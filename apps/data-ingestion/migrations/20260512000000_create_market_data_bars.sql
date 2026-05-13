-- Creates the market_data_bars hypertable and supporting index.
--
-- TimescaleDB turns a regular Postgres table into a "hypertable" — it
-- transparently partitions the data by time (like Postgres table inheritance
-- but managed automatically). This gives us fast range scans by time with
-- no application-level changes.
--
-- NUMERIC(36,18): 36 total digits, 18 decimal places — enough precision for
-- any crypto price without floating-point rounding errors. Binance sends
-- prices as strings for the same reason; we store them as exact decimals.

CREATE TABLE IF NOT EXISTS market_data_bars (
    time             TIMESTAMPTZ    NOT NULL,
    instrument_id    TEXT           NOT NULL,
    symbol           TEXT           NOT NULL,
    venue            TEXT           NOT NULL,
    -- "interval" is a reserved word in Postgres so we quote it everywhere.
    "interval"       TEXT           NOT NULL,
    open             NUMERIC(36,18) NOT NULL,
    high             NUMERIC(36,18) NOT NULL,
    low              NUMERIC(36,18) NOT NULL,
    close            NUMERIC(36,18) NOT NULL,
    volume           NUMERIC(36,18) NOT NULL,
    quote_volume     NUMERIC(36,18) NOT NULL,
    trade_count      BIGINT         NOT NULL,
    -- source_event_id is the Kafka event-id header (UUID).
    -- UNIQUE constraint makes all inserts idempotent at the DB level:
    -- if the consumer retries the same event, the second INSERT is a no-op.
    source_event_id  TEXT           NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Convert the table to a TimescaleDB hypertable partitioned on `time`.
-- This must be called before any data is inserted.
SELECT create_hypertable('market_data_bars', 'time', if_not_exists => TRUE);

-- Composite index for the primary query pattern:
-- "give me all bars for instrument X at interval Y, newest first".
CREATE INDEX IF NOT EXISTS market_data_bars_instrument_interval_time_idx
    ON market_data_bars (instrument_id, "interval", time DESC);
