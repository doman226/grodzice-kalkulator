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
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_LABELS.map(p => (
              <button key={p.id} type="button" onClick={() => setPreset(p.id)}
                      className={chip(filters.preset === p.id)}>
                {p.label}
              </button>
            ))}
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
