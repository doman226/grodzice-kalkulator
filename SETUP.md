# Instrukcja uruchomienia – Kalkulator Wynajmu Grodzic

## 1. Zainstaluj zależności

```bash
cd grodzice-kalkulator
npm install
```

## 2. Utwórz projekt w Supabase

1. Wejdź na [supabase.com](https://supabase.com) i utwórz nowy projekt
2. W SQL Editorze wykonaj poniższe zapytania:

```sql
-- Tabela profili grodzic
CREATE TABLE profiles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  width_mm    NUMERIC NOT NULL,
  weight_kg_per_m  NUMERIC NOT NULL,
  wall_kg_per_m2   NUMERIC NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabela cennika
CREATE TABLE rental_prices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  base_price_pln  NUMERIC NOT NULL DEFAULT 450,
  base_weeks      INTEGER NOT NULL DEFAULT 8,
  price_per_week_1 NUMERIC NOT NULL DEFAULT 25,
  threshold_weeks  INTEGER NOT NULL DEFAULT 16,
  price_per_week_2 NUMERIC NOT NULL DEFAULT 20,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  note            TEXT
);

-- Tabela historii cen
CREATE TABLE price_history (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  base_price_pln  NUMERIC,
  base_weeks      INTEGER,
  price_per_week_1 NUMERIC,
  threshold_weeks  INTEGER,
  price_per_week_2 NUMERIC,
  changed_at      TIMESTAMPTZ DEFAULT now(),
  note            TEXT
);

-- Trigger: log zmian cennika
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO price_history (
    base_price_pln, base_weeks, price_per_week_1,
    threshold_weeks, price_per_week_2, note
  ) VALUES (
    OLD.base_price_pln, OLD.base_weeks, OLD.price_per_week_1,
    OLD.threshold_weeks, OLD.price_per_week_2, OLD.note
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER price_change_log
BEFORE UPDATE ON rental_prices
FOR EACH ROW EXECUTE FUNCTION log_price_change();

-- RLS – publiczny dostęp
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "public_write_profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "public_read_prices" ON rental_prices FOR SELECT USING (true);
CREATE POLICY "public_write_prices" ON rental_prices FOR ALL USING (true);
CREATE POLICY "public_read_history" ON price_history FOR SELECT USING (true);

-- Dane startowe: profile grodzic
INSERT INTO profiles (name, type, width_mm, weight_kg_per_m, wall_kg_per_m2) VALUES
  ('VL603',  'VL', 600, 64.2, 107.0),
  ('VL604',  'VL', 600, 73.1, 121.8),
  ('VL605A', 'VL', 600, 76.5, 127.5),
  ('VL605N', 'VL', 600, 82.1, 136.9),
  ('VL606A', 'VL', 600, 85.4, 142.3),
  ('VL606N', 'VL', 600, 94.1, 156.8),
  ('GU16N',  'GU', 600, 72.6, 121.0);

-- Dane startowe: cennik
INSERT INTO rental_prices (
  base_price_pln, base_weeks, price_per_week_1,
  threshold_weeks, price_per_week_2, note
) VALUES (
  450, 8, 25, 16, 20, 'Cennik startowy'
);
```

## 3. Skonfiguruj zmienne środowiskowe

Edytuj plik `.env.local` i wstaw klucze z Supabase:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

Klucze znajdziesz w Supabase → Project Settings → API.

## 4. Uruchom lokalnie

```bash
npm run dev
```

Aplikacja będzie dostępna pod: http://localhost:5173

## 5. Deploy na Netlify

1. Wypchnij kod na GitHub
2. W Netlify połącz repozytorium
3. Ustaw Build command: `npm run build`, Publish directory: `dist`
4. W Netlify → Site settings → Environment variables dodaj:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Weryfikacja obliczeń

Test: GU16N, 10 szt., 12 m, 8 tygodni
- Całkowita długość: 10 × 12 = 120 m
- Masa: 120 × 72,6 / 1000 = **8,712 t**
- Koszt 8 tyg.: 8,712 × 450 = **3 920,40 PLN** ✓
