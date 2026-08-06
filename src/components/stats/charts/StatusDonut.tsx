/**
 * StatusDonut.tsx — struktura statusów ofert. Czysty SVG, bez bibliotek.
 *
 * Pierścień rysowany jednym okręgiem na segment techniką `stroke-dasharray`:
 * każdy segment to ten sam okrąg z widoczną tylko swoją częścią obwodu,
 * przesuniętą o sumę poprzednich (`stroke-dashoffset`).
 *
 * W środku udział statusu dominującego. W praktyce jest nim „wysłana" i to
 * właśnie ta liczba jest najważniejszą informacją na całym wykresie: pokazuje,
 * jaka część ofert nigdy nie została rozstrzygnięta.
 */

import type { OfferStatus } from '../../../types';
import { STATUS_COLORS } from '../lib/statsTypes';
import { fmtInt } from '../lib/statsAggregate';

const SIZE = 140;
const R = 54;
const STROKE = 20;
const CIRC = 2 * Math.PI * R;

interface Props {
  data: { status: string; count: number }[];
  total: number;
}

export default function StatusDonut({ data, total }: Props) {
  if (data.length === 0 || total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800">Struktura statusów</h3>
        <p className="text-xs text-gray-400 mt-4">Brak ofert w wybranym okresie.</p>
      </div>
    );
  }

  const top = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  const topShare = Math.round((top.count / total) * 100);

  // Segmenty liczone narastająco — offset każdego to suma długości poprzednich.
  let acc = 0;
  const segments = data.map(d => {
    const len = (d.count / total) * CIRC;
    const seg = { ...d, len, offset: -acc, color: STATUS_COLORS[d.status as OfferStatus] ?? '#d1d5db' };
    acc += len;
    return seg;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Struktura statusów</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">{fmtInt(total)} ofert w filtrze</p>

      <div className="flex items-center gap-6 flex-wrap">
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img"
               aria-label={`Udział statusów: ${data.map(d => `${d.status} ${d.count}`).join(', ')}`}>
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} fill="none" strokeWidth={STROKE}>
              {segments.map(s => (
                <circle key={s.status} cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={s.color}
                        strokeDasharray={`${s.len} ${CIRC - s.len}`} strokeDashoffset={s.offset}>
                  <title>{`${s.status} — ${fmtInt(s.count)} ofert`}</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-semibold text-gray-900">{topShare}%</span>
            <span className="text-[10px] text-gray-400">{top.status}</span>
          </div>
        </div>

        <ul className="text-sm space-y-1.5">
          {data.map(d => (
            <li key={d.status} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                    style={{ background: STATUS_COLORS[d.status as OfferStatus] ?? '#d1d5db' }} />
              <span className="text-gray-600 capitalize">{d.status}</span>
              <span className="font-semibold text-gray-900">{fmtInt(d.count)}</span>
              <span className="text-gray-400 text-xs">{Math.round((d.count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
