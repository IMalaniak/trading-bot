#[cfg(test)]
mod tests {
    // ── InstrumentConsumer tests ─────────────────────────────────────────────
    mod instrument_consumer_tests {
        use std::sync::Arc;

        use prost::Message;
        use rdkafka::producer::FutureProducer;
        use trading_common::kafka::consumer::RetryConfig;
        use trading_common::proto::tradingbot::common::{AssetClass, Instrument};
        use trading_common::proto::tradingbot::events::InstrumentRegistered;

        use crate::consumers::instrument_consumer::InstrumentConsumer;
        use crate::error::AppError;
        use crate::subscription::gateway::{MockSubscriptionGateway};

        fn make_dlq_producer() -> FutureProducer {
            // We intentionally point at a broker that will never be reached so
            // DLQ delivery simply times-out. Unit tests that exercise the DLQ
            // path only assert that the consumer does NOT panic; they do not
            // assert that the message was successfully delivered.
            rdkafka::ClientConfig::new()
                .set("bootstrap.servers", "localhost:29092")
                .set("message.timeout.ms", "100")
                .create()
                .expect("test DLQ producer")
        }

        fn make_dlq() -> trading_common::kafka::dlq::DlqPublisher {
            trading_common::kafka::dlq::DlqPublisher::new(make_dlq_producer())
        }

        fn make_instrument(id: &str, symbol: &str, venue: &str) -> Instrument {
            Instrument {
                id: id.to_owned(),
                asset_class: AssetClass::Crypto as i32,
                symbol: symbol.to_owned(),
                venue: venue.to_owned(),
                external_symbol: None,
            }
        }

        fn encode_event(event: InstrumentRegistered) -> Vec<u8> {
            let mut buf = Vec::new();
            event.encode(&mut buf).expect("proto encode");
            buf
        }

        #[tokio::test]
        async fn calls_start_subscription_for_each_default_interval() {
            let instrument = make_instrument("inst-1", "BTCUSDT", "BINANCE");
            let event = InstrumentRegistered {
                instrument: Some(instrument.clone()),
                registered_at: "2024-01-01T00:00:00Z".to_owned(),
            };
            let payload = encode_event(event);

            // Mock: expect two calls — one for "1m" and one for "5m"
            let mut mock = MockSubscriptionGateway::new();
            mock.expect_start_subscription()
                .times(2)
                .returning(|_| Ok(()));

            let consumer = InstrumentConsumer::new(
                Arc::new(mock),
                vec!["1m".to_owned(), "5m".to_owned()],
                RetryConfig::default(),
                make_dlq(),
            );

            // We test handle_message directly without a real Kafka message.
            // Build a minimal BorrowedMessage stand-in by using the raw bytes.
            // Since BorrowedMessage is non-constructible outside rdkafka, we
            // exercise the internal parsing logic via a thin shim.
            consumer
                .process_payload(&payload)
                .await;
        }

        #[tokio::test]
        async fn skips_event_with_missing_instrument_field() {
            let event = InstrumentRegistered {
                instrument: None, // invalid — consumer should skip gracefully
                registered_at: "2024-01-01T00:00:00Z".to_owned(),
            };
            let payload = encode_event(event);

            // No gateway calls expected
            let mock = MockSubscriptionGateway::new();

            let consumer = InstrumentConsumer::new(
                Arc::new(mock),
                vec!["1m".to_owned()],
                RetryConfig::default(),
                make_dlq(),
            );

            consumer.process_payload(&payload).await;
            // No panic, no mock calls — test passes
        }

        #[tokio::test]
        async fn publishes_to_dlq_on_decode_failure() {
            // Garbage bytes that cannot be decoded as InstrumentRegistered
            let payload = b"not a valid protobuf payload \xFF\xFE";

            let mock = MockSubscriptionGateway::new();

            let consumer = InstrumentConsumer::new(
                Arc::new(mock),
                vec!["1m".to_owned()],
                RetryConfig::default(),
                make_dlq(),
            );

            // Should not panic; DLQ publish will fail (no broker) but that is
            // swallowed — the consumer logs the error and continues.
            consumer.process_payload(payload).await;
        }

        #[tokio::test]
        async fn does_not_panic_when_gateway_returns_error() {
            let instrument = make_instrument("inst-2", "ETHUSD", "KRAKEN");
            let event = InstrumentRegistered {
                instrument: Some(instrument),
                registered_at: "2024-01-01T00:00:00Z".to_owned(),
            };
            let payload = encode_event(event);

            let mut mock = MockSubscriptionGateway::new();
            mock.expect_start_subscription()
                .times(1)
                .returning(|_| Err(AppError::from(tonic::Status::unavailable("down"))));

            // Retry config with 0 retries so the test finishes quickly
            let retry_cfg = RetryConfig {
                max_retries: 0,
                initial_delay_ms: 1,
                max_delay_ms: 1,
            };

            let consumer = InstrumentConsumer::new(
                Arc::new(mock),
                vec!["1m".to_owned()],
                retry_cfg,
                make_dlq(),
            );

            consumer.process_payload(&payload).await;
            // No panic — gateway error is logged and DLQ attempted
        }
    }

    // ── MarketDataConsumer tests ─────────────────────────────────────────────
    mod market_data_consumer_tests {
        use std::sync::Arc;

        use prost::Message;
        use trading_common::kafka::consumer::RetryConfig;
        use trading_common::proto::tradingbot::events::MarketDataBar;

        use crate::consumers::market_data_consumer::MarketDataConsumer;
        use crate::repository::market_data_repository::{
            MockMarketDataRepository,
        };

        fn make_dlq_producer() -> rdkafka::producer::FutureProducer {
            rdkafka::ClientConfig::new()
                .set("bootstrap.servers", "localhost:29092")
                .set("message.timeout.ms", "100")
                .create()
                .expect("test DLQ producer")
        }

        fn make_dlq() -> trading_common::kafka::dlq::DlqPublisher {
            trading_common::kafka::dlq::DlqPublisher::new(make_dlq_producer())
        }

        fn make_bar(is_final: bool) -> MarketDataBar {
            MarketDataBar {
                instrument_id: "inst-1".to_owned(),
                symbol: "BTCUSDT".to_owned(),
                venue: "BINANCE".to_owned(),
                interval: "1m".to_owned(),
                open_time_ms:  1_700_000_000_000,
                close_time_ms: 1_700_000_060_000,
                open:  "40000.00".to_owned(),
                high:  "40100.00".to_owned(),
                low:   "39900.00".to_owned(),
                close: "40050.00".to_owned(),
                volume: "100.5".to_owned(),
                quote_volume: "4020025.00".to_owned(),
                trade_count: 1234,
                is_final,
            }
        }

        fn encode_bar(bar: MarketDataBar) -> Vec<u8> {
            let mut buf = Vec::new();
            bar.encode(&mut buf).expect("proto encode");
            buf
        }

        #[tokio::test]
        async fn persists_final_bar() {
            let payload = encode_bar(make_bar(true));

            let mut mock = MockMarketDataRepository::new();
            mock.expect_insert_bar()
                .times(1)
                .returning(|_| Ok(()));

            let consumer = MarketDataConsumer::new(
                Arc::new(mock),
                RetryConfig::default(),
                make_dlq(),
            );

            consumer.process_payload(&payload).await;
        }

        #[tokio::test]
        async fn skips_non_final_bar() {
            let payload = encode_bar(make_bar(false));

            // No insert_bar call expected
            let mock = MockMarketDataRepository::new();

            let consumer = MarketDataConsumer::new(
                Arc::new(mock),
                RetryConfig::default(),
                make_dlq(),
            );

            consumer.process_payload(&payload).await;
        }

        #[tokio::test]
        async fn publishes_to_dlq_on_decode_failure() {
            let payload = b"garbage \xFF";
            let mock = MockMarketDataRepository::new();

            let consumer = MarketDataConsumer::new(
                Arc::new(mock),
                RetryConfig::default(),
                make_dlq(),
            );

            consumer.process_payload(payload).await;
        }

        #[tokio::test]
        async fn does_not_panic_when_insert_fails() {
            let payload = encode_bar(make_bar(true));

            let mut mock = MockMarketDataRepository::new();
            mock.expect_insert_bar()
                .times(1)
                .returning(|_| Err(anyhow::anyhow!("simulated DB error")));

            let retry_cfg = RetryConfig {
                max_retries: 0,
                initial_delay_ms: 1,
                max_delay_ms: 1,
            };

            let consumer = MarketDataConsumer::new(
                Arc::new(mock),
                retry_cfg,
                make_dlq(),
            );

            consumer.process_payload(&payload).await;
        }
    }
}
