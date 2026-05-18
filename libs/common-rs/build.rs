// build.rs — runs at compile time (like a webpack plugin, but for Rust).
//
// tonic_build reads every .proto file and generates two things:
//   1. prost structs  — the message types (StartMarketDataSubscriptionRequest, etc.)
//   2. tonic stubs    — the async service traits + client/server wrappers
//
// The output lands in a Cargo-managed temp directory (OUT_DIR).
// We expose it in src/proto.rs via tonic::include_proto!().
//
// All future Rust crates (feature-engineering, etc.) simply depend on
// `trading-common` and get every proto type without running their own codegen.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Cargo re-runs this script whenever any proto file changes.
    // Equivalent to telling webpack "watch this directory".
    println!("cargo:rerun-if-changed=../../proto");

    tonic_build::configure()
        .build_server(true) // generate async service trait + Server wrapper
        .build_client(true) // generate async Client stub
        .compile_protos(
            &[
                // Shared message types
                "../../proto/common/instrument.proto",
                "../../proto/common/portfolio.proto",
                "../../proto/common/signal.proto",
                // Event messages (InstrumentRegistered, MarketDataBar, features)
                "../../proto/events/events.proto",
                "../../proto/events/market.proto",
                "../../proto/events/features.proto",
                // gRPC service definitions
                "../../proto/services/external_api_facade.proto",
                "../../proto/services/portfolio_manager.proto",
                "../../proto/services/data_ingestion.proto",
                "../../proto/services/prediction_engine.proto",
            ],
            &["../../proto"], // root search path for `import` statements in .proto files
        )?;

    Ok(())
}
