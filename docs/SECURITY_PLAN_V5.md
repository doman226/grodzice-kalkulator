# Security Plan V5 — Kalkulator Grodzic Intra B.V.

**Status:** FINALNY — zatwierdzony przez Piotra Domańskiego, gotowy do wdrożenia
**Iteracje:** v1 → v2 → v3 → v4 → **v5** → **v5.1 (aktualizacja: moduł Płyty drogowe)**
**Cel:** zabezpieczyć aplikację tak, aby osoba niezalogowana nie mogła wejść do UI ani odczytać danych z Supabase, wyłącznie przez Supabase Auth + RLS (bez Netlify security)

> **Aktualizacja v5.1 (po dodaniu modułu Płyty drogowe):**
> - +3 tabele do RLS: `road_plate_profiles`, `road_plate_rental_prices`, `road_plate_price_history`
> - +2 komponenty do obsługi 401/403: `RoadPlateCalculator.tsx`, `EditRoadPlateOfferModal.tsx`
> - Drugi blok try/catch w `App.tsx loadData()` (płyty drogowe) **celowo połyka błędy** — po RLS wymaga jawnego 401/403 handlera
> - +1 RPC do GRANT EXECUTE: `update_offer_items_atomic_v2` (używany przez `EditOfferModal` **i** `EditRoadPlateOfferModal`)
> - +1 RPC do GRANT EXECUTE: `soft_delete_sale_offer` (przeoczone w v5)
> - Nowe stany w resetie SIGNED_OUT: `roadPlateProfiles`, `roadPlatePrices`, `roadPlateOffers`, `rentalSubMode`
> - Łącznie: **19 tabel × 4 polityki = 76 polityk** (było 16 × 4 = 64)

---

## ⚡ Prompt startowy do kolejnej sesji

**Skopiuj dokładnie ten blok jako pierwszy prompt w nowej rozmowie Claude Code:**

```
Kontynuujemy pracę nad kalkulatorem grodzic Intra B.V. w folderze C:\Users\doman\CENNIK\grodzice-kalkulator.
Aplikacja jest na Netlify: https://intra-kalkulator.netlify.app, baza Supabase.

Proszę przeczytaj CLAUDE.md i pliki projektu żeby się zorientować.

Następne zadanie i cały plan zabezpieczenia aplikacji znajduje się w pliku docs/SECURITY_PLAN_V5.md.
Przeczytaj go w całości, a następnie powiedz którą sesję realizujemy (Sesja 1 / Sesja 2 / Sesja 3)
i przejdź do wykonania zadań z tej sesji.
```

---

## 📋 Spis treści

1. [Założenia kluczowe](#założenia-kluczowe)
2. [Breakdown 3 sesji](#breakdown-3-sesji)
   - [Sesja 1 — Krok 3 (Frontend auth)](#sesja-1--krok-3-frontend-auth)
   - [Sesja 2 — Kroki 4+5+6 (Deploy + RLS + Testy)](#sesja-2--kroki-4--5--6-deploy--rls--testy-regresji)
   - [Sesja 3 — Krok 7 (Edge Function nip-lookup)](#sesja-3--krok-7-edge-function-nip-lookup)
3. [Pełna referencja planu v5](#pełna-referencja-planu-v5)
   - A. Ryzyko dziś
   - B. Rekomendacja
   - C. Baza danych
   - D. Frontend (szczegóły) — zaktualizowane v5.1
   - E. Tabele objęte RLS — 19 tabel (v5.1)
   - F. Polityki RLS (oba warianty z `TO authenticated`)
   - G. Edge Function nip-lookup
   - H. Kroki wdrożenia
   - I. Na co uważać (ryzyka) — +3 wiersze v5.1
4. [Checklisty testów regresji](#checklisty-testów-regresji)
5. [Zarządzanie tokenami i sesjami](#zarządzanie-tokenami-i-sesjami)

---

## Założenia kluczowe

| # | Założenie |
|---|---|
| 1 | **Jedno wspólne konto** w Supabase Auth (2-3 osoby pracują równolegle) |
| 2 | **Login przez email + hasło** |
| 3 | **Wyłączony publiczny signup** (konto tworzy admin w Dashboardzie) |
| 4 | **Pełna blokada aplikacji bez sesji** (UI + dane) |
| 5 | **RLS** na wszystkich tabelach, **`TO authenticated`** w politykach |
| 6 | **`nip-lookup`** zabezpieczone **jawną walidacją usera w funkcji** (nie tylko `verify_jwt`) |
| 7 | Brak ról (admin/editor/viewer) |
| 8 | Bez Netlify security — wyłącznie Supabase Auth + RLS |
| 9 | Kolejność **UI-first** (logowanie działa zanim RLS zamknie bazę) |
| 10 | **Wszystkie `signOut()` z `scope: 'local'`** (aby nie wylogowywać pozostałych użytkowników współdzielonego konta) |

---

# Breakdown 3 sesji

## Sesja 1 — Krok 3 (Frontend auth)

**Cel:** działające logowanie w aplikacji, zanim RLS zamknie bazę. Jeśli coś pójdzie nie tak z Auth, lepiej żeby dane były jeszcze otwarte niż zablokować zespół.

**Czas szacunkowy:** 2-3h
**Poziom trudności:** średni (wymaga uważności przy `authReady` i eventach sesji)

### Prerekwizyty — zrób przed sesją 1 (ręcznie, bez Claude)

1. **Dashboard Supabase → Authentication → Providers → Email → Enable**
2. **Dashboard Supabase → Authentication → Settings → wyłącz "Enable Email Signup"**
3. **Dashboard Supabase → Authentication → Users → Add user**
   - Email: ustalony alias zespołowy (np. `aplikacja@intra.com.pl`)
   - Password: silne, zapisane w menedżerze haseł zespołowym (1Password/Bitwarden/KeePass)
   - Auto Confirm User: ✅ **zaznacz**
4. **Recovery email** — upewnij się że alias ma skrzynkę dostępną dla zespołu (nie prywatna 1 osoby)

### Zadania do wykonania w sesji 1

#### Zadanie 1.1 — Helper `signOutLocal()` w `src/lib/supabase.ts`

**Cel:** jedno miejsce definicji `scope: 'local'`, aby wszystkie wylogowania w aplikacji były lokalne (nie wyrzucały pozostałych użytkowników konta).

**Wzorzec (koncept, do adaptacji):**
```typescript
// src/lib/supabase.ts — nowy export na końcu pliku
export async function signOutLocal() {
  return supabase.auth.signOut({ scope: 'local' });
}
```

**Ważne:** w całej aplikacji używamy **wyłącznie** `signOutLocal()`, nigdy `supabase.auth.signOut()` bez parametru. Code review musi to sprawdzać.

#### Zadanie 1.2 — Nowy komponent `src/components/LoginScreen.tsx`

**Wymagania:**
- Formularz: email + hasło (dwa pola)
- Wywołuje `supabase.auth.signInWithPassword({ email, password })`
- **BEZ pre-wypełniania emaila** (jedno wspólne konto — pre-wypełnienie = ujawnienie loginu w bundlu)
- Pokazuje błąd logowania pod polami (komunikat z Supabase)
- **Bez linku "zapomniałem hasła"** — reset przez admina w Dashboardzie
- Style spójne z resztą aplikacji (Tailwind, niebieska paleta `blue-900`, logo Intra)
- Responsywny (mobile-first)

#### Zadanie 1.3 — Rozbudowa `src/App.tsx`

**Obecny problem (linie 27-29):**
```tsx
useEffect(() => {
  loadData();   // ← odpala się przy mouncie, BEZ sprawdzenia sesji
}, []);
```

Po włączeniu RLS zapytania wyjdą z anonowym tokenem i dostaną 401/403 lub pustki.

**Nowy model stanów:**

| Stan | Typ | Cel |
|---|---|---|
| `session` | `Session \| null` | Aktualna sesja (z `getSession()` i `onAuthStateChange`) |
| `authReady` | `boolean` | `false` do pierwszego rozwiązania `getSession()`, potem `true` na zawsze |

**Nowe zachowania w `useEffect`:**

**Pierwszy `useEffect` (mount, dependencies `[]`):**
- Wywołaj `supabase.auth.getSession()` → ustaw `session` i `authReady = true`
- Zarejestruj `supabase.auth.onAuthStateChange` z obsługą **trzech eventów**:

| Event | Akcja |
|---|---|
| `INITIAL_SESSION` | Ustaw `session` z payloadu (idempotentne wobec `getSession()`) |
| `TOKEN_REFRESHED` | Zaktualizuj `session` (nowy access_token), żadnych innych akcji |
| `SIGNED_OUT` | **Pełny reset stanów aplikacji** + `session = null` |

- Zwróć cleanup: `subscription.unsubscribe()`

**Drugi `useEffect` (dependencies `[authReady, session]`):**
- Wywołaj `loadData()` **tylko gdy** `authReady && session`

**Trzy stany renderu (w kolejności):**
```
!authReady               → spinner "Ładowanie..."
authReady && !session    → <LoginScreen />
authReady && session     → obecna logika (zakładki, moduły)
```

#### Zadanie 1.4 — Pełny reset stanów przy `SIGNED_OUT`

Obecne stany w `App.tsx` do wyczyszczenia (w handlerze eventu `SIGNED_OUT`):

**Wynajem (grodzice):**
- `profiles: []`
- `prices: null`
- `offers: []`

**Wynajem (płyty drogowe) — NOWE w v5.1:**
- `roadPlateProfiles: []`
- `roadPlatePrices: null`
- `roadPlateOffers: []`
- `rentalSubMode: 'sheet_pile'` (reset na domyślny sub-toggle)

**Wspólne / nawigacja:**
- `clients: []`
- `activeTab: 'calculator'` (reset na domyślny)
- `saleActiveTab: 'calculator'`
- `saleOffersCount: 0`
- `error: null`
- `loading: false`

**Powód:** po wylogowaniu dane pozostałyby w RAM przeglądarki do F5. Niewielkie ryzyko, ale trywialne do wyeliminowania.

**Wskazówka:** sprawdź deklaracje `useState` w `App.tsx` linie 20-34 — to są wszystkie stany do wyczyszczenia. Po dodaniu nowych modułów w przyszłości aktualizuj tę listę razem z deklaracjami.

#### Zadanie 1.5 — Obsługa 401/403 w 6 kluczowych miejscach (zaktualizowane w v5.1)

**Lokalizacje:**

| Plik | Funkcja |
|---|---|
| `src/App.tsx` | `loadData()` — **oba bloki** (sheet pile + road plate) |
| `src/components/Calculator.tsx` | zapis oferty wynajmu (grodzice) |
| `src/components/RoadPlateCalculator.tsx` | zapis oferty wynajmu (płyty drogowe) — **NOWE w v5.1** |
| `src/components/sale/SaleCalculator.tsx` | zapis oferty sprzedaży |
| `src/components/EditOfferModal.tsx` | zapis edycji oferty wynajmu (grodzice) |
| `src/components/EditRoadPlateOfferModal.tsx` | zapis edycji oferty wynajmu (płyty drogowe) — **NOWE w v5.1** |
| `src/components/sale/EditSaleOfferModal.tsx` | zapis edycji oferty sprzedaży |

**⚠️ Specjalna uwaga dla `App.tsx` `loadData()` — pułapka v5.1:**

Obecnie `loadData()` ma **dwa bloki try/catch**:
1. Pierwszy — sheet pile (profiles, rental_prices, clients, offers) — krytyczny, ustawia `error` przy błędzie
2. Drugi — road plates (road_plate_profiles, road_plate_rental_prices, offers z item_type=road_plate) — **celowo połyka błędy** (komentarz: "migracja SQL może być jeszcze niewykonana")

Po włączeniu RLS drugi blok stanie się pułapką: wygasły token → 401/403 → silent swallow → użytkownik widzi puste tabele bez wylogowania. **Konieczne**: w drugim bloku też sprawdzić `error.status === 401 || 403` i wywołać `signOutLocal()` zanim error zostanie zignorowany.

**Wzorzec dla drugiego bloku (road_plate):**
```typescript
try {
  const [rpProfilesRes, rpPricesRes, rpOffersRes] = await Promise.all([...]);

  // KRYTYCZNE: sprawdź auth zanim "miłosiernie" zignorujesz inne błędy
  for (const res of [rpProfilesRes, rpPricesRes, rpOffersRes]) {
    if (res.error?.status === 401 || res.error?.status === 403) {
      await signOutLocal();
      return;
    }
  }

  // Dotychczasowa logika — ignoruj inne błędy (migracja może być niegotowa)
  if (!rpProfilesRes.error && rpProfilesRes.data) { ... }
  // ...
} catch { /* tabele jeszcze nie istnieją */ }
```

**Wzorzec (koncept, nie gotowy kod):**
```
try {
  const { data, error } = await supabase.from('...')...;
  if (error) {
    if (error.status === 401 || error.status === 403) {
      await signOutLocal();        // ← event SIGNED_OUT posprząta stan
      return;                       // ← zatrzymaj dalsze przetwarzanie
    }
    // inne błędy — dotychczasowa logika (setError)
  }
} catch (e) { ... }
```

**Celowo NIE robimy w tej iteracji:**
- Globalnego wrappera wokół klienta Supabase
- Interceptora fetch dla całej aplikacji
- Obsługi 401/403 w każdym miejscu z `supabase.from(...)`

Ścieżki tylko-odczytowe (filtry, rozwijanie wierszy) nie odpalają nowych zapytań — dane są już w RAM. Wystarczy zabezpieczyć `loadData()` + zapisy.

#### Zadanie 1.6 — Przycisk wylogowania w headerze `App.tsx`

- Widoczny po zalogowaniu (ikona + "Wyloguj" lub sama ikona)
- Onclick: wywołuje `signOutLocal()` (helper z zadania 1.1)
- Reszta reakcji dzieje się przez event `SIGNED_OUT` (reset stanów + LoginScreen)

### Testy lokalne po Sesji 1 (PRZED deployem)

- [ ] **Test 1** — Login: wpisz email+hasło → aplikacja się otwiera
- [ ] **Test 2** — F5 trzyma sesję: po odświeżeniu jesteś nadal zalogowany, bez LoginScreen
- [ ] **Test 3** — Network tab: **zero zapytań** do Supabase **przed rozwiązaniem sesji** (sprawdź w DevTools)
- [ ] **Test 4** — Logout: kliknij "Wyloguj" → LoginScreen, stany wyczyszczone (sprawdź React DevTools)
- [ ] **Test 5** — Symulacja wygaśnięcia: DevTools → Application → Local Storage → usuń klucz `sb-*-auth-token` → spróbuj zapisać ofertę → wylogowanie, LoginScreen
- [ ] **Test 6** — Drugi profil przeglądarki (symulacja 2 osoby): zaloguj się w obu, wyloguj w jednym → drugi nadal zalogowany (kluczowy test `scope: 'local'`)
- [ ] **Test 7** — Błędne hasło: komunikat błędu w LoginScreen, bez crasha

**Nie deployuj jeśli którykolwiek test nie przechodzi.** Do sesji 2 nie wchodzimy.

### Git — po Sesji 1

- Branch: `feature/auth-session-handling` (lub dowolna nazwa)
- **NIE mergujemy do `main` jeszcze** — merge dopiero w sesji 2 jako Krok 4 (deploy)
- Commit messages: jeden commit per zadanie 1.1–1.6 lub 2-3 większe (stylistyka autora)

---

## Sesja 2 — Kroki 4 + 5 + 6 (Deploy + RLS + Testy regresji)

**Cel:** zamknięcie bazy danych politykami RLS + weryfikacja że wszystko dalej działa.

**Czas szacunkowy:** 2-3h
**Poziom trudności:** średni (mechaniczne SQL + cierpliwe testy)

**⚠️ Warunek wstępny:** Sesja 1 w pełni zakończona, wszystkie 7 testów lokalnych zielone.

### Zadanie 2.1 — Krok 4: Deploy UI (merge + push)

1. Zmergowuj branch `feature/auth-*` do `main`
2. Push → Netlify auto-deploy
3. **Smoke test na produkcji w trybie prywatnym:**
   - LoginScreen pojawia się natychmiast
   - Zero zapytań do Supabase w Network tab przed logowaniem
   - Po zalogowaniu aplikacja działa identycznie jak przed zmianami

**⚠️ Nie przechodź do Kroku 5 dopóki smoke test na prod nie jest zielony.** Gdyby był problem z Auth na prod — nadal masz otwartą bazę i możesz naprawić bez utraty dostępu.

### Zadanie 2.2 — Krok 5: Włącz RLS + polityki (SQL)

**Supabase Dashboard → SQL Editor**

Użyj **Wariantu A** z sekcji F (`TO authenticated` + `USING (true)`).

**Pełny SQL do wklejenia (19 tabel × 4 polityki = 76 polityk — zaktualizowane w v5.1):**

```sql
-- ════════════════════════════════════════════════════════════════
-- SECURITY PLAN V5.1 — RLS POLICIES (Wariant A)
-- ════════════════════════════════════════════════════════════════
-- Dla każdej z 19 tabel: ENABLE RLS + 4 polityki (SELECT/INSERT/UPDATE/DELETE)
-- Rola: authenticated (wbudowana rola Supabase dla zalogowanych)
-- Predykat: true (dostęp bez filtra per-row — wszyscy authenticated widzą wszystko)
-- ════════════════════════════════════════════════════════════════

-- ─── WYNAJEM — GRODZICE ─────────────────────────────────────────
-- Powtórz blok poniżej dla każdej tabeli, zmieniając nazwę:
-- profiles, rental_prices, price_history, offers, offer_items

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete" ON profiles FOR DELETE TO authenticated USING (true);

-- [powtórz dla: rental_prices, price_history, offers, offer_items]

-- ─── WYNAJEM — PŁYTY DROGOWE (NOWE w v5.1) ──────────────────────
-- [powtórz dla: road_plate_profiles, road_plate_rental_prices, road_plate_price_history]

-- ─── SPRZEDAŻ ────────────────────────────────────────────────────
-- [powtórz dla: sale_offers, sale_offer_items, sale_offer_lock_items,
--               sale_steel_grades, sale_warehouses, sale_prices,
--               sale_profiles, sale_locks, sale_price_change_log]

-- ─── WSPÓLNE ─────────────────────────────────────────────────────
-- [powtórz dla: clients, offer_sequences]

-- ─── GRANT EXECUTE na funkcjach RPC (NOWE w v5.1) ───────────────
-- Tylko jeśli funkcje są SECURITY INVOKER. SECURITY DEFINER ich nie potrzebuje.
-- Sprawdź: SELECT proname, prosecdef FROM pg_proc WHERE proname IN (...);

GRANT EXECUTE ON FUNCTION soft_delete_offer(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_sale_offer(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION update_offer_items_atomic(uuid, jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION update_offer_items_atomic_v2(uuid, jsonb) TO authenticated;
-- (sygnatury do potwierdzenia w `pg_proc` — argumenty mogą być inne)

-- ════════════════════════════════════════════════════════════════
-- WERYFIKACJA PO WDROŻENIU
-- ════════════════════════════════════════════════════════════════

-- Sprawdź czy wszystkie tabele mają RLS włączone:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Oczekiwane: rowsecurity = true dla wszystkich 19 tabel

-- Sprawdź liczbę polityk (powinno być 76 = 19 tabel × 4 polityki):
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Oczekiwane: 76

-- Sprawdź które role mają które polityki:
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
-- Oczekiwane: wszystkie polityki mają roles = {authenticated}

-- Sprawdź czy funkcje RPC są SECURITY DEFINER (nie wymagają wtedy GRANT):
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN (
  'soft_delete_offer', 'soft_delete_sale_offer',
  'update_offer_items_atomic', 'update_offer_items_atomic_v2'
);
-- Oczekiwane: prosecdef = true → SECURITY DEFINER, GRANT zbędny
-- Jeśli prosecdef = false → potrzebujesz GRANT EXECUTE (jak wyżej)
```

**Pełna lista 19 tabel (do wygenerowania SQL):**

**Wynajem — grodzice (5):** `profiles`, `rental_prices`, `price_history`, `offers`, `offer_items`

**Wynajem — płyty drogowe (3) — NOWE w v5.1:** `road_plate_profiles`, `road_plate_rental_prices`, `road_plate_price_history`

> Uwaga: oferty płyt drogowych żyją w tabeli `offers` z dyskryminatorem `item_type = 'road_plate'` — RLS na `offers` z Wariantu A pokrywa **oba** typy ofert automatycznie.

**Sprzedaż (9):** `sale_offers`, `sale_offer_items`, `sale_offer_lock_items`, `sale_steel_grades`, `sale_warehouses`, `sale_prices`, `sale_profiles`, `sale_locks`, `sale_price_change_log`

**Wspólne (2):** `clients`, `offer_sequences`

**Wskazówka dla Claude:** poproś o wygenerowanie pełnego SQL jednym promptem ("wygeneruj SQL RLS dla wszystkich 19 tabel z Planu V5.1, Wariant A, plus GRANT EXECUTE dla 4 RPC") — to zadanie mechaniczne, Sonnet poradzi sobie równie dobrze jak Opus za ułamek kosztu.

### Zadanie 2.3 — Krok 6: Testy regresji

Patrz sekcja [Checklisty testów regresji](#checklisty-testów-regresji) niżej w tym pliku. Wszystkie testy **R1-R2, S1-S3, P1-P3** muszą przejść.

**Jeśli któryś test nie przechodzi** → najprawdopodobniej brakuje GRANT EXECUTE na funkcji RPC lub trigger jest `SECURITY INVOKER` i wymaga polityki. Diagnoza z Claude w tej samej sesji.

### Git — po Sesji 2

- RLS nie jest w kodzie — żyje w Supabase. Ale **zachowaj pełny SQL w pliku** `docs/rls_policies.sql` w repo, jako referencję i dokumentację audytową.

---

## Sesja 3 — Krok 7 (Edge Function nip-lookup)

**Cel:** zamknięcie ostatniej luki — `nip-lookup` Edge Function, która dziś akceptuje anon key i jest dostępna dla niezalogowanych.

**Czas szacunkowy:** 1-2h
**Poziom trudności:** wyższy (Deno, Supabase server-side, JWT validation)

**⚠️ Warunek wstępny:** Sesja 2 zakończona, aplikacja działa na prod z zamkniętą bazą.

### Zadanie 3.1 — Zbadaj obecny stan funkcji

**Lokalnie w repo:** sprawdź czy istnieje `supabase/functions/nip-lookup/index.ts` i `config.toml`.

**Jeśli kodu funkcji nie ma lokalnie:**
- Dashboard Supabase → Edge Functions → `nip-lookup` → kliknij aby zobaczyć kod
- Skopiuj do `supabase/functions/nip-lookup/index.ts` (będzie pod kontrolą git)

**Sprawdź konfigurację:**
- Dashboard → Edge Functions → `nip-lookup` → Settings → czy `Verify JWT` jest włączone?

### Zadanie 3.2 — Dodaj jawną walidację usera w kodzie funkcji

**Kluczowa rzecz:** `verify_jwt = true` NIE wystarcza, bo `anonKey` jest valid JWT z rolą `anon` — `verify_jwt` go przepuszcza.

**Wzorzec (koncept do adaptacji w kodzie funkcji):**
```typescript
// supabase/functions/nip-lookup/index.ts — na początku handlera

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // ─── Autoryzacja: jawna walidacja zalogowanego usera ──────────
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ─── Dotychczasowa logika nip-lookup ─────────────────────────
  // [istniejący kod funkcji]
})
```

**Kluczowe punkty:**
- `supabase.auth.getUser(token)` robi round-trip do schematu `auth` — sprawdza że token odpowiada realnemu userowi
- Anon key **nie** odpowiada żadnemu userowi → `getUser()` zwraca null → 401
- To **druga warstwa ochrony** — pierwsza to `verify_jwt` (platform-level sanity check)

### Zadanie 3.3 — Upewnij się że `verify_jwt = true`

- Dashboard Supabase → Edge Functions → `nip-lookup` → Settings → `Verify JWT` = ✅ włączone
- Alternatywnie: w `supabase/functions/nip-lookup/config.toml` wpis `verify_jwt = true`

### Zadanie 3.4 — Deploy funkcji

```bash
cd grodzice-kalkulator
npx supabase functions deploy nip-lookup
```

(lub przez Dashboard jeśli kod był edytowany w UI)

### Zadanie 3.5 — Zmień `fetchNipData` w `src/lib/supabase.ts`

**Obecny kod (linie 28-38):**
```typescript
const res = await fetch(`${supabaseUrl}/functions/v1/nip-lookup`, {
  method: 'POST',
  headers: {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,   // ← anon key
    ...
  },
  ...
});
```

**Nowy kod (koncept):**
```typescript
export async function fetchNipData(nip: string): Promise<NipData> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Brak aktywnej sesji')

  const res = await fetch(`${supabaseUrl}/functions/v1/nip-lookup`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,   // ← user token
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nip }),
  });
  // reszta bez zmian
}
```

**Kolejność wdrożenia jest krytyczna:**
1. **Najpierw** zmień funkcję (zadanie 3.2 + 3.3 + 3.4) — dodaj walidację user tokenu
2. **Dopiero potem** zmień frontend (zadanie 3.5) — przełącz na user token

Odwrotnie = przerwanie wyszukiwarki NIP (frontend wysyła user token, ale funkcja nadal oczekuje anon).

### Testy po Sesji 3

- [ ] **Test N1** — Wyszukiwanie NIP działa po zalogowaniu: w ClientsTable → "Dodaj klienta" → wpisz NIP → dane firmy pobierają się
- [ ] **Test N2** — Po wylogowaniu w konsoli: `fetch('/functions/v1/nip-lookup', {method: 'POST', headers: {apikey: '<anonKey>', Authorization: 'Bearer <anonKey>'}, body: JSON.stringify({nip: '5252344078'})})` **musi zwrócić 401**
- [ ] **Test N3** — Żadne regresje w CRUD klientów

### Git — po Sesji 3

- Commit: `src/lib/supabase.ts` + `supabase/functions/nip-lookup/index.ts` + ew. `config.toml`
- Tag: `v2.0-security-hardening-complete` (wg konwencji projektu)

---

# Pełna referencja planu v5

## A. Ryzyko dziś

`VITE_SUPABASE_ANON_KEY` wbudowany w publiczny bundle JS (widoczny w DevTools > Sources). Żadna tabela nie ma RLS. **Każdy z URL-em aplikacji może przez REST API czytać i modyfikować całą bazę** bez logowania. Dodatkowo Edge Function `nip-lookup` przyjmuje wywołania z tym samym anon keyem jako `Bearer` — otwarta bramka do danych GUS/MF.

## B. Rekomendacja

Supabase Auth (email + hasło) + RLS z politykami `TO authenticated` + jawna walidacja usera w `nip-lookup`. Kolejność UI-first.

## C. Baza danych

- Jedno konto w Dashboardzie (alias zespołowy)
- **Bez tabeli profili użytkowników** (przy jednym koncie zbędne)
- **Bez żadnych ról w DB** (brak potrzeby różnicowania dostępu)

## D. Frontend — szczegóły (zaktualizowane v5.1)

Patrz Sesja 1 (zadania 1.1–1.6) niżej w tym pliku. Kluczowe elementy:

- `LoginScreen.tsx` — email + hasło, bez pre-wypełnienia
- `App.tsx` — `authReady` + `session` + dwa `useEffect` + 3 eventy + reset stanów (w tym **road plate states + `rentalSubMode`**) + 3 stany renderu
- 401/403 handler w `loadData()` (oba bloki try/catch — sheet pile **i** road plate) + **6 zapisach kluczowych**:
  - `Calculator.tsx` (grodzice)
  - `RoadPlateCalculator.tsx` (płyty — NOWE v5.1)
  - `SaleCalculator.tsx`
  - `EditOfferModal.tsx`
  - `EditRoadPlateOfferModal.tsx` (NOWE v5.1)
  - `EditSaleOfferModal.tsx`
- Helper `signOutLocal()` — wszystkie wylogowania z `scope: 'local'`
- Przycisk "Wyloguj" w headerze

## E. Tabele objęte RLS (zaktualizowane w v5.1)

**Wynajem — grodzice (5):** `profiles`, `rental_prices`, `price_history`, `offers`, `offer_items`
**Wynajem — płyty drogowe (3) — NOWE w v5.1:** `road_plate_profiles`, `road_plate_rental_prices`, `road_plate_price_history`
**Sprzedaż (9):** `sale_offers`, `sale_offer_items`, `sale_offer_lock_items`, `sale_steel_grades`, `sale_warehouses`, `sale_prices`, `sale_profiles`, `sale_locks`, `sale_price_change_log`
**Wspólne (2):** `clients`, `offer_sequences`

Łącznie **19 tabel × 4 polityki = 76 polityk**.

**Funkcje RPC do weryfikacji `SECURITY DEFINER` / `GRANT EXECUTE`:**
- `soft_delete_offer` (wynajem grodzice + płyty)
- `soft_delete_sale_offer` (sprzedaż) — **NOWE w v5.1**
- `update_offer_items_atomic` (legacy v1, używany tylko wewnętrznie jako backup)
- `update_offer_items_atomic_v2` — **NOWE w v5.1**, wspólny dla `EditOfferModal` i `EditRoadPlateOfferModal`

## F. Polityki RLS — oba warianty z `TO authenticated`

### Wariant A (REKOMENDOWANY) — `TO authenticated` + `USING (true)`

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON <tabela>
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert" ON <tabela>
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON <tabela>
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete" ON <tabela>
  FOR DELETE TO authenticated USING (true);
```

**Argumenty za Wariantem A:**
- Idiomatyczne Supabase — wykorzystuje wbudowaną rolę `authenticated`
- `USING (true)` jednoznacznie komunikuje "każdy wiersz dla każdego z tej roli"
- Planner PG odcina politykę przed ewaluacją predykatu dla `anon`
- `pg_policies.roles` pokazuje `{authenticated}` — jawna intencja przy audycie

### Wariant B (ALTERNATYWA) — `TO authenticated` + jawny predykat

```sql
CREATE POLICY "auth_select" ON <tabela>
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
```

Redundantne predykaty przy `TO authenticated` — **Wariant A jest lepszy**.

### Ważne: 4 polityki per tabela, nie `FOR ALL`

Oddzielne polityki dla SELECT/INSERT/UPDATE/DELETE z jawnym rozdziałem USING/WITH CHECK:
- **audytowalność** — widoczne w `pg_policies` kto może co
- **gotowość na przyszłe różnicowanie** (np. tylko admin DELETE)
- **rozróżnienie "co widać" (USING) od "co można wstawić" (WITH CHECK)**

## G. Edge Function `nip-lookup`

### G.1 Stan dzisiejszy

`src/lib/supabase.ts` linie 28-38 — frontend wysyła `Authorization: Bearer ${supabaseAnonKey}`. Funkcja przyjmuje to jako valid JWT (bo anon key faktycznie jest valid JWT).

### G.2 Dlaczego sam `verify_jwt = true` NIE wystarcza

`verify_jwt = true` sprawdza tylko:
- Poprawny podpis JWT
- Token nie wygasł

`anonKey` spełnia oba warunki — **jest valid JWT wydanym przez Wasz projekt z rolą `anon`**.

### G.3 Finalna rekomendacja — dwuwarstwowa ochrona

- **Warstwa 1:** `verify_jwt = true` (platform-level)
- **Warstwa 2:** Jawny `supabase.auth.getUser(token)` w kodzie funkcji

Patrz Sesja 3 (zadanie 3.2) powyżej.

## H. Kroki wdrożenia (skrót)

```
Krok 1 — Dashboard: email provider + wyłącz signup       [ręcznie, przed sesją 1]
Krok 2 — Dashboard: utwórz 1 konto (auto confirm)        [ręcznie, przed sesją 1]
Krok 3 — Frontend: LoginScreen + authReady + 401/403     [SESJA 1]
Krok 4 — Deploy UI + smoke test na prod                  [SESJA 2]
Krok 5 — SQL Editor: RLS + polityki                      [SESJA 2]
Krok 6 — Testy regresji R1-R2, S1-S3, P1-P3              [SESJA 2]
Krok 7 — Edge Function nip-lookup                        [SESJA 3]
```

## I. Na co uważać — ryzyka i środki zaradcze

| Ryzyko | Środek zaradczy |
|---|---|
| **Okno otwartej bazy między krokami 1-4** | Zrób kroki 1-5 w jednej sesji (realnie 4-5h). W tym czasie nie udostępniaj nowego URL-a osobom postronnym. |
| **Hasło współdzielone** | Menedżer haseł (1Password/Bitwarden/KeePass) dostępny dla zespołu. Nie wysyłaj mailem/Slackiem. |
| **Rotacja po odejściu osoby** | Admin zmienia hasło w Dashboardzie → aktualizuje w menedżerze → zespół pobiera. |
| **Recovery email** | MUSI być alias zespołowy, nie prywatna skrzynka 1 osoby. Inaczej przy jej odejściu tracicie kontrolę. |
| **Trigger numeracji `offer_sequences`** | Test S1/S2 — jeżeli `SECURITY INVOKER`, potrzebuje polityk SELECT+UPDATE dla `authenticated` (mamy w Wariancie A). |
| **Trigger `price_history`, `sale_price_change_log`, `road_plate_price_history`** | Test P1/P2/P4 — potrzebują polityki INSERT dla `authenticated` (mamy w Wariancie A). |
| **RPC `update_offer_items_atomic_v2` SECURITY mode** | Używany przez `EditOfferModal` (grodzice) **i** `EditRoadPlateOfferModal`. Jeśli `prosecdef = false` → potrzebuje `GRANT EXECUTE TO authenticated`. Sprawdź: `SELECT prosecdef FROM pg_proc WHERE proname = 'update_offer_items_atomic_v2'`. |
| **RPC `soft_delete_sale_offer` (NOWE v5.1)** | Analogicznie do `soft_delete_offer` — sprawdź `prosecdef` i ewent. dodaj GRANT. |
| **Drugi blok try/catch w `App.tsx loadData()` (płyty drogowe)** | Celowo połyka błędy ("migracja może być niegotowa"). Po RLS to maskuje 401/403 i kazi UX. Wzorzec w Zadaniu 1.5 — sprawdź `error.status` przed silent swallow. |
| **`service_role` jako awaryjne wyjście** | Klucz `service_role` w Dashboardzie *zawsze* omija RLS. Trzymaj tylko w Dashboardzie, nigdy w kodzie. |
| **Globalny signOut wyrzucający pozostałych** | Wszystkie wylogowania przez `signOutLocal()` z `scope: 'local'`. Nigdy `supabase.auth.signOut()` bez parametru. Code review sprawdza to pierwsze przed merge. |
| **Globalny interceptor 401/403 — zostawiony na potem** | Ścieżki read-only nie mają obsługi wygaśnięcia. Jak objawi się problem w praktyce, dodamy w kolejnej iteracji. Akceptowalne dla tej rundy. |
| **`authReady` jako warunek `loadData()`, nie `session`** | `session` będzie `null` w pierwszej chwili mountu. Bez `authReady` gate staje się niedeterministyczny. |
| **`nip-lookup` nadal otwarte po Kroku 6** | Nie uznawaj wdrożenia za zamknięte przed Krokiem 7 (Sesja 3). |
| **Auto-Confirm przy tworzeniu konta** | Bez flagi user musi kliknąć link z maila (zbędne dla konta wewnętrznego). |

---

# Checklisty testów regresji

**Wszystkie testy do wykonania w Sesji 2 po włączeniu RLS (Krok 5).**

## Testy podstawowe (dostępność)

- [ ] **D1** — Tryb prywatny: zero danych bez logowania, tylko LoginScreen
- [ ] **D2** — Po zalogowaniu: ładowanie profili, klientów, ofert działa
- [ ] **D3** — `Network tab`: requesty po logowaniu mają `Authorization: Bearer eyJ...` (user JWT, nie anon)

## Testy CRUD

- [ ] **C1** — Wynajem grodzice: utworzenie oferty z `Calculator.tsx` → zapis OK, numer `OF/YYYY/NNN` nadany, `item_type = 'sheet_pile'`
- [ ] **C2** — Wynajem grodzice: edycja oferty przez `EditOfferModal.tsx` → zapis OK (w tym wcześniej naprawiony bug transport EUR)
- [ ] **C3** — Sprzedaż: utworzenie oferty z `SaleCalculator.tsx` → zapis OK, numer `SP/YYYY/NNN` nadany
- [ ] **C4** — Sprzedaż: edycja oferty przez `EditSaleOfferModal.tsx` → zapis OK
- [ ] **C5 (NOWE v5.1)** — Wynajem płyty drogowe: utworzenie oferty z `RoadPlateCalculator.tsx` → zapis OK, numer `OF/YYYY/NNN` nadany, `item_type = 'road_plate'`, pozycje w `offer_items` mają `thickness_mm`/`sheet_length_m`/`sheet_width_m`
- [ ] **C6 (NOWE v5.1)** — Wynajem płyty drogowe: edycja oferty przez `EditRoadPlateOfferModal.tsx` → zapis OK, RPC `update_offer_items_atomic_v2` zwraca sukces

## Test R1 — soft delete w wynajmie grodzice (`soft_delete_offer`)

- [ ] W `OffersTable.tsx` kliknij "Usuń" na ofercie testowej (sheet_pile)
- [ ] SQL weryfikacja: `SELECT offer_number, deleted_at FROM offers WHERE id = '...'` — `deleted_at` ustawione
- [ ] Po wylogowaniu w konsoli: próba `supabase.rpc('soft_delete_offer', ...)` → błąd auth
- [ ] **Jeśli RPC zwraca błąd GRANT:** dodaj `GRANT EXECUTE ON FUNCTION soft_delete_offer TO authenticated;`

## Test R2 — rollback w `EditOfferModal` i `EditRoadPlateOfferModal` (zaktualizowane v5.1)

- [ ] Wymuś błąd `update_offer_items_atomic_v2` (np. niepoprawne dane w DevTools, np. ujemna ilość)
- [ ] Sprawdź że aplikacja cofa nagłówek oferty przez bezpośrednie UPDATE
- [ ] Oferta po błędzie jest w spójnym stanie (stare dane)
- [ ] Powtórz dla `EditRoadPlateOfferModal` — ten sam RPC, ten sam wzorzec rollbacku

## Test R3 — soft delete w wynajmie płyty drogowe (NOWE v5.1)

- [ ] W `OffersTable.tsx` (gdy `rentalSubMode === 'road_plate'`) kliknij "Usuń" na ofercie płyt
- [ ] Tabela `offers` współdzielona z grodzicami — RPC `soft_delete_offer` ten sam
- [ ] SQL: `SELECT offer_number, item_type, deleted_at FROM offers WHERE id = '...'` — `item_type='road_plate'`, `deleted_at` ustawione
- [ ] Po refreshu strony oferta nie pojawia się w liście (filtrowanie `item_type='road_plate'` + brak `deleted_at`)

## Test S1 — numeracja ofert wynajmu (`OF/YYYY/NNN`)

- [ ] Utwórz nową ofertę wynajmu
- [ ] Weryfikacja: trigger DB nadaje kolejny numer
- [ ] SQL: `SELECT offer_number FROM offers ORDER BY created_at DESC LIMIT 1` — format poprawny
- [ ] Sprawdź `SECURITY DEFINER` triggera: `SELECT prosecdef FROM pg_proc WHERE proname LIKE '%sequence%'`
- [ ] **Jeśli SECURITY INVOKER i trigger nie działa:** dodaj polityki RLS na `offer_sequences` (powinny być z Wariantu A)

## Test S2 — numeracja ofert sprzedaży (`SP/YYYY/NNN`)

- [ ] Utwórz nową ofertę sprzedaży
- [ ] Analogicznie do S1 — numer `SP/YYYY/NNN` nadany

## Test S3 — soft delete w sprzedaży (`soft_delete_sale_offer`, `sale_offers.deleted_at`)

- [ ] Usuwanie oferty SP w `SaleOffersTable.tsx` → wywołanie RPC `soft_delete_sale_offer`
- [ ] SQL: `SELECT offer_number, deleted_at FROM sale_offers WHERE id = '...'` — `deleted_at` ustawione
- [ ] Oferta znika z listy (filtr `WHERE deleted_at IS NULL`)
- [ ] **Jeśli RPC zwraca błąd GRANT:** dodaj `GRANT EXECUTE ON FUNCTION soft_delete_sale_offer TO authenticated;`
- [ ] Sprawdź `prosecdef`: `SELECT prosecdef FROM pg_proc WHERE proname = 'soft_delete_sale_offer'` — jeśli `false`, GRANT konieczny

## Test P1 — trigger `price_history` po zmianie `rental_prices`

- [ ] W `PriceSettings.tsx` zmień cenę bazową i zapisz
- [ ] SQL: `SELECT * FROM price_history ORDER BY changed_at DESC LIMIT 1` — nowy wiersz z nowymi wartościami
- [ ] **Jeśli trigger nie działa:** sprawdź `prosecdef` + polityka INSERT na `price_history` (mamy w Wariancie A)

## Test P2 — trigger `sale_price_change_log` po zmianie `sale_prices`

- [ ] W `SalePriceMatrix.tsx` zmień cenę jednej komórki i zapisz
- [ ] SQL: `SELECT * FROM sale_price_change_log ORDER BY changed_at DESC LIMIT 1` — nowy wiersz (who/when/old/new)
- [ ] Jak P1

## Test P3 — obsługa wygaśnięcia sesji (manualnie)

- [ ] Zaloguj się
- [ ] DevTools → Application → Local Storage → usuń klucz `sb-*-auth-token`
- [ ] Spróbuj zapisać ofertę lub odświeżyć stronę
- [ ] Oczekiwane: wylogowanie + LoginScreen + toast "Sesja wygasła" (lub podobny)
- [ ] **Kluczowy test `scope: 'local'`:** drugi profil przeglądarki nadal zalogowany po tym
- [ ] **Kluczowy test "tichy 401" w road plate (v5.1):** powtórz powyższe gdy aktywna zakładka to `Wynajem → Płyty drogowe → Cennik`. Drugi blok try/catch w `loadData()` musi wywołać `signOutLocal()`, nie milcząco zwrócić puste tabele.

## Test P4 — trigger `road_plate_price_history` po zmianie `road_plate_rental_prices` (NOWE v5.1)

- [ ] W `RoadPlatePriceSettings.tsx` zmień jedną cenę i zapisz
- [ ] SQL: `SELECT * FROM road_plate_price_history ORDER BY changed_at DESC LIMIT 1` — nowy wiersz z nowymi wartościami
- [ ] **Jeśli trigger nie działa:** sprawdź `prosecdef` triggera + polityka INSERT na `road_plate_price_history` (mamy w Wariancie A)
- [ ] Analogicznie do P1 — to ten sam wzorzec audytu cen, tylko dla modułu płyt

## Testy po Sesji 3 (nip-lookup)

- [ ] **N1** — Wyszukiwanie NIP działa po zalogowaniu w ClientsTable
- [ ] **N2** — Po wylogowaniu: fetch z konsoli z anon key → 401
- [ ] **N3** — Żadne regresje w CRUD klientów

---

# Zarządzanie tokenami i sesjami

## Estymacja zużycia tokenów (Opus 4.7 Extra High)

| Sesja | Input | Output | Razem |
|---|---|---|---|
| Sesja 1 (Krok 3) — większy zakres v5.1 (+2 pliki 401/403, +reset road_plate) | 70-90k | 25-35k | ~115k |
| Sesja 2 (Kroki 4-6) — 76 polityk zamiast 64, +testy R3/C5/C6/P4 | 55-85k | 35-50k | ~125k |
| Sesja 3 (Krok 7) | 30-50k | 15-25k | ~60k |
| Bufor na bugfixy | | | ~50k |
| **Razem v5.1** | | | **~350k** |

**Weekly budget:** 320k to ~1-3% budżetu tygodniowego Pro. Starczy z ogromnym marginesem.

## Wskazówki oszczędzania tokenów

| Technika | Oszczędność | Zastosowanie |
|---|---|---|
| **Nowa rozmowa na sesję** | Duża | Zawsze — context resetuje się |
| **`Edit` zamiast `Write`** | ~80% na pliku | Modyfikacja istniejących plików |
| **Czytanie z `offset`/`limit`** | ~50-90% | Duże pliki, znane linie |
| **Referencja do tego pliku** | Średnia | Zamiast wklejania planu |
| **Sonnet dla SQL (Sesja 2 Krok 5)** | ~60-70% | Mechaniczne generowanie 76 polityk + GRANT EXECUTE |
| **Extra High thinking tylko dla Sesji 1 i 3** | ~30-40% | Reszta działa na High |

## Jak zacząć nową sesję

1. Otwórz nową rozmowę Claude Code w tym folderze
2. Skopiuj [prompt startowy z góry tego pliku](#-prompt-startowy-do-kolejnej-sesji) jako pierwszy prompt
3. Powiedz którą sesję realizujesz: **"Zaczynamy Sesję 1"** (lub 2, lub 3)
4. Claude przeczyta plan i plik CLAUDE.md, potem zacznie realizować zadania z danej sesji

---

**Koniec dokumentu. Plan zatwierdzony, gotowy do wdrożenia.**

---

## Changelog

- **v5** (FINAL, zatwierdzony przed dodaniem płyt drogowych): 16 tabel × 4 polityki = 64 polityki. 4 zapisy kluczowe (Calculator, SaleCalculator, EditOfferModal, EditSaleOfferModal). 3 RPC do weryfikacji. Testy R1-R2, S1-S3, P1-P3.
- **v5.1** (ta wersja, po module Płyty drogowe):
  - +3 tabele RLS (`road_plate_profiles`, `road_plate_rental_prices`, `road_plate_price_history`) → **19 × 4 = 76 polityk**
  - +2 zapisy kluczowe (`RoadPlateCalculator`, `EditRoadPlateOfferModal`) → **6 zapisów**
  - +1 RPC do weryfikacji (`update_offer_items_atomic_v2` — używany przez oba edytory)
  - +1 RPC do weryfikacji (`soft_delete_sale_offer` — przeoczone w v5)
  - +reset stanów road plate w SIGNED_OUT (`roadPlateProfiles`, `roadPlatePrices`, `roadPlateOffers`, `rentalSubMode`)
  - +nowe testy: **C5, C6** (CRUD płyty), **R3** (soft delete płyty), **P4** (trigger road_plate_price_history)
  - +ostrzeżenie o pułapce: drugi blok try/catch w `App.tsx loadData()` celowo połyka błędy → po RLS musi mieć osobny 401/403 handler
