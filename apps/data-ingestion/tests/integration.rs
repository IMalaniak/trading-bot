/// Integration test entry point.
///
/// All integration test groups live as submodules under `tests/integration/`.
/// To add a new group, create `tests/integration/<name>.rs` and declare it here:
///
/// ```
/// mod <name>;
/// ```
///
/// Run all integration tests with:
///   cargo test -p data-ingestion --test integration
mod repository;
