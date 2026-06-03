# Sekcja „Zamki" w podmodule sprzedaży rur (SR) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do podmodułu sprzedaży rur (SR) sekcję zamków identyczną z modułem grodzic — katalog współdzielony (`sale_locks`), nowa tabela pozycji per oferta, pełny cykl zapis/edycja/kopia + blok zamków w PDF (PL/EN).

**Architecture:** Wierny klon sekcji zamków z `src/components/sale/*` do `src/components/sale/pipe/*`. Katalog `sale_locks` współdzielony (tylko-do-odczytu z perspektywy rur). Nowa tabela `pipe_sale_offer_lock_items` (lustro `sale_offer_lock_items`, FK→`pipe_sale_offers`). Reszta = klon stanu/logiki/UI/PDF z `SaleCalculator`/`SaveSaleOfferModal`/`EditSaleOfferModal`/`SaleOfferPDF`.

**Tech Stack:** React 18 + TypeScript + Vite 5, Tailwind 3, Supabase (PostgreSQL), `@react-pdf/renderer`.

**Spec:** `docs/superpowers/specs/2026-06-03-pipe-sale-locks-design.md`

> **Brak frameworka testowego.** „Test" w tym repo = `npm run build` (strict `tsc`, identyczny z Netlify; wykrywa m.in. niekompletną koercję `'' * number` i brakujące pola interfejsów PDF) + ręczny smoke test + render PDF w Node. Uruchamiaj build przez **PowerShell/cmd** (Node nie jest w bash PATH). Każdy task kończy się zielonym buildem i commitem.

> **Kolejność tasków** dobrana tak, by każdy commit kompilował się zielono. Nowe propsy (`locks?`, `lockItems?`) są **opcjonalne** tam, gdzie producent i konsument są w różnych taskach (wzorzec „prop opcjonalny" z `CLAUDE.md`).

> **Commit message** w PowerShell: pisz treść do pliku poza repo i użyj `-F` (here-stringi `@'...'@` są zawodne). Wzorzec w każdym kroku „Commit". Stopka commita:
> `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
> **Nie commituj** dopóki użytkownik nie poprosi — jeśli pracujesz autonomicznie, wykonaj kroki Commit; jeśli nie, pomiń je i zbierz zgodę zbiorczo.

---

## File Structure

| Plik | Akcja | Odpowiedzialność |
|---|---|---|
| `docs/migrations/2026-06-03-pipe-sale-locks.sql` | **Create** | DDL tabeli `pipe_sale_offer_lock_items` |
| `src/types/index.ts` | Modify | `PipeSaleOfferLockItem` + `PipeSaleOffer.lock_items?` |
| `src/lib/pdfStrings.ts` | Modify | klucze zamków w `PipeSalePdfStrings` + `pipeSale_pl` + `pipeSale_en` |
| `src/components/sale/pipe/PipeOfferPDF.tsx` | Modify | blok tabeli zamków + breakdown w price boxie |
| `src/components/sale/pipe/PipeSaveOfferModal.tsx` | Modify | `LockSnapshot`, prop `lockItems?`, INSERT zamków, podsumowanie |
| `src/components/sale/pipe/PipeSaleCalculator.tsx` | Modify | prop `locks?`, stan/logika/UI zamków, masa łączna, `lockSnapshot` |
| `src/components/sale/pipe/PipeEditOfferModal.tsx` | Modify | prop `locks?`, edycja zamków, saga DELETE+INSERT, kopia |
| `src/components/sale/pipe/PipeOffersTable.tsx` | Modify | prop `locks?`, przekazanie do modali, pozycje zamków w wierszu |
| `src/components/sale/pipe/PipeSaleSection.tsx` | Modify | ładowanie `sale_locks`, query `lock_items`, przekazanie `locks` |

**Pliki-wzorce (źródło prawdy do skopiowania, NIE modyfikować):**
`src/components/sale/SaleCalculator.tsx`, `SaveSaleOfferModal.tsx`, `EditSaleOfferModal.tsx`, `SaleOfferPDF.tsx`, `SaleOffersTable.tsx`, `SaleSection.tsx`.

---

## Task 1: Migracja DB — tabela `pipe_sale_offer_lock_items`

**Files:**
- Create: `docs/migrations/2026-06-03-pipe-sale-locks.sql`
- Apply: Supabase projekt `hliemaqfncptedkxxakt`

- [ ] **Step 1: Napisz plik migracji**

```sql
-- ============================================================================
-- Migration: Pipe Sale Locks (zamki w ofertach sprzedaży rur)
-- Data: 2026-06-03
--
-- Strategia: 100% addytywna. Katalog zamków (sale_locks) WSPÓŁDZIELONY z
-- modułem grodzic — NIE tworzymy pipe_locks. Tylko nowa tabela pozycji per
-- oferta: pipe_sale_offer_lock_items (lustro sale_offer_lock_items, FK do
-- pipe_sale_offers). Bez RLS (spójnie z resztą tabel pipe_sale_*).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipe_sale_offer_lock_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id           UUID        NOT NULL REFERENCES pipe_sale_offers(id) ON DELETE CASCADE,
  lock_name          TEXT        NOT NULL,
  steel_grade        TEXT,
  quantity_szt       NUMERIC,
  length_m           NUMERIC,
  quantity_mb        NUMERIC     NOT NULL,
  price_eur_mb       NUMERIC     NOT NULL,
  total_eur          NUMERIC     NOT NULL,
  total_pln          NUMERIC     NOT NULL DEFAULT 0,
  mass_t             NUMERIC     NOT NULL,
  sell_price_eur_mb  NUMERIC,
  sell_eur_total     NUMERIC,
  sell_pln_total     NUMERIC,
  sort_order         INTEGER     NOT NULL DEFAULT 0
);

COMMENT ON TABLE pipe_sale_offer_lock_items IS
  'Pozycje zamków w ofertach sprzedaży rur. Katalog źródłowy: sale_locks (współdzielony z grodzicami). ON DELETE CASCADE.';

CREATE INDEX IF NOT EXISTS idx_pipe_lock_items_offer ON pipe_sale_offer_lock_items(offer_id);
```

- [ ] **Step 2: Zastosuj migrację w Supabase**

Użyj narzędzia `apply_migration` (MCP Supabase) z `project_id=hliemaqfncptedkxxakt`, name `pipe_sale_offer_lock_items`, query = treść pliku.

- [ ] **Step 3: Weryfikacja — tabela istnieje z poprawnymi kolumnami**

Uruchom `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pipe_sale_offer_lock_items'
ORDER BY ordinal_position;
```
Expected: 14 kolumn; `offer_id` NOT NULL, `lock_name` NOT NULL, `quantity_mb`/`price_eur_mb`/`total_eur`/`total_pln`/`mass_t` NOT NULL, reszta nullable. Sprawdź FK + index:
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'pipe_sale_offer_lock_items'::regclass;
```
Expected: PK + FK do `pipe_sale_offers`.

- [ ] **Step 4: Commit** (plik migracji to dokumentacja)

```
git add docs/migrations/2026-06-03-pipe-sale-locks.sql
git commit -F <msg>
```
Msg: `feat(pipe-sale): migracja pipe_sale_offer_lock_items (zamki w ofertach rur)`

---

## Task 2: Typy TypeScript

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Dodaj interfejs `PipeSaleOfferLockItem`**

Wstaw **bezpośrednio po** interfejsie `PipeSaleOfferItem` (kończy się ok. linii 306, przed komentarzem „Sprzedaż płyt drogowych"). Lustro `SaleOfferLockItem` (linie 169–186):

```ts
export interface PipeSaleOfferLockItem {
  id: string;
  offer_id: string;
  lock_name: string;
  steel_grade?: string | null;   // gatunek stali (informacyjnie)
  quantity_szt?: number | null;  // liczba sztuk
  length_m?: number | null;      // długość jednej sztuki [m]
  quantity_mb: number;           // szt × długość [mb]
  price_eur_mb: number;          // cena EUR/mb (snapshot)
  total_eur: number;             // quantity_mb × price_eur_mb
  total_pln: number;             // total_eur × exchange_rate
  sell_price_eur_mb?: number | null;
  sell_eur_total?: number | null;
  sell_pln_total?: number | null;
  mass_t: number;                // quantity_mb × weight_kg_m / 1000
  sort_order: number;
}
```

- [ ] **Step 2: Dodaj `lock_items?` do `PipeSaleOffer`**

W interfejsie `PipeSaleOffer` (linia ~234), tuż po `items?: PipeSaleOfferItem[];` (linia 272) dodaj:
```ts
  lock_items?: PipeSaleOfferLockItem[];
```

- [ ] **Step 3: Build**

Run (PowerShell): `npm run build`
Expected: PASS (zielony). `SaleLock` jest reużywany — nie dodawaj nowego typu katalogu.

- [ ] **Step 4: Commit**

Msg: `feat(pipe-sale): typy PipeSaleOfferLockItem + lock_items na ofercie`

---

## Task 3: Stringi PDF (`pdfStrings.ts`)

**Files:**
- Modify: `src/lib/pdfStrings.ts` (interfejs `PipeSalePdfStrings` @1012, `pipeSale_pl` @1113, `pipeSale_en` @1204)

> **⚠ GOTCHA (`CLAUDE.md`):** te same polskie i angielskie stringi bywają identyczne — `replace_all` łatwo wstawia zły język, a `tsc` tego NIE wykryje. Edytuj `pipeSale_pl` i `pipeSale_en` **osobnymi, jednoznacznymi** edycjami (kotwica: sąsiednie pole w danym obiekcie). Po edycji zweryfikuj `grep`.

- [ ] **Step 1: Dodaj klucze zamków do interfejsu `PipeSalePdfStrings`**

W bloku interfejsu, po `thValue: string;` (linia 1041) dodaj:
```ts
  // Locks table (zamki)
  thLock:           string;   // "Zamek" / "Interlock"
  thLockQtySzt:     string;   // "Szt." / "Pcs."
  thLockMassT:      string;   // "Masa [t]" / "Mass [t]"
  thMb:             string;   // "mb łącznie" / "Total [lm]"
  lockSectionTitle: string;   // "Zamki" / "Interlocks"
  lockTotalRow:     string;   // "Łącznie" / "Total interlocks"
  lockMassRow:      string;   // "Masa zamków" / "Interlock mass"
```

- [ ] **Step 2: Dodaj wartości do `pipeSale_pl`**

W obiekcie `pipeSale_pl`, po `thValue: 'Wartość',` (linia 1138) dodaj:
```ts
  thLock:           'Zamek',
  thLockQtySzt:     'Szt.',
  thLockMassT:      'Masa [t]',
  thMb:             'mb łącznie',
  lockSectionTitle: 'Zamki',
  lockTotalRow:     'Łącznie',
  lockMassRow:      'Masa zamków',
```

- [ ] **Step 3: Dodaj wartości do `pipeSale_en`**

W obiekcie `pipeSale_en`, po `thValue: 'Value',` (linia 1229) dodaj:
```ts
  thLock:           'Interlock',
  thLockQtySzt:     'Pcs.',
  thLockMassT:      'Mass [t]',
  thMb:             'Total [lm]',
  lockSectionTitle: 'Interlocks',
  lockTotalRow:     'Total interlocks',
  lockMassRow:      'Interlock mass',
```

- [ ] **Step 4: Build + weryfikacja językowa**

Run: `npm run build` → PASS (jeśli brak pola w którymś obiekcie → błąd TS = dobry sygnał).
Run (Grep): potwierdź, że `'Interlock'` jest **tylko** w `pipeSale_en`, a `'Zamek'`/`'Zamki'` **tylko** w `pipeSale_pl`:
```
grep -n "Interlock\|'Zamek'\|'Zamki'" src/lib/pdfStrings.ts
```
Expected: linie EN mają „Interlock*", PL mają „Zamek/Zamki" — żadnego pomieszania.

- [ ] **Step 5: Commit**

Msg: `feat(pipe-sale): klucze PDF dla bloku zamków (PL/EN)`

---

## Task 4: Blok zamków w `PipeOfferPDF.tsx`

**Files:**
- Modify: `src/components/sale/pipe/PipeOfferPDF.tsx`
- Wzorzec: `src/components/sale/SaleOfferPDF.tsx` (linie 197–198 lokalne consts, 211–234 sumy, 419–501 tabela zamków, 545–556 breakdown)

> Style (`s.table`, `s.tableHeaderRow`, `s.thCell`, `s.tdLabel`, `C.*`, `s.priceRow`) już istnieją w `PipeOfferPDF` i są 1:1 z `SaleOfferPDF` — blok zamków wkleja się bez nowych stylów.

- [ ] **Step 1: Lokalne consts nagłówków (currency-dependent)**

Po `const isEUR = currency === 'EUR';` (linia 224) dodaj (wzorzec `SaleOfferPDF` 197–198):
```ts
  const thPriceMb = isEUR ? (lang === 'pl' ? 'Cena EUR/mb' : 'Price EUR/lm')
                          : (lang === 'pl' ? 'Cena PLN/mb' : 'Price PLN/lm');
  const thValueC  = isEUR ? (lang === 'pl' ? 'Wartość [EUR]' : 'Value [EUR]')
                          : (lang === 'pl' ? 'Wartość [PLN]' : 'Value [PLN]');
```

- [ ] **Step 2: Sumy zamków + integracja z totalem dla klienta**

Po `const hasItems = sortedItems.length > 0;` (linia 227) dodaj:
```ts
  const sortedLocks = [...(offer.lock_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasLocks    = sortedLocks.length > 0;
  const locksTotalEUR   = sortedLocks.reduce((s, l) => s + (l.sell_eur_total ?? l.total_eur ?? 0), 0);
  const locksTotalPLN   = sortedLocks.reduce((s, l) => s + (l.sell_pln_total ?? l.total_pln ?? 0), 0);
  const locksTotalMassT = sortedLocks.reduce((s, l) => s + (l.mass_t ?? 0), 0);
```
Następnie rozszerz istniejące `totalForClientEUR/PLN` (linie 239–240), dodając wartość zamków:
```ts
  const totalForClientEUR = totalSellEUR + deliveryCostEUR + locksTotalEUR;
  const totalForClientPLN = totalSellPLN + deliveryCostPLN + locksTotalPLN;
```

- [ ] **Step 3: Wstaw tabelę zamków po tabeli pozycji rur**

Bezpośrednio **po** zamknięciu bloku `{hasItems && (...)}` (linia 476, przed komentarzem „CENA BOX") wstaw tabelę zamków — skopiuj `SaleOfferPDF` linie 419–501, z adaptacją: nagłówek długości użyj `t.thLengthM` (zamiast `t.thLength`). Pełny blok:
```tsx
        {/* ── TABELA ZAMKÓW ── */}
        {hasLocks && (
          <View style={[s.table, { marginTop: hasItems ? 6 : 0 }]}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 1.5 }]}>{t.thLock}</Text>
              <Text style={[s.thCell, { flex: 1.2 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thLockQtySzt}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thLengthM}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thKgPerM}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thLockMassT}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{t.thMb}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{thPriceMb}</Text>
              <Text style={[s.thCell, { flex: 1.3, textAlign: 'right' }]}>{thValueC}</Text>
            </View>
            {sortedLocks.map((lock, idx) => {
              const qMb    = lock.quantity_mb ?? 0;
              const massT  = lock.mass_t ?? 0;
              const kgPerM = qMb > 0 ? (massT * 1000) / qMb : 0;
              const qtySzt = lock.quantity_szt ?? null;
              const lenM   = lock.length_m   ?? null;
              return (
                <View key={lock.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                  <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{lock.lock_name}</Text>
                  <Text style={[s.tdLabel, { flex: 1.2, color: C.gray700 }]}>{lock.steel_grade?.toUpperCase() ?? '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>{qtySzt != null ? `${qtySzt} ${t.unitPcs}` : '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right' }]}>{lenM != null ? `${lenM} m` : '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', color: C.gray700 }]}>{formatNumber(kgPerM, 1)}</Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(massT, 3)} t</Text>
                  <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(qMb, 1)}</Text>
                  <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', color: C.gray700 }]}>
                    {isEUR
                      ? `${formatEUR(lock.sell_price_eur_mb ?? lock.price_eur_mb)} EUR/mb`
                      : `${formatPLN((lock.sell_price_eur_mb ?? lock.price_eur_mb) * exchRate)} PLN/mb`}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {isEUR
                      ? `${formatEUR(lock.sell_eur_total ?? lock.total_eur)} EUR`
                      : `${formatPLN(lock.sell_pln_total ?? lock.total_pln ?? 0)} PLN`}
                  </Text>
                </View>
              );
            })}
            <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
              <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.lockTotalRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.85 }]} />
              <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{formatNumber(locksTotalMassT, 3)} t</Text>
              <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {formatNumber(sortedLocks.reduce((acc, l) => acc + (l.quantity_mb ?? 0), 0), 1)}
              </Text>
              <Text style={[s.tdLabel, { flex: 1.0 }]} />
              <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {isEUR ? `${formatEUR(locksTotalEUR)} EUR` : `${formatPLN(locksTotalPLN)} PLN`}
              </Text>
            </View>
          </View>
        )}
```

- [ ] **Step 4: Pokaż wartość dla klienta z zamkami w CENA BOX**

W IIFE price-boxa (linie 482–515) zmienna `totalToShow` musi obejmować zamki. Zmień obie gałęzie:
```ts
          const totalToShow = dapIncludedHasCost
            ? (isEUR ? totalForClientEUR : totalForClientPLN)
            : (isEUR ? totalSellEUR + locksTotalEUR : totalSellPLN + locksTotalPLN);
```
(`totalForClientEUR/PLN` już zawiera zamki po Step 2; gałąź „bez kosztu DAP" dodaj `locksTotal*`.)
Pod `priceValue` dodaj rozbicie zamków (po linii `effectivePerT` Text, w `s.priceRow`, wzorzec `SaleOfferPDF` 545–556):
```tsx
                {hasLocks && (
                  <Text>{t.lockSectionTitle}: {isEUR ? `${formatEUR(locksTotalEUR)} EUR` : `${formatPLN(locksTotalPLN)} PLN`}</Text>
                )}
```

- [ ] **Step 5: Build**

Run: `npm run build` → PASS.

- [ ] **Step 6: Render PDF (Node) — weryfikacja wizualna PL + EN**

Użyj harnessu z `CLAUDE.md` („Debugowanie układu PDF"): uruchom `npm run dev` w tle, ustaw `globalThis.window.location.origin` przed dynamicznym importem, `ReactPDF.renderToFile(<PipeOfferPDF offer={mock} lang="pl"/>, '_pl.pdf')` i `lang="en"`. Mock `offer` z 1 rurą + 2 pozycjami `lock_items`.
Weryfikuj `pdfplumber`/`extract_text`: PL zawiera „Zamki"/„Zamek"; EN zawiera „Interlocks"/„Interlock"; suma price-boxa = rury + zamki (+transport gdy DAP). **Sprzątnij** `_*.pdf`, `_*.tsx` przed commitem.

- [ ] **Step 7: Commit**

Msg: `feat(pipe-sale): blok zamków w PDF oferty rur (PL/EN, 9 kolumn)`

---

## Task 5: `PipeSaveOfferModal` — zapis pozycji zamków

**Files:**
- Modify: `src/components/sale/pipe/PipeSaveOfferModal.tsx`
- Wzorzec: `src/components/sale/SaveSaleOfferModal.tsx` (interfejs `LockSnapshot` 11–24, INSERT 248–275, sumy 284–292, podsumowanie JSX 334–366)

- [ ] **Step 1: Dodaj interfejs `LockSnapshot` (eksport, lokalny dla modułu rur)**

Po interfejsie `PipeDeliverySnapshot` (linia 49) dodaj (lustro `SaveSaleOfferModal` 11–24):
```ts
/** Snapshot jednej pozycji zamka — z PipeSaleCalculator. Ceny zawsze w EUR. */
export interface LockSnapshot {
  lockName: string;
  steelGrade: string;
  quantitySzt: number;
  lengthM: number;
  quantityMb: number;   // = quantitySzt × lengthM
  priceEurMb: number;
  sellPriceEurMb?: number;
  totalEUR: number;
  totalPLN: number;
  totalSellEUR?: number;
  totalSellPLN?: number;
  massT: number;
}
```

- [ ] **Step 2: Dodaj prop `lockItems?` + import typu pozycji**

W `Props` (linia 51) po `items: PipeItemSnapshot[];` dodaj:
```ts
  lockItems?: LockSnapshot[];
```
W destrukturyzacji (linie 66–69) dodaj `lockItems = [],`. W imporcie typów (linia 3) dodaj `PipeSaleOfferLockItem`:
```ts
import type { Client, PipeSaleOffer, PipeSaleOfferItem, PipeSaleOfferLockItem, OfferStatus } from '../../../types';
```

- [ ] **Step 3: Sumy zamków (przed `handleSave`) + uwzględnij w totalach oferty**

Po wyliczeniach `totalSellEUR/PLN/totalCostEUR` (linie 101–103) dodaj (wzorzec 284–292):
```ts
  const lockTotalSellEUR = lockItems.reduce((s, i) => s + (i.totalSellEUR ?? 0), 0);
  const lockTotalSellPLN = lockItems.reduce((s, i) => s + (i.totalSellPLN ?? 0), 0);
  const lockTotalCostEUR = lockItems.reduce((s, i) => s + (i.totalEUR ?? 0), 0);
  const lockTotalMassT   = lockItems.reduce((s, i) => s + (i.massT ?? 0), 0);
```
W INSERT oferty (linie 167–194) zmień 3 sumy, by zawierały zamki:
```ts
        total_cost_eur:  (totalCostEUR + lockTotalCostEUR) || null,
        total_sell_eur:  (totalSellEUR + lockTotalSellEUR) || null,
        total_sell_pln:  (totalSellPLN + lockTotalSellPLN) || null,
```

- [ ] **Step 4: INSERT pozycji zamków + rollback (po INSERT pozycji rur)**

Po bloku zapisu `pipe_sale_offer_items` (po linii 245, przed `setSaving(false); savedOffer.items = ...`) wstaw (wzorzec `SaveSaleOfferModal` 248–275):
```ts
    // INSERT pozycji zamków (jeśli są) — rollback usuwa świeżą ofertę
    let savedLockItems: PipeSaleOfferLockItem[] = [];
    if (lockItems.length > 0) {
      const { data: insertedLocks, error: locksErr } = await supabase
        .from('pipe_sale_offer_lock_items')
        .insert(lockItems.map((item, idx) => ({
          offer_id:          savedOffer.id,
          lock_name:         item.lockName,
          steel_grade:       item.steelGrade || null,
          quantity_szt:      item.quantitySzt,
          length_m:          item.lengthM,
          quantity_mb:       item.quantityMb,
          price_eur_mb:      item.priceEurMb,
          sell_price_eur_mb: item.sellPriceEurMb,
          total_eur:         item.totalEUR,
          total_pln:         item.totalPLN,
          sell_eur_total:    item.totalSellEUR,
          sell_pln_total:    item.totalSellPLN,
          mass_t:            item.massT,
          sort_order:        idx,
        })))
        .select();
      if (locksErr) {
        await supabase.from('pipe_sale_offers').delete().eq('id', savedOffer.id);
        setSaving(false);
        return setError('Błąd zapisu zamków – oferta anulowana: ' + locksErr.message);
      }
      savedLockItems = (insertedLocks ?? []) as PipeSaleOfferLockItem[];
    }
```
Zaraz przy `onSaved` (linia 248–249) dopisz:
```ts
    savedOffer.lock_items = savedLockItems;
```

- [ ] **Step 5: Podsumowanie zamków + masa łączna w JSX**

W sekcji „Podsumowanie do zapisu" (linie 474–493): masę pokaż łącznie (rury + zamki) i sumę oferty z zamkami. Zmień:
```tsx
              <div><span className="text-gray-600">Masa:</span>{' '}
                <strong>{formatNumber(totals.totalMassT + lockTotalMassT, 3)} t</strong></div>
```
i sumę oferty:
```tsx
              <div><span className="text-gray-600">Suma oferty:</span>{' '}
                <strong>
                  {currency === 'EUR'
                    ? formatEUR(totals.totalSell + lockTotalSellEUR)
                    : formatPLN(totals.totalSell + lockTotalSellPLN)} {currency}
                </strong></div>
```
Dodaj walidację: zezwól na zapis gdy są same zamki (linia 155 `if (items.length === 0)`):
```ts
    if (items.length === 0 && lockItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję (rura lub zamek).');
```

- [ ] **Step 6: Build**

Run: `npm run build` → PASS. (Prop `lockItems?` opcjonalny → kalkulator może go jeszcze nie podawać.)

- [ ] **Step 7: Commit**

Msg: `feat(pipe-sale): zapis pozycji zamków w PipeSaveOfferModal (rollback)`

---

## Task 6: `PipeSaleCalculator` — stan, logika i UI zamków

**Files:**
- Modify: `src/components/sale/pipe/PipeSaleCalculator.tsx`
- Wzorzec: `src/components/sale/SaleCalculator.tsx` (interfejsy 37–55, stan 100, funkcje 249–282, obliczenia 307–339, combined mass 370–391, sekcja UI 715–905, snapshot 1300–1319)

> **Klucz:** ceny zamków zawsze w EUR w stanie; `handleCurrencyChange` (linia 149) ich NIE rusza. Gatunek stali zamka = grodzicowe `sale_steel_grades`, więc dołóż jego ładowanie.

- [ ] **Step 1: Importy + prop `locks?`**

W imporcie typów dodaj `SaleLock`, `SaleSteeelGrade`. Dodaj import `LockSnapshot`:
```ts
import type { PipeItemSnapshot, PipeOfferTotals, LockSnapshot } from './PipeSaveOfferModal';
```
W `Props` dodaj `locks?: SaleLock[];`. W sygnaturze (linia 99) destrukturyzuj `locks = [],`.

- [ ] **Step 2: Interfejsy `PipeLockCalcItem` + `LockItemResult`**

Po istniejących interfejsach (przy `marginColor`, linia ~57) dodaj (lustro `SaleCalculator` 37–55):
```ts
interface PipeLockCalcItem {
  uid: string;
  lockName: string;
  steelGrade: string;
  quantitySzt: number | '';
  lengthM: number | '';
  priceEurMb: number;      // zawsze EUR
  sellPriceEurMb: number;
}
interface LockItemResult {
  valid: boolean;
  totalEUR: number; totalPLN: number;
  totalSellEUR: number; totalSellPLN: number;
  marginPct: number | null; massT: number;
}
```

- [ ] **Step 3: Stan zamków + ładowanie gatunków grodzicowych**

Po `const [taskName, setTaskName] = useState('');` (linia 121) dodaj:
```ts
  const [lockItems, setLockItems] = useState<PipeLockCalcItem[]>([]);
  const [grades, setGrades] = useState<SaleSteeelGrade[]>([]);
```
W istniejącym `useEffect`/loaderze (lub nowy `useEffect`) pobierz gatunki:
```ts
  useEffect(() => {
    supabase.from('sale_steel_grades').select('*').order('sort_order')
      .then(({ data }) => { if (data) setGrades(data as SaleSteeelGrade[]); });
  }, []);
```

- [ ] **Step 4: Funkcje add/remove/update zamka** (lustro 249–282)

```ts
  function addLockItem() {
    if (!locks.length) return;
    const def = locks[0];
    setLockItems(prev => [...prev, {
      uid: crypto.randomUUID(), lockName: def.name, steelGrade: grades[0]?.id ?? '',
      quantitySzt: '', lengthM: '', priceEurMb: def.price_eur_mb, sellPriceEurMb: def.price_eur_mb,
    }]);
  }
  function removeLockItem(uid: string) { setLockItems(prev => prev.filter(i => i.uid !== uid)); }
  function updateLockItem(uid: string, patch: Partial<PipeLockCalcItem>) {
    setLockItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      if ('lockName' in patch) {
        const def = locks.find(l => l.name === patch.lockName);
        if (def) { updated.priceEurMb = def.price_eur_mb; updated.sellPriceEurMb = def.price_eur_mb; }
      }
      return updated;
    }));
  }
```

- [ ] **Step 5: Obliczenia `lockResults` + `lockTotals`** (lustro 307–339)

```ts
  const lockResults = useMemo((): LockItemResult[] =>
    lockItems.map(item => {
      const def = locks.find(l => l.name === item.lockName);
      const quantityMb = (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0);
      if (!def || quantityMb <= 0 || item.priceEurMb <= 0)
        return { valid: false, totalEUR: 0, totalPLN: 0, totalSellEUR: 0, totalSellPLN: 0, marginPct: null, massT: 0 };
      const totalEUR = quantityMb * item.priceEurMb;
      const totalSellEUR = quantityMb * item.sellPriceEurMb;
      const marginPct = item.sellPriceEurMb > 0 ? ((item.sellPriceEurMb - item.priceEurMb) / item.sellPriceEurMb) * 100 : null;
      return { valid: true, totalEUR, totalPLN: totalEUR * exchangeRate, totalSellEUR, totalSellPLN: totalSellEUR * exchangeRate, marginPct, massT: (quantityMb * def.weight_kg_m) / 1000 };
    }), [lockItems, locks, exchangeRate]);
  const lockTotals = useMemo(() => {
    let totalEUR = 0, totalPLN = 0, totalSellEUR = 0, totalSellPLN = 0, totalMassT = 0;
    for (const r of lockResults) { if (!r.valid) continue; totalEUR += r.totalEUR; totalPLN += r.totalPLN; totalSellEUR += r.totalSellEUR; totalSellPLN += r.totalSellPLN; totalMassT += r.massT; }
    return { totalEUR, totalPLN, totalSellEUR, totalSellPLN, totalMassT };
  }, [lockResults]);
```

- [ ] **Step 6: Masa łączna (rury + zamki) napędza dostawę**

W `deliveryCalc` (linia 289–300) zmień:
```ts
    const combinedMassT = totals.totalMassT + lockTotals.totalMassT;
```
i dodaj `lockTotals.totalMassT` do tablicy zależności useMemo. Zaktualizuj też warunek wczesnego wyjścia: `if (totals.totalMassT + lockTotals.totalMassT <= 0) return null;`.

- [ ] **Step 7: Walidacja zapisu z zamkami**

Przy `allItemsValid`/`hasEmptyItems` (linie 321–322) dodaj:
```ts
  const allLocksValid = lockResults.every(r => r.valid);
  const hasValidLocks = lockResults.some(r => r.valid);
  const hasEmptyLocks = lockItems.length > 0 && !allLocksValid;
```
Rozszerz warunek `canSave` (znajdź istniejący, ~linia 324+): zapis możliwy gdy `(allItemsValid || hasValidLocks)` oraz `!hasEmptyItems && !hasEmptyLocks`.

- [ ] **Step 8: Sekcja UI „🔗 Zamki"**

Wstaw po sekcji pozycji rur (po przycisku „Dodaj pozycję"/tabeli rur, przed sekcją podsumowania/dostawy). Skopiuj `SaleCalculator` linie 715–905 z adaptacją nazw funkcji/stanu (już zgodne: `addLockItem`, `lockItems`, `updateLockItem`, `lockResults`, `lockTotals`, `locks`, `grades`, `currency`, `exchangeRate`, `formatEUR/formatPLN/formatNumber`). Sekcja zawiera: nagłówek + „Dodaj zamek", listę pozycji (Typ zamka `<select>` z `locks`, Gatunek `<select>` z `grades`, Ilość/Dł. `number|''` z czerwoną obwódką, Łącznie mb, Cena kosztu/sprzedaży w `currency` z przyciskiem „przywróć cenę", Masa t, usuń), podsumowanie zamków.
> Cena w UI: `priceEurMb` trzymany w EUR; przy zmianie inputu w PLN dziel przez kurs (`currency === 'PLN' ? parsed / exchangeRate : parsed`) — patrz wzorzec linie 818, 840.

- [ ] **Step 9: `lockSnapshot` + przekazanie do modala**

Przy budowaniu `snapshots`/wywołaniu `<PipeSaveOfferModal>` (linia 831) dodaj memo (lustro 1300–1319) i prop:
```ts
  const lockSnapshot = useMemo<LockSnapshot[]>(() =>
    lockItems.flatMap((item, idx) => {
      const r = lockResults[idx];
      if (!r.valid) return [];
      return [{
        lockName: item.lockName, steelGrade: item.steelGrade,
        quantitySzt: Number(item.quantitySzt) || 0, lengthM: Number(item.lengthM) || 0,
        quantityMb: (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0),
        priceEurMb: item.priceEurMb, totalEUR: r.totalEUR, totalPLN: r.totalPLN, massT: r.massT,
        sellPriceEurMb: item.sellPriceEurMb, totalSellEUR: r.totalSellEUR, totalSellPLN: r.totalSellPLN,
      }];
    }), [lockItems, lockResults]);
```
W `<PipeSaveOfferModal ... />` dodaj prop `lockItems={lockSnapshot}`.

- [ ] **Step 10: Build + smoke walutowy**

Run: `npm run build` → PASS (audyt koercji `number|''`).
Smoke (`Claude_Preview` lub ręcznie): dodaj zamek 100 EUR/mb, toggle EUR↔PLN — `priceEurMb` w stanie stały (100), display przelicza; masa łączna = rury + zamki; brak double-conversion.

- [ ] **Step 11: Commit**

Msg: `feat(pipe-sale): sekcja zamków w kalkulatorze rur (stan, logika, UI, snapshot)`

---

## Task 7: `PipeEditOfferModal` — edycja + kopia zamków

**Files:**
- Modify: `src/components/sale/pipe/PipeEditOfferModal.tsx`
- Wzorzec: `src/components/sale/EditSaleOfferModal.tsx` (sekcja zamków + saga lock items)

> Modal edycji = kalkulator + modal w jednym (najwięcej zmian). Saga rur to UPDATE → DELETE items → INSERT items (linie 413–456). Zamki dokładamy jako **drugą parę DELETE+INSERT** w tej samej sadze.

- [ ] **Step 1: Prop `locks?` + stan zamków z oferty**

W `Props` dodaj `locks?: SaleLock[];`; destrukturyzuj `locks = []` (linia 123). Dodaj helper `lockItemsFromOffer(offer)` (lustro `itemsFromOffer` 68–112) mapujący `offer.lock_items` → `PipeLockCalcItem` (`quantitySzt`/`lengthM` jako `number|''`, `priceEurMb`/`sellPriceEurMb` z snapshotu). Stan:
```ts
  const [editLocks, setEditLocks] = useState<PipeLockCalcItem[]>(() => lockItemsFromOffer(offer));
  const [grades, setGrades] = useState<SaleSteeelGrade[]>([]);
```
Załaduj `sale_steel_grades` jak w Task 6 Step 3. (Reużyj interfejs `PipeLockCalcItem` — wyeksportuj go z `PipeSaleCalculator` lub zdefiniuj lokalnie; preferuj lokalną definicję dla izolacji modala.)

- [ ] **Step 2: Funkcje + obliczenia zamków**

Skopiuj `addLockItem/removeLockItem/updateLockItem` (na `editLocks`) oraz `lockResults`/`lockTotals` z Task 6 (Steps 4–5). Ceny zamków NIE rusza `handleCurrencyChange` (linia 230) — pozostają w EUR.

- [ ] **Step 3: Saga — DELETE + INSERT pozycji zamków**

Zbuduj payload zamków (bez `offer_id`, jak `newItemsPayload`):
```ts
  const newLockPayload = editLocks.flatMap((item, idx) => {
    const r = lockResults[idx]; if (!r.valid) return [];
    return [{
      lock_name: item.lockName, steel_grade: item.steelGrade || null,
      quantity_szt: Number(item.quantitySzt) || 0, length_m: Number(item.lengthM) || 0,
      quantity_mb: (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0),
      price_eur_mb: item.priceEurMb, sell_price_eur_mb: item.sellPriceEurMb,
      total_eur: r.totalEUR, total_pln: r.totalPLN,
      sell_eur_total: r.totalSellEUR, sell_pln_total: r.totalSellPLN,
      mass_t: r.massT, sort_order: idx,
    }];
  });
```
W gałęzi **kopii** (`if (isCopy)`, linia 380): po INSERT pozycji rur dodaj INSERT zamków:
```ts
    if (newLockPayload.length > 0) {
      const { error: lockErr } = await supabase.from('pipe_sale_offer_lock_items')
        .insert(newLockPayload.map(it => ({ ...it, offer_id: saved.id })));
      if (lockErr) { await supabase.from('pipe_sale_offers').update({ deleted_at: new Date().toISOString() }).eq('id', saved.id); setSaving(false); return setError('Błąd kopiowania zamków: ' + lockErr.message); }
    }
```
W gałęzi **edycji** (saga, po KROK 3 INSERT pozycji rur, linia ~441): dodaj KROK 4+5:
```ts
    // KROK 4: DELETE starych zamków
    await supabase.from('pipe_sale_offer_lock_items').delete().eq('offer_id', offer.id);
    // KROK 5: INSERT nowych zamków
    if (newLockPayload.length > 0) {
      const { error: lockErr } = await supabase.from('pipe_sale_offer_lock_items')
        .insert(newLockPayload.map(it => ({ ...it, offer_id: offer.id })));
      if (lockErr) { setSaving(false); return setError('Błąd zapisu zamków – stare pozycje zamków usunięte, otwórz edycję ponownie: ' + lockErr.message); }
    }
```
Uwzględnij zamki w `offerPayload` sumach (`total_*`) — dodaj `lockTotals` do `total_cost_eur/total_sell_eur/total_sell_pln` (przelicz wg `currency`).

- [ ] **Step 4: Sekcja UI zamków + odśwież `onSaved`**

Wstaw sekcję UI zamków (jak Task 6 Step 8, na `editLocks`) po sekcji pozycji rur. Przy `onSaved` zwróć ofertę z `lock_items` (dla edycji: ponowny `select` lub ręczne złożenie; minimalnie ustaw `updated.lock_items` z `newLockPayload`).

- [ ] **Step 5: Build**

Run: `npm run build` → PASS.

- [ ] **Step 6: Commit**

Msg: `feat(pipe-sale): edycja i kopiowanie zamków w PipeEditOfferModal (saga)`

---

## Task 8: `PipeOffersTable` — pozycje zamków w wierszu + przekazanie `locks`

**Files:**
- Modify: `src/components/sale/pipe/PipeOffersTable.tsx`
- Wzorzec: `src/components/sale/SaleOffersTable.tsx` (rozwijany wiersz z pozycjami zamków)

- [ ] **Step 1: Prop `locks?`**

W `Props` (linia 13) dodaj `locks?: SaleLock[];`; destrukturyzuj `locks = []` (linia 48). Import `SaleLock`.

- [ ] **Step 2: Przekaż `locks` do modali edycji i kopii**

W `<PipeEditOfferModal ... />` (linie 133 i 143–146) dodaj `locks={locks}` w obu instancjach (edit + copy).

- [ ] **Step 3: Pokaż pozycje zamków w rozwiniętym wierszu**

W bloku `{expanded === offer.id && (...)}` (linia 308+) po tabeli pozycji rur dodaj listę `offer.lock_items` (jeśli `.length`), wzorzec z `SaleOffersTable`: nazwa zamka, gatunek, szt × dł = mb, cena sprzedaży/mb, masa, wartość. Sortuj po `sort_order`.

- [ ] **Step 4: Build**

Run: `npm run build` → PASS.

- [ ] **Step 5: Commit**

Msg: `feat(pipe-sale): pozycje zamków w rozwijanym wierszu listy ofert SR`

---

## Task 9: `PipeSaleSection` — ładowanie katalogu i przekazanie

**Files:**
- Modify: `src/components/sale/pipe/PipeSaleSection.tsx`
- Wzorzec: `src/components/sale/SaleSection.tsx` (ładowanie `sale_locks` 33–35, query `lock_items` 38)

- [ ] **Step 1: Stan `locks` + ładowanie `sale_locks` (graceful)**

Import `SaleLock`. Dodaj `const [locks, setLocks] = useState<SaleLock[]>([]);`. W `loadData()` dołóż równoległe pobranie (odporne na brak tabeli — `sale_locks` istnieje, ale trzymaj wzorzec try/catch jak dla ofert):
```ts
    supabase.from('sale_locks').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => { if (data) setLocks(data as SaleLock[]); });
```

- [ ] **Step 2: Rozszerz query ofert o `lock_items`**

W `select` ofert (linia 40) zmień na:
```ts
.select('*, client:clients(*), items:pipe_sale_offer_items(*), lock_items:pipe_sale_offer_lock_items(*)')
```

- [ ] **Step 3: Przekaż `locks` do kalkulatora i tabeli**

W `<PipeSaleCalculator ... />` (linia 93) dodaj `locks={locks}`.
W `<PipeOffersTable ... />` (linia 110) dodaj `locks={locks}`.

- [ ] **Step 4: Build**

Run: `npm run build` → PASS. Teraz pełny przepływ jest podłączony.

- [ ] **Step 5: Commit**

Msg: `feat(pipe-sale): ładowanie sale_locks + lock_items w sekcji rur (pełne podłączenie)`

---

## Task 10: Weryfikacja end-to-end (Definition of Done)

**Files:** (brak zmian — tylko weryfikacja; ewentualne poprawki w osobnych commitach)

- [ ] **Step 1: Build produkcyjny**

Run: `npm run build` → PASS (strict tsc).

- [ ] **Step 2: Smoke test pełnego cyklu** (`Claude_Preview` lub ręcznie w `npm run dev`)

  1. Sprzedaż → Rury → Kalkulator: dodaj 1 rurę + 1 zamek (np. 50 szt × 6 m, cena z cennika). Sprawdź masę łączną (rury + zamki) i liczbę aut.
  2. Toggle EUR↔PLN: ceny zamka w stanie stałe (EUR), display przelicza — brak double-conversion.
  3. Zapisz ofertę → pojawia się `SR/2026/NNN` w zakładce Oferty.
  4. Rozwiń wiersz → widoczne pozycje rur **i** zamków.
  5. Pobierz PDF PL i EN → blok zamków obecny; PL „Zamki", EN „Interlocks"; suma = rury + zamki (+transport gdy DAP).
  6. Edytuj ofertę → zmień typ/ilość zamka → zapisz → zmiana widoczna.
  7. Kopiuj ofertę → nowy `SR/`, status `szkic`, zamki skopiowane.
  8. Usuń (soft-delete) → znika z listy; pozycje zamków pozostają w DB (CASCADE tylko przy hard delete).

- [ ] **Step 3: Weryfikacja DB**

```sql
SELECT o.offer_number, count(li.*) AS lock_items
FROM pipe_sale_offers o
LEFT JOIN pipe_sale_offer_lock_items li ON li.offer_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.offer_number ORDER BY o.created_at DESC LIMIT 5;
```
Expected: testowa oferta ma `lock_items > 0`.

- [ ] **Step 4: (Opcjonalnie) deploy** — push do `main`, weryfikacja Netlify wg `CLAUDE.md` (SHA lub content-check bundla: `grep -c "pipe_sale_offer_lock_items"`).

- [ ] **Step 5: Aktualizacja `CLAUDE.md`** (poza repo, `C:\Users\doman\CENNIK\CLAUDE.md`)

Dopisz w sekcji tabel Supabase: `pipe_sale_offer_lock_items` (zamki SR, katalog współdzielony `sale_locks`). Zaktualizuj listę plików modułu pipe. Dodaj do gotchy: „katalog zamków `sale_locks` współdzielony grodzice+rury; pozycje SR w `pipe_sale_offer_lock_items`".

---

## Podsumowanie gotchas (checklist przed merge)

- [ ] `replace_all` w `pdfStrings.ts` — zweryfikowane `grep`-em, że PL/EN się nie pomieszały.
- [ ] Ceny zamków w EUR — `handleCurrencyChange` ich NIE dotyka (kalkulator i edit modal).
- [ ] `number | ''` + koercja `Number(x)||0` — pusta pozycja zamka blokuje zapis (czerwona obwódka), nie znika po cichu.
- [ ] Masa łączna (rury + zamki) napędza liczbę aut w `deliveryCalc`.
- [ ] PDF: `sheetVal/pipeVal + lockTotal = totalForClient` — brak podwójnego liczenia.
- [ ] Saga edycji: DELETE zamków przed INSERT; komunikat błędu między krokami.
- [ ] Kopia: zamki bez `offer_id`, wstrzyknięte przy `.insert()`; rollback = `UPDATE deleted_at`.
- [ ] Wszystkie nowe propsy (`locks?`, `lockItems?`) opcjonalne — każdy commit kompiluje się zielono.
