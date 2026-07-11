-- ============================================================================
-- Migration: Beam Sale (dwuteowniki HEB/HEA/IPE — sprzedaż, prefiks SH)
-- Data: 2026-07-10
-- Strategia: 100% addytywna. Wspólny katalog beam_profiles (bez zmian).
-- Spec: docs/superpowers/specs/2026-07-10-beam-sale-design.md
-- RLS celowo NIE włączamy (konwencja wszystkich tabel ofert w projekcie).
-- ============================================================================

-- ─── 1. Sekwencja numeracji SH (izolowana) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS beam_sale_sequences (
  year          INTEGER     PRIMARY KEY,
  last_sequence INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE beam_sale_sequences IS
  'Sekwencja numerów ofert sprzedaży dwuteowników (SH/YYYY/NNN). Izolowana od OF/OP/OH/SP/SR/SPP.';

-- ─── 2. Cennik sprzedaży belek (1 wiersz) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS beam_sale_prices (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  default_sell_price_per_ton_pln  NUMERIC     NOT NULL DEFAULT 0,
  default_cost_price_per_ton_pln  NUMERIC     NOT NULL DEFAULT 0,
  note                            TEXT,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE beam_sale_prices IS
  'Cennik sprzedaży dwuteowników (1 wiersz). Ceny kanoniczne w PLN; kalkulator pre-filluje pozycje.';

INSERT INTO beam_sale_prices (default_sell_price_per_ton_pln, default_cost_price_per_ton_pln, note)
SELECT 3800, 0, 'Domyślna cena sprzedaży 3800 PLN/t (ustawiona 2026-07-10). Koszt 0 = brak pre-fill.'
WHERE NOT EXISTS (SELECT 1 FROM beam_sale_prices);

-- ─── 3. Nagłówek oferty sprzedaży belek ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS beam_sale_offers (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_number              TEXT        NOT NULL DEFAULT '' UNIQUE,
  year                      INTEGER     NOT NULL DEFAULT 0,
  sequence                  INTEGER     NOT NULL DEFAULT 0,
  client_id                 UUID        REFERENCES clients(id) ON DELETE SET NULL,
  task_name                 TEXT,
  is_used                   BOOLEAN     NOT NULL DEFAULT FALSE,
  status                    TEXT        NOT NULL DEFAULT 'szkic'
    CHECK (status IN ('szkic','wysłana','przyjęta','odrzucona')),
  notes                     TEXT,
  valid_days                INTEGER     NOT NULL DEFAULT 14,
  payment_days              INTEGER     NOT NULL DEFAULT 30,
  prepared_by               TEXT,
  currency                  TEXT        NOT NULL DEFAULT 'PLN'
    CHECK (currency IN ('EUR','PLN')),
  exchange_rate             NUMERIC,
  -- Sumy (snapshot)
  total_mass_t              NUMERIC,
  total_cost_eur            NUMERIC,
  total_sell_eur            NUMERIC,
  total_sell_pln            NUMERIC,
  margin_pct                NUMERIC,
  -- Dostawa: koszty
  delivery_trucks           NUMERIC,
  delivery_cost_per_truck   NUMERIC,
  delivery_cost_total       NUMERIC,
  delivery_paid_by          TEXT
    CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('dap_included','dap_extra','fca','cif')),
  delivery_from             TEXT,
  delivery_to               TEXT,
  -- Warunki oferty
  delivery_timeline         TEXT
    CHECK (delivery_timeline IS NULL OR delivery_timeline IN ('huta','magazyn')),
  campaign_weeks            TEXT,
  campaign_delivery_weeks   TEXT,
  warehouse_delivery_time   TEXT,
  delivery_terms            TEXT
    CHECK (delivery_terms IS NULL OR delivery_terms IN ('DAP','DAP_EXTRA','FCA','CIF')),
  fca_location              TEXT,
  -- Audit / soft-delete
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);
COMMENT ON TABLE beam_sale_offers IS
  'Oferty sprzedaży dwuteowników (SH/YYYY/NNN). Soft-delete przez deleted_at.';

CREATE INDEX IF NOT EXISTS idx_beam_sale_offers_deleted  ON beam_sale_offers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_beam_sale_offers_created  ON beam_sale_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beam_sale_offers_client   ON beam_sale_offers(client_id);
CREATE INDEX IF NOT EXISTS idx_beam_sale_offers_year_seq ON beam_sale_offers(year, sequence);

-- ─── 4. Pozycje oferty sprzedaży belek ────────────────────────────────────────
-- cost_per_ton/sell_per_ton/cost_total/sell_total: W WALUCIE OFERTY.
-- sell_value_eur/sell_value_pln: denominacje zawsze wyliczone.
-- steel_grade CHECK ↔ BEAM_STEEL_GRADES w types/index.ts (utrzymuj zgodne).
CREATE TABLE IF NOT EXISTS beam_sale_offer_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id         UUID        NOT NULL REFERENCES beam_sale_offers(id) ON DELETE CASCADE,
  profile_id       UUID        REFERENCES beam_profiles(id) ON DELETE SET NULL,
  profile_name     TEXT        NOT NULL,
  series           TEXT        NOT NULL,
  weight_kg_per_m  NUMERIC     NOT NULL CHECK (weight_kg_per_m > 0),
  steel_grade      TEXT        NOT NULL
    CHECK (steel_grade IN ('S235','S275','S355','min. S235','min. S275','min. S355')),
  quantity_pcs     INTEGER     NOT NULL CHECK (quantity_pcs > 0),
  length_m         NUMERIC     NOT NULL CHECK (length_m > 0),
  total_length_m   NUMERIC     NOT NULL CHECK (total_length_m > 0),
  mass_t           NUMERIC     NOT NULL CHECK (mass_t > 0),
  cost_per_ton     NUMERIC     NOT NULL DEFAULT 0 CHECK (cost_per_ton >= 0),
  sell_per_ton     NUMERIC     NOT NULL CHECK (sell_per_ton >= 0),
  cost_total       NUMERIC     NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  sell_total       NUMERIC     NOT NULL CHECK (sell_total >= 0),
  sell_value_eur   NUMERIC     NOT NULL CHECK (sell_value_eur >= 0),
  sell_value_pln   NUMERIC     NOT NULL CHECK (sell_value_pln >= 0),
  margin_pct       NUMERIC,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE beam_sale_offer_items IS
  'Pozycje ofert sprzedaży belek. ON DELETE CASCADE na offer_id. profile_id ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS idx_beam_sale_items_offer   ON beam_sale_offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_beam_sale_items_profile ON beam_sale_offer_items(profile_id);

-- ─── 5. Trigger numeracji SH/YYYY/NNN ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_beam_sale_offer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year     INTEGER;
  v_sequence INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM timezone('Europe/Warsaw', NOW()))::INTEGER;

  INSERT INTO beam_sale_sequences (year, last_sequence, updated_at)
  VALUES (v_year, 1, NOW())
  ON CONFLICT (year)
    DO UPDATE SET
      last_sequence = beam_sale_sequences.last_sequence + 1,
      updated_at    = NOW()
  RETURNING last_sequence INTO v_sequence;

  NEW.year         := v_year;
  NEW.sequence     := v_sequence;
  NEW.offer_number := 'SH/' || v_year || '/' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beam_sale_offer_number ON beam_sale_offers;
CREATE TRIGGER trg_beam_sale_offer_number
  BEFORE INSERT ON beam_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION generate_beam_sale_offer_number();

-- ─── 6. Triggery touch updated_at (reuse funkcji z migracji beam-rental) ──────
DROP TRIGGER IF EXISTS trg_beam_sale_offer_touch ON beam_sale_offers;
CREATE TRIGGER trg_beam_sale_offer_touch
  BEFORE UPDATE ON beam_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION touch_beam_updated_at();

DROP TRIGGER IF EXISTS trg_beam_sale_prices_touch ON beam_sale_prices;
CREATE TRIGGER trg_beam_sale_prices_touch
  BEFORE UPDATE ON beam_sale_prices
  FOR EACH ROW
  EXECUTE FUNCTION touch_beam_updated_at();

-- ============================================================================
-- KONIEC MIGRACJI
--
-- Weryfikacja po uruchomieniu:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'generate_beam_sale_offer_number';
--   -- prosecdef = true
--   SELECT default_sell_price_per_ton_pln FROM beam_sale_prices;  -- 3800
--   BEGIN;
--     INSERT INTO beam_sale_offers (status, currency) VALUES ('szkic','PLN')
--     RETURNING offer_number;   -- SH/2026/001
--   ROLLBACK;
--   SELECT tablename FROM pg_tables WHERE tablename LIKE 'beam_sale%' ORDER BY tablename;
-- ============================================================================
