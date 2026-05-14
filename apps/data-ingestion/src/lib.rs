// data-ingestion library root.
//
// Exposing modules as a library (in addition to the binary) lets the integration
// tests in tests/ import service internals directly — the same pattern as having
// a NestJS app module importable by e2e test harnesses.

pub mod config;
pub mod consumers;
pub mod domain;
pub mod error;
pub mod grpc;
pub mod repository;
pub mod subscription;
