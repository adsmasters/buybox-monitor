-- Buybox Monitor – Supabase Schema
-- In Supabase SQL Editor ausführen

-- Kunden
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ASINs je Kunde
CREATE TABLE asins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  asin        TEXT NOT NULL,
  title       TEXT,
  brand       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, asin)
);

-- Seller-Cache
CREATE TABLE sellers (
  seller_id   TEXT PRIMARY KEY,
  seller_name TEXT NOT NULL,
  is_partner  BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Buy-Box-Historie
CREATE TABLE bb_history (
  id          BIGSERIAL PRIMARY KEY,
  asin        TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  ts_km       BIGINT NOT NULL,
  seller_id   TEXT,
  seller_name TEXT,
  UNIQUE(asin, ts_km)
);

-- Preis-Historie
CREATE TABLE price_history (
  id          BIGSERIAL PRIMARY KEY,
  asin        TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  ts_km       BIGINT NOT NULL,
  price_eur   NUMERIC(10,2),
  UNIQUE(asin, ts_km)
);

-- Pull-Log
CREATE TABLE pull_log (
  id          BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  status      TEXT NOT NULL, -- 'running' | 'done' | 'error'
  asins_total INT DEFAULT 0,
  asins_done  INT DEFAULT 0,
  error_msg   TEXT,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Indizes
CREATE INDEX ON bb_history(asin, ts_km);
CREATE INDEX ON price_history(asin, ts_km);

-- RLS: Kunden sehen nur ihre eigenen Daten
ALTER TABLE customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE asins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bb_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_log    ENABLE ROW LEVEL SECURITY;

-- Admins (Service-Role) können alles – User sehen nur ihre Daten
-- Auth: Supabase verknüpft auth.users.email mit customers.email

CREATE POLICY "customer_own" ON customers
  FOR SELECT USING (email = auth.jwt()->>'email');

CREATE POLICY "asins_own" ON asins
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE email = auth.jwt()->>'email')
  );

CREATE POLICY "bb_own" ON bb_history
  FOR SELECT USING (
    asin IN (
      SELECT a.asin FROM asins a
      JOIN customers c ON c.id = a.customer_id
      WHERE c.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "price_own" ON price_history
  FOR SELECT USING (
    asin IN (
      SELECT a.asin FROM asins a
      JOIN customers c ON c.id = a.customer_id
      WHERE c.email = auth.jwt()->>'email'
    )
  );

CREATE POLICY "sellers_all" ON sellers
  FOR SELECT USING (true);

CREATE POLICY "pull_log_own" ON pull_log
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE email = auth.jwt()->>'email')
  );
