/**
 * StatsSection.tsx — kontener modułu statystyk.
 *
 * Komponent KONTROLOWANY, analogicznie do BeamRentalSection / SaleSection:
 * App.tsx trzyma aktywną zakładkę i licznik „do domknięcia", sekcja sama ładuje
 * swoje dane.
 *
 * PRZEPŁYW DANYCH — sedno wydajności modułu:
 *  1. Jedno zapytanie do widoku `v_offer_stats` przy wejściu i przy zmianie okresu.
 *  2. Fakty siedzą w stanie jako OfferFact[].
 *  3. Filtry rodzaju / handlowca / modułów przeliczają się przez useMemo,
 *     BEZ odpytywania bazy — filtrowanie jest natychmiastowe.
 */

import { useState, useEffect, useMemo } from 'react';
import StatsFilterBar from './StatsFilterBar';
import StatsOverviewTab from './StatsOverviewTab';
import StatsRepsTab from './StatsRepsTab';
import { fetchOfferFacts } from './lib/statsQueries';
import {
  applyFilters, inDateRange, computeFollowUps, buildPeriod, previousPeriod,
  fmtInt, fmtCompact,
} from './lib/statsAggregate';
import { STATS_MODULES, NO_REP } from './lib/statsTypes';
import type { OfferFact, StatsFilters } from './lib/statsTypes';

export type StatsTab = 'overview' | 'reps' | 'followup';

/** Próg „oferta wisi za długo" używany do licznika w nagłówku zakładki. */
export const FOLLOWUP_DEFAULT_DAYS = 30;

interface Props {
  activeTab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  onFollowUpCountChange: (count: number) => void;
}

export default function StatsSection({ activeTab, onTabChange, onFollowUpCountChange }: Props) {
  const [facts, setFacts]     = useState<OfferFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [filters, setFilters] = useState<StatsFilters>(() => {
    const { from, to } = buildPeriod('this_year');
    return { from, to, preset: 'this_year', kind: 'all', rep: 'all', modules: [...STATS_MODULES] };
  });

  /** Poprzedni okres o tej samej długości — potrzebny do wskaźników zmiany. */
  const prevRange = useMemo(
    () => previousPeriod(filters.from, filters.to),
    [filters.from, filters.to],
  );

  // Nowe zapytanie tylko przy zmianie okresu — pozostałe filtry działają lokalnie.
  // Pobieramy POSZERZONY zakres (poprzedni okres + bieżący) jednym zapytaniem,
  // a rozdzielamy je już po stronie klienta.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchOfferFacts(prevRange.from, filters.to);
        if (!cancelled) setFacts(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Nie udało się pobrać danych statystyk.');
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [prevRange.from, filters.to]);

  // UWAGA: `facts` zawiera także poprzedni okres — każda metryka bieżąca MUSI
  // wychodzić od `filtered`, nigdy od `facts`.
  const filtered = useMemo(
    () => applyFilters(inDateRange(facts, filters.from, filters.to), filters),
    [facts, filters],
  );

  const filteredPrev = useMemo(
    () => applyFilters(inDateRange(facts, prevRange.from, prevRange.to), filters),
    [facts, prevRange, filters],
  );

  const reps = useMemo(
    () => Array.from(new Set(facts.map(f => f.prepared_by ?? NO_REP))).sort((a, b) => a.localeCompare(b, 'pl')),
    [facts],
  );

  const followUps = useMemo(
    () => computeFollowUps(filtered, FOLLOWUP_DEFAULT_DAYS),
    [filtered],
  );

  useEffect(() => { onFollowUpCountChange(followUps.length); }, [followUps.length, onFollowUpCountChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto mb-4" />
          <p className="text-gray-500">Liczenie statystyk...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <StatsFilterBar filters={filters} onChange={setFilters} reps={reps} />

      {filters.modules.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <p className="text-amber-800 font-medium">Nie wybrano żadnego modułu</p>
          <p className="text-sm text-amber-700 mt-1">Zaznacz przynajmniej jeden moduł, żeby zobaczyć statystyki.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-700 font-medium">Brak ofert w wybranym zakresie</p>
          <p className="text-sm text-gray-500 mt-1">Zmień okres lub poszerz filtry.</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <StatsOverviewTab facts={filtered} previousFacts={filteredPrev} onTabChange={onTabChange} />
          )}
          {activeTab === 'reps'     && <StatsRepsTab facts={filtered} />}
          {activeTab === 'followup' && <TabPlaceholder name="Do domknięcia" facts={followUps} />}
        </>
      )}
    </div>
  );
}

/** Tymczasowa zawartość zakładek — wypełniana w kolejnych taskach planu. */
function TabPlaceholder({ name, facts }: { name: string; facts: OfferFact[] }) {
  const value = facts.reduce((s, f) => s + (Number(f.value_pln) || 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">{name}</h2>
      <p className="text-sm text-gray-500 mb-6">Zakładka w budowie — dane są już podłączone.</p>
      <div className="flex flex-wrap gap-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ofert w filtrze</p>
          <p className="text-3xl font-semibold text-gray-900">{fmtInt(facts.length)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Wartość</p>
          <p className="text-3xl font-semibold text-gray-900">{fmtCompact(value)} <span className="text-base font-normal text-gray-500">PLN</span></p>
        </div>
      </div>
    </div>
  );
}
