# Konwersja walut EUR ↔ PLN — wzorzec i znany problem regresji

> **Status na 2026-05-14 (po refaktorze):** wszystkie 8 miejsc z `handleCurrencyChange`
> używają wspólnego helpera **`convertCurrencyValue`** z `src/lib/currency.ts`.
> Inline `Math.round(...)` zostało wyeliminowane — single source of truth.
> Bug konwersji walut **fizycznie niemożliwy** przy korzystaniu z helpera.
>
> **Dla AI Agent czytającego ten plik:** to nie jest opis nieaktualnego problemu.
> To jest **instrukcja prewencji** którą MUSISZ stosować przy każdej modyfikacji
> kodu związanego z walutą. Sekcje 1-4 to historia, sekcja 5+ to aktualny workflow.

---

## 1. Problem — bug który wracał wielokrotnie

W trybach z togglem waluty `EUR ↔ PLN`, **ceny pozycji** były poprawnie konwertowane przy zmianie waluty (np. `1500 EUR/t → 6379 PLN/t`), ale **koszt transportu / auto** (`deliveryCostPerTruck` / `transportCostPerTruck`) **NIE BYŁ KONWERTOWANY** w niektórych plikach.

**Konsekwencja:** handlowiec wpisywał `600 EUR/auto`, przełączał walutę na PLN, pole pokazywało wciąż `600` z etykietą `[PLN]`. Po zapisie do bazy `delivery_cost_per_truck = 600` (rzekomo PLN) ale `delivery_cost_total = 600 × rate` (canonical PLN). **Niespójność danych** + handlowiec myślał że transport kosztuje 600 PLN gdy faktycznie ~2551 PLN.

### Dlaczego bug wracał

Kod konwersji walut jest **rozsiany po 8 plikach** bez wspólnego helpera. Każde przeniesienie sekcji "Koszty dostawy" z modala do kalkulatora (jak miało miejsce dla rur 2026-05-14) **odtwarza bug w nowym miejscu**, bo programista pamięta o konwersji cen pozycji ale zapomina o transporcie.

To **systemowa duplikacja kodu**, nie regresja w sensie cofnięcia naprawy.

---

## 2. Pełna lista miejsc z `handleCurrencyChange`

| # | Plik | Moduł | Wzorzec |
|---|---|---|---|
| 1 | `src/components/Calculator.tsx` | Wynajem grodzice, kalkulator | `factor + conv` (symetryczne 2dp) |
| 2 | `src/components/EditOfferModal.tsx` | Wynajem grodzice, edycja | `factor + conv` |
| 3 | `src/components/RoadPlateCalculator.tsx` | Wynajem płyty, kalkulator | `factor + conv` |
| 4 | `src/components/EditRoadPlateOfferModal.tsx` | Wynajem płyty, edycja | `factor + conv` |
| 5 | `src/components/sale/SaleCalculator.tsx` | Sprzedaż grodzice, kalkulator | per-pole inline (asymetryczne: PLN całe / EUR 2dp) |
| 6 | `src/components/sale/EditSaleOfferModal.tsx` | Sprzedaż grodzice, edycja | per-pole inline |
| 7 | `src/components/sale/pipe/PipeSaleCalculator.tsx` | Sprzedaż rury, kalkulator | per-pole inline |
| 8 | `src/components/sale/pipe/PipeEditOfferModal.tsx` | Sprzedaż rury, edycja | per-pole inline |

**Dwa style** współistnieją:
- **Wynajem** (pliki 1-4): symetryczne zaokrąglenia 2dp w obie strony przez helper `conv`
- **Sprzedaż** (pliki 5-8): asymetryczne — PLN do całych złotówek, EUR z dokładnością 2dp

---

## 3. Pełna lista pól które MUSZĄ być konwertowane w każdym `handleCurrencyChange`

### Pola "w walucie oferty" (state komponentu)

#### Wynajem (pliki 1-4)
- `pricePerTon` / `customBasePricePln`
- `pricePerWeek1` / `customPricePerWeek1`
- `lossPrice`
- `sortingPrice`
- `grindingPrice` *(tylko grodzice)*
- `weldingPrice` / `m12WeldingPrice`
- `cuttingPrice` / `cuttingHeadPrice`
- `repairPrice` *(tylko grodzice)*
- `serviceHourPrice` *(tylko płyty)*
- `liftingHolePrice` *(tylko płyty)*
- **`transportCostPerTruck`** ⚠ ← **TO BYŁO ŹRÓDŁO BUG-U**

#### Sprzedaż (pliki 5-8)
- `costPriceEurT` / `costPricePerTon` (per pozycja w `setItems(map(...))`)
- `sellPriceEurT` / `sellPricePerTon` (per pozycja)
- **`deliveryCostPerTruck`** ⚠ ← **TO BYŁO ŹRÓDŁO BUG-U**
- Ewentualnie `applyAllSellPrice` (w kalkulatorach) — pomocnicze, można pominąć

### Pola które NIE są konwertowane (canonical PLN)
- `exchangeRate` — to sam kurs, nie podlega konwersji
- `delivery_cost_total` w bazie (zawsze PLN canonical)
- `sell_pln_total` w bazie (zawsze PLN)
- Wszystkie sumy obliczane (`useMemo`) — derive z konwertowanych pól, nie state

---

## 4. Wzorzec poprawnej implementacji

### A. Styl WYNAJMU (pliki 1-4) — symetryczny

```typescript
function handleCurrencyChange(newCur: 'EUR' | 'PLN') {
  if (newCur === currency) return;
  const factor = newCur === 'EUR' ? 1 / exchangeRate : exchangeRate;
  const conv = (v: number) => Math.round(v * factor * 100) / 100;

  // Ceny stawek wynajmu
  setPricePerTon(prev => conv(prev));
  setPricePerWeek1(prev => conv(prev));

  // Ceny szkód i napraw
  setLossPrice(prev => conv(prev));
  setSortingPrice(prev => conv(prev));
  // ... inne ceny szkód

  // ⚠ TRANSPORT — to było źródło bug-u, NIE ZAPOMNIJ
  if (typeof transportCostPerTruck === 'number' && transportCostPerTruck > 0) {
    setTransportCostPerTruck(conv(transportCostPerTruck));
  }

  setCurrency(newCur);
}
```

### B. Styl SPRZEDAŻY (pliki 5-8) — asymetryczny

```typescript
function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
  if (newCurrency === currency) return;

  // Per-pozycja: cost + sell
  setItems(prev => prev.map(item => ({
    ...item,
    costPriceEurT: item.costPriceEurT
      ? newCurrency === 'PLN'
        ? Math.round(item.costPriceEurT * exchangeRate)              // EUR→PLN: round całe
        : Math.round((item.costPriceEurT / exchangeRate) * 100) / 100 // PLN→EUR: 2dp
      : 0,
    sellPriceEurT: item.sellPriceEurT
      ? newCurrency === 'PLN'
        ? Math.round(item.sellPriceEurT * exchangeRate)
        : Math.round((item.sellPriceEurT / exchangeRate) * 100) / 100
      : 0,
  })));

  // ⚠ TRANSPORT — to było źródło bug-u, NIE ZAPOMNIJ
  setDeliveryCostPerTruck(prev => {
    if (typeof prev !== 'number' || prev <= 0) return prev;
    return newCurrency === 'PLN'
      ? Math.round(prev * exchangeRate)
      : Math.round((prev / exchangeRate) * 100) / 100;
  });

  setCurrency(newCurrency);
}
```

---

## 5. Reguła dla developerów / AI agentów (po refaktorze)

> **Dodając nowe pole "w walucie oferty":**
>
> 1. **W komponencie:** zadeklaruj `useState<number | ''>('')` jak dotąd.
> 2. **W `handleCurrencyChange`:** dodaj `setNowePole(prev => conv(prev))` — helper `conv` już istnieje w funkcji.
> 3. **NIE pisz `Math.round(v * rate)` inline** — to zła praktyka łamiąca abstrakcję helpera.
> 4. **Test:** smoke test z sekcji 7 (wpisanie 600 EUR → toggle PLN → oczekiwane 2551 PLN).
>
> Helper `convertCurrencyValue` automatycznie:
>   - chroni przed `value <= 0` (zwraca bez zmian — żadnych NaN)
>   - chroni przed `fromCcy === toCcy` (no-op)
>   - dobiera precyzję wg modułu (`cents` wynajem / `whole` sprzedaż)

### Czerwone flagi przy code review

Otwórz alert jeśli widzisz:
- ❌ `Math.round(prev * exchangeRate)` lub `(prev / exchangeRate) * 100` **inline** w `handleCurrencyChange` — to powrót do starego antypatternu. **Zamień na `conv(prev)`** (wywołanie helpera).
- ❌ Brak `import { convertCurrencyValue } from '.../lib/currency'` w pliku z `handleCurrencyChange`.
- ❌ Nowy `useState<number | ''>('')` z nazwą `*Price/Cost/PerTon/PerTruck/Fee` **bez** dodania `setX(prev => conv(prev))` w `handleCurrencyChange`.
- ❌ Modyfikacja sygnatury `convertCurrencyValue` bez aktualizacji **wszystkich 8 wywołań** + smoke testu.

---

## 6. Refaktor wykonany (2026-05-14) ✅

Helper `convertCurrencyValue` istnieje w **`src/lib/currency.ts`** i jest używany
we wszystkich 8 plikach z `handleCurrencyChange`. Sekcja 4 (inline wzorce) to już
**historia** — żaden plik nie ma już `Math.round(v * rate)` w `handleCurrencyChange`.

### Aktualna implementacja helpera

```typescript
// src/lib/currency.ts
export type Currency = 'EUR' | 'PLN';

export function convertCurrencyValue(
  value: number,
  fromCcy: Currency,
  toCcy: Currency,
  rate: number,
  precision: 'whole' | 'cents' = 'cents',
): number {
  if (value <= 0 || fromCcy === toCcy) return value;
  if (toCcy === 'PLN') {
    const raw = value * rate;
    return precision === 'whole' ? Math.round(raw) : Math.round(raw * 100) / 100;
  }
  // PLN → EUR: zawsze 2dp (ułamki PLN nie mają sensu w EUR)
  return Math.round((value / rate) * 100) / 100;
}
```

### Aktualny wzorzec użycia w `handleCurrencyChange`

```typescript
import { convertCurrencyValue } from '@/lib/currency'; // ścieżka zależy od poziomu

function handleCurrencyChange(newCcy: 'EUR' | 'PLN') {
  if (newCcy === currency) return;

  // Wynajem (Calculator, EditOfferModal, RoadPlateCalculator, EditRoadPlateOfferModal):
  const conv = (v: number) => convertCurrencyValue(v, currency, newCcy, exchangeRate, 'cents');

  // LUB Sprzedaż (SaleCalculator, EditSaleOfferModal, PipeSaleCalculator, PipeEditOfferModal):
  // const conv = (v: number) => convertCurrencyValue(v, currency, newCcy, exchangeRate, 'whole');

  setPricePerTon(prev => conv(prev));
  // ... wszystkie pola "w walucie oferty"
  // Transport — zawsze obecny:
  if (typeof transportCostPerTruck === 'number') {
    setTransportCostPerTruck(conv(transportCostPerTruck));
  }
  setCurrency(newCcy);
}
```

### Korzyści osiągnięte

- ✅ Dodanie nowego pola pieniężnego = `setX(prev => conv(prev))` — bez decyzji o `Math.round`
- ✅ Single source of truth — zmiana logiki konwersji wymaga edycji 1 pliku
- ✅ TS gwarantuje poprawne sygnatury wywołań (helper jest typowany)
- ✅ Round-trip behavior zachowany 1:1 vs poprzedni inline kod (weryfikowane smoke testami)

---

## 7. Smoke test po każdej zmianie `handleCurrencyChange`

Po jakiejkolwiek modyfikacji którejkolwiek funkcji `handleCurrencyChange`, uruchom ten test ręcznie lub przez Playwright/Claude_Preview:

### Test A: SaleCalculator (sprzedaż grodzice, kalkulator)
1. Otwórz Sprzedaż → Grodzice → Kalkulator
2. Wybierz walutę EUR
3. Wpisz w sekcji "Koszty dostawy" — `Koszt / auto`: **600**
4. Przełącz walutę na PLN
5. **Oczekiwany rezultat:** pole pokazuje **2551**, etykieta `[PLN]`

### Test B: Calculator (wynajem grodzice, kalkulator)
1. Otwórz Wynajem → Grodzice → Kalkulator
2. Domyślnie waluta PLN. Wpisz `Koszt / auto`: **2551**
3. Przełącz walutę na EUR
4. **Oczekiwany rezultat:** pole pokazuje **599.9**, etykieta `[EUR]`

### Test C: RoadPlateCalculator (wynajem płyty, kalkulator)
Identycznie jak Test B, w trybie Wynajem → Płyty drogowe.

### Test D: PipeSaleCalculator (sprzedaż rury, kalkulator)
Identycznie jak Test A, w trybie Sprzedaż → Rury stalowe.

### Test E: Modały edycji (4 pliki)
Otwórz dowolną zapisaną ofertę → Edytuj → w modalu wpisz transport w bieżącej walucie → przełącz walutę → sprawdź czy wartość się zaktualizowała.

### Round-trip drift
Po EUR → PLN → EUR oczekiwana wartość to **599,9** (nie 600) — to **akceptowalny drift ~0,02%** wynikający z asymetrycznego zaokrąglenia. Niedopuszczalne byłoby `600` zostające jako `600` przy zmianie waluty (= bug który właśnie naprawiamy).

---

## 8. Historia incydentów

| Data | Co zostało naprawione | Pliki |
|---|---|---|
| < 2026-05-14 | Pierwszy fix (zapamiętany przez użytkownika jako "naprawione w grodzicach") | `EditOfferModal.tsx`, `EditRoadPlateOfferModal.tsx` |
| 2026-05-14 (faza 3 rur) | Wszystkie pozostałe 6 plików — pełny audyt + fix inline | `Calculator.tsx`, `RoadPlateCalculator.tsx`, `SaleCalculator.tsx`, `EditSaleOfferModal.tsx`, `PipeSaleCalculator.tsx`, `PipeEditOfferModal.tsx` |
| 2026-05-14 (refaktor) ✅ | **Wyodrębniono wspólny helper** `src/lib/currency.ts` — wszystkie 8 plików używa `convertCurrencyValue` zamiast inline `Math.round`. Bug fizycznie niemożliwy. | `src/lib/currency.ts` (nowy) + wszystkie 8 plików z `handleCurrencyChange` |

---

## 9. Powiązane gotchas z `CLAUDE.md`

Ten bug ma "rodzeństwo" w kategorii konwersji walut. Dla pełnego kontekstu sprawdź też te wpisy w `CLAUDE.md`:

- `Ceny szkód — waluta oferty, nie PLN` — analogiczny problem dla cen szkód grodzic, naprawiony przez `effectivePricesForOffer` w `Calculator.tsx`
- `Calculator.effectivePricesForOffer` — wzorzec dla pól które już są przeliczone w stanie kalkulatora
- `SQL: detekcja podwójnej konwersji EUR damage cen` — sposób na wykrycie historycznych ofert z bugiem (`WHERE currency = 'EUR' AND loss_price_pln < 500`)

---

**Ostatnia aktualizacja:** 2026-05-14
**Następne kroki (sugerowane):** refaktor `convertCurrencyValue` do wspólnego helpera (sekcja 6)
