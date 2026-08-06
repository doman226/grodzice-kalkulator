/**
 * RepProductMatrix.tsx — macierz handlowiec × moduł, „kto w czym siedzi".
 *
 * Intensywność tła jest proporcjonalna do liczby ofert względem maksimum w
 * całej macierzy, więc jeden rzut oka pokazuje specjalizacje: czy ktoś jest
 * monokulturą (wszystko w jednym module), czy sprzedaje szeroko.
 *
 * Czysty Tailwind — siatka kilkunastu komórek nie potrzebuje SVG.
 */

import type { RepModuleMatrix } from '../lib/statsAggregate';
import { MODULE_LABELS } from '../lib/statsTypes';

interface Props {
  matrix: RepModuleMatrix;
}

/** Tło komórki: im większy udział względem maksimum, tym mocniejszy błękit. */
function cellStyle(count: number, max: number): { background: string; color: string } {
  if (count === 0) return { background: '#f9fafb', color: '#d1d5db' };
  const ratio = max === 0 ? 0 : count / max;
  if (ratio > 0.75) return { background: '#3b82f6', color: '#ffffff' };
  if (ratio > 0.45) return { background: '#93c5fd', color: '#1e3a8a' };
  if (ratio > 0.20) return { background: '#c7ddf9', color: '#1e3a8a' };
  if (ratio > 0.05) return { background: '#e0edfd', color: '#1e40af' };
  return { background: '#f3f4f6', color: '#6b7280' };
}

export default function RepProductMatrix({ matrix }: Props) {
  const { reps, modules, counts, max } = matrix;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Kto w czym siedzi</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">Liczba ofert · handlowiec × moduł</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th />
              {modules.map(m => (
                <th key={m} title={MODULE_LABELS[m]}
                    className="text-[11px] font-semibold text-gray-500 pb-1 px-1">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.map(rep => (
              <tr key={rep}>
                <td className="text-xs text-gray-700 pr-2 whitespace-nowrap">
                  {rep.split(' ')[0]}
                </td>
                {modules.map(m => {
                  const n = counts[rep]?.[m] ?? 0;
                  const style = cellStyle(n, max);
                  return (
                    <td key={m} className="p-0">
                      <div className="rounded-md text-center text-xs font-semibold py-1.5 px-2"
                           style={style} title={`${rep} · ${MODULE_LABELS[m]}: ${n} ofert`}>
                        {n}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
