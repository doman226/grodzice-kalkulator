-- ============================================================================
-- Migration: RPC update_offer_items_atomic_v2
-- Data: 2026-04-28
--
-- Cel: atomowa edycja pozycji oferty (DELETE + INSERT w jednej transakcji DB)
--      ze wsparciem dla WSZYSTKICH kolumn offer_items, w tym pól road_plate
--      (item_type, thickness_mm, sheet_length_m, sheet_width_m, weight_kg_per_m2).
--
-- Strategia: NOWA procedura v2 obok istniejącej v1. Grodzice nadal używają v1
--            (zero regresji), road_plate i przyszłe nowe typy używają v2.
--            W przyszłości można zmigrować grodzice na v2 i usunąć v1 osobną sesją.
--
-- Wykonanie: wklej całość do Supabase SQL Editor i uruchom raz.
--            Idempotentne — CREATE OR REPLACE FUNCTION nie zaszkodzi przy ponownym uruchomieniu.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_offer_items_atomic_v2(
  p_offer_id UUID,
  p_items    JSONB
)
RETURNS SETOF offer_items
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Usuń wszystkie istniejące pozycje oferty
  DELETE FROM offer_items WHERE offer_id = p_offer_id;

  -- 2. Wstaw nowe pozycje atomowo. Jeśli INSERT padnie (np. constraint violation),
  --    cała transakcja (DELETE + INSERT) zostanie automatycznie cofnięta przez Postgres.
  --    Pola road_plate (thickness_mm, sheet_length_m, sheet_width_m, weight_kg_per_m2)
  --    są opcjonalne — dla grodzic zostają NULL.
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

-- Uprawnienia: udostępnij dla roli używanej przez frontend (anon)
-- (Supabase domyślnie pozwala anon wywoływać RPC, ale jawnie potwierdzamy)
GRANT EXECUTE ON FUNCTION update_offer_items_atomic_v2(UUID, JSONB) TO anon, authenticated;

-- Weryfikacja: po uruchomieniu sprawdź czy funkcja istnieje
SELECT 'update_offer_items_atomic_v2 created' AS check_,
       proname,
       pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'update_offer_items_atomic_v2';
