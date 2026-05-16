-- ============================================================================
-- Migration: Road Plate Sale (płyty drogowe — sprzedaż) — analog pipe-sale
-- Data: 2026-05-16
--
-- Strategia: 100% addytywna, pełna izolacja od grodzic.
--   * Brak ALTER na istniejących tabelach sale_offers / sale_offer_items.
--   * Nowe tabele:
--       - road_plate_offer_sequences   (sekwencja SPP/YYYY/NNN)
--       - road_plate_sale_offers       (oferty sprzedaży płyt — prefix SPP)
--       - road_plate_sale_offer_items  (pozycje oferty — snapshot atrybutów profilu)
--       - road_plate_sale_prices       (cennik 2D: profile_id × steel_grade)
--   * Osobny trigger numeracji SPP/YYYY/NNN — NIE używa istniejących
--     offer_sequences ani pipe_offer_sequences.
--   * Trigger SECURITY DEFINER (per CLAUDE.md gotcha): umożliwia anon
--     insertowanie ofert bez bezpośredniego dostępu do road_plate_offer_sequences.
--   * Reuse istniejącej tabeli road_plate_profiles (decyzja: profile wspólne
--     dla wynajmu i sprzedaży) — bez kopiowania katalogu.
--   * Brak FK na słownik gatunków stali — wartości snapshot TEXT z CHECK constraint
--     (4 gatunki: min. S270GP, S270GP, min. S355GP, S355GP), identycznie jak
--     w module wynajmu płyt (RoadPlateCalculator STEEL_GRADES).
--
-- Wykonanie: wklej cały skrypt do Supabase SQL Editor (projekt hliemaqfncptedkxxakt)
-- i uruchom jednorazowo. Wszystkie operacje są idempotentne
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS / ON CONFLICT DO NOTHING).
--
-- UWAGA — RLS celowo NIE włączamy w tej migracji:
--   Tabele road_plate_sale_* są tworzone bez ROW LEVEL SECURITY, dokładnie
--   w takim samym stanie w jakim dziś działają moduły grodzic SP i rur SR
--   (pipe_sale_offers). Dzięki temu zapis ofert płyt sprzedaży działa od
--   pierwszej minuty po uruchomieniu migracji, bez konieczności konfigurowania
--   policies.
--
--   Gdy będziesz robił osobne zadanie bezpieczeństwa, włączysz RLS dla wszystkich
--   tabel sprzedaży naraz:
--     ALTER TABLE road_plate_offer_sequences   ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE road_plate_sale_offers       ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE road_plate_sale_offer_items  ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE road_plate_sale_prices       ENABLE ROW LEVEL SECURITY;
-- ============================================================================

-- ─── 1. Sekwencja numeracji ofert sprzedaży płyt (izolowana od OF/SP/SR) ──────
--     Jeden wiersz per rok. last_sequence inkrementowane atomowo przez trigger.
CREATE TABLE IF NOT EXISTS road_plate_offer_sequences (
  year          INTEGER     PRIMARY KEY,
  last_sequence INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  road_plate_offer_sequences IS
  'Sekwencja numerów ofert sprzedaży płyt drogowych (SPP/YYYY/NNN). Izolowana od OF/SP/SR.';
COMMENT ON COLUMN road_plate_offer_sequences.last_sequence IS
  'Ostatnio przydzielony numer w danym roku. UPSERT przez trigger generate_road_plate_offer_number().';

-- ─── 2. Tabela ofert sprzedaży płyt — analog pipe_sale_offers ─────────────────
CREATE TABLE IF NOT EXISTS road_plate_sale_offers (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Numeracja: trigger BEFORE INSERT generuje SD/YYYY/NNN
  offer_number              TEXT        NOT NULL DEFAULT '' UNIQUE,
  year                      INTEGER     NOT NULL DEFAULT 0,
  sequence                  INTEGER     NOT NULL DEFAULT 0,
  -- Klient i stan oferty
  client_id                 UUID        REFERENCES clients(id) ON DELETE SET NULL,
  status                    TEXT        NOT NULL DEFAULT 'szkic'
    CHECK (status IN ('szkic','wysłana','przyjęta','odrzucona')),
  notes                     TEXT,
  valid_days                INTEGER     NOT NULL DEFAULT 14,
  payment_days              INTEGER     NOT NULL DEFAULT 14,
  prepared_by               TEXT,
  -- Waluta i kurs (w momencie zapisu)
  currency                  TEXT        NOT NULL DEFAULT 'EUR'
    CHECK (currency IN ('EUR','PLN')),
  exchange_rate             NUMERIC,
  -- Sumy (snapshot)
  total_cost_eur            NUMERIC,
  total_sell_eur            NUMERIC,
  total_sell_pln            NUMERIC,
  margin_pct                NUMERIC,
  -- Dostawa: koszty
  delivery_trucks           NUMERIC,
  delivery_cost_per_truck   NUMERIC,
  delivery_cost_total       NUMERIC,
  delivery_paid_by          TEXT
    CHECK (delivery_paid_by IS NULL OR delivery_paid_by IN ('dap_included','dap_extra','fca')),
  delivery_from             TEXT,
  delivery_to               TEXT,
  -- Warunki oferty (terminy, kampania, FCA)
  delivery_timeline         TEXT
    CHECK (delivery_timeline IS NULL OR delivery_timeline IN ('huta','magazyn')),
  campaign_weeks            TEXT,
  campaign_delivery_weeks   TEXT,
  warehouse_delivery_time   TEXT,
  delivery_terms            TEXT
    CHECK (delivery_terms IS NULL OR delivery_terms IN ('DAP','DAP_EXTRA','FCA')),
  fca_location              TEXT,
  -- Audit / soft-delete
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);

COMMENT ON TABLE road_plate_sale_offers IS
  'Oferty sprzedaży płyt drogowych (SPP/YYYY/NNN). Soft-delete przez deleted_at.';

CREATE INDEX IF NOT EXISTS idx_rp_sale_offers_deleted   ON road_plate_sale_offers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_rp_sale_offers_created   ON road_plate_sale_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_sale_offers_client    ON road_plate_sale_offers(client_id);
CREATE INDEX IF NOT EXISTS idx_rp_sale_offers_year_seq  ON road_plate_sale_offers(year, sequence);

-- ─── 3. Pozycje oferty płyt sprzedaży ─────────────────────────────────────────
--     profile_id: FK ON DELETE SET NULL — usunięcie profilu z katalogu NIE
--     kasuje pozycji historycznych, ale link zrywa się czysto. Snapshoty
--     (profile_name, thickness_mm, sheet_length_m, sheet_width_m,
--     weight_kg_per_m2) zachowują pełną informację o tym CO zostało wystawione.
CREATE TABLE IF NOT EXISTS road_plate_sale_offer_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            UUID        NOT NULL REFERENCES road_plate_sale_offers(id) ON DELETE CASCADE,
  -- Link do katalogu (opcjonalny: ON DELETE SET NULL — patrz komentarz wyżej)
  profile_id          UUID        REFERENCES road_plate_profiles(id) ON DELETE SET NULL,
  -- Snapshoty atrybutów profilu (kanoniczne dane w momencie wystawienia)
  profile_name        TEXT        NOT NULL,
  steel_grade         TEXT        NOT NULL
    CHECK (steel_grade IN ('min. S270GP','S270GP','min. S355GP','S355GP')),
  thickness_mm        NUMERIC     NOT NULL    CHECK (thickness_mm > 0),
  sheet_length_m      NUMERIC     NOT NULL    CHECK (sheet_length_m > 0),
  sheet_width_m       NUMERIC     NOT NULL    CHECK (sheet_width_m > 0),
  weight_kg_per_m2    NUMERIC     NOT NULL    CHECK (weight_kg_per_m2 > 0),
  -- Ilość i agregaty
  quantity_szt        INTEGER     NOT NULL    CHECK (quantity_szt > 0),
  -- Powierzchnia całkowita: quantity × sheet_length × sheet_width
  total_area_m2       NUMERIC     NOT NULL    CHECK (total_area_m2 > 0),
  -- Masa: quantity × length × width × kg/m² / 1000
  mass_t              NUMERIC     NOT NULL    CHECK (mass_t > 0),
  -- Ceny i sumy (w walucie oferty)
  cost_price_per_ton  NUMERIC,                                              -- może być 0/NULL — kalkulacja wstępna
  sell_price_per_ton  NUMERIC     NOT NULL    CHECK (sell_price_per_ton >= 0),
  cost_total          NUMERIC,                                              -- = mass_t × cost_price_per_ton
  sell_total          NUMERIC     NOT NULL    CHECK (sell_total >= 0),      -- = mass_t × sell_price_per_ton
  -- Denominacja (zawsze obliczona, niezależnie od currency oferty)
  sell_eur_total      NUMERIC     NOT NULL    CHECK (sell_eur_total >= 0),
  sell_pln_total      NUMERIC     NOT NULL    CHECK (sell_pln_total >= 0),
  margin_pct          NUMERIC,                                              -- NULL gdy sell = 0 lub cost = 0
  -- Sortowanie i audit
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE road_plate_sale_offer_items IS
  'Pozycje ofert sprzedaży płyt drogowych. ON DELETE CASCADE na offer_id — usunięcie oferty kasuje pozycje. profile_id z ON DELETE SET NULL — zachowuje historię.';

CREATE INDEX IF NOT EXISTS idx_rp_sale_offer_items_offer   ON road_plate_sale_offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_rp_sale_offer_items_profile ON road_plate_sale_offer_items(profile_id);

-- ─── 4. Cennik 2D: profile × gatunek → cena EUR/t ─────────────────────────────
--     Bez magazynu (decyzja: płyty sprzedawane z jednej lokalizacji, jak w wynajmie).
--     UNIQUE(profile_id, steel_grade) — jedna cena na parę.
CREATE TABLE IF NOT EXISTS road_plate_sale_prices (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID        NOT NULL REFERENCES road_plate_profiles(id) ON DELETE CASCADE,
  steel_grade   TEXT        NOT NULL
    CHECK (steel_grade IN ('min. S270GP','S270GP','min. S355GP','S355GP')),
  price_eur_t   NUMERIC,                  -- NULL = brak ceny (cell pusty w UI)
  available     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, steel_grade)
);

COMMENT ON TABLE road_plate_sale_prices IS
  'Cennik sprzedaży płyt drogowych: profile_id × steel_grade → price_eur_t. Brak magazynu (jedna lokalizacja). ON DELETE CASCADE — usunięcie profilu kasuje jego ceny.';

CREATE INDEX IF NOT EXISTS idx_rp_sale_prices_profile ON road_plate_sale_prices(profile_id);

-- ─── 5. Trigger: auto-generacja numeru SD/YYYY/NNN przy INSERT oferty ─────────
--     SECURITY DEFINER — pozwala anon insertować ofertę bez dostępu do
--     road_plate_offer_sequences (zgodnie z CLAUDE.md gotcha).
--     UPSERT z RETURNING — atomowy increment, brak race condition.
CREATE OR REPLACE FUNCTION generate_road_plate_offer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year     INTEGER;
  v_sequence INTEGER;
BEGIN
  -- Rok wg czasu warszawskiego — chroni przed przesunięciem rocznym gdy
  -- serwer DB jest w UTC, a oferta jest wystawiana wieczorem 31.12 czasu PL.
  v_year := EXTRACT(YEAR FROM timezone('Europe/Warsaw', NOW()))::INTEGER;

  -- Atomowy UPSERT: pierwszy wpis w roku → 1, kolejne → last_sequence + 1
  INSERT INTO road_plate_offer_sequences (year, last_sequence, updated_at)
  VALUES (v_year, 1, NOW())
  ON CONFLICT (year)
    DO UPDATE SET
      last_sequence = road_plate_offer_sequences.last_sequence + 1,
      updated_at    = NOW()
  RETURNING last_sequence INTO v_sequence;

  -- Ustaw pola w wstawianym wierszu — overridujemy nawet jeśli klient podał
  NEW.year         := v_year;
  NEW.sequence     := v_sequence;
  NEW.offer_number := 'SPP/' || v_year || '/' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_road_plate_offer_number ON road_plate_sale_offers;
CREATE TRIGGER trg_road_plate_offer_number
  BEFORE INSERT ON road_plate_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION generate_road_plate_offer_number();

-- ─── 6. Trigger: auto-update updated_at na road_plate_sale_offers ─────────────
CREATE OR REPLACE FUNCTION touch_road_plate_sale_offer_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_road_plate_sale_offer_touch ON road_plate_sale_offers;
CREATE TRIGGER trg_road_plate_sale_offer_touch
  BEFORE UPDATE ON road_plate_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION touch_road_plate_sale_offer_updated_at();

-- ─── 7. Trigger: auto-update updated_at na road_plate_sale_prices ─────────────
--     Niezbędny, bo cennik jest edytowany komórka-po-komórce w UI i potrzebny
--     jest timestamp ostatniej modyfikacji do wyświetlenia w historii.
CREATE OR REPLACE FUNCTION touch_road_plate_sale_price_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_road_plate_sale_price_touch ON road_plate_sale_prices;
CREATE TRIGGER trg_road_plate_sale_price_touch
  BEFORE UPDATE ON road_plate_sale_prices
  FOR EACH ROW
  EXECUTE FUNCTION touch_road_plate_sale_price_updated_at();

-- ─── 8. Seed cennika — placeholder rows (cross join profil × gatunek) ─────────
--     Generuje pełną siatkę cennika z price_eur_t = NULL, available = FALSE.
--     Dzięki temu UI cennika ma od razu strukturę do edycji.
--     Kalkulator widząc NULL — wymusza wpisanie ceny ręcznie (manual entry
--     w polu sell_price_per_ton), więc brak ryzyka pomyłkowej sprzedaży po
--     wartościach placeholder.
--
--     ON CONFLICT DO NOTHING — idempotentne; ponowne uruchomienie migracji
--     nie nadpisze już-wypełnionych cen.
INSERT INTO road_plate_sale_prices (profile_id, steel_grade, price_eur_t, available)
SELECT
  rp.id,
  sg.grade,
  NULL,    -- placeholder — wypełnij w UI cennika
  FALSE
FROM road_plate_profiles rp
CROSS JOIN (VALUES
  ('min. S270GP'),
  ('S270GP'),
  ('min. S355GP'),
  ('S355GP')
) AS sg(grade)
WHERE rp.active = TRUE
ON CONFLICT (profile_id, steel_grade) DO NOTHING;

-- ============================================================================
-- KONIEC MIGRACJI
--
-- Weryfikacja po uruchomieniu (uruchom w SQL Editor osobno):
--
--   -- Sprawdź czy trigger numeracji ma SECURITY DEFINER:
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN (
--     'generate_road_plate_offer_number',
--     'touch_road_plate_sale_offer_updated_at',
--     'touch_road_plate_sale_price_updated_at'
--   );
--   -- generate_road_plate_offer_number powinien mieć prosecdef = true
--
--   -- Sprawdź ile wierszy seedu cennika powstało (powinno = profile_count × 4):
--   SELECT
--     (SELECT COUNT(*) FROM road_plate_profiles WHERE active = TRUE) AS profile_count,
--     (SELECT COUNT(*) FROM road_plate_sale_prices) AS price_rows_count;
--
--   -- Test numeracji (smoke test w transakcji — bezpieczny, nic nie pozostawia):
--   BEGIN;
--     INSERT INTO road_plate_sale_offers (status, currency)
--     VALUES ('szkic', 'EUR')
--     RETURNING offer_number, year, sequence;
--   ROLLBACK;
--   -- Oczekiwany wynik: SPP/2026/001 (lub kolejny numer w bieżącym roku).
--   -- ROLLBACK cofa CAŁĄ transakcję, w tym UPSERT na road_plate_offer_sequences
--   -- wykonany przez trigger SECURITY DEFINER.
--
--   -- Lista wszystkich nowych tabel i trigerów:
--   SELECT tablename FROM pg_tables
--   WHERE tablename LIKE 'road_plate_sale%' OR tablename = 'road_plate_offer_sequences'
--   ORDER BY tablename;
-- ============================================================================
