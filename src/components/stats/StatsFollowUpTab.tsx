/**
 * StatsFollowUpTab.tsx — zakładka Do domknięcia.
 *
 * JEDYNE miejsce w module statystyk, które zapisuje do bazy.
 *
 * Zmiana statusu idzie `UPDATE`-em w macierzystą tabelę oferty — ten sam wiersz,
 * który czyta lista ofert w module sprzedaży/wynajmu. Jedno źródło prawdy, bez
 * kopii i synchronizacji: oferta oznaczona tutaj jako przyjęta jest przyjęta
 * także w module sprzedaży, natychmiast.
 *
 * To NIE jest nowa ścieżka zapisu — identyczny `UPDATE` wykonują dziś rozwijane
 * listy statusu w każdej z sześciu list ofert (OffersTable:88, SaleOffersTable:101
 * itd.). Zakładka zbiera je tylko w jedną posortowaną kolejkę.
 */

import { useMemo, useState } from 'react';
import { computeFollowUps, daysAgo, fmtInt, fmtPln } from './lib/statsAggregate';
import { setOfferStatus, snoozeOffer } from './lib/statsQueries';
import type { OfferFact } from './lib/statsTypes';
import type { OfferStatus } from '../../types';

const THRESHOLDS = [30, 60, 90] as const;
const SNOOZE_DAYS = 30;

interface Props {
  facts: OfferFact[];
  /** Aktywny filtr handlowca — trafia do `decided_by` jako ślad, kto domknął. */
  activeRep: string | 'all';
  /**
   * Próg wieku trzymany w kontenerze, nie lokalnie — dzięki temu karta
   * „Jak długo czekają oferty" w Przeglądzie może go ustawić przy przejściu.
   */
  threshold: number;
  onThresholdChange: (days: number) => void;
  /** Aktualizuje fakt w stanie rodzica, żeby KPI przeliczyły się bez refetchu. */
  onFactUpdate: (id: string, patch: Partial<OfferFact>) => void;
}

export default function StatsFollowUpTab({
  facts, activeRep, threshold, onThresholdChange, onFactUpdate,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const rows = useMemo(() => computeFollowUps(facts, threshold), [facts, threshold]);
  const decidedBy = activeRep === 'all' ? null : activeRep;

  const totalValue = rows.reduce((s, r) => s + (Number(r.value_pln) || 0), 0);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev => (prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id))));
  }

  const markBusy = (id: string, on: boolean) =>
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  async function decide(fact: OfferFact, status: OfferStatus) {
    setError(''); setInfo('');
    markBusy(fact.id, true);
    try {
      const { followupWarning } = await setOfferStatus(fact.module_code, fact.id, status, decidedBy);
      onFactUpdate(fact.id, { status });
      setSelected(prev => { const n = new Set(prev); n.delete(fact.id); return n; });
      // Status zapisany — ewentualny problem dotyczy tylko wpisu pomocniczego.
      if (followupWarning) setInfo(`${fact.offer_number}: ${followupWarning}`);
    } catch (err) {
      setError(`Nie udało się zmienić statusu oferty ${fact.offer_number}. ${
        err instanceof Error ? err.message : ''}`);
      console.error(err);
    } finally {
      markBusy(fact.id, false);
    }
  }

  async function snooze(fact: OfferFact) {
    setError(''); setInfo('');
    markBusy(fact.id, true);
    try {
      await snoozeOffer(fact.module_code, fact.id, SNOOZE_DAYS);
      const until = new Date();
      until.setDate(until.getDate() + SNOOZE_DAYS);
      onFactUpdate(fact.id, { snoozed_until: until.toISOString() });
    } catch (err) {
      setError(`Nie udało się odłożyć oferty ${fact.offer_number}.`);
      console.error(err);
    } finally {
      markBusy(fact.id, false);
    }
  }

  /** Akcja masowa — wykonywana sekwencyjnie, z podsumowaniem sukcesów i błędów. */
  async function decideSelected(status: OfferStatus) {
    const targets = rows.filter(r => selected.has(r.id));
    if (targets.length === 0) return;
    if (!window.confirm(
      `Oznaczyć ${targets.length} ofert jako „${status}"?\n\n` +
      'Zmiana będzie widoczna od razu także w module sprzedaży i wynajmu.'
    )) return;

    setError(''); setInfo('');
    let ok = 0;
    let warnings = 0;
    const failed: string[] = [];
    for (const fact of targets) {
      markBusy(fact.id, true);
      try {
        const { followupWarning } = await setOfferStatus(fact.module_code, fact.id, status, decidedBy);
        onFactUpdate(fact.id, { status });
        ok += 1;
        if (followupWarning) warnings += 1;
      } catch (err) {
        failed.push(fact.offer_number);
        console.error(err);
      } finally {
        markBusy(fact.id, false);
      }
    }
    setSelected(new Set());
    setInfo(
      `Zmieniono ${ok} z ${targets.length} ofert.` +
      (warnings > 0 ? ` W ${warnings} przypadkach nie zapisano informacji o autorze decyzji.` : '')
    );
    if (failed.length) setError(`Nie udało się zmienić statusu: ${failed.join(', ')}.`);
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 text-xs rounded-md border transition-colors ${
      active ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold'
             : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-900">
          <b>{fmtInt(rows.length)} ofert czeka dłużej niż {threshold} dni</b>
          {rows.length > 0 && <> — łącznie {fmtPln(totalValue)}.</>}
          {' '}Każda domknięta oferta natychmiast poprawia statystyki — moduł liczy na żywo.
        </p>
        <p className="text-xs text-amber-800 mt-1.5">
          Lista pomija oferty młodsze niż {threshold} dni oraz odłożone przyciskiem „W grze".
          Kafel „Skuteczność" w Przeglądzie pokazuje szerszą liczbę — wszystkie oferty bez decyzji,
          niezależnie od wieku.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-6 items-end">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Starsze niż
          </span>
          <div className="flex gap-1.5">
            {THRESHOLDS.map(t => (
              <button key={t} type="button"
                      onClick={() => { onThresholdChange(t); setSelected(new Set()); }}
                      className={chip(threshold === t)}>
                {t} dni
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Zaznaczone ({selected.size})
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={selected.size === 0}
                    onClick={() => decideSelected('przyjęta')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-green-300 bg-green-50 text-green-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-100">
              Oznacz przyjęte
            </button>
            <button type="button" disabled={selected.size === 0}
                    onClick={() => decideSelected('odrzucona')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-300 bg-red-50 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-100">
              Oznacz odrzucone
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {info && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800">{info}</div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <p className="text-gray-700 font-medium">Nic nie czeka na decyzję</p>
          <p className="text-sm text-gray-500 mt-1">
            Brak ofert utworzonych ponad {threshold} dni temu, które nadal czekają na decyzję.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2 border-b border-gray-200 w-8">
                    <input type="checkbox" aria-label="Zaznacz wszystkie"
                           checked={selected.size === rows.length && rows.length > 0}
                           onChange={toggleAll} />
                  </th>
                  <th className="text-left font-semibold pb-2 px-2 border-b border-gray-200">Oferta</th>
                  <th className="text-left font-semibold pb-2 px-2 border-b border-gray-200">Klient</th>
                  <th className="text-left font-semibold pb-2 px-2 border-b border-gray-200">Handlowiec</th>
                  <th className="text-right font-semibold pb-2 px-2 border-b border-gray-200">Wartość</th>
                  <th className="text-right font-semibold pb-2 px-2 border-b border-gray-200"
                      title="Wiek liczony od utworzenia oferty — baza nie zapisuje daty wysłania">
                    Wiek oferty
                  </th>
                  <th className="text-left font-semibold pb-2 pl-2 border-b border-gray-200">Decyzja</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const days = daysAgo(r.created_at);
                  const isBusy = busy.has(r.id);
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${isBusy ? 'opacity-40' : ''}`}>
                      <td className="py-2.5">
                        <input type="checkbox" aria-label={`Zaznacz ${r.offer_number}`}
                               checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-gray-800 whitespace-nowrap">
                        {r.offer_number}
                      </td>
                      <td className="py-2.5 px-2 text-gray-700 max-w-[220px] truncate" title={r.client_name ?? ''}>
                        {r.client_name ?? '—'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-600 whitespace-nowrap">{r.prepared_by ?? '—'}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                        {fmtInt(Number(r.value_pln) || 0)}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          days > 90 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {days} dni
                        </span>
                      </td>
                      <td className="py-2.5 pl-2">
                        <div className="flex gap-1.5 flex-wrap">
                          <button type="button" disabled={isBusy} onClick={() => decide(r, 'przyjęta')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40">
                            Przyjęta
                          </button>
                          <button type="button" disabled={isBusy} onClick={() => decide(r, 'odrzucona')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40">
                            Odrzucona
                          </button>
                          <button type="button" disabled={isBusy} onClick={() => snooze(r)}
                                  title={`Ukryj na ${SNOOZE_DAYS} dni`}
                                  className="px-2.5 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                            W grze
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-400 mt-3">
            „W grze" odkłada ofertę o {SNOOZE_DAYS} dni, żeby nie wracała codziennie.
            Zmiana statusu jest natychmiast widoczna w module sprzedaży i wynajmu.
            Wiek liczony od <b>utworzenia</b> oferty — baza nie zapisuje daty wysłania do klienta.
            {threshold !== 30 && (
              <> Licznik przy nazwie zakładki zawsze pokazuje zaległości powyżej <b>30 dni</b>,
              niezależnie od wybranego tu progu — dlatego może różnić się od liczby wierszy.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
