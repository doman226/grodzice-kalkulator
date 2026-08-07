/**
 * statsAggregate.test.ts — testy rachunkowe modułu statystyk.
 *
 * ZAKRES ŚWIADOMIE WĄSKI: wyłącznie czyste funkcje z `statsAggregate.ts`.
 * Nie testujemy komponentów, renderowania ani zapytań do Supabase.
 *
 * DLACZEGO TE TESTY ISTNIEJĄ: recenzja modułu wykryła trzy błędy rachunkowe,
 * które przeszły przez dziewięć zielonych buildów — `tsc` nie ma jak wykryć
 * źle policzonej średniej. Osiem z poniższych testów to testy regresji tych
 * konkretnych błędów (obszary A, B, D).
 */

import { describe, it, expect } from 'vitest';
import {
  computeKpis, computeByRep, computeMonthly, computeStatusSplit,
  applyFilters, inDateRange, computeFollowUps, computePendingAge,
  buildPeriod, previousPeriod, pctChange,
} from './statsAggregate';
import type { OfferFact, StatsFilters, StatsModule } from './statsTypes';
import { STATS_MODULES } from './statsTypes';

// ─── Pomocnicze ───────────────────────────────────────────────────────────────

let seq = 0;

/** Buduje fakt ofertowy z sensownymi domyślnymi wartościami. */
function fact(over: Partial<OfferFact> = {}): OfferFact {
  seq += 1;
  return {
    id: `id-${seq}`,
    module_code: 'SP',
    kind: 'sale',
    offer_number: `SP/2026/${String(seq).padStart(3, '0')}`,
    client_id: 'c1',
    client_name: 'Klient',
    prepared_by: 'Anna Nowak',
    status: 'wysłana',
    currency: 'PLN',
    created_at: '2026-05-15T10:00:00.000Z',
    value_pln: 1000,
    value_eur: 250,
    mass_t: 10,
    margin_pct: null,
    snoozed_until: null,
    ...over,
  };
}

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const filters = (over: Partial<StatsFilters> = {}): StatsFilters => ({
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-12-31T23:59:59.999Z',
  preset: 'this_year',
  kind: 'all',
  rep: 'all',
  modules: [...STATS_MODULES],
  ...over,
});

// ─── A. Szkice poza metrykami (regresja błędu #2) ─────────────────────────────

describe('szkice są poza metrykami handlowymi', () => {
  const facts = [
    fact({ status: 'wysłana',  value_pln: 1000, mass_t: 10 }),
    fact({ status: 'przyjęta', value_pln: 2000, mass_t: 20 }),
    fact({ status: 'szkic',    value_pln: 5000, mass_t: 50 }),
  ];

  it('1. nie wlicza szkiców do count, valuePln ani massT', () => {
    const k = computeKpis(facts);
    expect(k.count).toBe(2);
    expect(k.valuePln).toBe(3000);
    expect(k.massT).toBe(30);
  });

  it('2. raportuje szkice osobno w drafts i draftPln', () => {
    const k = computeKpis(facts);
    expect(k.drafts).toBe(1);
    expect(k.draftPln).toBe(5000);
  });

  it('3. avgOffer dzieli przez liczbę ofert bez szkiców', () => {
    // 3000 / 2 = 1500. Ze szkicem byłoby 8000 / 3 = 2667.
    expect(computeKpis(facts).avgOffer).toBe(1500);
  });
});

// ─── B. Marża (regresja błędu #3) ─────────────────────────────────────────────

describe('średnia marża', () => {
  it('4. wlicza marże UJEMNE — sprzedaż poniżej kosztu musi obniżać średnią', () => {
    const k = computeKpis([
      fact({ margin_pct: 10 }),
      fact({ margin_pct: -5 }),
    ]);
    expect(k.avgMargin).toBeCloseTo(2.5, 10);
  });

  it('5. wlicza marżę ZEROWĄ', () => {
    const k = computeKpis([
      fact({ margin_pct: 10 }),
      fact({ margin_pct: 0 }),
    ]);
    expect(k.avgMargin).toBeCloseTo(5, 10);
  });

  it('6. wyklucza marżę ≥100% (brak ceny zakupu) i liczy ją w noCostCount', () => {
    const k = computeKpis([
      fact({ margin_pct: 8 }),
      fact({ margin_pct: 100 }),
    ]);
    expect(k.avgMargin).toBeCloseTo(8, 10);
    expect(k.noCostCount).toBe(1);
  });

  it('7. bez ofert z marżą zwraca null, nigdy 0', () => {
    const k = computeKpis([fact({ margin_pct: null, kind: 'rental' })]);
    expect(k.avgMargin).toBeNull();
  });
});

// ─── C. Skuteczność ───────────────────────────────────────────────────────────

describe('skuteczność', () => {
  it('8. liczy tylko z rozstrzygniętych — wysłane i szkice poza mianownikiem', () => {
    const k = computeKpis([
      fact({ status: 'przyjęta' }),
      fact({ status: 'przyjęta' }),
      fact({ status: 'odrzucona' }),
      fact({ status: 'wysłana' }),
      fact({ status: 'wysłana' }),
      fact({ status: 'szkic' }),
    ]);
    // 2 z 3 rozstrzygniętych, nie 2 z 5 ani 2 z 6.
    expect(k.winRate).toBeCloseTo(66.666, 2);
    expect(k.pending).toBe(2);
  });

  it('9. bez rozstrzygniętych zwraca null, nigdy 0', () => {
    const k = computeKpis([fact({ status: 'wysłana' }), fact({ status: 'szkic' })]);
    expect(k.winRate).toBeNull();
  });
});

// ─── D. Rozdzielenie sprzedaży i wynajmu (regresja błędu #1) ──────────────────

describe('wartość sprzedaży i wynajmu', () => {
  it('10. każda zawiera wyłącznie swój rodzaj, a razem dają valuePln', () => {
    const k = computeKpis([
      fact({ kind: 'sale',   module_code: 'SP', value_pln: 1000 }),
      fact({ kind: 'sale',   module_code: 'SR', value_pln: 500 }),
      fact({ kind: 'rental', module_code: 'OF', value_pln: 300 }),
      fact({ kind: 'rental', module_code: 'OF', value_pln: 200, status: 'szkic' }),
    ]);
    expect(k.saleValuePln).toBe(1500);
    expect(k.rentalValuePln).toBe(300);          // szkic nie wchodzi
    expect(k.saleValuePln + k.rentalValuePln).toBe(k.valuePln);
  });
});

// ─── E. Filtry ────────────────────────────────────────────────────────────────

describe('filtry', () => {
  const facts = [
    fact({ kind: 'sale',   module_code: 'SP', prepared_by: 'Anna Nowak' }),
    fact({ kind: 'sale',   module_code: 'SR', prepared_by: 'Jan Kowalski' }),
    fact({ kind: 'rental', module_code: 'OF', prepared_by: 'Anna Nowak' }),
  ];

  it('11. filtruje po rodzaju, handlowcu i modułach; pusta lista modułów daje pustkę', () => {
    expect(applyFilters(facts, filters({ kind: 'rental' })).length).toBe(1);
    expect(applyFilters(facts, filters({ rep: 'Anna Nowak' })).length).toBe(2);
    expect(applyFilters(facts, filters({ modules: ['SR'] as StatsModule[] })).length).toBe(1);
    expect(applyFilters(facts, filters({ modules: [] })).length).toBe(0);
  });

  it('12. inDateRange traktuje obie granice WŁĄCZNIE', () => {
    // Ta funkcja rozdziela okres bieżący od poprzedniego przy poszerzonym
    // pobraniu. Błąd o jeden dzień zawyżałby wszystkie kafle KPI.
    const from = '2026-05-01T00:00:00.000Z';
    const to   = '2026-05-31T23:59:59.999Z';
    const inside = [
      fact({ created_at: from }),
      fact({ created_at: '2026-05-15T12:00:00.000Z' }),
      fact({ created_at: to }),
    ];
    const outside = [
      fact({ created_at: '2026-04-30T23:59:59.999Z' }),
      fact({ created_at: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(inDateRange([...inside, ...outside], from, to).length).toBe(3);
  });
});

// ─── F. Okresy ────────────────────────────────────────────────────────────────

describe('okresy', () => {
  it('13. buildPeriod("this_year") obejmuje rok od 1 stycznia do końca dnia', () => {
    const now = new Date(2026, 6, 15, 14, 30);       // 15 lipca 2026, 14:30
    const { from, to } = buildPeriod('this_year', now);
    const f = new Date(from);
    const t = new Date(to);
    expect(f.getFullYear()).toBe(2026);
    expect(f.getMonth()).toBe(0);
    expect(f.getDate()).toBe(1);
    expect(f.getHours()).toBe(0);
    expect(t.getDate()).toBe(15);
    expect(t.getHours()).toBe(23);
  });

  it('14. previousPeriod ma tę samą długość i kończy się tuż przed bieżącym', () => {
    const from = '2026-05-01T00:00:00.000Z';
    const to   = '2026-05-31T00:00:00.000Z';
    const prev = previousPeriod(from, to);
    const span = new Date(to).getTime() - new Date(from).getTime();
    const prevSpan = new Date(prev.to).getTime() - new Date(prev.from).getTime();

    expect(prevSpan).toBe(span - 1);                       // kończy się 1 ms przed
    expect(new Date(prev.to).getTime()).toBe(new Date(from).getTime() - 1);
    expect(pctChange(150, 100)).toBeCloseTo(50, 10);
    expect(pctChange(50, 0)).toBeNull();                   // brak bazy porównania
  });
});

// ─── G. Do domknięcia ─────────────────────────────────────────────────────────

describe('oferty do domknięcia', () => {
  it('15. bierze tylko wysłane starsze niż próg, pomija aktywnie odłożone', () => {
    const stare = fact({ status: 'wysłana', created_at: daysFromNow(-100) });
    const swieze = fact({ status: 'wysłana', created_at: daysFromNow(-5) });
    const przyjete = fact({ status: 'przyjęta', created_at: daysFromNow(-100) });
    const szkic = fact({ status: 'szkic', created_at: daysFromNow(-100) });
    const odlozone = fact({
      status: 'wysłana', created_at: daysFromNow(-100), snoozed_until: daysFromNow(20),
    });
    const odlozenieWygaslo = fact({
      status: 'wysłana', created_at: daysFromNow(-100), snoozed_until: daysFromNow(-1),
    });

    const wynik = computeFollowUps(
      [stare, swieze, przyjete, szkic, odlozone, odlozenieWygaslo], 30,
    );
    const ids = wynik.map(r => r.id);

    expect(ids).toContain(stare.id);
    expect(ids).toContain(odlozenieWygaslo.id);   // odłożenie minęło → wraca
    expect(ids).not.toContain(swieze.id);         // za młoda
    expect(ids).not.toContain(przyjete.id);       // już rozstrzygnięta
    expect(ids).not.toContain(szkic.id);          // nie trafiła do klienta
    expect(ids).not.toContain(odlozone.id);       // odłożona na przyszłość
    expect(wynik.length).toBe(2);
  });
});

describe('wiek ofert nierozstrzygniętych', () => {
  it('16. przypisuje przedziały rozłącznie i pomija to, czego nie ma na liście', () => {
    const buckets = computePendingAge([
      fact({ status: 'wysłana', created_at: daysFromNow(-10),  value_pln: 100 }),
      fact({ status: 'wysłana', created_at: daysFromNow(-45),  value_pln: 200 }),
      fact({ status: 'wysłana', created_at: daysFromNow(-75),  value_pln: 300 }),
      fact({ status: 'wysłana', created_at: daysFromNow(-200), value_pln: 400 }),
      fact({ status: 'przyjęta', created_at: daysFromNow(-200) }),          // rozstrzygnięta
      fact({ status: 'szkic',    created_at: daysFromNow(-200) }),          // nie u klienta
      fact({ status: 'wysłana', created_at: daysFromNow(-200),
             snoozed_until: daysFromNow(15) }),                             // odłożona
    ]);
    expect(buckets.map(b => b.count)).toEqual([1, 1, 1, 1]);
    expect(buckets.map(b => b.valuePln)).toEqual([100, 200, 300, 400]);
    // Suma przedziałów = liczba ofert, które pokazałaby lista Do domknięcia.
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it('17. progi przejścia: pierwszy przedział bez akcji, pozostałe z dolną granicą', () => {
    const buckets = computePendingAge([fact({ status: 'wysłana', created_at: daysFromNow(-5) })]);
    expect(buckets.map(b => b.threshold)).toEqual([null, 30, 60, 90]);
  });

  it('granica przedziału należy do starszego kubełka', () => {
    // Dokładnie 30 dni → „30–60", nie „do 30". Przedziały muszą być rozłączne,
    // inaczej oferta liczyłaby się dwa razy albo znikała.
    const buckets = computePendingAge([
      fact({ status: 'wysłana', created_at: daysFromNow(-30) }),
    ]);
    expect(buckets[0].count).toBe(0);
    expect(buckets[1].count).toBe(1);
  });
});

// ─── Spójność podziałów ───────────────────────────────────────────────────────

describe('podziały pozostają spójne z KPI', () => {
  // Wartości celowo RÓŻNE — przy remisie asercja o kolejności byłaby
  // niejednoznaczna (sortowanie zachowuje wtedy kolejność wejścia).
  const facts = [
    fact({ prepared_by: 'Anna Nowak',   status: 'przyjęta', value_pln: 1000 }),
    fact({ prepared_by: 'Anna Nowak',   status: 'wysłana',  value_pln: 2000 }),
    fact({ prepared_by: 'Jan Kowalski', status: 'wysłana',  value_pln: 4000 }),
    fact({ prepared_by: 'Jan Kowalski', status: 'szkic',    value_pln: 9000 }),
  ];

  it('computeByRep: sortuje malejąco, udziały dają 100%, szkice poza wartością', () => {
    const rows = computeByRep(facts);
    // Jan 4000 > Anna 3000. Szkic Jana (9000) NIE wchodzi — inaczej byłby na 13 000.
    expect(rows.map(r => r.rep)).toEqual(['Jan Kowalski', 'Anna Nowak']);
    expect(rows[0].valuePln).toBe(4000);
    expect(rows[1].valuePln).toBe(3000);
    expect(rows.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100, 6);
  });

  it('computeMonthly pomija szkice, computeStatusSplit je pokazuje', () => {
    const monthly = computeMonthly(facts);
    expect(monthly.reduce((s, m) => s + m.count, 0)).toBe(3);

    const split = computeStatusSplit(facts);
    expect(split.find(s => s.status === 'szkic')?.count).toBe(1);
    expect(split.reduce((s, x) => s + x.count, 0)).toBe(4);
  });
});
