# Spec: sekcja „Zamki" w podmodule sprzedaży rur stalowych (SR)

**Data:** 2026-06-03
**Status:** zaakceptowany (design), gotowy do planu wdrożenia
**Moduł docelowy:** `src/components/sale/pipe/*`

---

## 1. Cel

Przeszczepić do podmodułu sprzedaży rur (SR) sekcję **zamków** identyczną z tą,
która działa w module sprzedaży grodzic — te same zasady, ta sama logika, ten sam
wygląd. Oferta rur ma móc zawierać pozycje zamków (łączniki), liczone i prezentowane
dokładnie tak jak w grodzicach: katalog + snapshot ceny/masy per oferta, masa łączna
(rury + zamki) napędzająca liczbę aut, blok zamków w PDF (PL/EN), pełna edycja i
kopiowanie.

## 2. Decyzje projektowe (zatwierdzone z użytkownikiem)

1. **Katalog współdzielony** — moduł rur używa istniejącej tabeli `sale_locks`
   (ten sam cennik co grodzice). NIE tworzymy `pipe_locks` ani osobnej zakładki
   cennika. Zamki edytuje się dalej w **Grodzice → Cennik → 🔗 Zamki**
   (`SaleLocksTable` w `SalePriceMatrix`). Sekcja rur tylko **czyta** katalog.
2. **Pełny zakres** — zapis nowych ofert + edycja istniejących + kopiowanie,
   wszystko z obsługą zamków.

### Uzasadnienie współdzielenia katalogu
Moduł rur jest celowo izolowany od grodzic (osobne tabele, osobna sekwencja `SR/`,
słowniki w `pipeConstants.ts`). Złamanie tej izolacji jest tu uzasadnione: katalog
zamków to z perspektywy rur **czysty słownik tylko-do-odczytu** (rury nigdy go nie
edytują), więc współdzielenie nie tworzy ryzykownego sprzężenia zapisu, a daje jedno
źródło prawdy dla cen. Combi-wall (rura + zamek) fizycznie używa tych samych zamków.

## 3. Anatomia sekcji zamków w grodzicach (źródło prawdy do skopiowania)

| Warstwa | Plik / obiekt | Rola |
|---|---|---|
| Katalog DB | `sale_locks` | `name`, `price_eur_mb`, `weight_kg_m`, `sort_order`, `active` |
| Pozycje DB | `sale_offer_lock_items` | FK→`sale_offers`, snapshot ceny/masy per oferta |
| Typy | `SaleLock`, `SaleOfferLockItem`; `SaleOffer.lock_items?[]` | model danych |
| Katalog UI | `SaleLocksTable` (w `SalePriceMatrix`, pod-zakładka `zamki`) | edycja inline cennika |
| Kalkulator | `SaleCalculator` | stan `lockItems`, `addLockItem/removeLockItem/updateLockItem`, `lockResults`, `lockTotals`, masa łączna, sekcja UI, `lockSnapshot` |
| Zapis | `SaveSaleOfferModal` | `LockSnapshot`, INSERT do `sale_offer_lock_items`, rollback |
| Edycja | `EditSaleOfferModal` | stan + saga UPDATE/DELETE/INSERT + kopiowanie |
| PDF | `SaleOfferPDF` + `pdfStrings` | blok zamków, klucze `thLock`/`lockTotalRow`/`lockSectionTitle`... ×PL/EN |

### Kluczowe niezmienniki logiki (z `CLAUDE.md` + lektury kodu)
- Cena zamka jest **zawsze w EUR** w stanie kalkulatora (`priceEurMb`, `sellPriceEurMb`);
  do PLN przeliczana **tylko w warstwie display** (`currency==='PLN' ? val*rate : val`).
  Dlatego — w odróżnieniu od cen grodzic/transportu — pól zamków NIE rusza
  `handleCurrencyChange`.
- `quantityMb = quantitySzt × lengthM`; `massT = quantityMb × weight_kg_m / 1000`.
- `total_eur = quantityMb × price_eur_mb`; `total_pln = total_eur × exchange_rate`;
  analogicznie `sell_*`.
- Pola liczbowe (`quantitySzt`, `lengthM`) = typ `number | ''`, koercja `Number(x)||0`,
  pusta/0 ⇒ czerwona obwódka + blokada zapisu (NIE cichy filtr pozycji).
- Masa łączna oferty = masa rur + masa zamków; to ona napędza liczbę aut/dostawę.
- PDF: `sheetVal (rury z transportem przy DAP) + lockTotal = totalForClient`
  — bloku zamków NIE dubluj w sumie rur.

## 4. Zakres zmian (wierny klon, 9 warstw)

### 4.1. Warstwa danych — 1 nowa tabela
Nowa migracja `docs/migrations/2026-06-03-pipe-sale-locks.sql`, w 100% addytywna,
wierne lustro `sale_offer_lock_items` (potwierdzony schemat z żywej bazy):

```sql
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
CREATE INDEX IF NOT EXISTS idx_pipe_lock_items_offer ON pipe_sale_offer_lock_items(offer_id);
```
Bez RLS (spójnie z resztą tabel `pipe_sale_*`; włączenie RLS to osobne zadanie
bezpieczeństwa). `ON DELETE CASCADE`: soft-delete oferty (`deleted_at`) NIE rusza
pozycji; twardy DELETE oferty kasuje pozycje kaskadowo.

### 4.2. Typy (`src/types/index.ts`)
- Nowy interfejs `PipeSaleOfferLockItem` — lustro `SaleOfferLockItem`.
- `PipeSaleOffer.lock_items?: PipeSaleOfferLockItem[]`.
- `SaleLock` — reużywany bez zmian.

### 4.3. Ładowanie (`PipeSaleSection.tsx`)
- Dodać do `loadData()` równoległe pobranie katalogu:
  `sale_locks` `.eq('active', true).order('sort_order')` → stan `locks: SaleLock[]`.
- Rozszerzyć query ofert o `lock_items:pipe_sale_offer_lock_items(*)`.
- Przekazać `locks` do `PipeSaleCalculator` (prop) oraz do `PipeOffersTable`
  (potrzebne w `PipeEditOfferModal` przy edycji/kopii).
- Ładowanie zamków odporne na brak tabeli (jak dziś `pipe_sale_offers`): gdy tabela
  jeszcze nie istnieje (przed migracją) — graceful degrade, sekcja zamków pusta.

### 4.4. Kalkulator (`PipeSaleCalculator.tsx`)
Przeszczep 1:1 z `SaleCalculator`:
- prop `locks: SaleLock[]`;
- interfejsy `PipeLockCalcItem` (= `SaleLockCalcItem`) i `LockItemResult`;
- stan `lockItems`, funkcje `addLockItem/removeLockItem/updateLockItem`
  (auto-cena z katalogu przy zmianie typu);
- memo `lockResults`, `lockTotals`;
- masa łączna = `pipeTotals.totalMassT + lockTotals.totalMassT` → liczba aut;
- totale w walucie = rury + zamki + dostawa;
- sekcja UI „🔗 Zamki" (te same kolumny, walidacja `number|''`, czerwone obwódki,
  przyciski „przywróć cenę z cennika");
- budowanie `lockSnapshot: LockSnapshot[]` i przekazanie do `PipeSaveOfferModal`.
- **Gatunek stali zamka** (informacyjny): dodać ładowanie `sale_steel_grades`
  do dropdownu zamka — wierny klon (zamek to grodzicowy łącznik, więc grodzicowe
  gatunki, nie rurowe normy/gatunki z `pipeConstants`).
- `canSave` rozszerzyć: zapis możliwy gdy są rury **lub** ważne zamki
  (`isValid || hasValidLocks`), brak pustych pozycji.

### 4.5. Zapis (`PipeSaveOfferModal.tsx`)
- Eksport/import `LockSnapshot` (reużyć z `SaveSaleOfferModal` lub zdefiniować lokalnie
  — patrz „Otwarte kwestie"), nowy prop `lockItems: LockSnapshot[]`.
- Sumy `total_sell_eur/pln` na ofercie = rury + zamki.
- INSERT do `pipe_sale_offer_lock_items` (mapowanie pól jak w grodzicach),
  z rollbackiem: błąd zapisu zamków ⇒ kasacja świeżej oferty.
- Podsumowanie zamków w podglądzie JSX modala.

### 4.6. PDF (`PipeOfferPDF.tsx` + `pdfStrings.ts`)
- Przenieść blok zamków z `SaleOfferPDF` (`<View wrap={false}>`, własny układ kolumn
  dla zamków, wiersz „Łącznie", sekcja masy).
- Do interfejsu `PipeSalePdfStrings` + obu obiektów `_pl`/`_en` dorzucić klucze zamków:
  `lockSectionTitle`, `thLock`, `thLockQtySzt`, `thLockMassT`, `lockTotalRow`,
  `lockMassRow` (+ ewentualne `thLockPriceMb`/`thLockQtyMb`/`thLockValue` zależnie od
  układu w `SaleOfferPDF`). PL: „Zamki/Zamek/Masa zamków"; EN: „Interlocks/Interlock/
  Interlock mass". **Uwaga na `replace_all`** przy identycznych stringach PL/EN —
  weryfikować `grep`, nie tylko zielony build.
- `sheetVal + lockTotal = totalForClient` (transport „w cenie" przy DAP — jak w SP).

### 4.7. Edycja + kopiowanie (`PipeEditOfferModal.tsx`)
- Prop `locks: SaleLock[]`; ładowanie `offer.lock_items` do stanu; ta sama sekcja UI
  zamków co w kalkulatorze.
- **Saga** (spójna z istniejącą sagą pozycji rur): UPDATE oferty →
  DELETE `pipe_sale_offer_lock_items WHERE offer_id` → INSERT nowych pozycji zamków.
- Tryb `mode='copy'`: pozycje zamków bez `offer_id`, wstrzyknięte przy INSERT kopii;
  rollback kopii = surowy `UPDATE pipe_sale_offers SET deleted_at=now()`.
- `offerPayload` (współdzielony update/copy) — sumy uwzględniają zamki.

### 4.8. Lista ofert (`PipeOffersTable.tsx`)
- Rozwijany wiersz pokazuje pozycje zamków (jak `SaleOffersTable`).
- Handler kopii uwzględnia `lock_items`; po zapisie kopii **prepend** nowej oferty
  (`[nowa, ...offers]`).
- Przekazać `locks` do `PipeEditOfferModal` (edycja i kopia).

## 5. Poza zakresem (YAGNI / non-goals)
- ❌ Brak `pipe_locks` i osobnej zakładki cennika w sekcji rur.
- ❌ Brak zmian w module grodzic, płyt drogowych, wynajmu.
- ❌ Brak włączania RLS (osobne zadanie bezpieczeństwa).
- ❌ Brak nowych typów zamków / zmian w katalogu `sale_locks`.

## 6. Ryzyka i pułapki (z `CLAUDE.md`)
- **`replace_all` na identycznych stringach PL/EN** w `pdfStrings.ts` — łatwo wstawić
  zły język; `tsc` tego nie wykryje. Weryfikacja `grep` na wartościach.
- **Konwersja walut** — pola zamków zostają w EUR; nie dodawać ich do
  `handleCurrencyChange` (inaczej double-conversion). Display przelicza do PLN.
- **Sekwencje numerów** — saga edycji nie dotyczy numeracji; numery `SR/` bez zmian.
- **Saga vs RPC** — moduł rur używa sagi DELETE→INSERT (gorsza odporność na błędy niż
  atomic RPC, ale spójna z istniejącym `PipeEditOfferModal`). Komunikat błędu między
  DELETE a INSERT: „stare pozycje usunięte — otwórz edycję ponownie".
- **`number | ''`** — koercja `Number(x)||0`; pusta pozycja blokuje zapis (czerwona
  obwódka), nie znika po cichu.

## 7. Otwarte kwestie do rozstrzygnięcia w planie
1. **Źródło `LockSnapshot`**: import z `SaveSaleOfferModal` (cross-module) czy lokalna
   kopia interfejsu w module rur (spójniej z izolacją)? Rekomendacja: lokalna kopia
   w `PipeSaveOfferModal` (re-eksport), by nie wiązać modułu rur z plikiem grodzic.
2. **Gatunki stali zamka**: potwierdzić, że dropdown ma używać `sale_steel_grades`
   (grodzicowe), nie pipe-owych norm.

## 8. Weryfikacja (Definition of Done)
- `npm run build` zielony (strict tsc — audyt koercji `number|''`).
- Smoke test walutowy: zamek 100 EUR/mb, toggle EUR↔PLN — wartości spójne, brak
  double-conversion.
- Render PDF PL **i** EN z ofertą rura + zamek: `sheetVal + lockTotal = total`;
  `grep` potwierdza poprawne stringi EN („Interlocks").
- Pełny cykl: zapis SR z zamkiem → edycja (zmiana typu zamka, ilości) → kopia
  (numer `SR/` nadany, status `szkic`) → soft-delete.
- Lista ofert: rozwinięcie wiersza pokazuje pozycje zamków.
