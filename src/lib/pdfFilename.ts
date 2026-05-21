// Wspólny helper budujący nazwę pobieranego pliku PDF.
// Format: {numer}_{klient}_{zadanie}  (sekcje oddzielone '_', spacje -> '-').
// Diakrytyki zachowane. Suffix języka (np. '-EN') dokleja wywołujący — patrz
// CLAUDE.md "Dodanie pola per-oferta": różne moduły mają różne konwencje suffixu.

/** Oczyszcza pojedynczą sekcję do postaci bezpiecznej dla nazwy pliku Windows. */
function sanitizeSegment(value: string): string {
  return value
    .normalize('NFC')                 // diakrytyki w formie złożonej (ó, ł, ś...)
    .replace(/[\\/:*?"<>|]/g, '')     // znaki nielegalne w nazwach plików Windows
    .replace(/,/g, '')                // przecinki
    .replace(/\s+/g, '-')             // ciągi białych znaków -> pojedynczy '-'
    .replace(/-+/g, '-')              // zwiń wielokrotne '-'
    .replace(/^[-.]+|[-.]+$/g, '')    // utnij wiodące/końcowe '-' lub '.'
    .trim();
}

/**
 * Buduje rdzeń nazwy pliku PDF (bez suffixu języka i bez '.pdf').
 * @param offerNumber numer oferty (np. "OF/2026/056") — '/' zamieniane na '-'
 * @param clientName  nazwa klienta (opcjonalna) — ucinana do 40 znaków
 * @param taskName    nazwa zadania (opcjonalna) — pomijana gdy pusta
 */
export function buildPdfFilenameBase(
  offerNumber: string,
  clientName?: string | null,
  taskName?: string | null,
): string {
  const parts: string[] = [offerNumber.replace(/\//g, '-')];

  if (clientName) {
    const c = sanitizeSegment(clientName).slice(0, 40).replace(/-+$/, '');
    if (c) parts.push(c);
  }
  if (taskName) {
    const t = sanitizeSegment(taskName);
    if (t) parts.push(t);
  }
  return parts.join('_');
}
