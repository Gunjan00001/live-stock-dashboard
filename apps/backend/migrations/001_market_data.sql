CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  interval TEXT NOT NULL CHECK (interval IN ('1D', '1W', '1M', '1Y')),
  time TIMESTAMPTZ NOT NULL,
  open NUMERIC(20, 6) NOT NULL,
  high NUMERIC(20, 6) NOT NULL,
  low NUMERIC(20, 6) NOT NULL,
  close NUMERIC(20, 6) NOT NULL,
  volume BIGINT NOT NULL,
  PRIMARY KEY (symbol, exchange, interval, time),
  CHECK (high >= low),
  CHECK (volume >= 0)
);

CREATE INDEX IF NOT EXISTS candles_symbol_time_idx ON candles (symbol, time DESC);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id BIGINT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (watchlist_id, symbol, exchange)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  target_price NUMERIC(20, 6) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ABOVE', 'BELOW')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
