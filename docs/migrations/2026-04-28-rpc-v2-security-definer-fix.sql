-- ============================================================================
-- Hotfix: update_offer_items_atomic_v2 — SECURITY DEFINER + cleanup duplikatów
-- Data: 2026-04-28
--
-- Problem: poprzednia wersja RPC była SECURITY INVOKER (default plpgsql),
--          przez co DELETE wewnątrz funkcji nie miał uprawnień gdy wywoływany
--          przez rolę `anon`. W rezultacie INSERT się wykonywał, DELETE — nie,
--          i pozycje oferty się duplikowały zamiast być zastępowane.
--
-- Diagnoza: na ofercie OF/2026/022 widać 4 wiersze z różnymi godzinami utworzenia,
--           3 z sort_order=0 — czyli każda edycja dorzucała pozycje zamiast je
--           wymieniać.
--
-- Naprawa: SECURITY DEFINER sprawia że funkcja wykonuje się z uprawnieniami
--          jej właściciela (postgres → superuser), więc DELETE działa
--          niezależnie od polityk RLS lub uprawnień wywołującego.
--          SET search_path zabezpiecza przed atakiem typu search_path injection.
--
-- Wykonanie: wklej całość do Supabase SQL Editor i uruchom raz.
--            Idempotentne (CREATE OR REPLACE) — można uruchamiać wielokrotnie.
-- ============================================================================

-- 1. Przepisanie RPC v2 z SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_offer_items_atomic_v2(
  p_offer_id UUID,
  p_items    JSONB
)
RETURNS SETOF offer_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Usuń wszystkie istniejące pozycje oferty
  DELETE FROM offer_items WHERE offer_id = p_offer_id;

  -- 2. Wstaw nowe pozycje atomowo
  RETURN QUERY
  INSERT INTO offer_items (
    offer_id,
    item_type,
    profile_name,
    profile_type,
    steel_grade,
    quantity,
    length_m,
    total_length_m,
    mass_t,
    wall_area_m2,
    thickness_mm,
    sheet_length_m,
    sheet_width_m,
    weight_kg_per_m2,
    sort_order
  )
  SELECT
    p_offer_id,
    COALESCE(it->>'item_type', 'sheet_pile'),
    it->>'profile_name',
    it->>'profile_type',
    it->>'steel_grade',
    (it->>'quantity')::INT,
    NULLIF(it->>'length_m', '')::NUMERIC,
    NULLIF(it->>'total_length_m', '')::NUMERIC,
    NULLIF(it->>'mass_t', '')::NUMERIC,
    NULLIF(it->>'wall_area_m2', '')::NUMERIC,
    NULLIF(it->>'thickness_mm', '')::NUMERIC,
    NULLIF(it->>'sheet_length_m', '')::NUMERIC,
    NULLIF(it->>'sheet_width_m', '')::NUMERIC,
    NULLIF(it->>'weight_kg_per_m2', '')::NUMERIC,
    COALESCE((it->>'sort_order')::INT, 0)
  FROM jsonb_array_elements(p_items) AS it
  RETURNING *;
END;
$$;

-- 2. Uprawnienia dla ról frontendu
GRANT EXECUTE ON FUNCTION update_offer_items_atomic_v2(UUID, JSONB) TO anon, authenticated;

-- 3. Cleanup duplikatów na ofercie OF/2026/022
--    Zostawiamy TYLKO pozycje z najnowszą godziną utworzenia (z mojego testu RPC v2 — 08:16:19),
--    czyli 2 wiersze: sort_order=0 (qty=15) i sort_order=1 (qty=100).
--    Wszystkie starsze duplikaty (02:39, 07:54) są usuwane.
WITH offer_uuid AS (
  SELECT id FROM offers WHERE offer_number = 'OF/2026/022'
),
latest_created AS (
  SELECT MAX(created_at) AS max_t
  FROM offer_items
  WHERE offer_id = (SELECT id FROM offer_uuid)
)
DELETE FROM offer_items
WHERE offer_id = (SELECT id FROM offer_uuid)
  AND created_at < (SELECT max_t FROM latest_created);

-- 4. Aktualizacja nagłówka oferty żeby pasowała do pozostałych 2 pozycji
--    (mass_t i pochodne były policzone PRZED bug fix, więc zostawiamy header'owe wartości
--     zgodne z ostatnim zapisem przez UI: 135.4125 t = 17.6625 + 117.75)
--    Nie ruszamy headera — był on poprawnie zapisany przez PATCH offers w moim teście.

-- 5. Weryfikacja
SELECT 'RPC update_offer_items_atomic_v2 zaktualizowane' AS status_,
       prosecdef AS security_definer,  -- powinno być TRUE
       array_to_string(proconfig, ', ') AS config_settings
FROM pg_proc
WHERE proname = 'update_offer_items_atomic_v2';

SELECT 'Pozycje OF/2026/022 po cleanup' AS check_,
       COUNT(*) AS pozycji,
       SUM(mass_t) AS suma_masy,
       array_agg(quantity ORDER BY sort_order) AS quantities
FROM offer_items oi
JOIN offers o ON o.id = oi.offer_id
WHERE o.offer_number = 'OF/2026/022';
