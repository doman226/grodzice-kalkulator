// ─── Konwersja walut EUR ↔ PLN — wspólny helper ──────────────────────────────
//
// Tło: bug konwersji transportu wracał wielokrotnie, bo logika `Math.round`
// była rozsiana po 8 plikach z `handleCurrencyChange`. Ten helper to single
// source of truth — każda zmiana w 1 miejscu propaguje się automatycznie do
// wszystkich modułów (wynajem grodzic/płyt + sprzedaż grodzic/rur).
//
// Patrz: docs/CURRENCY-CONVERSION-PATTERN.md
// ─────────────────────────────────────────────────────────────────────────────

export type Currency = 'EUR' | 'PLN';

/**
 * Konwertuje wartość pieniężną między EUR a PLN.
 *
 * Konwencje zaokrąglania:
 *   - PLN → EUR: zawsze 2dp (ułamki PLN nie mają sensu w EUR)
 *   - EUR → PLN z precision='cents': 2dp (symetria — wynajem)
 *   - EUR → PLN z precision='whole': do całych złotówek (sprzedaż)
 *
 * @param value      Wartość w walucie źródłowej (≤0 zwraca bez zmian)
 * @param fromCcy    Waluta źródłowa
 * @param toCcy      Waluta docelowa
 * @param rate       Kurs EUR/PLN (np. 4.2524)
 * @param precision  'cents' (domyślne, wynajem) lub 'whole' (sprzedaż)
 *
 * @example
 *   // Wynajem (symetryczne 2dp):
 *   convertCurrencyValue(600, 'EUR', 'PLN', 4.2524)        // → 2551.44
 *   convertCurrencyValue(2551.44, 'PLN', 'EUR', 4.2524)    // → 600.00
 *
 *   // Sprzedaż (asymetryczne):
 *   convertCurrencyValue(600, 'EUR', 'PLN', 4.2524, 'whole') // → 2551
 *   convertCurrencyValue(2551, 'PLN', 'EUR', 4.2524, 'whole') // → 599.90
 */
export function convertCurrencyValue(
  value: number,
  fromCcy: Currency,
  toCcy: Currency,
  rate: number,
  precision: 'whole' | 'cents' = 'cents',
): number {
  // Wartości niedodatnie lub identyczna waluta → bez konwersji
  if (value <= 0 || fromCcy === toCcy) return value;

  if (toCcy === 'PLN') {
    // EUR → PLN: rate × value
    const raw = value * rate;
    return precision === 'whole' ? Math.round(raw) : Math.round(raw * 100) / 100;
  }

  // PLN → EUR: zawsze 2dp (groszowe ułamki PLN nie mają sensu w EUR)
  return Math.round((value / rate) * 100) / 100;
}
