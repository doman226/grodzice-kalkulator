/**
 * statsAggregate.ts — czyste funkcje agregujące.
 *
 * BEZ importów Reacta i Supabase. Wejście: OfferFact[]. Wyjście: liczby.
 * To jedyne miejsce w module, w którym da się popełnić błąd rachunkowy —
 * dlatego jest odizolowane i weryfikowane kontrolą krzyżową SQL.
 *
 * KONWENCJE LICZENIA (spójne we wszystkich funkcjach):
 *  • SZKICE SĄ POZA METRYKAMI HANDLOWYMI. `count`, `valuePln`, `massT` i
 *    `avgOffer` liczą wyłącznie oferty, które trafiły do klienta (wysłane,
 *    przyjęte, odrzucone). Szkic to notatka robocza, nie oferta — wliczanie go
 *    zawyżało wartość o ok. 5%. Liczba i wartość szkiców są dostępne osobno
 *    jako `drafts` / `draftPln`.
 *  • Skuteczność = przyjęte / (przyjęte + odrzucone). Oferty wysłane nie
 *    wchodzą do mianownika — nie są rozstrzygnięte. Brak rozstrzygniętych daje
 *    `null` (wyświetlane jako „—"), nigdy 0%.
 *  • Średnia marża pomija szkice ORAZ oferty z marżą ≥ 100% (koszt zakupu = 0,
 *    czyli handlowiec go nie wpisał). Marże ZEROWE I UJEMNE WCHODZĄ do średniej —
 *    wycinanie ich usuwałoby z rachunku wyłącznie najgorsze transakcje i czyniło
 *    metrykę tym bardziej optymistyczną, im gorzej firma sprzedaje.
 *  • Wykresy czasowe opierają się na `created_at` (data wystawienia), nigdy na
 *    dacie decyzji — patrz spec.
 */

import type { OfferFact, StatsFilters, StatsModule, PeriodPreset } from './statsTypes';
import { NO_REP } from './statsTypes';

const num = (v: number | null | undefined): number => Number(v) || 0;

// ─── Filtrowanie ──────────────────────────────────────────────────────────────

export function applyFilters(facts: OfferFact[], f: StatsFilters): OfferFact[] {
  return facts.filter(x =>
    (f.kind === 'all' || x.kind === f.kind) &&
    (f.rep === 'all' || (x.prepared_by ?? NO_REP) === f.rep) &&
    f.modules.includes(x.module_code));
}

/**
 * Wycina fakty z przedziału dat (włącznie).
 *
 * Potrzebne, bo pobieramy z bazy POSZERZONY zakres — bieżący okres plus
 * poprzedni o tej samej długości — żeby jednym zapytaniem policzyć wskaźniki
 * zmiany na kaflach KPI. Bez tego podziału oferty z poprzedniego okresu
 * zawyżałyby wszystkie bieżące metryki.
 */
export function inDateRange(facts: OfferFact[], from: string, to: string): OfferFact[] {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return facts.filter(x => {
    const t = new Date(x.created_at).getTime();
    return t >= a && t <= b;
  });
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

export interface Kpis {
  /** Oferty, które trafiły do klienta — BEZ szkiców. */
  count: number;
  /** Wartość ofert bez szkiców. */
  valuePln: number;
  /** Tonaż ofert bez szkiców. */
  massT: number;
  /** Wartość wyłącznie ofert sprzedaży — nigdy sklejana z wynajmem. */
  saleValuePln: number;
  /** Wartość wyłącznie ofert wynajmu. */
  rentalValuePln: number;
  /** Wartość ofert przyjętych. */
  wonPln: number;
  /** Wartość ofert odrzuconych. */
  lostPln: number;
  /** Wartość ofert wysłanych, wciąż nierozstrzygniętych. */
  pendingPln: number;
  /** Wartość szkiców. */
  draftPln: number;
  accepted: number;
  rejected: number;
  /** Wysłane i nierozstrzygnięte — mianownik problemu jakości danych. */
  pending: number;
  /** Liczba szkiców — poza `count`, podawana osobno jako informacja. */
  drafts: number;
  /** przyjęte / (przyjęte + odrzucone) w %, lub null gdy brak rozstrzygniętych. */
  winRate: number | null;
  /** Średnia marża w %, lub null gdy brak ofert z sensowną marżą. */
  avgMargin: number | null;
  /** Oferty sprzedaży bez wpisanej ceny zakupu (marża ≥ 100%). */
  noCostCount: number;
  /** Średnia wartość oferty. */
  avgOffer: number;
}

const sumValue = (facts: OfferFact[]): number =>
  facts.reduce((s, x) => s + num(x.value_pln), 0);

export function computeKpis(facts: OfferFact[]): Kpis {
  // Szkice odpadają ze WSZYSTKICH metryk handlowych — patrz konwencje na górze.
  const live = facts.filter(x => x.status !== 'szkic');
  const drafts = facts.filter(x => x.status === 'szkic');

  const accepted = live.filter(x => x.status === 'przyjęta');
  const rejected = live.filter(x => x.status === 'odrzucona');
  const decided = accepted.length + rejected.length;

  // Marża: bez szkiców i bez ofert z niewpisanym kosztem (≥100%).
  // Zero i wartości ujemne WCHODZĄ — to realne transakcje po koszcie lub poniżej.
  const margins = live.filter(x => x.margin_pct !== null && x.margin_pct < 100);

  const valuePln = sumValue(live);

  return {
    count: live.length,
    valuePln,
    massT: live.reduce((s, x) => s + num(x.mass_t), 0),
    saleValuePln: sumValue(live.filter(x => x.kind === 'sale')),
    rentalValuePln: sumValue(live.filter(x => x.kind === 'rental')),
    wonPln: sumValue(accepted),
    lostPln: sumValue(rejected),
    pendingPln: sumValue(live.filter(x => x.status === 'wysłana')),
    draftPln: sumValue(drafts),
    accepted: accepted.length,
    rejected: rejected.length,
    pending: live.filter(x => x.status === 'wysłana').length,
    drafts: drafts.length,
    winRate: decided === 0 ? null : (accepted.length / decided) * 100,
    avgMargin: margins.length === 0
      ? null
      : margins.reduce((s, x) => s + num(x.margin_pct), 0) / margins.length,
    noCostCount: live.filter(x => x.margin_pct !== null && x.margin_pct >= 100).length,
    avgOffer: live.length === 0 ? 0 : valuePln / live.length,
  };
}

// ─── Podziały ─────────────────────────────────────────────────────────────────

export interface RepRow extends Kpis {
  rep: string;
  /** Udział w wartości całego przefiltrowanego zbioru, w %. */
  sharePct: number;
}

export function computeByRep(facts: OfferFact[]): RepRow[] {
  // Mianownik MUSI pomijać szkice tak samo jak licznik — `valuePln` każdego
  // handlowca jest już bez szkiców, więc liczenie ich w sumie zaniżałoby
  // wszystkie udziały i kolumna „Udział" nie sumowałaby się do 100%.
  const total = sumValue(facts.filter(x => x.status !== 'szkic'));
  const reps = Array.from(new Set(facts.map(x => x.prepared_by ?? NO_REP)));
  return reps
    .map(rep => {
      const own = facts.filter(x => (x.prepared_by ?? NO_REP) === rep);
      const kpis = computeKpis(own);
      return {
        ...kpis,
        rep,
        sharePct: total === 0 ? 0 : (kpis.valuePln / total) * 100,
      };
    })
    .sort((a, b) => b.valuePln - a.valuePln);
}

export interface ModuleRow extends Kpis {
  module: StatsModule;
}

export function computeByModule(facts: OfferFact[]): ModuleRow[] {
  const mods = Array.from(new Set(facts.map(x => x.module_code)));
  return mods
    .map(module => ({ ...computeKpis(facts.filter(x => x.module_code === module)), module }))
    .sort((a, b) => b.valuePln - a.valuePln);
}

export interface MonthPoint {
  month: string;
  count: number;
  valuePln: number;
}

/** Trend liczony bez szkiców — spójnie z kaflami KPI. */
export function computeMonthly(facts: OfferFact[]): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (const x of facts.filter(f => f.status !== 'szkic')) {
    const month = x.created_at.slice(0, 7);
    const cur = map.get(month) ?? { month, count: 0, valuePln: 0 };
    cur.count += 1;
    cur.valuePln += num(x.value_pln);
    map.set(month, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Rozkład statusów — JEDYNA funkcja licząca szkice na równi z resztą,
 * bo jej zadaniem jest pokazać pełny obraz stanów, w tym ile jest szkiców.
 */
export function computeStatusSplit(facts: OfferFact[]): { status: string; count: number }[] {
  return (['wysłana', 'przyjęta', 'odrzucona', 'szkic'] as const)
    .map(status => ({ status, count: facts.filter(x => x.status === status).length }))
    .filter(x => x.count > 0);
}

/** Macierz handlowiec × moduł (liczba ofert) — „kto w czym siedzi". */
export interface RepModuleMatrix {
  reps: string[];
  modules: StatsModule[];
  counts: Record<string, Record<string, number>>;
  max: number;
}

export function computeRepModuleMatrix(facts: OfferFact[]): RepModuleMatrix {
  const reps = Array.from(new Set(facts.map(x => x.prepared_by ?? NO_REP))).sort();
  const modules = Array.from(new Set(facts.map(x => x.module_code)));
  const counts: Record<string, Record<string, number>> = {};
  let max = 0;

  for (const rep of reps) {
    counts[rep] = {};
    for (const m of modules) {
      const n = facts.filter(x =>
        (x.prepared_by ?? NO_REP) === rep && x.module_code === m).length;
      counts[rep][m] = n;
      if (n > max) max = n;
    }
  }
  return { reps, modules, counts, max };
}

// ─── Do domknięcia ────────────────────────────────────────────────────────────

/**
 * Oferty wymagające decyzji: wysłane, starsze niż `olderThanDays`,
 * z nieaktywnym odłożeniem („wciąż w grze"). Najstarsze pierwsze.
 */
export function computeFollowUps(facts: OfferFact[], olderThanDays: number): OfferFact[] {
  const now = Date.now();
  const cutoff = now - olderThanDays * 86_400_000;
  return facts
    .filter(x => x.status === 'wysłana')
    .filter(x => new Date(x.created_at).getTime() < cutoff)
    .filter(x => !x.snoozed_until || new Date(x.snoozed_until).getTime() < now)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const daysAgo = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export interface AgeBucket {
  label: string;
  count: number;
  valuePln: number;
  /**
   * Próg dla zakładki Do domknięcia, albo `null` gdy przedział nie jest
   * jeszcze zaległy. Lista pokazuje oferty STARSZE NIŻ próg, więc kliknięcie
   * w przedział „60–90" pokaże także wszystko powyżej 90 — to nadzbiór.
   */
  threshold: number | null;
}

/**
 * Wiek ofert czekających na decyzję, w przedziałach.
 *
 * Semantyka identyczna z `computeFollowUps`: tylko status „wysłana", z
 * pominięciem ofert aktywnie odłożonych („wciąż w grze"). Dzięki temu liczby
 * na tej karcie zgadzają się z tym, co użytkownik zobaczy po kliknięciu.
 */
export function computePendingAge(facts: OfferFact[]): AgeBucket[] {
  const now = Date.now();
  const pending = facts.filter(x =>
    x.status === 'wysłana' &&
    (!x.snoozed_until || new Date(x.snoozed_until).getTime() < now));

  const defs: { label: string; min: number; max: number; threshold: number | null }[] = [
    { label: 'do 30 dni',   min: 0,  max: 30,       threshold: null },
    { label: '30–60 dni',   min: 30, max: 60,       threshold: 30 },
    { label: '60–90 dni',   min: 60, max: 90,       threshold: 60 },
    { label: 'ponad 90 dni', min: 90, max: Infinity, threshold: 90 },
  ];

  return defs.map(d => {
    const inBucket = pending.filter(x => {
      const age = daysAgo(x.created_at);
      return age >= d.min && age < d.max;
    });
    return {
      label: d.label,
      count: inBucket.length,
      valuePln: sumValue(inBucket),
      threshold: d.threshold,
    };
  });
}

// ─── Okresy ───────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
const endOfDay   = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };

/** Granice okresu dla presetu. `all` sięga 2000 roku — starszych ofert nie ma. */
export function buildPeriod(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  const to = endOfDay(new Date(now)).toISOString();
  let from: Date;

  switch (preset) {
    case 'this_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this_quarter':
      from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case 'this_year':
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last_12m':
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    default:
      from = new Date(2000, 0, 1);
  }
  return { from: startOfDay(from).toISOString(), to };
}

/** Poprzedni okres o tej samej długości — do wskaźników zmiany na kaflach KPI. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const span = b - a;
  return { from: new Date(a - span).toISOString(), to: new Date(a - 1).toISOString() };
}

/** Zmiana procentowa; null gdy poprzednia wartość to 0 (dzielenie bez sensu). */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ─── Formatery ────────────────────────────────────────────────────────────────
// Math.round, nie Math.ceil — formatPLN/formatEUR z lib/calculations.ts używają
// Math.ceil, co na float64 daje błędy w metrykach pochodnych (patrz CLAUDE.md).

export const fmtInt = (v: number): string =>
  Math.round(v).toLocaleString('pl-PL');

export const fmtPln = (v: number): string =>
  `${Math.round(v).toLocaleString('pl-PL')} PLN`;

/** Duże kwoty na kaflach: 219,9 mln / 583,0 tys. / 412 */
export function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mln`;
  if (abs >= 10_000)    return `${(v / 1_000).toFixed(1).replace('.', ',')} tys.`;
  return Math.round(v).toLocaleString('pl-PL');
}

export const fmtPct = (v: number | null, digits = 1): string =>
  v === null ? '—' : `${v.toFixed(digits).replace('.', ',')}%`;

export const fmtTons = (v: number): string =>
  `${Math.round(v).toLocaleString('pl-PL')} t`;

// ─── Skale wykresów ───────────────────────────────────────────────────────────

/**
 * Zaokrągla górę skali do 1/2/5 × 10^n, żeby podziałka osi wypadała na
 * okrągłych wartościach (25/50/75/100 zamiast 23,4/46,8/70,2/93,7).
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * base;
}

/** Etykieta osi dobierająca jednostkę do rzędu wielkości: 80 mln / 800 tys. / 250 */
export function axisLabel(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} mln`;
  if (Math.abs(v) >= 1_000) return `${+(v / 1_000).toFixed(0)} tys.`;
  return String(Math.round(v));
}
