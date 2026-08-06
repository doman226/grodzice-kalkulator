/**
 * MarginScatter.tsx — obrót zestawiony ze średnią marżą, punkt = handlowiec.
 *
 * Sens tego wykresu: ranking po samym obrocie premiuje tego, kto najwięcej
 * upuszcza z ceny. Zestawienie obrotu z marżą rozdziela dwie różne rzeczy —
 * „robi duży wolumen" i „robi duże pieniądze". Handlowiec wysoko na osi X, ale
 * nisko na Y, kupuje obrót rabatem.
 *
 * Wykonalne tylko dlatego, że baza trzyma `margin_pct` per oferta.
 * Handlowcy bez ofert sprzedaży (sam wynajem) nie mają marży — są wypisani pod
 * wykresem zamiast być rysowani na zerze, co byłoby nieprawdą.
 */

import type { RepRow } from '../lib/statsAggregate';
import { fmtCompact, fmtPct, niceMax, axisLabel } from '../lib/statsAggregate';

const W = 480, H = 250;
const PAD_L = 48, PAD_R = 26, PAD_T = 20, PAD_B = 42;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

interface Props {
  rows: RepRow[];
}

export default function MarginScatter({ rows }: Props) {
  const withMargin = rows.filter(r => r.avgMargin !== null && r.valuePln > 0);
  const withoutMargin = rows.filter(r => r.avgMargin === null && r.count > 0);

  if (withMargin.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800">Obrót a marża</h3>
        <p className="text-xs text-gray-400 mt-4">
          Brak ofert sprzedaży w filtrze — marża dotyczy tylko sprzedaży.
        </p>
      </div>
    );
  }

  const maxValue  = niceMax(Math.max(...withMargin.map(r => r.valuePln)));
  const maxMargin = niceMax(Math.max(...withMargin.map(r => r.avgMargin as number)));

  const xOf = (v: number) => PAD_L + (v / maxValue) * PLOT_W;
  const yOf = (m: number) => PAD_T + PLOT_H - (m / maxMargin) * PLOT_H;

  const xTicks = [0, 0.5, 1].map(f => f * maxValue);
  const yTicks = [0, 0.5, 1].map(f => f * maxMargin);

  /** Średnia ważona marża — linia odniesienia „tak wypada firma". */
  const totalValue = withMargin.reduce((s, r) => s + r.valuePln, 0);
  const weighted = withMargin.reduce((s, r) => s + (r.avgMargin as number) * r.valuePln, 0) / totalValue;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Obrót a marża</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">
        Duży słupek nie zawsze znaczy duże pieniądze
      </p>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 360, display: 'block' }}
             role="img"
             aria-label={`Wykres punktowy obrotu i marży: ${
               withMargin.map(r => `${r.rep} — obrót ${fmtCompact(r.valuePln)} PLN, marża ${fmtPct(r.avgMargin)}`).join('; ')}`}>
          {yTicks.map((t, i) => (
            <g key={`y${t}`}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)}
                    stroke={i === 0 ? '#d1d5db' : '#f3f4f6'} />
              <text x={PAD_L - 8} y={yOf(t) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">
                {fmtPct(t, 0)}
              </text>
            </g>
          ))}
          {xTicks.map(t => (
            <text key={`x${t}`} x={xOf(t)} y={H - 22} textAnchor="middle" fontSize={11} fill="#9ca3af">
              {axisLabel(t)}
            </text>
          ))}
          <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="#d1d5db" />

          {/* Średnia ważona firmy — punkt odniesienia dla oceny handlowca */}
          <line x1={PAD_L} x2={W - PAD_R} y1={yOf(weighted)} y2={yOf(weighted)}
                stroke="#9ca3af" strokeDasharray="4 4" />
          <text x={W - PAD_R} y={yOf(weighted) - 5} textAnchor="end" fontSize={10} fill="#6b7280">
            średnia firmy {fmtPct(weighted)}
          </text>

          {withMargin.map(r => {
            const cx = xOf(r.valuePln);
            const cy = yOf(r.avgMargin as number);
            const below = (r.avgMargin as number) < weighted;
            return (
              <g key={r.rep}>
                <title>
                  {`${r.rep} — obrót ${fmtCompact(r.valuePln)} PLN, marża ${fmtPct(r.avgMargin)}, skuteczność ${fmtPct(r.winRate)}`}
                </title>
                <circle cx={cx} cy={cy} r={8} fill={below ? '#dc2626' : '#1d4ed8'} />
                <text x={cx} y={cy - 14} textAnchor="middle" fontSize={11}
                      fill={below ? '#991b1b' : '#1e3a8a'}>
                  {r.rep.split(' ')[0]}
                </text>
              </g>
            );
          })}

          <text x={PAD_L + PLOT_W / 2} y={H - 5} textAnchor="middle" fontSize={10} fill="#9ca3af">
            obrót (PLN) →
          </text>
        </svg>
      </div>

      {withoutMargin.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-2">
          Bez marży (brak ofert sprzedaży): {withoutMargin.map(r => r.rep).join(', ')}
        </p>
      )}
    </div>
  );
}
