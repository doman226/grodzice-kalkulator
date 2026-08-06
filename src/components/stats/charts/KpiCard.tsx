/**
 * KpiCard.tsx — pojedynczy kafelek metryki.
 *
 * `change` to zmiana procentowa względem poprzedniego okresu o tej samej
 * długości; `null` oznacza „nie da się policzyć" (brak danych porównawczych,
 * np. przy okresie „Wszystko") i wtedy wskaźnik po prostu się nie pokazuje.
 */

interface Props {
  label: string;
  value: string;
  /** Jednostka dopisana mniejszą czcionką obok wartości. */
  unit?: string;
  hint?: React.ReactNode;
  change?: number | null;
  /** Wyróżnienie kafelka wymagającego uwagi. */
  tone?: 'default' | 'warning';
}

export default function KpiCard({ label, value, unit, hint, change, tone = 'default' }: Props) {
  const showChange = change !== null && change !== undefined && isFinite(change);
  const up = showChange && (change as number) >= 0;

  return (
    <div className={`rounded-lg border p-4 ${
      tone === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
    }`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
        {label}
      </p>
      <p className="text-2xl font-semibold text-gray-900 leading-tight">
        {value}
        {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
      </p>
      {(hint || showChange) && (
        <p className="text-xs text-gray-500 mt-1.5">
          {showChange && (
            <span className={`font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
              {up ? '↑' : '↓'} {Math.abs(change as number).toFixed(0)}%
            </span>
          )}
          {showChange && hint && <span className="mx-1">·</span>}
          {hint}
        </p>
      )}
    </div>
  );
}
