# Podmoduł „Dwuteowniki HEB" — Wynajem (design + plan)

**Data:** 2026-07-07
**Autor:** Claude Code (brainstorming z użytkownikiem)
**Status:** do akceptacji przed implementacją

---

## 1. Cel

Nowy podmoduł w trybie **Wynajem**: kalkulacja wynajmu **dwuteowników** (HEB, HEA, IPE).
Wzorowany 1:1 na wynajmie grodzic — **ta sama liczba zakładek, ten sam układ kalkulatora,
pełna funkcjonalność** (edycja, kopiowanie, PDF PL/EN, transport/Incoterms, cennik szkód,
toggle waluty EUR/PLN, soft-delete ofert).

Źródła danych:
- `Kopia pliku kształtowniki.xlsx` — profile i wzór obliczeń
- `Sales Order IBV260140 - WITEK s.r.o..pdf` — ceny, cennik szkód, warunki zamówienia

## 2. Decyzje (zatwierdzone)

| # | Decyzja | Wybór |
|---|---------|-------|
| 1 | Architektura | **Osobne tabele + komponenty** (moduł w pełni niezależny, nie dotyka istniejącego kodu). Wzorzec: sprzedaż rur/płyt. |
| 2 | Zakres profili | **Wszystkie dwuteowniki** — HEB, HEA, IPE (start: HEB300, HEB200, HEA340, HEA140, IPE300) |
| 3 | Model czynszu | **`koszt = masa[t] × cena[/t]`**; podstawowy okres (mies.) i stawka za dodatkowy tydzień = pola **informacyjne** w warunkach PDF |
| 4 | Numeracja | **`OH/YYYY/NNN`** (trigger DB, własna tabela sekwencji) |
| 5 | Układ kalkulatora | **1:1 jak grodzice** — pełny zestaw sekcji i funkcji, nic nie okrajamy |
| 6 | Metryka m² | Ukrywamy **tylko** 2 kolumny („powierzchnia ściany m²", „koszt/m²") — belki nie tworzą ściany. Zostaje „koszt/t". Reszta układu 1:1 |

## 3. Wzór obliczeń

```
masa [t]   = ilość[szt] × długość[m] × kg/m ÷ 1000
wartość    = masa[t] × cena[/t]
```

Identyczny z masą grodzic (`totalLength × weight_kg_per_m ÷ 1000`). **Brak** powierzchni ściany.
Profil opisany przez `weight_kg_per_m` (sterownik masy) + wymiary informacyjne.

## 4. Reguły biznesowe (z PDF WITEK)

- Podstawowy okres dzierżawy: **3 miesiące** (zmienny per oferta)
- Każdy dodatkowy tydzień: **9 EUR/t** (informacyjnie)
- Załadunek/rozładunek po stronie Najemcy; ceny netto; zwrot wg **EN10248-1/2**
- **Cennik szkód (6 pozycji):**
  - Zagubienie / całkowita strata — **910 €/t**
  - Sortowanie + czyszczenie — **30 €/t**
  - Spawanie (zamykanie) otworów — **60 €/szt**
  - Głowica tnąca (cięcie uszkodzenia) — **25 €/cięcie**
  - Naprawa / prostowanie — **59 €/mb**
  - Nowy otwór do podnoszenia — **6 €/szt**
- Transport: DAP, Incoterms 2020 (mechanizm już w aplikacji)

> Seedy cen szkód w migracji są **placeholderami PLN** (przeliczone z EUR wg kursu ref.);
> ostateczne wartości ustawia użytkownik w zakładce „Ustawienia cen".

## 5. Architektura i izolacja

W pełni niezależny moduł. **Nie modyfikuje żadnej istniejącej tabeli ani komponentu.**
Zmiany we wspólnym kodzie są **czysto addytywne**:

- **Nowy folder:** `src/components/beam/` (8 plików)
- **`App.tsx`:** dodanie sub-modu `rentalSubMode: 'sheet_pile' | 'road_plate' | 'beam'`,
  przycisku „Dwuteowniki" w sub-toggle wynajmu, gałęzi renderującej `<BeamRentalSection>`,
  stanu `beamRentalActiveTab` / `beamRentalOffersCount`, tablicy `beamTabs[]` (5. discriminated union)
  — **istniejące ścieżki nietknięte**
- **`types/index.ts`:** nowe interfejsy (dopisane)
- **`lib/pdfStrings.ts`:** nowy interfejs `BeamRentalPdfStrings` + `_pl`/`_en` (istniejące 5 bez zmian)
- **Reuse bez edycji:** `ClientsTable`, `ClientSearchInput`, `CountryOptions`, `SALES_REPS`,
  `convertCurrencyValue`, `nbp.ts`, `supabase.ts`, formatery z `calculations.ts`

## 6. Schemat bazy (migracja `docs/migrations/2026-07-07-beam-rental.sql`)

### `beam_profiles` (katalog)
`id`, `name` (unique), `series` CHECK IN ('HEB','HEA','IPE'), `weight_kg_per_m`,
`height_mm`?, `width_mm`? (informacyjne), `active` default true, `created_at`, `updated_at`.

Seed: HEB300/HEB/120, HEB200/HEB/61.27, HEA340/HEA/108, HEA140/HEA/24.7, IPE300/IPE/42.19.

### `beam_rental_prices` (1 wiersz)
`id`, `rent_price_per_ton_pln`, `base_period_months` default 3, `extra_week_price_per_ton_pln`,
6× cennik szkód (`loss_price_pln`, `sorting_price_pln`, `welding_price_pln`, `cutting_price_pln`,
`repair_price_pln`, `lifting_hole_price_pln`), `note`, `updated_at`. Seed: 1 wiersz z placeholderami.

### `beam_rental_offers` (nagłówek)
Wzorzec `road_plate_sale_offers`, ale rental (bez cost/sell/margin):
`id`, `offer_number` (OH/YYYY/NNN), `year`, `sequence`, `client_id`, `task_name`,
`status` CHECK, `notes`, `valid_days`, `payment_days`, `prepared_by`,
`currency` CHECK ('EUR','PLN'), `exchange_rate`,
`base_period_months`, `extra_week_price_per_ton` (snapshot w walucie oferty),
`total_mass_t`, `rental_cost_total`, `rental_cost_eur`, `rental_cost_pln`,
snapshot szkód (6 kolumn, w walucie oferty — konwencja jak grodzice),
transport: `delivery_trucks`, `delivery_cost_per_truck`, `delivery_cost_total`,
`delivery_paid_by` CHECK ('dap_included','dap_extra','fca','cif'), `delivery_from`, `delivery_to`,
`delivery_terms` CHECK ('DAP','DAP_EXTRA','FCA','CIF'), `fca_location`,
`created_at`, `updated_at`, `deleted_at` (soft-delete).

### `beam_rental_offer_items` (pozycje)
`id`, `offer_id` FK ON DELETE CASCADE, `profile_id` FK ON DELETE SET NULL,
`profile_name`+`series`+`weight_kg_per_m` (snapshot), `steel_grade`,
`quantity_pcs`, `length_m`, `total_length_m`, `mass_t`,
`price_per_ton` (waluta oferty), `value_total`, `value_eur`, `value_pln`,
`sort_order`, `created_at`.

### `beam_offer_sequences` + trigger
`year` PK, `last_sequence`. Trigger `generate_beam_offer_number()` BEFORE INSERT,
`SECURITY DEFINER`, `SET search_path = public, pg_temp`, `timezone('Europe/Warsaw', NOW())`,
format `OH/YYYY/NNN`.

### Typy TS + gatunki stali
`BEAM_STEEL_GRADES = ['S235','S275','S355'] as const` w `types/index.ts` (bez tabeli DB).
Nowe interfejsy: `BeamProfile`, `BeamRentalPrices`, `BeamRentalOffer`, `BeamRentalOfferItem`.

## 7. Komponenty (`src/components/beam/`)

| Plik | Klonuje | Adaptacja |
|------|---------|-----------|
| `BeamRentalSection.tsx` | wzorzec `RoadPlateSaleSection` (controlled, self-load) | 5 zakładek, własne ładowanie profili/cennika/ofert |
| `BeamCalculator.tsx` | `Calculator.tsx` (1:1 układ) | `kg/m` zamiast width; ukryte 2 kolumny m²; pole okresu + stawka/tydzień info |
| `BeamProfilesTable.tsx` | `ProfileTable.tsx` | kolumny: profil, seria, kg/m, wymiary; edycja inline |
| `BeamPriceSettings.tsx` | `PriceSettings.tsx` | cena/t + 6 szkód + okres/tydzień |
| `BeamOffersTable.tsx` | `OffersTable.tsx` | rozwijane wiersze, PDF, edycja, kopia, soft-delete |
| `BeamSaveOfferModal.tsx` | `SaveOfferModal.tsx` | transport/Incoterms, gatunek per-pozycja |
| `BeamEditOfferModal.tsx` | `EditOfferModal.tsx` | `mode: 'edit'\|'copy'`, saga UPDATE→DELETE→INSERT |
| `BeamOfferPDF.tsx` | `OfferPDF.tsx` | kolumny belek, warunki: 3 mies., +tydzień 9 €/t, EN10248-1/2, 6 szkód, transport |

## 8. Waluty i konwersja

Pełny toggle EUR/PLN jak grodzice. **Reuse `convertCurrencyValue` z `lib/currency.ts`**
+ wzorzec `convDmg` dla cen szkód (pełne kwoty EUR, `Math.round`). Ceny szkód w ofercie
zapisywane w **walucie oferty** (konwencja z CLAUDE.md — bez double-conversion).

## 9. Plan implementacji (kolejność kompilująca się krok po kroku)

Każda faza = osobny commit po zatwierdzeniu.

1. **DB:** migracja SQL (5 obiektów + trigger + seed profili + seed cennika). Weryfikacja: `SELECT` na tabelach, test triggera OH.
2. **Typy:** interfejsy + `BEAM_STEEL_GRADES`.
3. **pdfStrings:** `BeamRentalPdfStrings` (`_pl` + `_en`).
4. **PDF:** `BeamOfferPDF.tsx`.
5. **Komponenty (kolejność):** `BeamProfilesTable` → `BeamPriceSettings` → `BeamCalculator` → `BeamSaveOfferModal` → `BeamOffersTable` → `BeamEditOfferModal`.
6. **Section + App.tsx:** `BeamRentalSection` + wpięcie sub-modu (addytywnie).
7. **Weryfikacja końcowa:** `npm run build` (strict tsc); smoke test konwersji walut (600 EUR transport → toggle PLN); render PDF w Node (harness jak commit `9d1c08b`) — sprawdzić warunki, cennik szkód, transport.

## 10. Poza zakresem (YAGNI)

- **Sprzedaż dwuteowników** — na razie tylko wynajem (można dodać później osobnym modułem, jak sprzedaż rur/płyt).
- Osobny słownik gatunków stali w DB — hardkodowana krotka wystarcza.
- Historia zmian cennika (`beam_price_history`) — opcjonalnie w przyszłości; start bez niej (grodzice mają, ale to nie blokuje MVP).

## 11. Weryfikacja izolacji (Definition of Done dla „nie dotyka niczego")

- Istniejące tabele DB: **bez zmian** (tylko `CREATE TABLE`/`CREATE FUNCTION` dla `beam_*`).
- Istniejące komponenty: **bez edycji** (poza addytywnymi zmianami w `App.tsx`, `types/index.ts`, `pdfStrings.ts`).
- `npm run build` zielony; moduły grodzic/płyt/rur działają identycznie jak przed zmianą.
