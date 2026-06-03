-- ============================================================================
-- Migration: Pipe Sale Locks (zamki w ofertach sprzedaży rur)
-- Data: 2026-06-03
--
-- Strategia: 100% addytywna. Katalog zamków (sale_locks) WSPÓŁDZIELONY z
-- modułem grodzic — NIE tworzymy pipe_locks. Tylko nowa tabela pozycji per
-- oferta: pipe_sale_offer_lock_items (lustro sale_offer_lock_items, FK do
-- pipe_sale_offers). Bez RLS (spójnie z resztą tabel pipe_sale_*).
--
-- Wykonanie: idempotentne (IF NOT EXISTS). Bezpieczne do ponownego uruchomienia.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipe_sale_offer_lock_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id           UUID        NOT NULL REFERENCES pipe_sale_offers(id) ON DELETE CASCADE,
  lock_name          TEXT        NOT NULL,
  steel_grade        TEXT,
  quantity_szt       NUMERIC,
  length_m           NUMERIC,
  quantity_mb        NUMERIC     NOT NULL,
  price_eur_mb       NUMERIC     NOT NULL,
  total_eur          NUMERIC     NOT NULL,
  total_pln          NUMERIC     NOT NULL DEFAULT 0,
  mass_t             NUMERIC     NOT NULL,
  sell_price_eur_mb  NUMERIC,
  sell_eur_total     NUMERIC,
  sell_pln_total     NUMERIC,
  sort_order         INTEGER     NOT NULL DEFAULT 0
);

COMMENT ON TABLE pipe_sale_offer_lock_items IS
  'Pozycje zamków w ofertach sprzedaży rur. Katalog źródłowy: sale_locks (współdzielony z grodzicami). ON DELETE CASCADE — twardy DELETE oferty kasuje pozycje; soft-delete (deleted_at) ich nie rusza.';

CREATE INDEX IF NOT EXISTS idx_pipe_lock_items_offer ON pipe_sale_offer_lock_items(offer_id);

-- ============================================================================
-- Weryfikacja po uruchomieniu:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'pipe_sale_offer_lock_items' ORDER BY ordinal_position;
--   -- Oczekiwane: 14 kolumn; offer_id/lock_name/quantity_mb/price_eur_mb/
--   -- total_eur/total_pln/mass_t = NOT NULL, reszta nullable.
-- ============================================================================
