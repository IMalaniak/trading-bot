// trading-common — shared Rust library for the trading-bot monorepo.
//
// Analogous to libs/common in TypeScript — provides proto types and
// Kafka infrastructure utilities that every Rust service can reuse.
//
// Available modules:
//   trading_common::proto   — all generated gRPC message types and service stubs
//   trading_common::kafka   — topic/key/header helpers, retry loop, and DLQ publisher

pub mod kafka;
pub mod proto;
