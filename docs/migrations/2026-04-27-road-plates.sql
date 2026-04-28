-- ============================================================================
-- Migration: Road Plates (płyty drogowe) — moduł WYNAJMU
-- Data: 2026-04-27
--
-- Strategia: 100% additive.
--   * Brak ALTER na NOT NULL/CHECK istniejących kolumn.
--   * Wszystkie istniejące oferty/profiles/rental_prices pozostają nietknięte.
--   * Nowa kolumna `item_type` z DEFAULT 'sheet_pile' łapie wszystkie stare
--     wiersze automatycznie — żaden kod grodzic nie musi być zmieniany.
--
-- Wykonanie: wklej cały skrypt do Supabase SQL Editor (project hliemaqfncptedkxxakt)
-- i uruchom jednorazowo. Wszystkie operacje są idempotentne (IF NOT EXISTS / ON CONFLICT).
-- ============================================================================

-- 1. Dyskryminator typu na tabelach transakcyjnych
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'sheet_pile'
    CHECK (item_type IN ('sheet_pile','road_plate'));

ALTER TABLE offer_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'sheet_pile'
    CHECK (item_type IN ('sheet_pile','road_plate'));

CREATE INDEX IF NOT EXISTS idx_offers_item_type      ON offers(item_type);
CREATE INDEX IF NOT EXISTS idx_offer_items_item_type ON offer_items(item_type);

-- 2. Snapshot cennika napraw dla płyt drogowych — kolumny na ofercie
--    (analogicznie do loss_price_pln itd. dla grodzic — przechowywane per oferta
--     w momencie zapisu, żeby zmiana cennika globalnego nie wpływała na stare oferty)
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS rp_loss_price_pln    NUMERIC,
  ADD COLUMN IF NOT EXISTS rp_service_hour_pln  NUMERIC,
  ADD COLUMN IF NOT EXISTS rp_sorting_price_pln NUMERIC,
  ADD COLUMN IF NOT EXISTS rp_m12_welding_pln   NUMERIC,
  ADD COLUMN IF NOT EXISTS rp_cutting_head_pln  NUMERIC,
  ADD COLUMN IF NOT EXISTS rp_lifting_hole_pln  NUMERIC;

-- 3. Geometria płyty drogowej w pozycjach oferty
ALTER TABLE offer_items
  ADD COLUMN IF NOT EXISTS thickness_mm     NUMERIC,
  ADD COLUMN IF NOT EXISTS sheet_length_m   NUMERIC,
  ADD COLUMN IF NOT EXISTS sheet_width_m    NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_kg_per_m2 NUMERIC;

-- 4. Katalog profili płyt drogowych (osobna tabela — geometria niekompatybilna z `profiles`)
CREATE TABLE IF NOT EXISTS road_plate_profiles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  thickness_mm     NUMERIC     NOT NULL,
  sheet_length_m   NUMERIC     NOT NULL,
  sheet_width_m    NUMERIC     NOT NULL,
  weight_kg_per_m2 NUMERIC     NOT NULL,
  steel_grade      TEXT        NOT NULL DEFAULT 'S235',
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Cennik płyt drogowych (jednowierszowa, jak rental_prices dla grodzic)
--    Wszystkie ceny canonical w PLN — toggle PLN/EUR w UI konwertuje przez kurs
--    (identycznie jak w grodzicach).
CREATE TABLE IF NOT EXISTS road_plate_rental_prices (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base_price_pln       NUMERIC     NOT NULL,
  base_weeks           INTEGER     NOT NULL DEFAULT 8,
  price_per_week_1_pln NUMERIC     NOT NULL,
  threshold_weeks      INTEGER     NOT NULL DEFAULT 26,
  price_per_week_2_pln NUMERIC     NOT NULL,
  loss_price_pln       NUMERIC     NOT NULL,  -- strata całkowita [PLN/t]
  service_hour_pln     NUMERIC     NOT NULL,  -- roboczogodzina serwisowa [PLN/h]
  sorting_price_pln    NUMERIC     NOT NULL,  -- sortowanie i czyszczenie [PLN/t]
  m12_welding_pln      NUMERIC     NOT NULL,  -- spawanie otworów M12 [PLN/szt]
  cutting_head_pln     NUMERIC     NOT NULL,  -- głowica tnąca [PLN/cięcie]
  lifting_hole_pln     NUMERIC     NOT NULL,  -- nowy otwór do podnoszenia [PLN/szt]
  note                 TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Historia zmian cennika płyt (analogicznie do price_history)
CREATE TABLE IF NOT EXISTS road_plate_price_history (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base_price_pln       NUMERIC,
  base_weeks           INTEGER,
  price_per_week_1_pln NUMERIC,
  threshold_weeks      INTEGER,
  price_per_week_2_pln NUMERIC,
  loss_price_pln       NUMERIC,
  service_hour_pln     NUMERIC,
  sorting_price_pln    NUMERIC,
  m12_welding_pln      NUMERIC,
  cutting_head_pln     NUMERIC,
  lifting_hole_pln     NUMERIC,
  note                 TEXT,
  changed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Trigger: log każdej zmiany cennika płyt do historii
CREATE OR REPLACE FUNCTION log_road_plate_price_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO road_plate_price_history (
    base_price_pln, base_weeks, price_per_week_1_pln, threshold_weeks, price_per_week_2_pln,
    loss_price_pln, service_hour_pln, sorting_price_pln, m12_welding_pln, cutting_head_pln,
    lifting_hole_pln, note
  ) VALUES (
    OLD.base_price_pln, OLD.base_weeks, OLD.price_per_week_1_pln, OLD.threshold_weeks, OLD.price_per_week_2_pln,
    OLD.loss_price_pln, OLD.service_hour_pln, OLD.sorting_price_pln, OLD.m12_welding_pln, OLD.cutting_head_pln,
    OLD.lifting_hole_pln, OLD.note
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_road_plate_price_change ON road_plate_rental_prices;
CREATE TRIGGER trg_road_plate_price_change
  BEFORE UPDATE ON road_plate_rental_prices
  FOR EACH ROW EXECUTE FUNCTION log_road_plate_price_change();

-- 8. Seed: 2 startowe profile (z pliku Płyty drogowe.xlsx)
INSERT INTO road_plate_profiles (name, thickness_mm, sheet_length_m, sheet_width_m, weight_kg_per_m2, steel_grade)
SELECT * FROM (VALUES
  ('Płyta drogowa 12,5 mm', 12.5::NUMERIC, 6::NUMERIC, 2::NUMERIC, 98.125::NUMERIC, 'S235'),
  ('Płyta drogowa 12 mm',   12::NUMERIC,   6::NUMERIC, 2::NUMERIC, 94.2::NUMERIC,   'S235')
) AS v(name, thickness_mm, sheet_length_m, sheet_width_m, weight_kg_per_m2, steel_grade)
WHERE NOT EXISTS (SELECT 1 FROM road_plate_profiles);

-- 9. Seed: cennik startowy
--    base 180 PLN/t za 8 tyg., kolejny tydzień 22 PLN/t (bez progresji obniżki — week_2 = week_1)
--    Damage: wartości z EUR przeliczone @ 4,30 PLN/EUR (do późniejszej korekty w UI)
INSERT INTO road_plate_rental_prices (
  base_price_pln, base_weeks, price_per_week_1_pln, threshold_weeks, price_per_week_2_pln,
  loss_price_pln, service_hour_pln, sorting_price_pln, m12_welding_pln, cutting_head_pln, lifting_hole_pln,
  note
)
SELECT 180, 8, 22, 26, 22,
       3311, 107.50, 129, 10.75, 107.50, 25.80,
       'Wartości startowe — szkody przeliczone z EUR @ 4,30 PLN/EUR (2026-04-27)'
WHERE NOT EXISTS (SELECT 1 FROM road_plate_rental_prices);

-- 10. Weryfikacja po wykonaniu — sprawdź że wszystko jest na miejscu
SELECT 'item_type column on offers'      AS check_,
       COUNT(*) FILTER (WHERE item_type='sheet_pile') AS sheet_pile_offers,
       COUNT(*) FILTER (WHERE item_type='road_plate') AS road_plate_offers
FROM offers;

SELECT 'road_plate_profiles seeded'      AS check_, COUNT(*) AS rows_ FROM road_plate_profiles;
SELECT 'road_plate_rental_prices seeded' AS check_, COUNT(*) AS rows_ FROM road_plate_rental_prices;
