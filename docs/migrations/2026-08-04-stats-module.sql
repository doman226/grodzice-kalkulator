-- ============================================================================
-- Moduł statystyk (STATS) — widok normalizujący + tabela pomocnicza
-- Data: 2026-08-04
-- Spec: docs/superpowers/specs/2026-08-04-modul-statystyk-design.md
-- Plan: docs/superpowers/plans/2026-08-04-modul-statystyk.md
--
-- ZAKRES: wyłącznie CREATE. Żadnego ALTER TABLE na tabelach ofertowych —
-- moduły wynajmu i sprzedaży pozostają nietknięte, także strukturalnie.
--
-- WYCOFANIE:
--   DROP VIEW IF EXISTS v_offer_stats;
--   DROP TABLE IF EXISTS offer_followups;
-- ============================================================================

-- ─── 1. Tabela pomocnicza ───────────────────────────────────────────────────
-- Osobna tabela zamiast ALTER TABLE na sześciu tabelach ofert.
-- snoozed_until — „wciąż w grze", odkłada ofertę na liście Do domknięcia.
-- decided_at/by — kiedy i przez kogo domknięto (zapisuje tylko moduł statystyk).

CREATE TABLE IF NOT EXISTS offer_followups (
  module_code   text        NOT NULL,
  offer_id      uuid        NOT NULL,
  snoozed_until timestamptz,
  decided_at    timestamptz,
  decided_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_code, offer_id)
);

ALTER TABLE offer_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_all_offer_followups ON offer_followups;
CREATE POLICY public_all_offer_followups ON offer_followups
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON offer_followups TO anon, authenticated;

-- ─── 2. Widok normalizujący ─────────────────────────────────────────────────
-- Scala 7 strumieni ofertowych w jedną tabelę faktów. Jedyne miejsce w systemie,
-- które zna mapowanie kolumn wartości i masy każdego modułu.
--
-- WARTOŚĆ: na poziomie oferty kolumna *_pln trzyma PLN, a *_eur trzyma EUR —
-- zweryfikowane (iloraz = exchange_rate we wszystkich modułach i obu walutach).
-- Ostrzeżenie z CLAUDE.md o kolumnach _pln trzymających EUR dotyczy WYŁĄCZNIE
-- cen szkód, nie kwot zbiorczych. Brak przeliczania w module.
--
-- MASA: SP/SR/SPP nie mają wiarygodnej masy na poziomie oferty (SP ma tam 0) —
-- liczona z pozycji. OF/OP/OH/SH mają fallback na kolumnę oferty (legacy).

CREATE OR REPLACE VIEW v_offer_stats AS

-- OF: wynajem grodzic
SELECT o.id, 'OF'::text AS module_code, 'rental'::text AS kind,
       o.offer_number, o.client_id, c.name AS client_name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.rental_cost_pln AS value_pln,
       o.rental_cost_eur AS value_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM offer_items i WHERE i.offer_id = o.id),
                o.mass_t, 0) AS mass_t,
       NULL::numeric AS margin_pct,
       fu.snoozed_until
FROM offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'OF' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL AND COALESCE(o.item_type, 'sheet_pile') = 'sheet_pile'

UNION ALL

-- OP: wynajem płyt drogowych
SELECT o.id, 'OP', 'rental', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.rental_cost_pln, o.rental_cost_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM offer_items i WHERE i.offer_id = o.id),
                o.mass_t, 0),
       NULL::numeric, fu.snoozed_until
FROM offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'OP' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL AND o.item_type = 'road_plate'

UNION ALL

-- OH: wynajem dwuteowników
SELECT o.id, 'OH', 'rental', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.rental_cost_pln, o.rental_cost_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM beam_rental_offer_items i
                 WHERE i.offer_id = o.id), o.total_mass_t, 0),
       NULL::numeric, fu.snoozed_until
FROM beam_rental_offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'OH' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL

UNION ALL

-- SP: sprzedaż grodzic
SELECT o.id, 'SP', 'sale', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.total_sell_pln, o.total_sell_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM sale_offer_items i
                 WHERE i.offer_id = o.id), 0),
       o.margin_pct, fu.snoozed_until
FROM sale_offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'SP' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL

UNION ALL

-- SR: sprzedaż rur
SELECT o.id, 'SR', 'sale', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.total_sell_pln, o.total_sell_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM pipe_sale_offer_items i
                 WHERE i.offer_id = o.id), 0),
       o.margin_pct, fu.snoozed_until
FROM pipe_sale_offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'SR' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL

UNION ALL

-- SPP: sprzedaż płyt drogowych
SELECT o.id, 'SPP', 'sale', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.total_sell_pln, o.total_sell_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM road_plate_sale_offer_items i
                 WHERE i.offer_id = o.id), 0),
       o.margin_pct, fu.snoozed_until
FROM road_plate_sale_offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'SPP' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL

UNION ALL

-- SH: sprzedaż dwuteowników
SELECT o.id, 'SH', 'sale', o.offer_number, o.client_id, c.name,
       o.prepared_by, o.status, o.currency, o.created_at,
       o.total_sell_pln, o.total_sell_eur,
       COALESCE((SELECT SUM(i.mass_t) FROM beam_sale_offer_items i
                 WHERE i.offer_id = o.id), o.total_mass_t, 0),
       o.margin_pct, fu.snoozed_until
FROM beam_sale_offers o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN offer_followups fu ON fu.module_code = 'SH' AND fu.offer_id = o.id
WHERE o.deleted_at IS NULL;

-- ─── 3. Uprawnienia ─────────────────────────────────────────────────────────
-- BEZ tego PostgREST zwraca mylące 404 "relation does not exist in schema cache",
-- a nie błąd uprawnień — łatwo zmarnować pół godziny na szukanie literówki.

GRANT SELECT ON v_offer_stats TO anon, authenticated;
