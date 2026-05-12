// Data Ingestion service — Rust / Tokio / tonic
//
// This binary:
//   1. Consumes `instrument.registered` Kafka events → calls External API Facade to start
//      market data subscriptions.
//   2. Consumes `market.raw.data` Kafka events → persists OHLCV bars to TimescaleDB.
//   3. Exposes a gRPC server (`DataIngestion.GetMarketDataBars`) for API Gateway queries.
//
// Phase 4 will implement the full service. This file bootstraps the tokio runtime
// and will grow to wire all components together.

fn main() {
    println!("data-ingestion: not yet implemented");
}
