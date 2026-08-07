/**
 * StatsOverviewTab.tsx — zakładka Przegląd.
 *
 * Task 5: sześć kafli KPI + baner jakości danych.
 * Wykresy (trend, statusy, moduły) dochodzą w Tasku 6.
 */

import { useMemo } from 'react';
import KpiCard from './charts/KpiCard';
import TrendChart from './charts/TrendChart';
import StatusDonut from './charts/StatusDonut';
import ModuleBars from './charts/ModuleBars';
import PendingAgeBars from './charts/PendingAgeBars';
import {
  computeKpis, computeMonthly, computeStatusSplit, computeByModule, computePendingAge,
  pctChange, fmtInt, fmtCompact, fmtPct, fmtTons,
} from './lib/statsAggregate';
import type { OfferFact, StatsKind } from './lib/statsTypes';
import type { StatsTab } from './StatsSection';

interface Props {
  facts: OfferFact[];
  /** Ten sam filtr, ale za poprzedni okres — do wskaźników zmiany. */
  previousFacts: OfferFact[];
  /** Aktywny zakres — decyduje, czy wartość pokazać łącznie czy rozdzielnie. */
  kind: StatsKind | 'all';
  onTabChange: (tab: StatsTab) => void;
  /** Przejście do Do domknięcia z ustawionym progiem wieku. */
  onJumpToFollowUp: (threshold: number) => void;
}

export default function StatsOverviewTab({
  facts, previousFacts, kind, onTabChange, onJumpToFollowUp,
}: Props) {
  const kpis     = useMemo(() => computeKpis(facts), [facts]);
  const prev     = useMemo(() => computeKpis(previousFacts), [previousFacts]);
  const monthly  = useMemo(() => computeMonthly(facts), [facts]);
  const statuses = useMemo(() => computeStatusSplit(facts), [facts]);
  const modules  = useMemo(() => computeByModule(facts), [facts]);
  const ageBuckets = useMemo(() => computePendingAge(facts), [facts]);

  // Bez danych porównawczych nie pokazujemy wskaźnika zmiany zamiast zmyślać 0%.
  const hasPrev = previousFacts.length > 0;
  const change = (cur: number, before: number) => (hasPrev ? pctChange(cur, before) : null);

  const decided = kpis.accepted + kpis.rejected;
  const pendingShare = kpis.count === 0 ? 0 : kpis.pending / kpis.count;

  /** Wartość przyjętych ofert w rozbiciu — również nie sumowana na ekranie. */
  const wonSplit = useMemo(() => {
    const won = facts.filter(f => f.status === 'przyjęta');
    const sum = (k: string) => won.filter(f => f.kind === k)
      .reduce((s, f) => s + (Number(f.value_pln) || 0), 0);
    return { sale: sum('sale'), rental: sum('rental') };
  }, [facts]);

  return (
    <div>
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <KpiCard
          label="Ofert wystawionych"
          value={fmtInt(kpis.count)}
          change={change(kpis.count, prev.count)}
          hint={kpis.drafts > 0 ? `+ ${fmtInt(kpis.drafts)} szkiców poza statystyką` : undefined}
        />

        {/* Wartość sprzedaży i wynajmu NIGDY nie jest sumowana w jedną kwotę:
            sprzedaż to jednorazowy przychód, wynajem to opłata za okres.
            W trybie „Wszystko" pokazujemy dwa osobne kafle. */}
        {kind === 'all' ? (
          <>
            <KpiCard
              label="Wartość sprzedaży"
              value={fmtCompact(kpis.saleValuePln)}
              unit="PLN"
              change={change(kpis.saleValuePln, prev.saleValuePln)}
              hint="kurs z oferty"
            />
            <KpiCard
              label="Wartość wynajmu"
              value={fmtCompact(kpis.rentalValuePln)}
              unit="PLN"
              change={change(kpis.rentalValuePln, prev.rentalValuePln)}
              hint="opłata za okres najmu"
            />
          </>
        ) : (
          <KpiCard
            label={kind === 'sale' ? 'Wartość sprzedaży' : 'Wartość wynajmu'}
            value={fmtCompact(kpis.valuePln)}
            unit="PLN"
            change={change(kpis.valuePln, prev.valuePln)}
            hint={kind === 'sale' ? 'kurs z oferty' : 'opłata za okres najmu'}
          />
        )}
        <KpiCard
          label="Wartość przyjętych ofert"
          value={fmtCompact(kpis.wonPln)}
          unit="PLN"
          hint={
            kind === 'all' && kpis.wonPln > 0
              ? <>{fmtInt(kpis.accepted)} ofert · sprzedaż {fmtCompact(wonSplit.sale)} · wynajem {fmtCompact(wonSplit.rental)}</>
              : `${fmtInt(kpis.accepted)} ofert przyjętych`
          }
        />
        <KpiCard
          label="Skuteczność"
          value={fmtPct(kpis.winRate)}
          tone={kpis.pending > decided ? 'warning' : 'default'}
          hint={
            decided === 0
              ? 'brak rozstrzygniętych ofert'
              : <>{fmtInt(kpis.accepted)} z {fmtInt(decided)} rozstrzygniętych · <b>{fmtInt(kpis.pending)} czeka</b></>
          }
        />
        <KpiCard
          label="Tonaż"
          value={fmtTons(kpis.massT)}
          change={change(kpis.massT, prev.massT)}
          hint="stal w ofertach"
        />
        <KpiCard
          label="Średnia marża"
          value={fmtPct(kpis.avgMargin)}
          hint={
            kpis.avgMargin === null
              ? 'brak ofert sprzedaży w filtrze'
              : kpis.noCostCount > 0
                ? <>sprzedaż · bez {fmtInt(kpis.noCostCount)} ofert bez ceny zakupu</>
                : 'sprzedaż'
          }
        />
      </div>

      {pendingShare > 0.5 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-900">
            <b>{fmtInt(kpis.pending)} ofert ({Math.round(pendingShare * 100)}%) czeka na rozstrzygnięcie.</b>{' '}
            {decided > 0
              ? <>Skuteczność {fmtPct(kpis.winRate)} liczona jest z {fmtInt(decided)} domkniętych ofert — to {Math.round((decided / kpis.count) * 100)}% zbioru.</>
              : <>Bez domkniętych ofert skuteczności nie da się policzyć.</>}
          </p>
          <button
            type="button"
            onClick={() => onTabChange('followup')}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 whitespace-nowrap"
          >
            Domknij zaległe
          </button>
        </div>
      )}

      <div className="mb-4">
        <TrendChart data={monthly} />
      </div>

      {/* items-start: karty przyjmują własną wysokość. Bez tego siatka
          rozciągałaby kartę statusów do wysokości sąsiadki z 7-wierszową
          tabelą, zostawiając pod pierścieniem ~450 px pustego pola. */}
      {/* DWIE kolumny, nie trzy. Trzy karty wrzucone wprost do `auto-fit`
          utworzyłyby trzeci tor i ścisnęły kartę modułów (z 7-kolumnową
          tabelą) do jednej trzeciej szerokości. Dlatego obie niskie karty
          siedzą w zagnieżdżonej kolumnie po lewej. */}
      <div className="grid gap-4 items-start"
           style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="grid gap-4 content-start">
          {/* Donut dostaje PEŁNĄ liczbę ofert (ze szkicami) — inaczej udziały
              nie sumowałyby się do 100%, bo szkice są jednym z segmentów. */}
          <StatusDonut data={statuses} total={facts.length} />
          {/* Dopełnia donut: on mówi ILE ofert wisi, ta karta — JAK DŁUGO. */}
          <PendingAgeBars buckets={ageBuckets} onJump={onJumpToFollowUp} />
        </div>
        <ModuleBars rows={modules} />
      </div>
    </div>
  );
}
