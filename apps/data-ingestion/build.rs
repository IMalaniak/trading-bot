fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Tell cargo to re-run this build script if any proto file changes.
    // Cargo tracks file changes via these println! directives.
    println!("cargo:rerun-if-changed=../../proto");

    // Compile proto files to Rust.
    // tonic_build generates both the protobuf message structs (via prost)
    // and the gRPC service traits + client/server stubs (via tonic).
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        // OUT_DIR is set by Cargo — a temp directory unique to this build.
        // The generated .rs files land there and are included via include_proto!().
        .compile_protos(
            &[
                "../../proto/common/instrument.proto",
                "../../proto/common/portfolio.proto",
                "../../proto/common/signal.proto",
                "../../proto/events/events.proto",
                "../../proto/services/execution_engine.proto",
                "../../proto/services/portfolio_manager.proto",
                "../../proto/services/data_ingestion.proto",
            ],
            &["../../proto"],
        )?;

    Ok(())
}
