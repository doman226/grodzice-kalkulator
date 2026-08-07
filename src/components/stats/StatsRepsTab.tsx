/**
 * StatsRepsTab.tsx — zakładka Handlowcy.
 *
 * Tabela rankingowa (sortowalna po każdej kolumnie) plus trzy wizualizacje:
 * struktura wartości wg rozstrzygnięcia, macierz produktowa i zestawienie
 * obrotu z marżą.
 */

import { useMemo, useState } from 'react';
import RepStackedBars from './charts/RepStackedBars';
import RepProductMatrix from './charts/RepProductMatrix';
import MarginScatter from './charts/MarginScatter';
import { computeByRep, computeRepModuleMatrix, fmtInt, fmtPct, fmtTons } from './lib/statsAggregate';
import type { RepRow } from './lib/statsAggregate';
import type { OfferFact } from './lib/statsTypes';

type SortKey = 'rep' | 'count' | 'valuePln' | 'sharePct' | 'accepted' | 'rejected'
             | 'winRate' | 'massT' | 'avgMargin' | 'avgOffer';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'rep',       label: 'Handlowiec',  numeric: false },
  { key: 'count',     label: 'Ofert',       numeric: true },
  { key: 'valuePln',  label: 'Wartość PLN', numeric: true },
  { key: 'sharePct',  label: 'Udział',      numeric: true },
  { key: 'accepted',  label: 'Przyjęte',    numeric: true },
  { key: 'rejected',  label: 'Odrzucone',   numeric: true },
  { key: 'winRate',   label: 'Skuteczność', numeric: true },
  { key: 'massT',     label: 'Tonaż',       numeric: true },
  { key: 'avgMargin', label: 'Śr. marża',   numeric: true },
  { key: 'avgOffer',  label: 'Śr. oferta',  numeric: true },
];

/** Wartości null lądują zawsze na końcu, niezależnie od kierunku sortowania. */
function compare(a: RepRow, b: RepRow, key: SortKey, dir: 1 | -1): number {
  if (key === 'rep') return a.rep.localeCompare(b.rep, 'pl') * dir;
  const av = a[key] as number | null;
  const bv = b[key] as number | null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av - bv) * dir;
}

interface Props {
  facts: OfferFact[];
}

export default function StatsRepsTab({ facts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('valuePln');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo(() => computeByRep(facts), [facts]);
  const matrix = useMemo(() => computeRepModuleMatrix(facts), [facts]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(key === 'rep' ? 1 : -1); }
  }

  /** Skuteczność jako badge — zielony gdy dobra, czerwony gdy słaba, szary gdy nieznana. */
  function winRateBadge(v: number | null) {
    if (v === null) return <span className="text-gray-400">—</span>;
    const cls = v >= 60 ? 'bg-green-100 text-green-800'
              : v < 50  ? 'bg-red-100 text-red-800'
              :           'bg-amber-100 text-amber-800';
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{fmtPct(v)}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800">Ranking handlowców</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">Kliknij nagłówek, aby posortować</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`text-[11px] uppercase tracking-wide font-semibold text-gray-400 pb-2 border-b border-gray-200 cursor-pointer select-none hover:text-gray-600 whitespace-nowrap ${
                        c.numeric ? 'text-right pl-3' : 'text-left pr-3'
                      }`}>
                    {c.label}
                    {sortKey === c.key && <span className="ml-1">{sortDir === 1 ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.rep} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-gray-800 whitespace-nowrap">{r.rep}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{fmtInt(r.count)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{fmtInt(r.valuePln)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-gray-600">{fmtPct(r.sharePct)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-green-700">{fmtInt(r.accepted)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-red-700">{fmtInt(r.rejected)}</td>
                  <td className="py-2.5 pl-3 text-right">{winRateBadge(r.winRate)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-gray-600">{fmtTons(r.massT)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{fmtPct(r.avgMargin)}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-gray-600">{fmtInt(r.avgOffer)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400 mt-3">
          Skuteczność liczona z ofert rozstrzygniętych (przyjęte + odrzucone).
          Oferty wysłane i szkice nie wchodzą do mianownika.
        </p>
      </div>

      <RepStackedBars rows={rows} />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))' }}>
        <RepProductMatrix matrix={matrix} />
        <MarginScatter rows={rows} />
      </div>
    </div>
  );
}
