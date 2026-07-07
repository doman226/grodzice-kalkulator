-- ============================================================================
-- Migration: Beam Rental (dwuteowniki HEB/HEA/IPE — wynajem)
-- Data: 2026-07-07
--
-- Strategia: 100% addytywna, pełna izolacja od grodzic / płyt / rur.
--   * Brak ALTER na jakiejkolwiek istniejącej tabeli.
--   * Nowe tabele:
--       - beam_offer_sequences      (sekwencja OH/YYYY/NNN — izolowana od OF/OP/SP/SR/SPP)
--       - beam_profiles             (katalog dwuteowników HEB/HEA/IPE)
--       - beam_rental_prices        (1 wiersz: cena/t + okres + stawka/tydzień + 6 cen szkód)
--       - beam_rental_offers        (nagłówek oferty wynajmu — prefix OH, soft-delete)
--       - beam_rental_offer_items   (pozycje oferty — snapshot atrybutów profilu)
--   * Osobny trigger numeracji OH/YYYY/NNN (SECURITY DEFINER, czas Europe/Warsaw)
--     — NIE używa istniejących *_offer_sequences innych modułów.
--
-- Model rental: koszt = masa[t] × cena[/t]. Okres podstawowy (mies.) i stawka
-- za dodatkowy tydzień to pola INFORMACYJNE (warunki w PDF), nie wchodzą do wzoru.
--
-- Wykonanie: wklej cały skrypt do Supabase SQL Editor (projekt hliemaqfncptedkxxakt)
-- i uruchom jednorazowo. Wszystkie operacje są idempotentne.
--
-- UWAGA — RLS celowo NIE włączamy (jak wszystkie tabele ofert w tym projekcie).
--   Zapis ofert działa od pierwszej minuty. Gdy będziesz robił osobne zadanie
--   bezpieczeństwa, włączysz RLS dla wszystkich tabel ofert naraz:
--     ALTER TABLE beam_offer_sequences    ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE beam_rental_offers      ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE beam_rental_offer_items ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE beam_profiles           ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE beam_rental_prices      ENABLE ROW LEVEL SECURITY;
-- ============================================================================

-- ─── 1. Sekwencja numeracji ofert wynajmu belek (izolowana) ───────────────────
CREATE TABLE IF NOT EXISTS beam_offer_sequences (
  year          INTEGER     PRIMARY KEY,
  last_sequence INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  beam_offer_sequences IS
  'Sekwencja numerów ofert wynajmu dwuteowników (OH/YYYY/NNN). Izolowana od OF/OP/SP/SR/SPP.';
COMMENT ON COLUMN beam_offer_sequences.last_sequence IS
  'Ostatnio przydzielony numer w danym roku. UPSERT przez trigger generate_beam_offer_number().';

-- ─── 2. Katalog profili dwuteowników ──────────────────────────────────────────
--     weight_kg_per_m — sterownik masy (masa = szt × L × kg/m / 1000).
--     height_mm / width_mm — informacyjne (wysokość profilu / szerokość półki).
CREATE TABLE IF NOT EXISTS beam_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL UNIQUE,
  series            TEXT        NOT NULL CHECK (series IN ('HEB','HEA','IPE')),
  weight_kg_per_m   NUMERIC     NOT NULL CHECK (weight_kg_per_m > 0),
  height_mm         NUMERIC,
  width_mm          NUMERIC,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE beam_profiles IS
  'Katalog dwuteowników HEB/HEA/IPE do wynajmu. weight_kg_per_m steruje masą.';

CREATE INDEX IF NOT EXISTS idx_beam_profiles_active ON beam_profiles(active);

-- ─── 3. Cennik wynajmu belek (1 wiersz) ───────────────────────────────────────
--     Ceny kanoniczne w PLN (konwencja aplikacji). Przy ofercie EUR kalkulator
--     konwertuje do EUR (convertCurrencyValue / convDmg) i zapisuje snapshot
--     w walucie oferty na beam_rental_offers.
--
--     UWAGA: wartości seed to PLACEHOLDERY (przeliczone z EUR wg ~4.30).
--     Ustaw docelowe kwoty w UI „Ustawienia cen" przed pierwszą realną ofertą.
CREATE TABLE IF NOT EXISTS beam_rental_prices (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_price_per_ton_pln        NUMERIC     NOT NULL DEFAULT 0,   -- czynsz za okres podstawowy [PLN/t]
  base_period_months            INTEGER     NOT NULL DEFAULT 3,   -- podstawowy okres dzierżawy [mies.] (info)
  extra_week_price_per_ton_pln  NUMERIC     NOT NULL DEFAULT 0,   -- stawka za dodatkowy tydzień [PLN/t] (info)
  -- Cennik szkód i napraw (PLN kanoniczne)
  loss_price_pln                NUMERIC     NOT NULL DEFAULT 0,   -- zagubienie / całkowita strata [PLN/t]
  sorting_price_pln             NUMERIC     NOT NULL DEFAULT 0,   -- sortowanie + czyszczenie [PLN/t]
  welding_price_pln             NUMERIC     NOT NULL DEFAULT 0,   -- spawanie (zamykanie) otworów [PLN/szt]
  cutting_price_pln             NUMERIC     NOT NULL DEFAULT 0,   -- głowica tnąca [PLN/cięcie]
  repair_price_pln              NUMERIC     NOT NULL DEFAULT 0,   -- naprawa / prostowanie [PLN/mb]
  lifting_hole_price_pln        NUMERIC     NOT NULL DEFAULT 0,   -- nowy otwór do podnoszenia [PLN/szt]
  note                          TEXT,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE beam_rental_prices IS
  'Cennik wynajmu dwuteowników (1 wiersz). Ceny w PLN kanoniczne. Okres + stawka/tydzień = pola informacyjne.';

-- Seed pojedynczego wiersza cennika (tylko jeśli tabela pusta).
-- Placeholdery z PDF WITEK przeliczone z EUR wg ~4.30 (loss 910€, sort 30€,
-- weld 60€, cut 25€, repair 59€, lift 6€; czynsz ~180€/t za 3 mies.; +tydzień 9€/t).
INSERT INTO beam_rental_prices (
  rent_price_per_ton_pln, base_period_months, extra_week_price_per_ton_pln,
  loss_price_pln, sorting_price_pln, welding_price_pln,
  cutting_price_pln, repair_price_pln, lifting_hole_price_pln, note
)
SELECT
  774, 3, 39,
  3913, 129, 258,
  108, 254, 26,
  'Ceny placeholder (przeliczone z EUR ~4.30) — ustaw docelowe w UI.'
WHERE NOT EXISTS (SELECT 1 FROM beam_rental_prices);

-- ─── 4. Nagłówek oferty wynajmu belek — analog road_plate_sale_offers (rental) ─
CREATE TABLE IF NOT EXISTS beam_rental_offers (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Numeracja: trigger BEFORE INSERT generuje OH/YYYY/NNN
  offer_number                  TEXT        NOT NULL DEFAULT '' UNIQUE,
  year                          INTEGER     NOT NULL DEFAULT 0,
  sequence                      INTEGER     NOT NULL DEFAULT 0,
  -- Klient i stan oferty
  client_id                     UUID        REFERENCES clients(id) ON DELETE SET NULL,
  task_name                     TEXT,
  status                        TEXT        NOT NULL DEFAULT 'szkic'
    CHECK (status IN ('szkic','wysłana','przyjęta','odrzucona')),
  notes                         TEXT,
  valid_days                    INTEGER     NOT NULL DEFAULT 14,
  payment_days                  INTEGER     NOT NULL DEFAULT 14,
  prepared_by                   TEXT,
  -- Waluta i kurs (w momencie zapisu)
  currency                      TEXT        NOT NULL DEFAULT 'PLN'
    CHECK (currency IN ('EUR','PLN')),
  exchange_rate                 NUMERIC,
  -- Warunki wynajmu (informacyjne — snapshot w walucie oferty gdzie dotyczy)
  base_period_months            INTEGER,
  extra_week_price_per_ton      NUMERIC,
  -- Sumy (snapshot)
  total_mass_t                  NUMERIC,
  rental_cost_total             NUMERIC,     -- w walucie oferty
  rental_cost_eur               NUMERIC,
  rental_cost_pln               NUMERIC,
  -- Snapshot cennika szkód (w walucie oferty — konwencja jak grodzice)
  loss_price_pln                NUMERIC,
  sorting_price_pln             NUMERIC,
  welding_price_pln             NUMERIC,
  cutting_price_pln             NUMERIC,
  repair_price_pln              NUMERIC,
  lifting_hole_price_pln        NUMERIC,
  -- Dostawa: koszty
  delivery_trucks               NUMERIC,
  delivery_cost_per_truck       NUMERIC,
  delivery_cost_total           NUMERIC,
  delivery_paid_by              TEXT
    CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('dap_included','dap_extra','fca','cif')),
  delivery_from                 TEXT,
  delivery_to                   TEXT,
  delivery_info                 TEXT,   -- termin dostawy (free-text, jak grodzice)
  -- Warunki dostawy (etykieta Incoterms)
  delivery_terms                TEXT
    CHECK (delivery_terms IS NULL OR delivery_terms IN ('DAP','DAP_EXTRA','FCA','CIF')),
  fca_location                  TEXT,
  -- Audit / soft-delete
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                    TIMESTAMPTZ
);

COMMENT ON TABLE beam_rental_offers IS
  'Oferty wynajmu dwuteowników (OH/YYYY/NNN). Soft-delete przez deleted_at. Ceny szkód w walucie oferty (konwencja grodzic).';

CREATE INDEX IF NOT EXISTS idx_beam_offers_deleted  ON beam_rental_offers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_beam_offers_created  ON beam_rental_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beam_offers_client   ON beam_rental_offers(client_id);
CREATE INDEX IF NOT EXISTS idx_beam_offers_year_seq ON beam_rental_offers(year, sequence);

-- ─── 5. Pozycje oferty wynajmu belek ──────────────────────────────────────────
--     profile_id: FK ON DELETE SET NULL — usunięcie profilu z katalogu NIE
--     kasuje pozycji historycznych. Snapshoty (profile_name, series,
--     weight_kg_per_m) zachowują pełną informację o wystawionej pozycji.
--
--     steel_grade CHECK ↔ BEAM_STEEL_GRADES w types/index.ts (utrzymuj zgodne).
CREATE TABLE IF NOT EXISTS beam_rental_offer_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            UUID        NOT NULL REFERENCES beam_rental_offers(id) ON DELETE CASCADE,
  profile_id          UUID        REFERENCES beam_profiles(id) ON DELETE SET NULL,
  -- Snapshoty atrybutów profilu
  profile_name        TEXT        NOT NULL,
  series              TEXT        NOT NULL,
  weight_kg_per_m     NUMERIC     NOT NULL CHECK (weight_kg_per_m > 0),
  steel_grade         TEXT        NOT NULL
    CHECK (steel_grade IN ('S235','S275','S355','min. S235','min. S275','min. S355')),
  -- Ilość i agregaty
  quantity_pcs        INTEGER     NOT NULL CHECK (quantity_pcs > 0),
  length_m            NUMERIC     NOT NULL CHECK (length_m > 0),
  total_length_m      NUMERIC     NOT NULL CHECK (total_length_m > 0),   -- quantity × length
  mass_t              NUMERIC     NOT NULL CHECK (mass_t > 0),           -- total_length × kg/m / 1000
  -- Cena i wartość (w walucie oferty)
  price_per_ton       NUMERIC     NOT NULL CHECK (price_per_ton >= 0),
  value_total         NUMERIC     NOT NULL CHECK (value_total >= 0),     -- mass_t × price_per_ton
  -- Denominacja (zawsze obliczona)
  value_eur           NUMERIC     NOT NULL CHECK (value_eur >= 0),
  value_pln           NUMERIC     NOT NULL CHECK (value_pln >= 0),
  -- Sortowanie i audit
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE beam_rental_offer_items IS
  'Pozycje ofert wynajmu belek. ON DELETE CASCADE na offer_id. profile_id ON DELETE SET NULL (zachowuje historię).';

CREATE INDEX IF NOT EXISTS idx_beam_offer_items_offer   ON beam_rental_offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_beam_offer_items_profile ON beam_rental_offer_items(profile_id);

-- ─── 6. Trigger: auto-generacja numeru OH/YYYY/NNN przy INSERT oferty ──────────
CREATE OR REPLACE FUNCTION generate_beam_offer_number()
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

  INSERT INTO beam_offer_sequences (year, last_sequence, updated_at)
  VALUES (v_year, 1, NOW())
  ON CONFLICT (year)
    DO UPDATE SET
      last_sequence = beam_offer_sequences.last_sequence + 1,
      updated_at    = NOW()
  RETURNING last_sequence INTO v_sequence;

  NEW.year         := v_year;
  NEW.sequence     := v_sequence;
  NEW.offer_number := 'OH/' || v_year || '/' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beam_offer_number ON beam_rental_offers;
CREATE TRIGGER trg_beam_offer_number
  BEFORE INSERT ON beam_rental_offers
  FOR EACH ROW
  EXECUTE FUNCTION generate_beam_offer_number();

-- ─── 7. Triggery: auto-update updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_beam_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beam_offer_touch ON beam_rental_offers;
CREATE TRIGGER trg_beam_offer_touch
  BEFORE UPDATE ON beam_rental_offers
  FOR EACH ROW
  EXECUTE FUNCTION touch_beam_updated_at();

DROP TRIGGER IF EXISTS trg_beam_profile_touch ON beam_profiles;
CREATE TRIGGER trg_beam_profile_touch
  BEFORE UPDATE ON beam_profiles
  FOR EACH ROW
  EXECUTE FUNCTION touch_beam_updated_at();

DROP TRIGGER IF EXISTS trg_beam_prices_touch ON beam_rental_prices;
CREATE TRIGGER trg_beam_prices_touch
  BEFORE UPDATE ON beam_rental_prices
  FOR EACH ROW
  EXECUTE FUNCTION touch_beam_updated_at();

-- ─── 8. Seed katalogu profili (z pliku Kopia pliku kształtowniki.xlsx) ─────────
--     kg/m: wartości katalogowe Intra. Wymiary informacyjne (h × szer. półki).
INSERT INTO beam_profiles (name, series, weight_kg_per_m, height_mm, width_mm) VALUES
  ('HEB300', 'HEB', 120,    300, 300),
  ('HEB200', 'HEB', 61.27,  200, 200),
  ('HEA340', 'HEA', 108,    330, 300),
  ('HEA140', 'HEA', 24.7,   133, 140),
  ('IPE300', 'IPE', 42.19,  300, 150)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- KONIEC MIGRACJI
--
-- Weryfikacja po uruchomieniu:
--
--   -- Trigger numeracji ma SECURITY DEFINER?
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'generate_beam_offer_number';
--   -- prosecdef powinien być true
--
--   -- Katalog profili (oczekiwane 5 wierszy):
--   SELECT name, series, weight_kg_per_m FROM beam_profiles ORDER BY series, name;
--
--   -- Cennik (oczekiwany 1 wiersz):
--   SELECT rent_price_per_ton_pln, base_period_months, loss_price_pln FROM beam_rental_prices;
--
--   -- Test numeracji (smoke test w transakcji — nic nie zostawia):
--   BEGIN;
--     INSERT INTO beam_rental_offers (status, currency) VALUES ('szkic','PLN')
--     RETURNING offer_number, year, sequence;
--   ROLLBACK;
--   -- Oczekiwane: OH/2026/001 (lub kolejny numer w roku).
--
--   -- Lista nowych tabel:
--   SELECT tablename FROM pg_tables
--   WHERE tablename LIKE 'beam_%' ORDER BY tablename;
-- ============================================================================
