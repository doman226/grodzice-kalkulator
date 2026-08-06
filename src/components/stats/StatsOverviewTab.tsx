/**
 * StatsOverviewTab.tsx — zakładka Przegląd.
 *
 * Task 5: sześć kafli KPI + baner jakości danych.
 * Wykresy (trend, statusy, moduły) dochodzą w Tasku 6.
 */

import { useMemo } from 'react';
import KpiCard from './charts/KpiCard';
import { computeKpis, pctChange, fmtInt, fmtCompact, fmtPct, fmtTons } from './lib/statsAggregate';
import type { OfferFact } from './lib/statsTypes';
import type { StatsTab } from './StatsSection';

interface Props {
  facts: OfferFact[];
  /** Ten sam filtr, ale za poprzedni okres — do wskaźników zmiany. */
  previousFacts: OfferFact[];
  onTabChange: (tab: StatsTab) => void;
}

export default function StatsOverviewTab({ facts, previousFacts, onTabChange }: Props) {
  const kpis = useMemo(() => computeKpis(facts), [facts]);
  const prev = useMemo(() => computeKpis(previousFacts), [previousFacts]);

  // Bez danych porównawczych nie pokazujemy wskaźnika zmiany zamiast zmyślać 0%.
  const hasPrev = previousFacts.length > 0;
  const change = (cur: number, before: number) => (hasPrev ? pctChange(cur, before) : null);

  const decided = kpis.accepted + kpis.rejected;
  const pendingShare = kpis.count === 0 ? 0 : kpis.pending / kpis.count;

  return (
    <div>
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <KpiCard
          label="Ofert wystawionych"
          value={fmtInt(kpis.count)}
          change={change(kpis.count, prev.count)}
          hint={kpis.drafts > 0 ? `w tym ${fmtInt(kpis.drafts)} szkiców` : undefined}
        />
        <KpiCard
          label="Wartość ofert"
          value={fmtCompact(kpis.valuePln)}
          unit="PLN"
          change={change(kpis.valuePln, prev.valuePln)}
          hint="kurs z oferty"
        />
        <KpiCard
          label="Wartość wygrana"
          value={fmtCompact(kpis.wonPln)}
          unit="PLN"
          hint={`${fmtInt(kpis.accepted)} ofert przyjętych`}
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

      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-400">Wykresy trendu, statusów i modułów — Task 6.</p>
      </div>
    </div>
  );
}
