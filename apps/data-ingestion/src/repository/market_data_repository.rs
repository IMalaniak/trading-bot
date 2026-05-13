// MarketDataRepository trait — the "interface" for database access.
//
// TypeScript analogy:
//   export interface IMarketDataRepository {
//     insertBar(bar: MarketDataBarRow): Promise<void>;
//     getBars(query: BarsQuery): Promise<MarketDataBarRow[]>;
//   }
//
// Defining the trait first lets us:
//   1. Write tests using a mockall-generated mock (no real DB needed)
//   2. Swap implementations (Postgres today, in-memory for tests, etc.)
//
// `#[async_trait]` is needed because Rust's trait system doesn't yet support
// `async fn` in traits natively at 1.95 MSRV. The macro rewrites the async
// methods into ones that return `Pin<Box<dyn Future>>` — identical to what
// TypeScript's Promise<T> compiles down to.
//
// `#[cfg_attr(test, mockall::automock)]` tells mockall to generate a
// `MockMarketDataRepository` struct only when compiling tests — equivalent
// to `jest.fn()` but checked at compile time.

use anyhow::Result;
use async_trait::async_trait;

use crate::domain::{BarsQuery, MarketDataBarRow};

#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait MarketDataRepository: Send + Sync {
    /// Persist a single OHLCV bar.
    ///
    /// Idempotent: if a row with the same `source_event_id` already exists,
    /// the insert is silently ignored (ON CONFLICT DO NOTHING at the DB level).
    async fn insert_bar(&self, bar: &MarketDataBarRow) -> Result<()>;

    /// Retrieve stored bars matching `query`.
    async fn get_bars(&self, query: &BarsQuery) -> Result<Vec<MarketDataBarRow>>;
}
