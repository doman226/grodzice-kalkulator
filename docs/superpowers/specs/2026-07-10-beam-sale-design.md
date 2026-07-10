# Moduł „Dwuteowniki" — Sprzedaż (SH) — design

Data: 2026-07-10
Status: zatwierdzony przez użytkownika (rozmowa 2026-07-10)
Poprzednik: `2026-07-07-dwuteowniki-heb-wynajem-design.md` (wynajem OH — źródło logiki obliczeń)

## 1. Cel

Moduł sprzedaży dwuteowników HEB/HEA/IPE — czwarty pod-moduł trybu SPRZEDAŻ
(obok grodzic SP, rur SR i płyt drogowych SPP). Zasady liczenia masy identyczne
jak w wynajmie dwuteowników (OH); warstwa handlowa (koszt / sprzedaż / marża,
dostawa, oferta PDF) identyczna jak w pozostałych modułach sprzedażowych.

## 2. Decyzje (zatwierdzone)

| Temat | Decyzja |
|---|---|
| Prefiks numeracji | **SH/YYYY/NNN** — osobna sekwencja `beam_sale_sequences`, trigger DB |
| Domyślna cena sprzedaży | **3800 PLN/t** — seed w tabeli `beam_sale_prices` (1 wiersz), edytowalna w zakładce „Cennik" |
| Domyślna cena kosztu | pole `default_cost_price_per_ton_pln` w tej samej tabeli (seed 0 = brak pre-fill), edytowalna w UI |
| Warunki techniczne PDF | 5 punktów (norma EN 10034 → gatunek → tolerancja −50/+50 mm → certyfikat 3.1/EN10204 → fakturowanie wg wagi teoretycznej) |
| Domyślna waluta kalkulatora | **PLN** (przełącznik EUR z kursem NBP jak wszędzie) |
| Katalog profili | **wspólny `beam_profiles`** z wynajmem OH (wzorzec SPP ↔ road_plate_profiles); moduł sprzedaży tylko czyta |
| Gatunki stali | `BEAM_STEEL_GRADES` z `types/index.ts` (S235, S275, S355, min. S235, min. S275, min. S355) — te same co wynajem |
| Dwuteowniki używane | checkbox jak w SP (bursztynowy kafelek) → flaga `is_used` → skrócona sekcja techniczna w PDF |
| Architektura | izolowany klon w `src/components/sale/beam/` — podejście A (odrzucone: parametryzacja BeamCalculator, wspólne tabele z flagą typu) |

## 3. Wzór obliczeń

```
masa pozycji [t]  = szt × długość[m] × weight_kg_per_m / 1000
                    (zaokrąglona do 3dp PRZED mnożeniem przez cenę — gotcha massT)
koszt pozycji     = masa × cena_kosztu/t      (w walucie oferty)
wartość pozycji   = masa × cena_sprzedaży/t   (w walucie oferty)
marża %           = (sprzedaż − koszt) / sprzedaż × 100  (badge kolorowy jak SP)
auta              = ceil(masa_łączna / 24.5 t)
```

Bez powierzchni ścianki i ceny/m² — belki nie tworzą ściany (jak PDF wynajmu OH).
Przy `dap_included` transport wliczany w kwotę pozycji na PDF
(`sheetVal = totalSell + deliveryCost` — wzorzec SP) oraz w `effectivePerTon`.

## 4. Architektura i izolacja

- 100% addytywnie: żadnych ALTER na istniejących tabelach, żadnych zmian
  w komponentach innych modułów poza `App.tsx` (nawigacja) i `pdfStrings.ts`
  (nowy interfejs + 2 obiekty).
- Wspólne zasoby (tylko odczyt lub istniejące wzorce): `beam_profiles`,
  `clients`, `ClientSearchInput`, `ClientsTable`, `convertCurrencyValue`,
  `fetchNBPRate`, `SALES_REPS`, formatery z `calculations.ts`.
- Edycja ofert: **saga** UPDATE → DELETE items → INSERT items (wzorzec SR/SPP;
  bez atomic RPC). Soft-delete: surowy `UPDATE deleted_at = now()`.
- Kopiowanie ofert: wspólny pattern `mode?: 'edit' | 'copy'` (commit `1997b9a` SP).

## 5. Schemat bazy — migracja `docs/migrations/2026-07-10-beam-sale.sql`

### `beam_sale_sequences`
`year INTEGER PK`, `last_sequence INTEGER NOT NULL DEFAULT 0`, `updated_at` —
izolowana od wszystkich pozostałych sekwencji.

### `beam_sale_prices` (1 wiersz)
| Kolumna | Typ | Seed |
|---|---|---|
| `id` | UUID PK | — |
| `default_sell_price_per_ton_pln` | NUMERIC NOT NULL DEFAULT 0 | **3800** |
| `default_cost_price_per_ton_pln` | NUMERIC NOT NULL DEFAULT 0 | 0 |
| `note` | TEXT | opis |
| `updated_at` | TIMESTAMPTZ | NOW() |

Ceny kanoniczne w PLN; kalkulator konwertuje do EUR przy przełączeniu waluty.

### `beam_sale_offers` (nagłówek)
Klon `beam_rental_offers` minus pola wynajmu (rental_weeks, display_unit,
extra_week, ceny szkód), plus pola handlowe sprzedaży (wzorzec `road_plate_sale_offers`):

- numeracja: `offer_number TEXT UNIQUE DEFAULT ''`, `year`, `sequence` — trigger BEFORE INSERT
- klient/meta: `client_id FK clients ON DELETE SET NULL`, `task_name`, **`is_used BOOLEAN NOT NULL DEFAULT FALSE`**, `status` CHECK (szkic/wysłana/przyjęta/odrzucona), `notes`, `valid_days INT DEFAULT 14`, `payment_days INT DEFAULT 14`, `prepared_by`
- waluta: `currency` CHECK (EUR/PLN) DEFAULT 'PLN', `exchange_rate NUMERIC`
- sumy snapshot: `total_mass_t`, `total_cost_eur`, `total_sell_eur`, `total_sell_pln`, `margin_pct`
- dostawa (koszt): `delivery_trucks`, `delivery_cost_per_truck`, `delivery_cost_total`, `delivery_paid_by` CHECK (dap_included/dap_extra/fca/cif), `delivery_from`, `delivery_to`
- warunki oferty: `delivery_timeline` CHECK (huta/magazyn), `campaign_weeks`, `campaign_delivery_weeks`, `warehouse_delivery_time`, `delivery_terms` CHECK (DAP/DAP_EXTRA/FCA/CIF), `fca_location`
- audit: `created_at`, `updated_at` (trigger touch), `deleted_at` (soft-delete)
- indeksy: deleted_at, created_at DESC, client_id, (year, sequence)

### `beam_sale_offer_items` (pozycje)
| Kolumna | Uwagi |
|---|---|
| `id` UUID PK, `offer_id` FK → beam_sale_offers ON DELETE CASCADE | |
| `profile_id` FK → beam_profiles ON DELETE SET NULL | historia przeżywa usunięcie profilu |
| `profile_name`, `series`, `weight_kg_per_m` | snapshot atrybutów profilu |
| `steel_grade` | CHECK IN (6 wartości `BEAM_STEEL_GRADES`) |
| `quantity_pcs` INT > 0, `length_m` > 0, `total_length_m` > 0, `mass_t` > 0 | |
| `cost_per_ton`, `sell_per_ton` | **w walucie oferty** (konwencja cost_eur_t/sell_eur_t z SP — mimo nazwy) |
| `cost_total`, `sell_total` | w walucie oferty |
| `sell_value_eur`, `sell_value_pln` | denominacje zawsze wyliczone (wzorzec value_eur/value_pln z OH) |
| `margin_pct` | snapshot |
| `sort_order` INT DEFAULT 0, `created_at` | |

### Trigger `generate_beam_sale_offer_number()`
Klon `generate_beam_offer_number`: `SECURITY DEFINER`, `SET search_path = public, pg_temp`,
`timezone('Europe/Warsaw', NOW())`, UPSERT na `beam_sale_sequences`, format
`'SH/' || year || '/' || LPAD(seq, 3, '0')`. Plus trigger touch `updated_at`
(reuse istniejącej funkcji `touch_beam_updated_at`).

RLS celowo wyłączony (konwencja wszystkich tabel ofert w projekcie).

## 6. Typy TS (`src/types/index.ts`)

- `BeamSalePrices` — odbicie tabeli 1-wierszowej
- `BeamSaleOffer` — nagłówek (wzorzec `RoadPlateSaleOffer` + `is_used` z `SaleOffer`)
- `BeamSaleOfferItem` — pozycja
- Reuse: `BeamProfile`, `BEAM_STEEL_GRADES`, `BeamSteelGrade`, `Client`, `OfferStatus`

## 7. Komponenty — `src/components/sale/beam/`

| Plik | Wzorzec | Różnice |
|---|---|---|
| `BeamSaleSection.tsx` | `RoadPlateSaleSection` | 4 zakładki: calculator / offers / clients / **prices**; self-load: beam_profiles (shared, `eq('active', true)`), beam_sale_prices (single), beam_sale_offers (`is('deleted_at', null)`); typ `BeamSaleTab` eksportowany |
| `BeamSaleCalculator.tsx` | `SaleCalculator` + pozycje z `BeamCalculator` | pozycja = profil (select z beam_profiles, `name (series)` + kg/m) + gatunek (BEAM_STEEL_GRADES) + ilość szt + długość m + masa; ceny kosztu/sprzedaży pre-fill z `beam_sale_prices` (w walucie widoku); „Zastosuj cenę do wszystkich"; marża badge (`marginColor`/`marginLabel`); waluta start PLN; dostawa 4 kafelki (dap_included/dap_extra/fca/cif) — pola kosztów ukryte dla FCA/CIF; kafelek bursztynowy „Dwuteowniki używane" (`isUsed`); `taskName`; walidacja `number | ''` + twarda blokada zapisu |
| `BeamSaveSaleOfferModal.tsx` | `SaveSaleOfferModal` | bez zamków; INSERT beam_sale_offers → INSERT beam_sale_offer_items; rollback = `UPDATE deleted_at`; blok „Transport (przeniesiony z kalkulatora)" + FCA pre-fill `fcaLocation` z `delivery.from`; radio Incoterms wyprowadzone z `paidBy`; blok terminu dostawy (huta/magazyn + terminy) |
| `BeamSaleOffersTable.tsx` | `SaleOffersTable` | expandable rows, badge statusu, PDF PL/EN (PDFDownloadLink), Edytuj + **Kopiuj** (prepend) + soft-delete |
| `BeamSaleEditOfferModal.tsx` | `RoadPlateEditOfferModal` | saga UPDATE → DELETE → INSERT; `mode?: 'edit' \| 'copy'`; wspólny `offerPayload`; kopia = INSERT z `offer_number: ''`, `status: 'szkic'`, `deleted_at: null` |
| `BeamSalePriceSettings.tsx` | `BeamPriceSettings` (uproszczony) | 2 pola: domyślna cena sprzedaży / kosztu PLN/t + zapis UPDATE |
| `BeamSaleOfferPDF.tsx` | `BeamOfferPDF` (geometria, 7 kolumn) + bloki handlowe z `SaleOfferPDF` | patrz §8 |

## 8. PDF — `BeamSaleOfferPDF.tsx` + `pdfStrings.ts`

- Nowy interfejs **`BeamSalePdfStrings`** + `beamSalePdfStrings_pl` + `beamSalePdfStrings_en`
  (7. interfejs w pliku; każde pole w OBU obiektach — wymusza TS).
- Tabela **7 kolumn**: Profil | Gatunek | Ilość [szt.] | Długość [m] | Masa [t] | Cena [waluta/t] | Wartość [waluta]
  (bez pow. ścianki / ceny/m²). UWAGA: inny zestaw kolumn niż rental `BeamOfferPDF`
  mimo tej samej liczby 7 — rental ma kg/m i nie ma wartości per pozycja; nie kopiować 1:1.
- Free-text PL→EN: `delivery_from`/`delivery_to` owijać `translateWarehouseLocation(value, lang)`,
  `warehouse_delivery_time` owijać `translateWarehouseDeliveryTime(value, lang)`
  (gotcha z CLAUDE.md — surowe polskie snapshoty w angielskim PDF).
- Warunki techniczne (nowe, zamówione przez użytkownika):
  ```
  - produkowane i dostarczane zgodnie z normą EN 10034.
  - gatunek stali zgodny z ofertą.
  - tolerancja długości -50/+50 mm.
  - certyfikat 3.1 zgodnie z normą EN10204.
  - fakturowanie wg. wagi teoretycznej.
  ```
  EN: `- produced and supplied in accordance with EN 10034.` /
  `- steel grade as stated in this quotation.` / `- length tolerance -50/+50 mm.` /
  `- mill certificate 3.1 in accordance with EN 10204.` /
  `- invoicing based on theoretical weight.`
- Wariant `is_used` (jak SP, commit `011b0b0`): nagłówek bold „Dwuteowniki używane:",
  tolerancja, fakturowanie, dopisek `techUsedNote` — bez normy i certyfikatu.
  Pełne brzmienie (mechaniczna adaptacja stringów SP):
  - PL: „Dwuteowniki używane mogą posiadać ślady użytkowania, w tym zabrudzenia,
    przylegającą ziemię, rdzę, pozostałości powłok ochronnych, otwory technologiczne,
    ślady spawania i cięcia oraz uszkodzenia mechaniczne i odchyłki wymiarowe
    wynikające z eksploatacji."
  - EN: „Used steel beams may show signs of use, including dirt, adhering soil, rust,
    residues of protective coatings, technological holes, welding and cutting marks,
    as well as mechanical damage and dimensional deviations resulting from operation."
- Blok „Dane klienta" 1:1 z pozostałymi PDF (`s.metaRight`, `{offer.client ? … : '—'}`),
  etykieta `customerLabel: 'Klient:'` (konwencja rur/płyt-sprzedaż).
- Sekcja transportu w `<View wrap={false}>`; `dap_included` = transport wliczony
  w wartość pozycji (bez osobnej linii); `dap_extra` = linia refaktury; FCA/CIF = etykieta.
- Geometria strony jak `BeamOfferPDF`: `paddingTop: 108`, `paddingBottom: 130`,
  fonty Roboto, logo header/footer, podpisy handlowców z `/signatures/` (encodeURIComponent).

## 9. Nawigacja — `App.tsx`

- `SaleSubMode` = `'sheet_pile' | 'pipe' | 'road_plate' | 'beam'`
- Nowe stany: `beamSaleActiveTab` (typ `BeamSaleTab` importowany z sekcji), `beamSaleOffersCount`
- `beamSaleTabs`: Kalkulator / **Oferty SH** (badge) / Klienci (badge) / Cennik
- Przycisk „Dwuteowniki" w sub-toggle sprzedaży (4. pozycja)
- Nagłówek: „Kalkulator Sprzedaży Dwuteowników"
- Rozszerzenie `currentTabs` / `currentActiveTab` / `onClick` nawigacji / render w main

## 10. Waluty i konwersja

- Helper `convertCurrencyValue` z `src/lib/currency.ts`, precision **'whole'**
  (konwencja sprzedaży: PLN całe, EUR 2dp) — NIGDY inline `Math.round(v * rate)`.
- `handleCurrencyChange` konwertuje: `costPerTon`, `sellPerTon` per pozycja,
  `applyAllSellPrice`, `deliveryCostPerTruck`.
- Pre-fill z cennika: `default_*_price_per_ton_pln` → przy walucie EUR przeliczane
  kursem (wzorzec `lookupCostInCurrency` z SP).
- Smoke test: 600 EUR transport → toggle PLN → 2551 PLN.

## 11. Poza zakresem (YAGNI)

- Zamki (koncept grodzic), powierzchnia ścianki, cena/m²
- Zakładka Profile w sprzedaży (wspólny katalog — CRUD w Wynajem → Dwuteowniki → Profile)
- Cennik szkód, okres dzierżawy, stawka tygodniowa (koncepty wynajmu)
- Magazyn per pozycja (lokalizacja tylko w sekcji dostawy — pole tekstowe jak SP)
- Cennik per profil × gatunek (jedna domyślna stawka wystarcza)
- Atomic RPC edycji (saga wystarcza — zgodnie z trade-off w CLAUDE.md dla modułów sprzedaży)
- RLS (osobne zadanie bezpieczeństwa dla wszystkich tabel naraz)

## 12. Weryfikacja (Definition of Done)

1. `npm run build` zielony (strict tsc) po każdym kroku łańcucha.
2. Migracja przechodzi na Supabase; smoke test numeracji SH w transakcji z ROLLBACK
   (nie zużywa numerów — zasada użytkownika).
3. Przepływ w przeglądarce: kalkulator (pre-fill 3800) → zapis SH/2026/001 → lista
   → edycja → kopia → PDF PL i EN (warunki techniczne + wariant używane).
4. Smoke test walutowy: 600 EUR → toggle PLN → 2551.
5. Moduły OF/OP/OH/SP/SR/SPP działają bez zmian (izolacja — żadnych ALTER,
   żadnych edycji ich komponentów).
