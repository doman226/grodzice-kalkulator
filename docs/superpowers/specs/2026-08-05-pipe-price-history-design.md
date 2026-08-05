# Historia cen rur — wyszukiwanie po parametrach (moduł SR)

**Data:** 2026-08-05
**Status:** zaakceptowany projekt (przed planem implementacji)

## Cel

Umożliwić handlowcowi sprawdzenie, **po ile sprzedawaliśmy rurę o danych
parametrach** w poprzednich ofertach. Wpisuje średnicę (opcjonalnie zawęża
gatunkiem i ścianką) i dostaje płaską listę wycenionych pozycji z historii —
cena/t, masa, numer oferty, klient, data, status — plus podsumowanie
(liczba pozycji, średnia cena, zakres).

Zakres: **wyłącznie moduł sprzedaży rur (SR)**. Pozostałe moduły bez zmian.

## Kontekst i fakty upraszczające

- `PipeSaleSection` ładuje oferty **z pozycjami**:
  `.select('*, client:clients(*), items:pipe_sale_offer_items(*), lock_items:…')`
  z filtrem `.is('deleted_at', null)` i sortowaniem `created_at desc`.
  → **Komplet danych jest już w pamięci przeglądarki**: żadnego nowego
  zapytania, żadnej migracji, soft-delete już wykluczony.
- `PipeOffersTable` ma dziś filtr tekstowy po `offer_number` i `client.name`
  (linie ~120-127). Nowa funkcja go **nie zmienia** — działa obok.
- Ceny pozycji (`sell_price_per_ton`) są **w walucie oferty** (`offer.currency`),
  nie zawsze w EUR. Porównywanie wymaga normalizacji kursem `offer.exchange_rate`.

## Decyzje projektowe (uzgodnione z użytkownikiem)

| Decyzja | Wybór |
|---|---|
| Jednostka wyniku | **Pozycja** (jeden wiersz = jedna wyceniona rura), nie oferta |
| Parametry filtrowania | Średnica (główny) + gatunek + grubość ścianki |
| Dopasowanie średnicy | Dokładne; przełącznik **±10%** rozszerza zakres |
| Zakres ofert | Wszystkie nieusunięte, **ze statusem widocznym w wierszu** |
| Waluta | Przełącznik EUR/PLN — wszystko przeliczone do jednej; znacznik waluty źródłowej |
| Umiejscowienie | **Panel rozwijany** nad listą ofert w zakładce „Oferty SR" |
| Podsumowanie | Pasek: liczba pozycji, średnia cena/t, zakres min–max |
| Źródło danych | Filtrowanie po stronie przeglądarki (dane już załadowane) |

## Model danych — spłaszczenie

Bez zmian w DB i bez nowych typów w bazie. W komponencie:

```ts
type PriceHistoryRow = {
  item:  PipeSaleOfferItem;   // pozycja
  offer: PipeSaleOffer;       // kontekst: numer, klient, data, status, waluta, kurs
};

const rows = offers.flatMap(o => (o.items ?? []).map(item => ({ item, offer: o })));
```

Spłaszczenie w `useMemo` zależnym od `offers` — przeliczane tylko przy zmianie listy ofert.

## Logika filtrowania

Kolejno, każdy filtr opcjonalny (pusty = nie zawęża):

1. **Średnica** — wymagana, aby pokazać wyniki (pusta = stan zachęty, brak tabeli).
   - dokładnie: `item.diameter_mm === q`
   - z tolerancją: `Math.abs(item.diameter_mm - q) <= q * 0.1`
2. **Gatunek** — `<select>` z gatunków **realnie występujących w wynikach po filtrze
   średnicy** (nie z pełnego słownika `PIPE_NORM_GRADES`) — nie da się wybrać opcji
   dającej pustą listę.
3. **Ścianka** — `<select>` budowany analogicznie, z unikalnych `wall_thickness_mm`.

Sortowanie wyników: **data oferty malejąco** (najnowsze ceny u góry) — stała,
bez sortowania klikanego (YAGNI). Pole daty: `offer.created_at` — to samo, które
pokazuje istniejąca lista ofert SR (spójność między widokami).

**Reset filtrów zależnych:** listy gatunku i ścianki zależą od wyniku filtra
średnicy. Po zmianie średnicy (lub przełącznika ±10%) wybrany wcześniej gatunek
lub ścianka może już nie występować — wtedy filtr **resetuje się do „wszystkie"**
zamiast dawać pustą tabelę bez wyjaśnienia. Warunek: jeśli aktualna wartość nie
należy do nowo policzonej listy opcji, ustaw ją na pustą.

## Waluta — normalizacja

Cena wyświetlana = `sell_price_per_ton` przeliczona z `offer.currency` na walutę
widoku kursem `offer.exchange_rate` (kurs **z tej oferty**, nie bieżący — cena ma
odzwierciedlać moment wystawienia).

**Konwersja wyłącznie przez `convertCurrencyValue` z `src/lib/currency.ts`.**
Zakaz `Math.round(v * rate)` inline — to udokumentowany antypattern (źródło 8
regresji, patrz `CLAUDE.md` i `docs/CURRENCY-CONVERSION-PATTERN.md`).

Gdy `offer.currency` ≠ waluta widoku, przy cenie pojawia się dyskretny znacznik
`z PLN` / `z EUR` — użytkownik wie, że wartość jest przeliczona.

Brak/zerowy `exchange_rate` przy ofercie w innej walucie: wiersz pokazuje cenę
w walucie oryginalnej z jawnym znacznikiem i **nie wchodzi do statystyk**
(nie da się go rzetelnie porównać).

## Podsumowanie (pasek nad tabelą)

Liczone z wierszy po filtrach, w walucie widoku:
- **liczba pozycji**,
- **średnia cena/t** — arytmetyczna ze `sell_price_per_ton` (benchmark „jaką cenę
  zwykle dawaliśmy", nie ważona masą, która odpowiadałaby na inne pytanie),
- **zakres** min–max.

Wiersze wykluczone z powodu braku kursu są pomijane w statystykach; gdy takie
istnieją, pasek to sygnalizuje.

## UI — panel rozwijany

Nad tabelą ofert w `PipeOffersTable`, domyślnie **zwinięty** (jeden nagłówek z
chevronem: „Szukaj po parametrach rury · historia cen z poprzednich ofert").
Rozwinięty pokazuje formularz, pasek podsumowania i tabelę wyników. Lista ofert
pozostaje pod spodem, nietknięta.

Kolumny wyników: `Rura (Ø × ścianka)` · `Gatunek` · `Cena/t` · `Masa` ·
`Oferta` · `Klient` · `Data + badge statusu`.

Stany puste:
- brak wpisanej średnicy → zachęta („podaj średnicę, aby zobaczyć historię cen"),
- brak trafień → komunikat z podpowiedzią o przełączniku ±10%.

Badge statusu: te same kolory co w istniejącej liście ofert SR (spójność wizualna).

## Komponenty i pliki

| Plik | Zmiana |
|---|---|
| `src/components/sale/pipe/PipePriceHistoryPanel.tsx` | **nowy** — samodzielny komponent; props: `offers: PipeSaleOffer[]`; cała logika filtrów, statystyk i renderu |
| `src/components/sale/pipe/PipeOffersTable.tsx` | dodanie stanu zwinięcia + osadzenie panelu nad tabelą |

Granica jest czysta: panel dostaje listę ofert i nie wie nic o tabeli, jej
filtrze ani akcjach (PDF, edycja, status). Można go testować i zmieniać
niezależnie.

## Weryfikacja

- `npm run build` (strict tsc — jak Netlify CI).
- Smoke test w przeglądarce na **realnych danych produkcyjnych, tylko do odczytu**
  (żadnego zapisu, żadnych testowych ofert — numeracja SR jest konsumowana
  bezpowrotnie): wpisać średnicę występującą w bazie, sprawdzić liczbę trafień,
  włączyć ±10% (liczba trafień rośnie lub się nie zmienia), przełączyć walutę
  (ceny przeliczone, kolejność wierszy bez zmian), zawęzić gatunkiem.
- Kontrola przeliczenia: pozycja z oferty PLN przy widoku EUR — ręcznie sprawdzić
  `cena / kurs` z danymi tej oferty.

## Znane ograniczenia

- Panel widzi tylko oferty załadowane przez `PipeSaleSection`. PostgREST zwraca
  max **1000** wierszy (limit projektu: `pgrst.db_max_rows=5000`), obecnie w bazie
  **104** oferty SR. Przy obecnym tempie zapas na lata; po przekroczeniu progu
  trzeba przejść na zapytanie serwerowe — wymiana źródła danych, bez zmian w UI.

## Poza zakresem (YAGNI)

- Wyszukiwanie po parametrach w pozostałych modułach (grodzice, płyty, dwuteowniki).
- Filtry po typie produktu, stanie, normie, powierzchni, magazynie.
- Sortowanie klikane po kolumnach, eksport wyników, wykres trendu cen.
- Przeliczanie po bieżącym kursie NBP zamiast kursu z oferty.
- Jakiekolwiek zmiany w schemacie bazy lub w logice zapisu ofert.
