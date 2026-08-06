/**
 * TrendChart.tsx — wartość ofert miesiąc po miesiącu. Czysty SVG, bez bibliotek.
 *
 * JEDNA OŚ Y, celowo. Pierwotny szkic zakładał wykres kombinowany: słupki =
 * liczba ofert, linia = wartość, każde na własnej osi. Odrzucone — przy dwóch
 * skalach wzajemne położenie słupka i linii nie znaczy nic, a wygląda jakby
 * znaczyło. Liczba ofert jest więc podpisana nad słupkiem: oba fakty widoczne,
 * zero ryzyka błędnego odczytu.
 *
 * Oś czasu opiera się na `created_at` (data wystawienia) — patrz spec.
 */

import type { MonthPoint } from '../lib/statsAggregate';
import { fmtInt, fmtPln } from '../lib/statsAggregate';

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

const W = 660, H = 240;
const PAD_L = 54, PAD_R = 14, PAD_T = 26, PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function monthLabel(iso: string): string {
  const [year, month] = iso.split('-');
  return `${MONTHS_PL[Number(month) - 1]} ${year.slice(2)}`;
}

function isCurrentMonth(iso: string): boolean {
  const now = new Date();
  return iso === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Zaokrągla górę skali do 1/2/5 × 10^n, żeby podziałka miała okrągłe wartości. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * base;
}

/** Formatuje wartość osi: 80 mln / 800 tys. / 250 */
function axisLabel(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} mln`;
  if (Math.abs(v) >= 1_000) return `${+(v / 1_000).toFixed(0)} tys.`;
  return String(Math.round(v));
}

interface Props {
  data: MonthPoint[];
}

export default function TrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800">Wartość ofert w czasie</h3>
        <p className="text-xs text-gray-400 mt-4">Brak ofert w wybranym okresie.</p>
      </div>
    );
  }

  const max = niceMax(Math.max(...data.map(d => d.valuePln)));
  const slot = PLOT_W / data.length;
  const barW = Math.min(54, slot * 0.58);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const hasPartial = data.some(d => isCurrentMonth(d.month));

  const yOf = (v: number) => PAD_T + PLOT_H - (v / max) * PLOT_H;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Wartość ofert w czasie</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">
        Wysokość słupka to wartość ofert, liczba nad słupkiem to ich ilość. Data wystawienia.
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420, display: 'block' }}
             role="img"
             aria-label={`Wykres słupkowy wartości ofert w podziale na miesiące: ${
               data.map(d => `${monthLabel(d.month)} ${fmtPln(d.valuePln)}, ${d.count} ofert`).join('; ')}`}>
          {ticks.map((t, i) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)}
                    stroke={i === 0 ? '#d1d5db' : '#f3f4f6'} strokeWidth={1} />
              <text x={PAD_L - 8} y={yOf(t) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">
                {axisLabel(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const partial = isCurrentMonth(d.month);
            const cx = PAD_L + slot * i + slot / 2;
            const y = yOf(d.valuePln);
            const h = Math.max(PAD_T + PLOT_H - y, d.valuePln > 0 ? 2 : 0);
            return (
              <g key={d.month}>
                <title>{`${monthLabel(d.month)} — ${fmtPln(d.valuePln)} · ${fmtInt(d.count)} ofert`}</title>
                <rect x={cx - barW / 2} y={PAD_T + PLOT_H - h} width={barW} height={h}
                      rx={3} fill={partial ? '#93c5fd' : '#3b82f6'} />
                <text x={cx} y={PAD_T + PLOT_H - h - 7} textAnchor="middle"
                      fontSize={11} fill={partial ? '#9ca3af' : '#4b5563'}>
                  {d.count}
                </text>
                <text x={cx} y={H - 10} textAnchor="middle" fontSize={11}
                      fill={partial ? '#9ca3af' : '#6b7280'}>
                  {monthLabel(d.month)}{partial ? '*' : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hasPartial && (
        <p className="text-[11px] text-gray-400 mt-2 text-right">
          * bieżący, jeszcze niedomknięty miesiąc
        </p>
      )}
    </div>
  );
}
