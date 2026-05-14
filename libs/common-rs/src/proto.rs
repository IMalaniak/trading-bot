// Generated proto types, organised by proto package.
//
// tonic::include_proto!("package.name") expands to:
//   include!(concat!(env!("OUT_DIR"), "/package.name.rs"))
//
// Cargo sets OUT_DIR to a per-build temp directory; the generated .rs files
// land there after build.rs runs tonic_build. This is the Rust equivalent of
// the barrel `libs/common/src/proto/index.ts` that re-exports all TS protos.
//
// Usage from data-ingestion:
//   use trading_common::proto::tradingbot::data_ingestion::data_ingestion_server::DataIngestion;
//   use trading_common::proto::tradingbot::events::MarketDataBar;

pub mod tradingbot {
    pub mod common {
        // Instrument, Portfolio, Signal message types.
        // Multiple .proto files share this package — prost merges them into one file.
        tonic::include_proto!("tradingbot.common");
    }

    pub mod events {
        // InstrumentRegistered, MarketDataBar, TradeDecision, etc.
        // Both events.proto and market.proto live in this package.
        tonic::include_proto!("tradingbot.events");
    }

    pub mod data_ingestion {
        // GetMarketDataBarsRequest/Response, MarketDataBarRecord.
        // Also includes DataIngestionServer trait and DataIngestionClient.
        tonic::include_proto!("tradingbot.data_ingestion");
    }

    pub mod external_api_facade {
        // StartMarketDataSubscriptionRequest/Response, etc.
        // Also includes ExternalApiFacadeClient for gRPC calls to the Facade.
        tonic::include_proto!("tradingbot.external_api_facade");
    }

    pub mod portfolio_manager {
        // ListInstrumentsRequest/Response, RegisterPortfolioInstrumentRequest, etc.
        // RiskAndPortfolioManagerClient used at startup for re-subscription.
        tonic::include_proto!("tradingbot.portfolio_manager");
    }
}
