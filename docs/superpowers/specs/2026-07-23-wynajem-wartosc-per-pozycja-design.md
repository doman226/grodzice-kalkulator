# Wartość per pozycja w module wynajmu grodzic (OF)

**Data:** 2026-07-23
**Status:** zaakceptowany projekt (przed planem implementacji)

## Cel

Dodać **wartość wynajmu dla każdego wiersza pozycji** w module wynajmu grodzic —
analogicznie do modułu sprzedaży. Handlowiec przygotowujący ofertę na kilkanaście
zadań (każde o innej pozycji) ma widzieć wartość każdego wiersza, bez liczenia w
głowie. Dotyczy PDF oferty, kalkulatora i modalu edycji.

Zakres: **wyłącznie moduł wynajmu grodzic (OF)**. Płyty (OP), dwuteowniki (OH) i
moduły sprzedaży (SP/SR/SPP/SH) — bez zmian.

## Kontekst i kluczowe fakty upraszczające

- **Zero zmian w danych.** Wynajem trzyma **jedną cenę/t na ofertę**
  (`offers.price_per_ton_pln`), nie per pozycja jak sprzedaż (`sell_eur_t`).
  Wartość wiersza jest w 100% wyliczalna z danych, które PDF już otrzymuje →
  **brak migracji DB, brak zmian w zapisie/edycji ofert, działa wstecz dla
  wszystkich istniejących ofert.**
- **kg/m już jest w PDF** jako osobna kolumna (5. z 9). W **kalkulatorze** kg/m
  jest już pod selektorem profilu (`Calculator.tsx:266` — „74,4 kg/m · 400 mm").
  → relokacja kg/m dotyczy **tylko PDF**.
- **Kolumna „Koszt/t" w PDF już dziś zawiera transport** przy „DAP w cenie":
  `costPerTonPLN = totalWithTransport / offer.mass_t` (`OfferPDF.tsx:486`). Cena/t
  jest jedna dla całej oferty → **żadnego uśredniania**, każdy wiersz ma tę samą
  stawkę.

## Sposób liczenia „za tonę" w sprzedaży (dla porównania)

W sprzedaży cena/t to **średnia ważona masą**: `(wartość + transport) / masa
łączna`; kolumna per wiersz dolicza proporcjonalny (wg masy) udział transportu.
W wynajmie problem nie występuje — cena/t jest stała na ofertę.

## Formuła wartości wiersza (PDF)

```
wartośćWiersza_PLN = costPerTonPLN × item.mass_t
                   = totalWithTransport × item.mass_t / offer.mass_t
```

Gwarancje:
- `wartośćWiersza = masa_wiersza × Koszt/t` (spójność w obrębie wiersza),
- `Σ wartościWierszy = totalWithTransport` = kwota boxu „Koszt wynajmu" (z
  transportem przy DAP w cenie).
- Wiersz „Razem" pokazuje `fmtVal(totalWithTransport)` bezpośrednio (nie sumę
  zaokrąglonych wierszy) — ewentualna różnica ±0,5 j. między wizualną sumą a
  „Razem" jest oczekiwanym efektem zaokrągleń (jak w sprzedaży), nie błędem.

## Decyzje projektowe (uzgodnione z użytkownikiem)

| Decyzja | Wybór |
|---|---|
| Zakres wyświetlania | PDF + kalkulator + modal edycji |
| Modal edycji | Tak — spójny kafelek wartości per pozycja |
| Liczba kolumn PDF | Nadal **9** (bez rozpychania strony) |
| Relokacja kg/m | Z osobnej kolumny → subline pod nazwą profilu (drobna, szara) |
| Nowa kolumna | „Wartość [waluta]" jako ostatnia (bold), lustrzanie do sprzedaży |
| Kolejność kolumn kosztowych | `Koszt/t → Koszt/m²` (jak w sprzedaży; dziś odwrotnie) |
| Waluta | Nagłówek nosi walutę „Wartość [PLN]/[EUR]", komórki = sama liczba |

## PDF — `OfferPDF.tsx` (tabela wielopozycyjna, 9 kolumn)

| # | Dziś | Po zmianie |
|---|---|---|
| 1 | Profil | Profil **+ subline „74,4 kg/m"** |
| 2 | Gatunek stali | Gatunek stali |
| 3 | Ilość | Ilość |
| 4 | Dług. [m] | Dług. [m] |
| 5 | **kg/m** | Masa [t] |
| 6 | Masa [t] | Pow. [m²] |
| 7 | Pow. [m²] | **Koszt/t** |
| 8 | Koszt/m² | **Koszt/m²** |
| 9 | Koszt/t | **Wartość [PLN/EUR]** (nowa) |

- Subline kg/m: `formatNumber(item.mass_t * 1000 / item.total_length_m, 1)` +
  „ kg/m" (odzyskuje kg/m z masy i długości — działa dla starych ofert, brak
  zależności od katalogu profili). Nazwa profilu w `<View>` z dwoma `<Text>`
  (nazwa bold + kg/m drobne, `C.gray400`).
- Wartość komórki: `fmtVal(costPerTonPLN * item.mass_t)` (bez sufiksu waluty —
  waluta w nagłówku). Wiersz „Razem": `fmtVal(totalWithTransport)`.
- Flex 9 kolumn **przestrojony** i zweryfikowany renderem + pomiarem (nie zgadywać
  — workflow z CLAUDE.md: render w Node, pomiar `pdfplumber`). Punkt wyjścia dziś:
  `[2.0, 1.3, 1.2, 1.2, 0.9, 1.2, 1.2, 1.1, 0.9]`.
- **Nie ruszamy** fallbacku starych ofert jednoprofilowych (blok `else`).

### `src/lib/pdfStrings.ts`

Nowy klucz `thLineValue: string` **tylko** w interfejsie `RentalPdfStrings`
(unikalna nazwa — brak kolizji z istniejącym `thValue` tabeli parametrów, brak
ryzyka `replace_all`). PL: `'Wartość'`, EN: `'Value'`. Nagłówek w PDF renderuje
`${t.thLineValue} [${currCode}]`.

## Kalkulator — `Calculator.tsx`

Kafelek **„Wartość pozycji"** obok „Masa pozycji" w wierszu pozycji:
`r.massT × pricePerTon` w bieżącej walucie (`formatPLN`/`formatEUR`), na żywo.
Gdy `!r.valid` lub brak ceny/t → „—". Konwencja jak dziś w UI: kafelek = czysty
wynajem **bez** transportu (transport ma własną sekcję niżej; efektywna wartość z
transportem pojawia się w PDF — identycznie jak dzisiejsza para „cena/t w UI" vs
„Koszt/t w PDF"). kg/m pod profilem już istnieje — bez zmian.

Reorganizacja spanów w `grid-cols-12` tak, by zmieścić nowy kafelek — dokładne
wartości ustalone przy implementacji z podglądem w przeglądarce.

## Modal edycji — `EditOfferModal.tsx`

Ten sam kafelek „Wartość pozycji" w liście pozycji modalu, liczony z ceny/t
oferty w jej walucie. Jeśli kg/m nie ma pod profilem — dodać (parytet z
kalkulatorem).

## Weryfikacja

- `npm run build` (strict tsc — wyłapie brak `thLineValue` w EN/PL i niezgodności
  typów).
- Render PDF z **mocka** (workflow render w Node + pomiar z CLAUDE.md):
  potwierdzić, że 9 kolumn się mieści, subline kg/m nie rozpycha wierszy, oraz
  `Σ wartości ≈ Koszt wynajmu`. **Bez zapisu testowych ofert na produkcji.**
- Smoke test kalkulatora i modalu edycji w przeglądarce (Claude_Browser).

## Poza zakresem (YAGNI)

- Zmiany w module płyt (OP), dwuteowników (OH), sprzedaży.
- Cena/t per pozycja w wynajmie (wynajem ma jedną cenę/oferta — świadomy wybór).
- Jakiekolwiek zmiany w schemacie DB lub logice zapisu ofert.
