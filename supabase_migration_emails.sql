-- Migration: mehrere E-Mails je Kunde (Zugriffsverwaltung)
-- Im Supabase SQL Editor ausführen.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS emails text[] NOT NULL DEFAULT '{}';

UPDATE customers SET emails = ARRAY[email]
  WHERE email IS NOT NULL AND NOT (email = ANY(emails));

DROP POLICY IF EXISTS customer_own ON customers;
CREATE POLICY customer_own ON customers FOR SELECT
  USING (auth.jwt()->>'email' = ANY(emails));

DROP POLICY IF EXISTS asins_own ON asins;
CREATE POLICY asins_own ON asins FOR SELECT
  USING (customer_id IN (SELECT id FROM customers WHERE auth.jwt()->>'email' = ANY(emails)));

DROP POLICY IF EXISTS bb_own ON bb_history;
CREATE POLICY bb_own ON bb_history FOR SELECT
  USING (asin IN (SELECT a.asin FROM asins a JOIN customers c ON c.id = a.customer_id
                  WHERE auth.jwt()->>'email' = ANY(c.emails)));

DROP POLICY IF EXISTS price_own ON price_history;
CREATE POLICY price_own ON price_history FOR SELECT
  USING (asin IN (SELECT a.asin FROM asins a JOIN customers c ON c.id = a.customer_id
                  WHERE auth.jwt()->>'email' = ANY(c.emails)));

DROP POLICY IF EXISTS pull_log_own ON pull_log;
CREATE POLICY pull_log_own ON pull_log FOR SELECT
  USING (customer_id IN (SELECT id FROM customers WHERE auth.jwt()->>'email' = ANY(emails)));
