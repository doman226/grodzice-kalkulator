-- ============================================================================
-- Migration: Pipe Sale (rury stalowe — sprzedaż) — faza 2
-- Data: 2026-05-13
--
-- Strategia: 100% addytywna, pełna izolacja od grodzic.
--   * Brak ALTER na istniejących tabelach sale_offers / sale_offer_items.
--   * Nowe tabele:   pipe_sale_offers, pipe_sale_offer_items, pipe_offer_sequences.
--   * Osobny trigger numeracji SR/YYYY/NNN — NIE używa istniejącej offer_sequences.
--   * Trigger SECURITY DEFINER (per CLAUDE.md gotcha): umożliwia anon insertowanie
--     ofert bez bezpośredniego dostępu do pipe_offer_sequences.
--
-- Wykonanie: wklej cały skrypt do Supabase SQL Editor (projekt hliemaqfncptedkxxakt)
-- i uruchom jednorazowo. Wszystkie operacje są idempotentne
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
--
-- UWAGA — RLS celowo NIE włączamy w tej migracji:
--   Tabele pipe_sale_* są tworzone bez ROW LEVEL SECURITY, dokładnie w takim
--   samym stanie w jakim dziś działa moduł grodzic (sale_offers / sale_offer_items)
--   — dzięki temu zapis ofert rur działa od pierwszej minuty po uruchomieniu
--   migracji, bez konieczności konfigurowania policies.
--
--   Gdy będziesz robił osobne zadanie bezpieczeństwa (zaplanowane na później),
--   włączysz RLS jednorazowo dla wszystkich tabel sprzedaży naraz:
--     ALTER TABLE pipe_offer_sequences   ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE pipe_sale_offers       ENABLE ROW LEVEL SECURITY;
--     ALTER TABLE pipe_sale_offer_items  ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY ... -- (analogicznie do sale_offers — policies anon/authenticated)
-- ============================================================================

-- 1. Sekwencja numeracji ofert sprzedaży rur (izolowana od OF/SP)
--    Jeden wiersz per rok. last_sequence inkrementowane atomowo przez trigger.
CREATE TABLE IF NOT EXISTS pipe_offer_sequences (
  year          INTEGER     PRIMARY KEY,
  last_sequence INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  pipe_offer_sequences IS
  'Sekwencja numerów ofert sprzedaży rur stalowych (SR/YYYY/NNN). Izolowana od OF i SP.';
COMMENT ON COLUMN pipe_offer_sequences.last_sequence IS
  'Ostatnio przydzielony numer w danym roku. UPSERT przez trigger generate_pipe_offer_number().';

-- 2. Tabela ofert sprzedaży rur — pełny analog sale_offers dla grodzic
CREATE TABLE IF NOT EXISTS pipe_sale_offers (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Numeracja: trigger BEFORE INSERT generuje SR/YYYY/NNN
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

COMMENT ON TABLE pipe_sale_offers IS
  'Oferty sprzedaży rur stalowych (SR/YYYY/NNN). Soft-delete przez deleted_at.';

CREATE INDEX IF NOT EXISTS idx_pipe_offers_deleted   ON pipe_sale_offers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pipe_offers_created   ON pipe_sale_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipe_offers_client    ON pipe_sale_offers(client_id);
CREATE INDEX IF NOT EXISTS idx_pipe_offers_year_seq  ON pipe_sale_offers(year, sequence);

-- 3. Pozycje oferty rur
--    Atrybuty katalogowe (product_type, condition, norm, steel_grade, surface)
--    przechowywane jako TEXT snapshots — nie ma FK na tabele słownikowe,
--    bo słowniki żyją w src/lib/pipeConstants.ts (decyzja z fazy 1).
CREATE TABLE IF NOT EXISTS pipe_sale_offer_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id            UUID        NOT NULL REFERENCES pipe_sale_offers(id) ON DELETE CASCADE,
  -- Specyfikacja rury (atrybuty katalogowe — string snapshots)
  product_type        TEXT        NOT NULL,
  condition           TEXT        NOT NULL,
  norm                TEXT,                   -- NULL gdy stan zawiera "bez atestu"
  norm_description    TEXT,                   -- "nie dotyczy" gdy stan bez atestu
  steel_grade         TEXT        NOT NULL,
  surface             TEXT        NOT NULL,
  -- Wymiary i ilość (z CHECK constraints — defense in depth)
  diameter_mm         NUMERIC     NOT NULL    CHECK (diameter_mm > 0),
  wall_thickness_mm   NUMERIC     NOT NULL    CHECK (wall_thickness_mm > 0),
  quantity_szt        INTEGER     NOT NULL    CHECK (quantity_szt > 0),
  length_m            NUMERIC     NOT NULL    CHECK (length_m > 0),
  -- Obliczenia (snapshot z momentu zapisu)
  kg_per_m            NUMERIC     NOT NULL    CHECK (kg_per_m > 0),         -- (D-t)*t*0.02466
  total_length_m      NUMERIC     NOT NULL    CHECK (total_length_m > 0),
  mass_t              NUMERIC     NOT NULL    CHECK (mass_t > 0),           -- 3dp zgodnie z konwencją CLAUDE.md
  -- Ceny i sumy (w walucie oferty)
  cost_price_per_ton  NUMERIC,                                              -- może być 0/NULL — kalkulacja wstępna
  sell_price_per_ton  NUMERIC     NOT NULL    CHECK (sell_price_per_ton >= 0),
  cost_total          NUMERIC,                                              -- = mass_t * cost_price_per_ton
  sell_total          NUMERIC     NOT NULL    CHECK (sell_total >= 0),      -- = mass_t * sell_price_per_ton
  -- Denominacja (zawsze obliczona, niezależnie od currency oferty)
  sell_eur_total      NUMERIC     NOT NULL    CHECK (sell_eur_total >= 0),
  sell_pln_total      NUMERIC     NOT NULL    CHECK (sell_pln_total >= 0),
  margin_pct          NUMERIC,                                              -- NULL gdy sell = 0 lub cost = 0
  -- Sortowanie i audit
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Spójność geometryczna rury: grubość ścianki musi być mniejsza od średnicy
  -- (matematyczna walidacja wzoru kg/m = (D-t)*t*0.02466)
  CONSTRAINT pipe_sale_offer_items_wall_lt_diameter
    CHECK (wall_thickness_mm < diameter_mm)
);

COMMENT ON TABLE pipe_sale_offer_items IS
  'Pozycje ofert sprzedaży rur. ON DELETE CASCADE — usunięcie oferty kasuje pozycje.';

CREATE INDEX IF NOT EXISTS idx_pipe_offer_items_offer ON pipe_sale_offer_items(offer_id);

-- 4. Funkcja triggera: auto-generacja numeru SR/YYYY/NNN przy INSERT oferty
--    SECURITY DEFINER — pozwala anon insertować ofertę bez dostępu do
--    pipe_offer_sequences (zgodnie z CLAUDE.md gotcha).
--    UPSERT z RETURNING — atomowy increment, brak race condition.
CREATE OR REPLACE FUNCTION generate_pipe_offer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year     INTEGER;
  v_sequence INTEGER;
BEGIN
  -- Rok wg czasu warszawskiego — chroni przed przecinkiem rocznym
  -- gdy serwer DB jest w UTC, a oferta jest wystawiana wieczorem 31.12 czasu PL
  -- (UTC = nadal 31.12, ale PL = już 1.01 nowego roku — i odwrotnie).
  v_year := EXTRACT(YEAR FROM timezone('Europe/Warsaw', NOW()))::INTEGER;

  -- Atomowy UPSERT: pierwszy wpis w roku → 1, kolejne → last_sequence + 1
  INSERT INTO pipe_offer_sequences (year, last_sequence, updated_at)
  VALUES (v_year, 1, NOW())
  ON CONFLICT (year)
    DO UPDATE SET
      last_sequence = pipe_offer_sequences.last_sequence + 1,
      updated_at    = NOW()
  RETURNING last_sequence INTO v_sequence;

  -- Ustaw pola w wstawianym wierszu — overridujemy nawet jeśli klient podał
  NEW.year         := v_year;
  NEW.sequence     := v_sequence;
  NEW.offer_number := 'SR/' || v_year || '/' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipe_offer_number ON pipe_sale_offers;
CREATE TRIGGER trg_pipe_offer_number
  BEFORE INSERT ON pipe_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION generate_pipe_offer_number();

-- 5. Funkcja triggera: auto-update updated_at na pipe_sale_offers
CREATE OR REPLACE FUNCTION touch_pipe_sale_offer_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipe_sale_offer_touch ON pipe_sale_offers;
CREATE TRIGGER trg_pipe_sale_offer_touch
  BEFORE UPDATE ON pipe_sale_offers
  FOR EACH ROW
  EXECUTE FUNCTION touch_pipe_sale_offer_updated_at();

-- ============================================================================
-- KONIEC MIGRACJI
--
-- Weryfikacja po uruchomieniu (uruchom w SQL Editor osobno):
--
--   -- Sprawdź czy trigger ma SECURITY DEFINER:
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('generate_pipe_offer_number','touch_pipe_sale_offer_updated_at');
--   -- generate_pipe_offer_number powinien mieć prosecdef = true
--
--   -- Test numeracji (smoke test w transakcji — bezpieczny, nic nie pozostawia w bazie):
--   BEGIN;
--     INSERT INTO pipe_sale_offers (status, currency)
--     VALUES ('szkic', 'EUR')
--     RETURNING offer_number, year, sequence;
--   ROLLBACK;
--   -- Oczekiwany wynik: SR/2026/001 (lub kolejny numer w bieżącym roku).
--   -- ROLLBACK cofa CAŁĄ transakcję, w tym UPSERT na pipe_offer_sequences
--   -- wykonany przez trigger SECURITY DEFINER. Po ROLLBACK:
--   --   * pipe_sale_offers — brak wiersza,
--   --   * pipe_offer_sequences.last_sequence — bez zmian.
--   -- (PostgreSQL nie ma natywnych autonomous transactions; SECURITY DEFINER
--   --  zmienia tylko "kto" wykonuje statement, nie "w jakiej transakcji".)
-- ============================================================================
