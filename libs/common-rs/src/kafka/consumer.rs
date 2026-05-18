// Shared Kafka consumer retry utilities.
//
// In TypeScript (libs/common) this lives in reliable-kafka-consumer.ts.
// Here we provide a `with_retry` function that wraps any fallible async
// operation with exponential backoff — same algorithm, different language.
//
// Usage pattern (from a Kafka message handler):
//
//   let result = with_retry(&RetryConfig::default(), "insert_bar", || async {
//       repo.insert_bar(&bar).await
//   }).await;
//
//   if let Err(e) = result {
//       dlq.publish(...).await?;
//   }

use std::time::Duration;

use anyhow::Result;
use tracing::{error, warn};

/// Configuration for exponential-backoff retry.
///
/// Analogous to the retry options object you'd pass to a Node retry library.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retries after the first attempt.
    /// Total attempts = max_retries + 1.
    pub max_retries: u32,
    /// Delay before the first retry, in milliseconds.
    pub initial_delay_ms: u64,
    /// Upper cap on delay growth, in milliseconds.
    pub max_delay_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 100,
            max_delay_ms: 5_000,
        }
    }
}

/// Runs `operation` with exponential backoff up to `config.max_retries` retries.
///
/// Each retry doubles the previous delay, capped at `max_delay_ms`.
/// Returns `Ok(T)` on success or the final `Err` after all attempts are exhausted.
///
/// # Type parameters
/// - `F`: a closure that produces a Future on each call (must be `FnMut` so it
///   can be called multiple times — equivalent to a factory function in JS).
/// - `Fut`: the Future returned by `F`.
/// - `T`: the success value type.
pub async fn with_retry<F, Fut, T>(
    config: &RetryConfig,
    operation_name: &str,
    mut operation: F,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut delay_ms = config.initial_delay_ms;

    // attempt 0 is the first try; 1..=max_retries are the retries.
    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(err) if attempt == config.max_retries => {
                // All attempts exhausted — propagate the error to the caller
                // so it can publish to the DLQ.
                error!(
                    operation = operation_name,
                    attempt = attempt + 1,
                    error = %err,
                    "All retry attempts failed"
                );
                return Err(err);
            }
            Err(err) => {
                warn!(
                    operation = operation_name,
                    attempt = attempt + 1,
                    max_attempts = config.max_retries + 1,
                    retry_in_ms = delay_ms,
                    error = %err,
                    "Operation failed, retrying with backoff"
                );
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                // Double the delay each time, but don't exceed max_delay_ms.
                delay_ms = (delay_ms * 2).min(config.max_delay_ms);
            }
        }
    }

    // Unreachable: the loop always returns inside one of the branches above.
    unreachable!("retry loop exited without returning")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    // --- helpers ---

    fn no_delay_config(max_retries: u32) -> RetryConfig {
        RetryConfig {
            max_retries,
            initial_delay_ms: 0, // no sleeping in unit tests
            max_delay_ms: 0,
        }
    }

    // --- tests ---

    #[tokio::test]
    async fn succeeds_on_first_attempt() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result = with_retry(&no_delay_config(3), "op", || {
            let cc = cc.clone();
            async move {
                cc.fetch_add(1, Ordering::SeqCst);
                Ok::<_, anyhow::Error>(42)
            }
        })
        .await;

        assert_eq!(result.unwrap(), 42);
        assert_eq!(
            call_count.load(Ordering::SeqCst),
            1,
            "should only call once"
        );
    }

    #[tokio::test]
    async fn retries_and_succeeds_on_third_attempt() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result = with_retry(&no_delay_config(3), "op", || {
            let cc = cc.clone();
            async move {
                let n = cc.fetch_add(1, Ordering::SeqCst);
                if n < 2 {
                    Err(anyhow::anyhow!("transient error"))
                } else {
                    Ok("done")
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn returns_error_after_all_retries_exhausted() {
        let call_count = Arc::new(AtomicU32::new(0));
        let cc = call_count.clone();

        let result = with_retry(&no_delay_config(2), "op", || {
            let cc = cc.clone();
            async move {
                cc.fetch_add(1, Ordering::SeqCst);
                Err::<(), _>(anyhow::anyhow!("permanent failure"))
            }
        })
        .await;

        assert!(result.is_err());
        // max_retries=2 means 1 initial + 2 retries = 3 total calls
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }
}
