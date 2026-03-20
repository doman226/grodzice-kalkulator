export interface NBPRate {
  rate: number;
  date: string;   // YYYY-MM-DD
  source: 'NBP' | 'ręczny';
}

/**
 * Pobiera aktualny kurs EUR/PLN z API NBP.
 * Używa /last/1/ zamiast /today/ — działa też w weekendy i święta,
 * zwracając ostatni dostępny kurs z datą publikacji.
 */
export async function fetchNBPRate(): Promise<NBPRate> {
  const res = await fetch(
    'https://api.nbp.pl/api/exchangerates/rates/A/EUR/last/1/?format=json',
    { signal: AbortSignal.timeout(8000), cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error(`NBP API błąd: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const entry = data?.rates?.[0];

  if (!entry?.mid || !entry?.effectiveDate) {
    throw new Error('Nieoczekiwany format odpowiedzi NBP API.');
  }

  return {
    rate: entry.mid,
    date: entry.effectiveDate,
    source: 'NBP',
  };
}

/**
 * Formatuje datę kursu do czytelnej formy po polsku.
 * np. "2025-03-19" → "19.03.2025"
 */
export function formatNBPDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
