/**
 * RepStackedBars.tsx — wartość ofert per handlowiec z podziałem na rozstrzygnięcie.
 *
 * Podział jest WARTOŚCIOWY, nie ilościowy: pasek pokazuje, jaka część wartości
 * ofert wystawionych przez handlowca została przyjęta, odrzucona lub wciąż
 * czeka na decyzję. Długość całego paska odpowiada wartości względem lidera,
 * więc widać naraz dwie rzeczy — skalę i strukturę.
 *
 * To wartość OFERT, nie obrót — moduł analizuje oferty, a nie faktury.
 */

import type { RepRow } from '../lib/statsAggregate';
import { fmtCompact, fmtPln } from '../lib/statsAggregate';

/**
 * Szkice celowo nie są segmentem — są poza metrykami handlowymi, więc suma
 * trzech poniższych części równa się dokładnie `valuePln` handlowca.
 */
const PARTS = [
  { key: 'wonPln',     label: 'Przyjęte',  color: '#16a34a' },
  { key: 'lostPln',    label: 'Odrzucone', color: '#dc2626' },
  { key: 'pendingPln', label: 'W toku',    color: '#f59e0b' },
] as const;

interface Props {
  rows: RepRow[];
}

export default function RepStackedBars({ rows }: Props) {
  const max = rows.reduce((m, r) => Math.max(m, r.valuePln), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Wartość ofert wg rozstrzygnięcia</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Udziały liczone wartościowo, nie ilościowo
      </p>

      <div className="flex gap-4 flex-wrap mb-4">
        {PARTS.map(p => (
          <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.rep} className="grid items-center gap-3"
               style={{ gridTemplateColumns: 'minmax(96px, 130px) 1fr 74px' }}>
            <span className="text-xs text-gray-700 truncate" title={r.rep}>{r.rep}</span>
            <div className="h-5 rounded-sm overflow-hidden bg-gray-100 flex"
                 style={{ width: max === 0 ? '0%' : `${Math.max((r.valuePln / max) * 100, 1)}%` }}>
              {PARTS.map(p => {
                const v = r[p.key];
                const pct = r.valuePln === 0 ? 0 : (v / r.valuePln) * 100;
                if (pct <= 0) return null;
                return (
                  <div key={p.key} style={{ width: `${pct}%`, background: p.color }}
                       title={`${p.label}: ${fmtPln(v)}`} />
                );
              })}
            </div>
            <span className="text-xs text-gray-700 text-right tabular-nums">
              {fmtCompact(r.valuePln)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
