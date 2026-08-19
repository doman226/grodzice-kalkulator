/**
 * PendingAgeBars.tsx — jak długo czekają oferty nierozstrzygnięte.
 *
 * Dopełnia donut statusów obok: on mówi, JAKA CZĘŚĆ ofert wisi, ten mówi
 * JAK DŁUGO. Jako jedyna karta na tym ekranie prowadzi do działania —
 * kliknięcie w przedział przenosi do zakładki Do domknięcia z ustawionym
 * progiem.
 *
 * Przedział „do 30 dni" nie jest klikalny: te oferty nie są jeszcze zaległe,
 * więc lista Do domknięcia (pokazująca starsze niż próg) i tak by ich nie
 * pokazała.
 */

import type { AgeBucket } from '../lib/statsAggregate';
import { fmtInt, fmtCompact } from '../lib/statsAggregate';

interface Props {
  buckets: AgeBucket[];
  /**
   * Oferty ukryte przyciskiem „W grze". NIE wchodzą do przedziałów poniżej,
   * więc bez tej liczby suma słupków nie zgadzałaby się z kaflem KPI
   * „bez decyzji" i wyglądałaby na błąd.
   */
  snoozed: number;
  /** Przeniesienie do zakładki Do domknięcia z podanym progiem dni. */
  onJump: (threshold: number) => void;
}

/** Im starszy przedział, tym mocniejszy sygnał — ostatni jest czerwony. */
const TONE = [
  { bar: 'bg-gray-300',   text: 'text-gray-500' },
  { bar: 'bg-amber-300',  text: 'text-amber-700' },
  { bar: 'bg-amber-500',  text: 'text-amber-800' },
  { bar: 'bg-red-500',    text: 'text-red-700' },
];

export default function PendingAgeBars({ buckets, snoozed, onJump }: Props) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const oldest = buckets[buckets.length - 1];

  if (total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800">Jak długo czekają oferty</h3>
        <p className="text-xs text-gray-400 mt-4">Brak ofert oczekujących na decyzję.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800">Jak długo czekają oferty</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        {fmtInt(total)} czeka na decyzję
        {snoozed > 0 && <> · {fmtInt(snoozed)} odłożonych przyciskiem „W grze"</>}
        {' '}· wiek liczony od utworzenia oferty
      </p>

      <div className="space-y-2.5">
        {buckets.map((b, i) => {
          const tone = TONE[i] ?? TONE[0];
          const width = max === 0 ? 0 : Math.max((b.count / max) * 100, b.count > 0 ? 2 : 0);
          const clickable = b.threshold !== null && b.count > 0;

          const row = (
            <div className="grid items-center gap-3 w-full"
                 style={{ gridTemplateColumns: '86px 1fr 46px 74px' }}>
              <span className={`text-xs ${tone.text} text-left`}>{b.label}</span>
              <div className="h-5 bg-gray-100 rounded-sm overflow-hidden">
                <div className={`h-full ${tone.bar}`} style={{ width: `${width}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-800 text-right tabular-nums">
                {fmtInt(b.count)}
              </span>
              <span className="text-[11px] text-gray-400 text-right tabular-nums">
                {b.valuePln > 0 ? fmtCompact(b.valuePln) : ''}
              </span>
            </div>
          );

          return clickable ? (
            <button
              key={b.label}
              type="button"
              onClick={() => onJump(b.threshold as number)}
              title={`Pokaż oferty starsze niż ${b.threshold} dni w zakładce Do domknięcia`}
              className="w-full text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-gray-50 transition-colors"
            >
              {row}
            </button>
          ) : (
            <div key={b.label} className="-mx-1 px-1 py-0.5">{row}</div>
          );
        })}
      </div>

      {oldest.count > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-red-800">
            <b>{fmtInt(oldest.count)} ofert za {fmtCompact(oldest.valuePln)} PLN</b> wisi ponad 90 dni.
          </p>
          <button
            type="button"
            onClick={() => onJump(90)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 whitespace-nowrap"
          >
            Domknij najstarsze
          </button>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Kliknięcie w przedział pokazuje oferty starsze niż jego dolna granica.
      </p>
    </div>
  );
}
