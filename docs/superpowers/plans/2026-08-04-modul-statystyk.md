# Moduł statystyk (STATS) — plan wdrożenia

> **Dla agentów:** WYMAGANE: użyj superpowers:executing-plans do realizacji.
> Kroki mają składnię checkbox (`- [ ]`) do śledzenia postępu.

**Cel:** Trzeci tryb aplikacji — moduł analityczny z zakładkami Przegląd,
Handlowcy i Do domknięcia, liczący na żywo z produkcyjnej bazy.

**Architektura:** Widok SQL `v_offer_stats` scala 7 strumieni ofertowych w jedną
tabelę faktów (szew anty-klonowy, read-only). Frontend pobiera fakty jednym
zapytaniem i agreguje w czystych funkcjach TypeScript; filtry działają bez
odpytywania bazy. Zapis wyłącznie w zakładce Do domknięcia — `UPDATE status` na
istniejących tabelach, identyczny z tym, który robią dziś listy ofert.

**Stack:** React 18 + TypeScript + Vite 5, Tailwind 3, Supabase (PostgreSQL),
Recharts (nowa zależność).

**Spec:** `docs/superpowers/specs/2026-08-04-modul-statystyk-design.md`

---

## Zasady obowiązujące w całym planie

- **Commit po każdym tasku.** Push do `main` dopiero po osobnej zgodzie użytkownika.
- **Build to jedyny automatyczny test.** `npm run build` uruchamia strict `tsc`,
  identyczny z Netlify CI. `vite dev` NIE wykrywa TS6133 (nieużywane zmienne).
- Build i `tsc` na tej maszynie trwają 2–3 min → uruchamiaj z
  `run_in_background: true`, wynik czytaj z pliku.
- **Zero testowych ofert na produkcji.** Moduł czyta; zapis statusu testuj na
  ofercie już rozstrzygniętej i przywróć stan po teście.
- Nieużywane parametry prefiksuj `_` (inaczej TS6133 wywali build na Netlify).
- PowerShell: CWD resetuje się między turami — zaczynaj od
  `cd C:\Users\doman\CENNIK\grodzice-kalkulator`.

---

## Struktura plików

**Nowe:**

| Plik | Odpowiedzialność |
|---|---|
| `docs/migrations/2026-08-04-stats-module.sql` | Widok + tabela pomocnicza (źródło prawdy migracji) |
| `src/components/stats/StatsSection.tsx` | Kontener: 3 zakładki, jedno ładowanie danych |
| `src/components/stats/StatsFilterBar.tsx` | Filtry: okres, handlowiec, moduł |
| `src/components/stats/StatsOverviewTab.tsx` | Zakładka Przegląd |
| `src/components/stats/StatsRepsTab.tsx` | Zakładka Handlowcy |
| `src/components/stats/StatsFollowUpTab.tsx` | Zakładka Do domknięcia |
| `src/components/stats/charts/KpiCard.tsx` | Kafelek KPI |
| `src/components/stats/charts/TrendChart.tsx` | Trend miesięczny |
| `src/components/stats/charts/StatusDonut.tsx` | Donut statusów |
| `src/components/stats/charts/ModuleBars.tsx` | Udział modułów |
| `src/components/stats/charts/RepStackedBars.tsx` | Wartość per handlowiec wg rozstrzygnięcia |
| `src/components/stats/charts/RepProductMatrix.tsx` | Heatmapa handlowiec × moduł (czysty Tailwind) |
| `src/components/stats/charts/MarginScatter.tsx` | Obrót vs marża |
| `src/components/stats/lib/statsTypes.ts` | Typy `OfferFact`, `StatsFilters` itd. |
| `src/components/stats/lib/statsQueries.ts` | Supabase → `OfferFact[]`, zapis statusu |
| `src/components/stats/lib/statsAggregate.ts` | Czyste funkcje agregujące (bez React/Supabase) |

**Modyfikowane:**

| Plik | Zakres zmiany |
|---|---|
| `src/App.tsx` | `Mode` += `'stats'`, przycisk w nagłówku, render `<StatsSection>` |
| `package.json` | + `recharts` |

**Nietykalne:** wszystkie kalkulatory, modale, PDF-y i listy ofert modułów
wynajmu i sprzedaży.

---

## Task 1: Migracja bazy danych

**Files:**
- Create: `docs/migrations/2026-08-04-stats-module.sql`

- [ ] **Krok 1: Zapisz plik migracji**

```sql
-- Moduł statystyk — widok normalizujący + tabela pomocnicza
-- 2026-08-04

-- 1. Tabela pomocnicza (osobna, żeby NIE robić ALTER TABLE na tabelach ofert)
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

-- 2. Widok normalizujący 7 strumieni ofertowych
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

-- 3. Uprawnienia — BEZ tego PostgREST zwraca mylące 404 "relation does not exist"
GRANT SELECT ON v_offer_stats TO anon, authenticated;
```

- [ ] **Krok 2: Zastosuj migrację**

Użyj Supabase MCP `apply_migration` na projekcie `hliemaqfncptedkxxakt`,
nazwa migracji: `stats_module_view_and_followups`.

**PYTAJ UŻYTKOWNIKA O ZGODĘ PRZED WYKONANIEM** — to zmiana w produkcyjnej bazie.

- [ ] **Krok 3: Weryfikacja — niezmiennik widoku (test regresji)**

**NIE porównuj z liczbą zapamiętaną wcześniej** — baza produkcyjna żyje, oferty
przybywają w trakcie pracy, więc „525 zamiast 506" nic nie dowodzi. Właściwy
test sprawdza niezmiennik odporny na wzrost danych:

```sql
WITH widok AS (
  SELECT module_code, count(*) n, count(DISTINCT id) unikalnych
  FROM v_offer_stats GROUP BY 1
), zrodlo AS (
  SELECT 'OF' mc, count(*) n FROM offers
    WHERE deleted_at IS NULL AND COALESCE(item_type,'sheet_pile')='sheet_pile'
  UNION ALL SELECT 'OP', count(*) FROM offers
    WHERE deleted_at IS NULL AND item_type='road_plate'
  UNION ALL SELECT 'OH', count(*) FROM beam_rental_offers WHERE deleted_at IS NULL
  UNION ALL SELECT 'SP', count(*) FROM sale_offers WHERE deleted_at IS NULL
  UNION ALL SELECT 'SR', count(*) FROM pipe_sale_offers WHERE deleted_at IS NULL
  UNION ALL SELECT 'SPP', count(*) FROM road_plate_sale_offers WHERE deleted_at IS NULL
  UNION ALL SELECT 'SH', count(*) FROM beam_sale_offers WHERE deleted_at IS NULL
)
SELECT z.mc, z.n w_tabeli, w.n w_widoku, w.unikalnych,
       CASE WHEN z.n = w.n AND w.n = w.unikalnych THEN 'OK' ELSE 'ROZJAZD' END wynik
FROM zrodlo z JOIN widok w ON w.module_code = z.mc ORDER BY z.mc;
```

Wymagane: **`OK` w każdym z 7 wierszy.**

- `w_tabeli = w_widoku` — widok nie gubi ani nie dokłada ofert
- `n = unikalnych` — `LEFT JOIN` (clients, offer_followups) nie duplikuje wierszy.
  To najczęstszy błąd w widokach tego typu; przy `UNION ALL` przez 7 tabel
  zawyżyłby **każdą kwotę w module** i byłby niewidoczny gołym okiem.

Ten test uruchamiaj ponownie po każdej zmianie widoku i przy dodaniu ósmego
modułu.

**Wynik wykonania 2026-08-06:** wszystkie 7 modułów `OK`
(OF 105, OP 4, OH 2, SP 297, SR 111, SPP 3, SH 3 — razem 525 ofert,
245 371 958 PLN, 74 137 t).

- [ ] **Krok 4: Weryfikacja uprawnień z poziomu PostgREST**

```sql
SELECT has_table_privilege('anon', 'v_offer_stats', 'SELECT') AS anon_czyta,
       has_table_privilege('anon', 'offer_followups', 'UPDATE') AS anon_pisze;
```

Oczekiwane: `true`, `true`.

- [ ] **Krok 5: Commit**

```bash
git add docs/migrations/2026-08-04-stats-module.sql
git commit -m "feat(stats): migracja - widok v_offer_stats i tabela offer_followups"
```

---

## Task 2: Typy i warstwa zapytań

**Files:**
- Create: `src/components/stats/lib/statsTypes.ts`
- Create: `src/components/stats/lib/statsQueries.ts`

- [ ] **Krok 1: Typy**

```ts
// statsTypes.ts
export const STATS_MODULES = ['OF','OP','OH','SP','SR','SPP','SH'] as const;
export type StatsModule = typeof STATS_MODULES[number];

export const MODULE_LABELS: Record<StatsModule, string> = {
  OF: 'Wynajem grodzic',
  OP: 'Wynajem płyt',
  OH: 'Wynajem dwuteowników',
  SP: 'Sprzedaż grodzic',
  SR: 'Sprzedaż rur',
  SPP: 'Sprzedaż płyt',
  SH: 'Sprzedaż dwuteowników',
};

export type StatsKind = 'rental' | 'sale';

/** Jeden wiersz z widoku v_offer_stats. */
export interface OfferFact {
  id: string;
  module_code: StatsModule;
  kind: StatsKind;
  offer_number: string;
  client_id: string | null;
  client_name: string | null;
  prepared_by: string | null;
  status: string;
  currency: string;
  created_at: string;
  value_pln: number | null;
  value_eur: number | null;
  mass_t: number | null;
  margin_pct: number | null;
  snoozed_until: string | null;
}

export interface StatsFilters {
  from: string;              // ISO date
  to: string;                // ISO date
  kind: StatsKind | 'all';
  rep: string | 'all';
  modules: StatsModule[];
}
```

- [ ] **Krok 2: Warstwa zapytań**

```ts
// statsQueries.ts
import { supabase } from '../../../lib/supabase';
import type { OfferFact, StatsModule } from './statsTypes';

/** Mapowanie modułu na tabelę, w której trzeba zmienić status. */
const MODULE_TABLE: Record<StatsModule, string> = {
  OF: 'offers',
  OP: 'offers',
  OH: 'beam_rental_offers',
  SP: 'sale_offers',
  SR: 'pipe_sale_offers',
  SPP: 'road_plate_sale_offers',
  SH: 'beam_sale_offers',
};

/**
 * Pobiera fakty ofertowe z widoku.
 * UWAGA: .limit(50000) jest OBOWIĄZKOWY — PostgREST domyślnie tnie do 1000
 * wierszy bez ostrzeżenia (HTTP 200, ucięta odpowiedź).
 */
export async function fetchOfferFacts(from: string, to: string): Promise<OfferFact[]> {
  const { data, error } = await supabase
    .from('v_offer_stats')
    .select('*')
    .gte('created_at', from)
    .lte('created_at', to)
    .limit(50000);
  if (error) throw error;
  return (data ?? []) as OfferFact[];
}

/** Zmienia status oferty — ten sam UPDATE, który robią listy ofert. */
export async function setOfferStatus(
  moduleCode: StatsModule, offerId: string, status: string, decidedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from(MODULE_TABLE[moduleCode])
    .update({ status })
    .eq('id', offerId);
  if (error) throw error;

  const { error: fuError } = await supabase
    .from('offer_followups')
    .upsert({
      module_code: moduleCode, offer_id: offerId,
      decided_at: new Date().toISOString(), decided_by: decidedBy,
      snoozed_until: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'module_code,offer_id' });
  if (fuError) throw fuError;
}

/** „Wciąż w grze" — odkłada ofertę o podaną liczbę dni. */
export async function snoozeOffer(
  moduleCode: StatsModule, offerId: string, days = 30,
): Promise<void> {
  const until = new Date();
  until.setDate(until.getDate() + days);
  const { error } = await supabase
    .from('offer_followups')
    .upsert({
      module_code: moduleCode, offer_id: offerId,
      snoozed_until: until.toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'module_code,offer_id' });
  if (error) throw error;
}
```

- [ ] **Krok 3: Build**

Run (w tle): `npm run build`
Expected: `✓ built in`, zero błędów TS.

- [ ] **Krok 4: Commit**

```bash
git add src/components/stats/lib/
git commit -m "feat(stats): typy OfferFact i warstwa zapytan do widoku"
```

---

## Task 3: Funkcje agregujące

**Files:**
- Create: `src/components/stats/lib/statsAggregate.ts`

Plik bez importów React i Supabase — same funkcje `OfferFact[] → wynik`.
To jedyne miejsce w module, w którym można pomylić się rachunkowo.

- [ ] **Krok 1: Implementacja**

```ts
import type { OfferFact, StatsFilters, StatsModule } from './statsTypes';

const DECIDED = ['przyjęta', 'odrzucona'];
const num = (v: number | null | undefined) => Number(v) || 0;

export function applyFilters(facts: OfferFact[], f: StatsFilters): OfferFact[] {
  return facts.filter(x =>
    (f.kind === 'all' || x.kind === f.kind) &&
    (f.rep === 'all' || x.prepared_by === f.rep) &&
    f.modules.includes(x.module_code));
}

/** Metryki handlowe pomijają szkice — szkic nie trafił do klienta. */
const commercial = (facts: OfferFact[]) => facts.filter(x => x.status !== 'szkic');

export interface Kpis {
  count: number; valuePln: number; wonPln: number;
  accepted: number; rejected: number; pending: number;
  winRate: number | null; massT: number; avgMargin: number | null;
  noCostCount: number;
}

export function computeKpis(facts: OfferFact[]): Kpis {
  const c = commercial(facts);
  const accepted = c.filter(x => x.status === 'przyjęta').length;
  const rejected = c.filter(x => x.status === 'odrzucona').length;
  const decided = accepted + rejected;
  // Marża 100% = handlowiec nie wpisał ceny zakupu — wyklucz ze średniej.
  const margins = c.filter(x => x.margin_pct !== null &&
                                x.margin_pct > 0 && x.margin_pct < 100);
  return {
    count: facts.length,
    valuePln: facts.reduce((s, x) => s + num(x.value_pln), 0),
    wonPln: c.filter(x => x.status === 'przyjęta')
             .reduce((s, x) => s + num(x.value_pln), 0),
    accepted, rejected,
    pending: c.filter(x => x.status === 'wysłana').length,
    winRate: decided === 0 ? null : (accepted / decided) * 100,
    massT: facts.reduce((s, x) => s + num(x.mass_t), 0),
    avgMargin: margins.length === 0 ? null
      : margins.reduce((s, x) => s + num(x.margin_pct), 0) / margins.length,
    noCostCount: c.filter(x => x.margin_pct !== null && x.margin_pct >= 100).length,
  };
}

export interface RepRow extends Kpis {
  rep: string; sharePct: number; avgOffer: number;
}

export function computeByRep(facts: OfferFact[]): RepRow[] {
  const total = facts.reduce((s, x) => s + num(x.value_pln), 0);
  const reps = Array.from(new Set(facts.map(x => x.prepared_by ?? '—')));
  return reps.map(rep => {
    const own = facts.filter(x => (x.prepared_by ?? '—') === rep);
    const k = computeKpis(own);
    return {
      ...k, rep,
      sharePct: total === 0 ? 0 : (k.valuePln / total) * 100,
      avgOffer: own.length === 0 ? 0 : k.valuePln / own.length,
    };
  }).sort((a, b) => b.valuePln - a.valuePln);
}

export function computeByModule(facts: OfferFact[]): (Kpis & { module: StatsModule })[] {
  const mods = Array.from(new Set(facts.map(x => x.module_code)));
  return mods.map(m => ({ ...computeKpis(facts.filter(x => x.module_code === m)), module: m }))
             .sort((a, b) => b.valuePln - a.valuePln);
}

export function computeMonthly(facts: OfferFact[]): { month: string; count: number; valuePln: number }[] {
  const map = new Map<string, { count: number; valuePln: number }>();
  for (const x of facts) {
    const key = x.created_at.slice(0, 7);
    const cur = map.get(key) ?? { count: 0, valuePln: 0 };
    cur.count += 1; cur.valuePln += num(x.value_pln);
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function computeStatusSplit(facts: OfferFact[]): { status: string; count: number }[] {
  const order = ['wysłana', 'przyjęta', 'odrzucona', 'szkic'];
  return order.map(s => ({ status: s, count: facts.filter(x => x.status === s).length }))
              .filter(x => x.count > 0);
}

/** Macierz handlowiec × moduł (liczba ofert). */
export function computeRepModuleMatrix(facts: OfferFact[]) {
  const reps = Array.from(new Set(facts.map(x => x.prepared_by ?? '—'))).sort();
  const mods = Array.from(new Set(facts.map(x => x.module_code)));
  return { reps, mods, cell: (rep: string, m: StatsModule) =>
    facts.filter(x => (x.prepared_by ?? '—') === rep && x.module_code === m).length };
}

/** Oferty do domknięcia: wysłane, starsze niż N dni, nieodłożone. */
export function computeFollowUps(facts: OfferFact[], olderThanDays: number): OfferFact[] {
  const now = Date.now();
  const cutoff = now - olderThanDays * 86400000;
  return facts
    .filter(x => x.status === 'wysłana')
    .filter(x => new Date(x.created_at).getTime() < cutoff)
    .filter(x => !x.snoozed_until || new Date(x.snoozed_until).getTime() < now)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const daysAgo = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
```

- [ ] **Krok 2: Build**

Run (w tle): `npm run build` — zero błędów.

- [ ] **Krok 3: Commit**

```bash
git add src/components/stats/lib/statsAggregate.ts
git commit -m "feat(stats): czyste funkcje agregujace (KPI, handlowcy, moduly, trend)"
```

---

## Task 4: Kontener, filtry i wpięcie w nawigację

Po tym tasku moduł jest **widoczny i klikalny** — trzy puste zakładki z
działającymi filtrami i licznikiem faktów.

**Files:**
- Create: `src/components/stats/StatsSection.tsx`
- Create: `src/components/stats/StatsFilterBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Krok 1: `StatsFilterBar.tsx`**

Presety okresu: ten miesiąc · ten kwartał · ten rok · ostatnie 12 mies. ·
wszystko · własny zakres. Plus `<select>` handlowca (z `SALES_REPS`) i chipy
modułów (wielokrotny wybór, `STATS_MODULES`). Styl: `bg-white border
border-gray-200 rounded-lg p-3`, jak paski filtrów w istniejących listach ofert.

- [ ] **Krok 2: `StatsSection.tsx`**

```tsx
type StatsTab = 'overview' | 'reps' | 'followup';
```

Ładuje fakty raz przez `fetchOfferFacts(from, to)` w `useEffect` zależnym od
zakresu dat. Filtry handlowca/modułu/rodzaju działają przez `useMemo` nad
`applyFilters` — **bez zapytania do bazy**. Stany `loading` / `error` /
pusty zbiór. Zakładki renderowane wewnątrz (nie w `App.tsx`).

Licznik przy zakładce Do domknięcia: `computeFollowUps(filtered, 30).length`.

- [ ] **Krok 3: Wpięcie w `App.tsx`**

```ts
type Mode = 'rental' | 'sale' | 'stats';
```

Trzeci przycisk w przełączniku nagłówka (`Statystyki`), obok istniejących.
W renderze: `{mode === 'stats' && <StatsSection />}`.
Sub-toggle i `currentTabs` **nie dotyczą** trybu `stats` — zakładki żyją
wewnątrz `StatsSection`, więc warunki `mode === 'rental'` / `mode === 'sale'`
zostają bez zmian.

- [ ] **Krok 4: Build + podgląd**

Run (w tle): `npm run build`.
Następnie `preview_start {name:'dev'}`, wejdź w Statystyki, sprawdź że dane się
ładują (licznik faktów) i że przełączanie Wynajem/Sprzedaż nadal działa.

- [ ] **Krok 5: Commit**

```bash
git add src/components/stats/ src/App.tsx
git commit -m "feat(stats): kontener modulu, filtry i wpiecie w nawigacje App"
```

---

## Task 5: Zakładka Przegląd — kafle KPI

**Files:**
- Create: `src/components/stats/charts/KpiCard.tsx`
- Create: `src/components/stats/StatsOverviewTab.tsx`

- [ ] **Krok 1: `KpiCard.tsx`** — label, wartość, podpis, opcjonalna zmiana %.

- [ ] **Krok 2: `StatsOverviewTab.tsx`** — 6 kafli z `computeKpis`:
ofert · wartość · wartość wygrana · skuteczność (+ „N czeka") · tonaż ·
średnia marża (+ „bez N ofert bez kosztu").

Skuteczność `null` → wyświetl `—`, nigdy `0%`.
Pod kaflami żółty baner ostrzegawczy, gdy `pending / count > 0.5`.

- [ ] **Krok 3: Kontrola krzyżowa** — porównaj kafle z wynikiem:

```sql
SELECT count(*), round(sum(value_pln)), round(sum(mass_t)),
       count(*) FILTER (WHERE status='przyjęta'),
       count(*) FILTER (WHERE status='odrzucona')
FROM v_offer_stats;
```

Liczby na ekranie (filtr: wszystko) muszą się zgadzać co do jedności.

- [ ] **Krok 4: Build + commit**

```bash
git add src/components/stats/
git commit -m "feat(stats): zakladka Przeglad - 6 kafli KPI"
```

---

## Task 6: Wykresy zakładki Przegląd

> **DECYZJA ZMIENIONA 2026-08-06: bez Rechartsa, wykresy pisane ręcznie w SVG.**
>
> Recharts zainstalował się w wersji **3.10.1** (nie 2.x, jak zakładał plan —
> `npm install` bierze najnowszą wersję główną). W tej wersji napotkano:
> - 3 błędy kompilacji z zaostrzonego typowania (formatery `Tooltip` ×2,
>   współrzędne funkcji etykiety ×1 — `x`/`y`/`width` są `string | number`),
> - **2 ciche awarie renderowania**: `<Pie>` nie rysował ani jednego elementu
>   `path` (naprawione jawnymi `cx`/`cy` + wymiarami na `ResponsiveContainer`),
>   a `<LabelList>` ORAZ prop `label={fn}` w ogóle nie były wywoływane —
>   nienaprawione mimo zastosowania oficjalnego przykładu z dokumentacji v3.
> - koszt w bundlu: **+116 kB gzip** (+591 modułów).
>
> Ciche awarie są tu groźniejsze niż błędy typów: `tsc` i `npm run build`
> przechodziły na zielono, a komponent nie rysował niczego. **Wniosek na
> przyszłość: weryfikuj wykres licząc kształty w DOM, nie obecność kontenera.**
>
> Wykresy przepisano na czysty SVG (ta sama technika, co w zatwierdzonej
> makiecie). Bundle wrócił do **831 kB gzip** — wykresy kosztują +2,4 kB.
> Zależności projektu pozostają w liczbie pięciu.

**Files:**
- Modify: `package.json` (+ `recharts`)
- Create: `src/components/stats/charts/TrendChart.tsx`
- Create: `src/components/stats/charts/StatusDonut.tsx`
- Create: `src/components/stats/charts/ModuleBars.tsx`
- Modify: `src/components/stats/StatsOverviewTab.tsx`

- [ ] **Krok 1: Instalacja**

```bash
npm install recharts
```

- [ ] **Krok 2: `TrendChart.tsx`** — `BarChart` z `computeMonthly`.
Słupki = wartość w mln PLN, liczba ofert jako `LabelList` nad słupkiem.
**Jedna oś Y.** (Świadome odejście od pierwotnego pomysłu combo z dwiema osiami
— dwie skale w jednym wykresie zachęcają do błędnego odczytu.)

- [ ] **Krok 3: `StatusDonut.tsx`** — `PieChart` + `Pie` z `innerRadius`,
kolory: wysłana `#f59e0b`, przyjęta `#16a34a`, odrzucona `#dc2626`, szkic `#9ca3af`.

- [ ] **Krok 4: `ModuleBars.tsx`** — poziome słupki z `computeByModule`
plus tabela zbiorcza per moduł (ofert, wartość, tonaż, skuteczność, śr. oferta).

- [ ] **Krok 5: Build + wizualna weryfikacja przez preview**

Sprawdź też rozmiar bundla — Recharts to pierwsza zależność UI w projekcie.

- [ ] **Krok 6: Commit**

```bash
git add package.json package-lock.json src/components/stats/
git commit -m "feat(stats): Recharts + wykresy trendu, statusow i modulow"
```

---

## Task 7: Zakładka Handlowcy

**Files:**
- Create: `src/components/stats/StatsRepsTab.tsx`
- Create: `src/components/stats/charts/RepStackedBars.tsx`
- Create: `src/components/stats/charts/RepProductMatrix.tsx`
- Create: `src/components/stats/charts/MarginScatter.tsx`

- [ ] **Krok 1: Tabela rankingowa** z `computeByRep` — kolumny: handlowiec,
ofert, wartość, udział %, wygrane, przegrane, skuteczność, tonaż, śr. marża,
śr. oferta. Sortowanie po kliknięciu w nagłówek (stan `sortKey` + `sortDir`).
Skuteczność jako badge: zielony ≥60%, czerwony <50%, szary gdy `null`.

- [ ] **Krok 2: `RepStackedBars.tsx`** — poziome słupki wartości z podziałem
na wygrane/przegrane/w toku/szkice (udział wartościowy, nie ilościowy).

- [ ] **Krok 3: `RepProductMatrix.tsx`** — heatmapa z `computeRepModuleMatrix`.
Czysty Tailwind, bez Recharts. Intensywność tła proporcjonalna do liczby ofert
względem maksimum w macierzy.

- [ ] **Krok 4: `MarginScatter.tsx`** — `ScatterChart`: oś X = wartość ofert,
oś Y = średnia marża, punkt = handlowiec z etykietą.

- [ ] **Krok 5: Kontrola krzyżowa**

```sql
SELECT prepared_by, count(*), round(sum(value_pln)), round(sum(mass_t)),
       count(*) FILTER (WHERE status='przyjęta') w,
       count(*) FILTER (WHERE status='odrzucona') p
FROM v_offer_stats WHERE status <> 'szkic'
GROUP BY prepared_by ORDER BY 3 DESC;
```

Uwaga: KPI liczbowe pomijają szkice, ale `count` i `valuePln` w tabeli
rankingowej liczą **wszystko** — porównuj odpowiednie kolumny świadomie.

- [ ] **Krok 6: Build + commit**

```bash
git add src/components/stats/
git commit -m "feat(stats): zakladka Handlowcy - ranking, macierz produktowa, marza"
```

---

## Task 8: Zakładka Do domknięcia

Najważniejsza funkcjonalnie część modułu — jedyna, która pisze do bazy.

**Files:**
- Create: `src/components/stats/StatsFollowUpTab.tsx`

- [ ] **Krok 1: Lista**

`computeFollowUps(filtered, olderThanDays)`, próg 30/60/90 dni jako chipy.
Kolumny: checkbox, numer oferty, klient, handlowiec, wartość, „czeka N dni"
(badge czerwony >90 dni, żółty 30–90), przyciski decyzji.

- [ ] **Krok 2: Akcje pojedyncze**

`Przyjęta` → `setOfferStatus(m, id, 'przyjęta', rep)`
`Odrzucona` → `setOfferStatus(m, id, 'odrzucona', rep)`
`W grze` → `snoozeOffer(m, id, 30)`

Po sukcesie aktualizuj stan lokalnie (usuń wiersz z listy) — bez pełnego
przeładowania. Przy błędzie: komunikat i pozostawienie wiersza.

- [ ] **Krok 3: Akcje masowe**

Zaznaczone wiersze → „Oznacz przyjęte" / „Oznacz odrzucone".
Wykonuj sekwencyjnie, zliczaj sukcesy i błędy, pokaż podsumowanie
(`Zmieniono N z M ofert`).

- [ ] **Krok 4: Test zapisu — BEZ zużywania numeru oferty**

Wybierz ofertę, która **już jest rozstrzygnięta** (`status = 'przyjęta'`),
zapisz jej `id` i obecny status, zmień przez UI na `odrzucona`, sprawdź w bazie,
po czym **przywróć**:

```sql
UPDATE sale_offers SET status = 'przyjęta' WHERE id = '<id>';
DELETE FROM offer_followups WHERE offer_id = '<id>';
```

Zweryfikuj też, że zmiana jest widoczna w module Sprzedaż → Oferty (to sedno
całej zakładki: jedno źródło prawdy).

- [ ] **Krok 5: Build + commit**

```bash
git add src/components/stats/
git commit -m "feat(stats): zakladka Do domkniecia - decyzje pojedyncze i masowe"
```

---

## Task 9: Weryfikacja końcowa

- [ ] **Krok 1: Pełna kontrola krzyżowa** — wszystkie KPI dla filtra „wszystko"
oraz dla filtrów WYNAJEM i SPRZEDAŻ osobno, porównane z zapytaniami SQL na
`v_offer_stats`.

- [ ] **Krok 2: Przypadki brzegowe**

| Test | Oczekiwane |
|---|---|
| Okres bez ofert (np. styczeń 2026) | Stan pusty, brak pustych wykresów |
| Filtr → moduł bez rozstrzygniętych (SH) | Skuteczność `—`, nie `0%` |
| Odznacz wszystkie moduły | Czytelny komunikat, brak awarii |
| Piotr Domański (1 oferta) | Marża `—`, skuteczność `—` |

- [ ] **Krok 3: `npm run build`** — zielony, zero ostrzeżeń TS.

- [ ] **Krok 4: E2E przez Claude_Browser** — przełączanie zakładek, zmiana
filtrów, render wszystkich wykresów, akcja domknięcia statusu.

- [ ] **Krok 5: Commit poprawek + raport dla użytkownika**

Push do `main` i deploy na Netlify **wyłącznie po osobnej zgodzie użytkownika**.

---

## Poza zakresem tego planu

Zakładki Produkty i Klienci (10 wykresów), eksport PDF/Excel, cele sprzedażowe,
Supabase Auth i widoki prywatne, triggery logujące zmiany statusu, Vitest.
