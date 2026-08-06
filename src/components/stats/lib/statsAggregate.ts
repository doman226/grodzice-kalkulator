/**
 * statsAggregate.ts — czyste funkcje agregujące.
 *
 * BEZ importów Reacta i Supabase. Wejście: OfferFact[]. Wyjście: liczby.
 * To jedyne miejsce w module, w którym da się popełnić błąd rachunkowy —
 * dlatego jest odizolowane i weryfikowane kontrolą krzyżową SQL.
 *
 * KONWENCJE LICZENIA (spójne we wszystkich funkcjach):
 *  • `count` / `valuePln` / `massT` — WSZYSTKIE oferty w filtrze, także szkice.
 *  • Skuteczność = przyjęte / (przyjęte + odrzucone). Szkice i oferty wysłane
 *    nie wchodzą do mianownika — nie są rozstrzygnięte. Brak rozstrzygniętych
 *    daje `null` (wyświetlane jako „—"), nigdy 0%.
 *  • Średnia marża pomija szkice ORAZ oferty z marżą ≥ 100% (koszt zakupu = 0,
 *    czyli handlowiec go nie wpisał — inaczej średnia byłaby zawyżona).
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

// ─── KPI ──────────────────────────────────────────────────────────────────────

export interface Kpis {
  /** Wszystkie oferty w filtrze, łącznie ze szkicami. */
  count: number;
  valuePln: number;
  massT: number;
  /** Wartość ofert przyjętych. */
  wonPln: number;
  accepted: number;
  rejected: number;
  /** Wysłane i nierozstrzygnięte — mianownik problemu jakości danych. */
  pending: number;
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

export function computeKpis(facts: OfferFact[]): Kpis {
  const accepted = facts.filter(x => x.status === 'przyjęta');
  const rejected = facts.filter(x => x.status === 'odrzucona');
  const decided = accepted.length + rejected.length;

  const margins = facts.filter(x =>
    x.status !== 'szkic' && x.margin_pct !== null &&
    x.margin_pct > 0 && x.margin_pct < 100);

  const valuePln = facts.reduce((s, x) => s + num(x.value_pln), 0);

  return {
    count: facts.length,
    valuePln,
    massT: facts.reduce((s, x) => s + num(x.mass_t), 0),
    wonPln: accepted.reduce((s, x) => s + num(x.value_pln), 0),
    accepted: accepted.length,
    rejected: rejected.length,
    pending: facts.filter(x => x.status === 'wysłana').length,
    drafts: facts.filter(x => x.status === 'szkic').length,
    winRate: decided === 0 ? null : (accepted.length / decided) * 100,
    avgMargin: margins.length === 0
      ? null
      : margins.reduce((s, x) => s + num(x.margin_pct), 0) / margins.length,
    noCostCount: facts.filter(x =>
      x.status !== 'szkic' && x.margin_pct !== null && x.margin_pct >= 100).length,
    avgOffer: facts.length === 0 ? 0 : valuePln / facts.length,
  };
}

// ─── Podziały ─────────────────────────────────────────────────────────────────

export interface RepRow extends Kpis {
  rep: string;
  /** Udział w wartości całego przefiltrowanego zbioru, w %. */
  sharePct: number;
}

export function computeByRep(facts: OfferFact[]): RepRow[] {
  const total = facts.reduce((s, x) => s + num(x.value_pln), 0);
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

export function computeMonthly(facts: OfferFact[]): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (const x of facts) {
    const month = x.created_at.slice(0, 7);
    const cur = map.get(month) ?? { month, count: 0, valuePln: 0 };
    cur.count += 1;
    cur.valuePln += num(x.value_pln);
    map.set(month, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

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
