/**
 * StatsFilterBar.tsx — filtry globalne modułu statystyk.
 *
 * Zmiana okresu wymaga nowego zapytania do bazy (inny zakres dat).
 * Zmiana rodzaju / handlowca / modułów działa WYŁĄCZNIE na już pobranych
 * danych — bez odpytywania Supabase, więc jest natychmiastowa.
 */

import type { StatsFilters, StatsModule, StatsKind, PeriodPreset } from './lib/statsTypes';
import { STATS_MODULES, MODULE_LABELS } from './lib/statsTypes';
import { buildPeriod } from './lib/statsAggregate';

const PERIOD_LABELS: { id: PeriodPreset; label: string }[] = [
  { id: 'this_month',   label: 'Ten miesiąc' },
  { id: 'this_quarter', label: 'Ten kwartał' },
  { id: 'this_year',    label: 'Ten rok' },
  { id: 'last_12m',     label: 'Ostatnie 12 mies.' },
  { id: 'all',          label: 'Wszystko' },
];

const KIND_LABELS: { id: StatsKind | 'all'; label: string }[] = [
  { id: 'all',    label: 'Wszystko' },
  { id: 'rental', label: 'Wynajem' },
  { id: 'sale',   label: 'Sprzedaż' },
];

interface Props {
  filters: StatsFilters;
  onChange: (filters: StatsFilters) => void;
  /** Handlowcy obecni w danych — lista budowana z faktów, nie ze stałej. */
  reps: string[];
}

export default function StatsFilterBar({ filters, onChange, reps }: Props) {
  function setPreset(preset: PeriodPreset) {
    const { from, to } = buildPeriod(preset);
    onChange({ ...filters, preset, from, to });
  }

  /** Ręczna data — przełącza preset na „custom" i domyka dzień do pełnego zakresu. */
  function setCustomBound(which: 'from' | 'to', value: string) {
    if (!value) return;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return;
    if (which === 'from') d.setHours(0, 0, 0, 0);
    else d.setHours(23, 59, 59, 999);
    onChange({ ...filters, preset: 'custom', [which]: d.toISOString() });
  }

  /** ISO → YYYY-MM-DD dla <input type="date">. */
  const dateValue = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function toggleModule(m: StatsModule) {
    const next = filters.modules.includes(m)
      ? filters.modules.filter(x => x !== m)
      : [...filters.modules, m];
    onChange({ ...filters, modules: next });
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 text-xs rounded-md border transition-colors ${
      active
        ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold'
        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
    }`;

  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 space-y-4">
      <div className="flex flex-wrap gap-6">
        {/* Okres */}
        <div>
          <span className={label}>Okres</span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {PERIOD_LABELS.map(p => (
              <button key={p.id} type="button" onClick={() => setPreset(p.id)}
                      className={chip(filters.preset === p.id)}>
                {p.label}
              </button>
            ))}
            <span className={`flex items-center gap-1 pl-2 ml-1 border-l border-gray-200 ${
              filters.preset === 'custom' ? 'text-blue-800' : 'text-gray-500'}`}>
              <input type="date" aria-label="Data od"
                     value={dateValue(filters.from)}
                     onChange={e => setCustomBound('from', e.target.value)}
                     className={`border rounded-md px-2 py-1 text-xs ${
                       filters.preset === 'custom' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`} />
              <span className="text-xs text-gray-400">–</span>
              <input type="date" aria-label="Data do"
                     value={dateValue(filters.to)}
                     onChange={e => setCustomBound('to', e.target.value)}
                     className={`border rounded-md px-2 py-1 text-xs ${
                       filters.preset === 'custom' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`} />
            </span>
          </div>
        </div>

        {/* Wynajem / sprzedaż */}
        <div>
          <span className={label}>Zakres</span>
          <div className="flex flex-wrap gap-1.5">
            {KIND_LABELS.map(k => (
              <button key={k.id} type="button"
                      onClick={() => onChange({ ...filters, kind: k.id })}
                      className={chip(filters.kind === k.id)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* Handlowiec */}
        <div>
          <span className={label}>Handlowiec</span>
          <select
            value={filters.rep}
            onChange={e => onChange({ ...filters, rep: e.target.value })}
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white min-w-[170px]"
          >
            <option value="all">Wszyscy</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Moduły */}
      <div>
        <div className="flex items-baseline gap-3 mb-1.5">
          <span className={`${label} mb-0`}>Moduł</span>
          <button
            type="button"
            onClick={() => onChange({
              ...filters,
              modules: filters.modules.length === STATS_MODULES.length ? [] : [...STATS_MODULES],
            })}
            className="text-[11px] text-blue-600 hover:underline"
          >
            {filters.modules.length === STATS_MODULES.length ? 'odznacz wszystkie' : 'zaznacz wszystkie'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATS_MODULES.map(m => (
            <button key={m} type="button" onClick={() => toggleModule(m)}
                    title={MODULE_LABELS[m]}
                    className={chip(filters.modules.includes(m))}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
