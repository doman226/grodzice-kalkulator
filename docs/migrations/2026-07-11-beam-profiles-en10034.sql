-- ============================================================================
-- Migration: Katalog dwuteowników HEA/HEB/HEM wg EN 10034 (2026-07-11)
--
-- Źródło: katalog "Stal węglowa. Kształtowniki gorącowalcowane —
-- Dwuteowniki szerokostopowe wg EN 10034" (masa teoretyczna kg/m, wymiary h×b).
--
-- Zakres:
--   1. Rozszerzenie CHECK serii o 'HEM' (dotychczas HEB/HEA/IPE).
--   2. Korekta mas istniejących profili wg katalogu:
--        HEA340: 108 → 105 kg/m
--        HEB200: 61.27 → 61.3 kg/m
--      (HEA140 24.7 ✓ i HEB300 117 ✓ już zgodne; IPE300 poza tym katalogiem.)
--   3. Seed 39 nowych profili (HEA 100–400, HEB 100–360, HEM 100–360)
--      — nazwy bez spacji (konwencja istniejąca), ON CONFLICT DO NOTHING.
--
-- Katalog beam_profiles jest WSPÓLNY dla wynajmu (OH) i sprzedaży (SH).
-- Zmiana mas NIE wpływa na historyczne oferty (pozycje trzymają snapshot).
-- Wykonanie: idempotentne. Supabase projekt hliemaqfncptedkxxakt.
-- ============================================================================

-- ─── 1. CHECK serii + HEM ─────────────────────────────────────────────────────
ALTER TABLE beam_profiles DROP CONSTRAINT IF EXISTS beam_profiles_series_check;
ALTER TABLE beam_profiles ADD CONSTRAINT beam_profiles_series_check
  CHECK (series IN ('HEB','HEA','IPE','HEM'));

-- ─── 2. Korekty mas wg EN 10034 ───────────────────────────────────────────────
UPDATE beam_profiles SET weight_kg_per_m = 105,  updated_at = NOW()
  WHERE name = 'HEA340' AND weight_kg_per_m <> 105;
UPDATE beam_profiles SET weight_kg_per_m = 61.3, updated_at = NOW()
  WHERE name = 'HEB200' AND weight_kg_per_m <> 61.3;

-- ─── 3. Seed katalogu EN 10034 (masa teoretyczna kg/m, h×b mm) ────────────────
INSERT INTO beam_profiles (name, series, weight_kg_per_m, height_mm, width_mm) VALUES
  -- HEA (HEA140 i HEA340 już istnieją — pominięte)
  ('HEA100','HEA', 16.7,  96, 100),
  ('HEA120','HEA', 19.9, 114, 120),
  ('HEA160','HEA', 30.4, 152, 160),
  ('HEA180','HEA', 35.5, 171, 180),
  ('HEA200','HEA', 42.3, 190, 200),
  ('HEA220','HEA', 50.5, 210, 220),
  ('HEA240','HEA', 60.3, 230, 240),
  ('HEA260','HEA', 68.2, 250, 260),
  ('HEA280','HEA', 76.4, 270, 280),
  ('HEA300','HEA', 88.3, 290, 300),
  ('HEA320','HEA', 97.6, 310, 300),
  ('HEA360','HEA', 112,  350, 300),
  ('HEA400','HEA', 125,  390, 300),
  -- HEB (HEB200 i HEB300 już istnieją — pominięte)
  ('HEB100','HEB', 20.4, 100, 100),
  ('HEB120','HEB', 26.7, 120, 120),
  ('HEB140','HEB', 33.7, 140, 140),
  ('HEB160','HEB', 42.6, 160, 160),
  ('HEB180','HEB', 51.2, 180, 180),
  ('HEB220','HEB', 71.5, 220, 220),
  ('HEB240','HEB', 83.2, 240, 240),
  ('HEB260','HEB', 93.0, 260, 260),
  ('HEB280','HEB', 103,  280, 280),
  ('HEB320','HEB', 127,  320, 300),
  ('HEB340','HEB', 134,  340, 300),
  ('HEB360','HEB', 142,  360, 300),
  -- HEM (nowa seria)
  ('HEM100','HEM', 41.8, 120, 106),
  ('HEM120','HEM', 52.1, 140, 126),
  ('HEM140','HEM', 63.2, 160, 146),
  ('HEM160','HEM', 76.2, 180, 166),
  ('HEM180','HEM', 88.9, 200, 186),
  ('HEM200','HEM', 103,  220, 206),
  ('HEM220','HEM', 117,  240, 226),
  ('HEM240','HEM', 157,  270, 248),
  ('HEM260','HEM', 172,  290, 268),
  ('HEM280','HEM', 189,  310, 288),
  ('HEM300','HEM', 238,  340, 310),
  ('HEM320','HEM', 245,  359, 309),
  ('HEM340','HEM', 248,  377, 309),
  ('HEM360','HEM', 250,  395, 308)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Weryfikacja:
--   SELECT series, COUNT(*) FROM beam_profiles WHERE active GROUP BY series;
--   -- oczekiwane: HEA 15, HEB 14, HEM 14, IPE 1 (razem 44)
--   SELECT name, weight_kg_per_m FROM beam_profiles
--   WHERE name IN ('HEA340','HEB200');  -- 105, 61.3
-- ============================================================================
