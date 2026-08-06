/**
 * ModuleBars.tsx — udział modułów w wartości + tabela zbiorcza.
 *
 * Paski rysowane czystym Tailwindem, nie Rechartsem: siedem pozycji o skrajnie
 * różnych rzędach wielkości (151 mln obok 34 tys.) czyta się lepiej jako lista
 * z etykietami niż jako wykres, na którym cztery ostatnie słupki i tak byłyby
 * niewidoczne.
 *
 * Wynajem i sprzedaż pozostają rozdzielone — wiersz „Razem" świadomie nie
 * istnieje, bo sumowanie przychodu ze sprzedaży z opłatą za okres wynajmu nie
 * ma sensu ekonomicznego (patrz spec).
 */

import type { ModuleRow } from '../lib/statsAggregate';
import { fmtInt, fmtCompact, fmtPct, fmtTons } from '../lib/statsAggregate';
import { MODULE_LABELS, MODULE_KIND } from '../lib/statsTypes';

interface Props {
  rows: ModuleRow[];
}

export default function ModuleBars({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.valuePln, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.valuePln), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Udział modułów w wartości</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Wynajem i sprzedaż nigdy nie sumowane w jedną kwotę
      </p>

      <div className="space-y-2 mb-6">
        {rows.map(r => (
          <div key={r.module} className="grid items-center gap-3"
               style={{ gridTemplateColumns: '46px 1fr 84px 46px' }}>
            <span className="text-xs font-semibold text-gray-700">{r.module}</span>
            <div className="h-5 bg-gray-100 rounded-sm overflow-hidden">
              <div
                className={`h-full ${MODULE_KIND[r.module] === 'sale' ? 'bg-blue-600' : 'bg-teal-600'}`}
                style={{ width: max === 0 ? '0%' : `${Math.max((r.valuePln / max) * 100, 1)}%` }}
              />
            </div>
            <span className="text-xs text-gray-700 text-right tabular-nums">
              {fmtCompact(r.valuePln)}
            </span>
            <span className="text-[11px] text-gray-400 text-right tabular-nums">
              {total === 0 ? '' : `${Math.round((r.valuePln / total) * 100)}%`}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-[11px] text-gray-500 mb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />Sprzedaż
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />Wynajem
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400">
              <th className="text-left font-semibold pb-2 pr-3 border-b border-gray-200">Moduł</th>
              <th className="text-right font-semibold pb-2 px-3 border-b border-gray-200">Ofert</th>
              <th className="text-right font-semibold pb-2 px-3 border-b border-gray-200">Wartość</th>
              <th className="text-right font-semibold pb-2 px-3 border-b border-gray-200">Tonaż</th>
              <th className="text-right font-semibold pb-2 px-3 border-b border-gray-200">Przyjęte</th>
              <th className="text-right font-semibold pb-2 px-3 border-b border-gray-200">Skuteczność</th>
              <th className="text-right font-semibold pb-2 pl-3 border-b border-gray-200">Śr. oferta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.module} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <span className="font-semibold text-gray-800">{r.module}</span>
                  <span className="text-gray-500 text-xs ml-2">{MODULE_LABELS[r.module]}</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtInt(r.count)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtInt(r.valuePln)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmtTons(r.massT)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtInt(r.accepted)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtPct(r.winRate)}</td>
                <td className="py-2 pl-3 text-right tabular-nums text-gray-600">{fmtInt(r.avgOffer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
