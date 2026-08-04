# Moduł statystyk (STATS)

**Data:** 2026-08-04
**Status:** zaakceptowany projekt (przed planem implementacji)

## Cel

Trzeci tryb aplikacji obok WYNAJEM i SPRZEDAŻ — **moduł analityczny** pokazujący
wyniki handlowe firmy: podział na handlowców (kto ile i jakich produktów), liczbę
i procent ofert przyjętych, statystyki liczebne i wartościowe oraz wykresy.

Zakres v1: **Przegląd + Handlowcy + Do domknięcia**. Zakładki Produkty i Klienci —
druga faza (architektura ma być na nie gotowa).

**Twarde ograniczenie: moduły wynajmu i sprzedaży pozostają nietknięte.** Zero
zmian w ich kodzie (kalkulatory, modale, PDF, tabele ofert) i zero zmian
strukturalnych w ich tabelach (żadnego `ALTER TABLE`). Moduł statystyk tylko
czyta; jedyny zapis to `UPDATE status` na istniejącej kolumnie — czyli dokładnie
taka sama operacja, jaką wykonuje dziś modal edycji.

## Rekonesans danych (stan 2026-08-04)

Liczby ustalone zapytaniami na produkcji — projekt jest na nich oparty, nie na
założeniach.

| Moduł | Ofert aktywnych | Suma PLN | Masa |
|---|---:|---:|---|
| SP sprzedaż grodzic | 288 | 151 132 199 | z pozycji (39 462 t) |
| SR sprzedaż rur | 103 | 47 879 991 | z pozycji |
| OF/OP wynajem grodzic + płyt | 105 | 18 771 980 | 21 949 t |
| SPP sprzedaż płyt | 3 | 1 604 252 | 401 t |
| SH sprzedaż dwuteowników | 2 | 41 389 | 9 t |
| OH wynajem dwuteowników | 2 | 34 398 | 41 t |

**556 ofert łącznie (503 aktywne), zakres 2026-03-19 … 2026-08-04, ~219 mln PLN.**
Tempo ~180 ofert/miesiąc. Klienci: 172, w tym 151 PL, 15 krajów.

### Fakty upraszczające (zweryfikowane)

- **`prepared_by` jest czysty** — dokładnie 4 wartości, 1:1 z `SALES_REPS`, zero
  NULL, zero literówek: Szymon Sobczak 201, Marzena Sobczak 190,
  Mateusz Cieślicki 111, Piotr Domański 1. Wymiar „handlowiec" nie wymaga
  normalizacji ani słownika.
- **Kolumny wartościowe wypełnione w 100%** we wszystkich 6 tabelach (zero NULL/0).
- **Na poziomie oferty `*_pln` trzyma PLN, a `*_eur` trzyma EUR** — zweryfikowane:
  iloraz `value_pln / value_eur` równa się `exchange_rate` we wszystkich modułach
  i w obu walutach. Ostrzeżenie z `CLAUDE.md` o kolumnach `_pln` trzymających EUR
  dotyczy **wyłącznie cen szkód**, nie kwot zbiorczych.
  → **Moduł nie przelicza walut. Bierze gotową kolumnę `*_pln`.**
- Wszystkie 6 tabel `*_items` mają `mass_t` → tonaż policzalny wszędzie.
- `margin_pct` wypełnione w 100% (SP śr. 7,3%, SR 19,1%, SPP 12,9%).

### Problem jakości danych — sedno projektu

**426 z 503 aktywnych ofert (85%) tkwi w statusie „wysłana".**

| Status | Ofert |
|---|---:|
| wysłana | 426 |
| przyjęta | 30 |
| szkic | 29 |
| odrzucona | 18 |

Nie poprawia się w czasie (lipiec: 160/182 = 88% „wysłana"). Konsekwencje:

- Naiwna skuteczność = 30/503 = **6%** — liczba nieprawdziwa i demotywująca.
- Uczciwa skuteczność (tylko rozstrzygnięte) = 30/48 = **62,5%**, ale z próbki
  stanowiącej 10% zbioru.
- **Brak kolumny `accepted_at`** — nie wiadomo, *kiedy* ofertę przyjęto.
  `updated_at` się nie nadaje (289 ofert edytowano po zapisie).

**Rozstrzygnięcie:** moduł pokazuje skuteczność z rozstrzygniętych **zawsze wraz z
licznikiem nierozstrzygniętych**, żeby nikt nie mylił jednego z drugim, oraz
dostaje zakładkę „Do domknięcia", która czyni porządkowanie statusów czynnością
dwuminutową zamiast godzinnej. Bez tego mechanizmu każdy procent w module z
czasem staje się fikcją.

## Decyzje projektowe (uzgodnione z użytkownikiem)

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Metryka skuteczności | Ekran domykania statusów + skuteczność z rozstrzygniętych | Przykaz „posprawdzajcie oferty" zadziała raz; lista 200 pozycji zgnije. Krótka lista z dwoma przyciskami jest egzekwowalna stale |
| Odbiorca | Zarząd, wszyscy widzą wszystko | Aplikacja nie ma logowania per-użytkownik; wariant prywatny wymagałby Supabase Auth + RLS, czyli osobnego dużego projektu |
| Wynajem vs sprzedaż | Osobno, przełącznik WSZYSTKO / WYNAJEM / SPRZEDAŻ | Nieporównywalne ekonomicznie: sprzedaż to jednorazowy przychód, wynajem to opłata za okres. Wartość nigdy jako jedna zlepiona kwota |
| Zakres v1 | Przegląd + Handlowcy + Do domknięcia (~9 wykresów) | Pokrywa pierwotne wymaganie; Produkty i Klienci w drugiej fazie |
| Wykresy | Recharts | Tooltipy, animacje, responsywność, legendy — ręcznie to dni pracy i łatwo zrobić źle. Bundle i tak zawiera znacznie cięższy react-pdf |
| Kurs walutowy | `exchange_rate` zapisany w ofercie | Inaczej historyczne statystyki zmieniałyby się same wraz z kursem NBP. 167/326 ofert SP jest w EUR — to nie przypadek brzegowy |
| Oś czasu wykresów | `created_at` (data wystawienia) | `accepted_at` uzupełniany wstecz skłamałby: oferta przyjęta w kwietniu dostałaby stempel sierpniowy. `created_at` mierzy skuteczność rocznika ofert — miara właściwsza handlowo |
| Szkice i usunięte | Poza metrykami handlowymi | Szkic nie trafił do klienta; `deleted_at` wykluczone zawsze |
| Testy | Bez Vitest w v1 | Projekt nie ma frameworka testowego; weryfikacja przez kontrolę krzyżową SQL |

## Architektura — warstwa danych

### Widok `v_offer_stats` (szew anty-klonowy)

Jeden widok SQL scalający 7 strumieni ofertowych w tabelę faktów. Każdy moduł ma
inne nazwy kolumn wartości (`rental_cost_pln` vs `total_sell_pln`) i inne źródło
masy — **widok jest jedynym miejscem, gdzie to mapowanie istnieje**.

```sql
CREATE OR REPLACE VIEW v_offer_stats AS
SELECT o.id, 'OF' AS module_code, 'rental' AS kind,
       o.offer_number, o.client_id, o.prepared_by, o.status,
       o.currency, o.created_at, o.deleted_at,
       o.rental_cost_pln AS value_pln,
       o.rental_cost_eur AS value_eur,
       COALESCE(NULLIF(im.mass_t, 0), o.mass_t, 0) AS mass_t,
       NULL::numeric AS margin_pct,
       NULL::numeric AS cost_pln
FROM offers o
LEFT JOIN (SELECT offer_id, SUM(mass_t) mass_t FROM offer_items GROUP BY 1) im
       ON im.offer_id = o.id
WHERE COALESCE(o.item_type,'sheet_pile') = 'sheet_pile'
UNION ALL
  -- OP (offers WHERE item_type='road_plate'), OH (beam_rental_offers),
  -- SP (sale_offers), SR (pipe_sale_offers), SPP (road_plate_sale_offers),
  -- SH (beam_sale_offers) — analogicznie, każdy z własnym mapowaniem
```

Mapowanie kolumn wartości i masy per moduł:

| module_code | kind | tabela | value_pln | masa |
|---|---|---|---|---|
| OF | rental | `offers` (`item_type='sheet_pile'`) | `rental_cost_pln` | items → fallback `mass_t` |
| OP | rental | `offers` (`item_type='road_plate'`) | `rental_cost_pln` | items → fallback `mass_t` |
| OH | rental | `beam_rental_offers` | `rental_cost_pln` | items → fallback `total_mass_t` |
| SP | sale | `sale_offers` | `total_sell_pln` | **tylko items** (`mass_t` na ofercie = 0) |
| SR | sale | `pipe_sale_offers` | `total_sell_pln` | tylko items (brak kolumny na ofercie) |
| SPP | sale | `road_plate_sale_offers` | `total_sell_pln` | tylko items (brak kolumny na ofercie) |
| SH | sale | `beam_sale_offers` | `total_sell_pln` | items → fallback `total_mass_t` |

**Dlaczego widok, a nie agregacja w Reakcie:**

1. Jest **read-only** — fizycznie nie może zepsuć modułów, których nie ruszamy.
2. **Jedno miejsce** do poprawki, gdy dojdzie ósmy moduł.
3. Omija udokumentowaną **pułapkę PostgREST z limitem 1000 wierszy**.
4. Komponent React nie musi znać wewnętrznych nazw kolumn siedmiu modułów —
   czyli nie powstaje sprzężenie, którego architektura klonów unikała.

### Tabela `offer_followups`

```sql
CREATE TABLE offer_followups (
  module_code   text NOT NULL,
  offer_id      uuid NOT NULL,
  snoozed_until timestamptz,   -- „wciąż w grze" — odłóż o 30 dni
  decided_at    timestamptz,   -- kiedy domknięto (przez moduł statystyk)
  decided_by    text,
  PRIMARY KEY (module_code, offer_id)
);
```

Celowo **osobna tabela zamiast `ALTER TABLE` na sześciu tabelach ofertowych** —
wymaganie „nie ruszamy dwóch modułów" traktowane dosłownie, także strukturalnie.

Znane ograniczenie: `decided_at` zapisuje wyłącznie moduł statystyk. Zmiany
statusu dokonane w modalach edycji nie będą logowane. Akceptowalne, bo wykresy
czasowe i tak opierają się na `created_at`; `decided_at` jest informacją
pomocniczą na przyszłość (czas do decyzji).

**Migracja: 1 widok + 1 tabela. Zero `ALTER TABLE`, zero zmian w kodzie modułów.**

## Architektura — komponenty

Wzorzec 1:1 z `BeamRentalSection` (kontrolowany kontener, self-load danych):

```
src/components/stats/
├── StatsSection.tsx          # kontener: 3 zakładki, ładuje dane raz
├── StatsFilterBar.tsx        # okres / zakres / handlowiec / moduł
├── StatsOverviewTab.tsx      # 6 kafli KPI + 4 wykresy + tabela per moduł
├── StatsRepsTab.tsx          # ranking + 5 wykresów
├── StatsFollowUpTab.tsx      # do domknięcia + akcje masowe
├── charts/
│   ├── KpiCard.tsx           ·  TrendChart.tsx   (ComposedChart)
│   ├── StatusDonut.tsx       ·  ModuleDonut.tsx
│   ├── RepBarChart.tsx       ·  MarginScatter.tsx
│   └── RepProductMatrix.tsx  (heatmapa — czysty Tailwind, bez Recharts)
└── lib/
    ├── statsQueries.ts       # Supabase → OfferFact[]
    ├── statsAggregate.ts     # czyste funkcje agregujące
    └── statsTypes.ts
```

`statsAggregate.ts` nie importuje ani Reacta, ani Supabase — same funkcje
`OfferFact[] → wynik`. To jedyny plik, w którym da się popełnić błąd rachunkowy.

W `App.tsx`: `Mode` rozszerza się o `'stats'`, dochodzi piąta unia zakładek i
jeden `<StatsSection>` w renderze. Gałęzie `rental`/`sale` bez zmian.

## Przepływ danych

1. Wejście w moduł → **jedno** zapytanie: `v_offer_stats` filtrowany po dacie,
   z `.limit(50000)` (obowiązkowo — pułapka PostgREST).
2. Wynik w stanie jako `OfferFact[]`.
3. Każdy wykres to `useMemo` nad tą samą tablicą.
4. **Zmiana filtra handlowca / modułu / zakresu → tylko `useMemo`, zero
   zapytań.** Filtrowanie natychmiastowe.
5. Zmiana okresu → jeden refetch.

556 wierszy × 13 wąskich kolumn ≈ 150 KB. Przy ~180 ofertach/mies. za trzy lata
wciąż poniżej 1 MB.

## Zawartość v1

### Filtry globalne (sterują każdą liczbą)

| Filtr | Wartości |
|---|---|
| Okres | ten miesiąc · kwartał · rok · ostatnie 12 mies. · wszystko · własny |
| Zakres | WSZYSTKO · WYNAJEM · SPRZEDAŻ |
| Handlowiec | wszyscy · konkretna osoba |
| Moduł | OF · OP · OH · SP · SR · SPP · SH (wielokrotny wybór) |

### Zakładka 1 — Przegląd

**6 kafli KPI**, każdy ze zmianą % względem poprzedniego okresu:
ofert wystawionych · wartość ofert · wartość wygrana · skuteczność (+ licznik
nierozstrzygniętych) · tonaż · średnia marża (tylko sprzedaż).

| # | Wykres | Treść |
|---|---|---|
| 1 | Trend miesięczny (ComposedChart) | Słupki = liczba ofert, linia = wartość |
| 2 | Struktura statusów (donut) | szkic / wysłana / przyjęta / odrzucona |
| 3 | Udział modułów (donut) | Który produkt robi obrót |
| 4 | Wynajem vs sprzedaż (2 kafle) | Nigdy jako jedna suma |

Plus tabela zbiorcza per moduł: ofert · wartość · tonaż · skuteczność ·
śr. wartość oferty · marża.

### Zakładka 2 — Handlowcy

Tabela rankingowa, sortowalna po każdej kolumnie: handlowiec · ofert · wartość ·
udział % · wygrane · skuteczność % · tonaż · śr. marża · śr. wartość oferty.

| # | Wykres | Wartość dla zarządu |
|---|---|---|
| 5 | Ranking wartości (poziome słupki, stacked po statusie) | Kto ile wystawił, z podziałem wygrane/przegrane/w toku |
| 6 | Udział procentowy (donut) | Podział tortu między handlowców |
| 7 | Macierz handlowiec × produkt (heatmapa) | Kto w czym siedzi — monokultura czy szeroka sprzedaż |
| 8 | Trendy porównawcze (linie) | Kto rośnie, kto zwalnia |
| 9 | Obrót vs marża (punktowy) | Ujawnia handlowca kupującego obrót rabatem |

Wykres 9 jest wykonalny tylko dlatego, że baza trzyma `margin_pct` per oferta.
Ranking po samym obrocie premiuje tego, kto najwięcej upuszcza z ceny; rozrzut w
danych jest realny (SP 7,3% vs SR 19,1%, pojedyncze oferty schodzą do −1,5%).

### Zakładka 3 — Do domknięcia

Lista ofert w statusie „wysłana" starszych niż wybrany próg:

```
SP/2026/144 · Budimex · 340 000 PLN · wysłana 47 dni temu
                              [Przyjęta] [Odrzucona] [Wciąż w grze]
```

- Filtr: starsze niż 30 / 60 / 90 dni, per handlowiec
- Akcje pojedyncze i **masowe** (zaznacz N → oznacz zbiorczo)
- „Wciąż w grze" → `snoozed_until = now() + 30 dni`, oferta znika z listy na
  miesiąc
- Licznik w nazwie zakładki: **Do domknięcia (426)**

Zapis: `UPDATE <tabela modułu> SET status = ... WHERE id = ...` plus `UPSERT` do
`offer_followups`. Mapowanie `module_code → nazwa tabeli` w `statsQueries.ts`.

## Przypadki brzegowe

Wynikają z faktycznych danych, nie z teorii:

| Sytuacja | Zachowanie |
|---|---|
| Marża 100% (koszt zakupu = 0) | Wyłączona ze średnich + licznik „N ofert bez ceny zakupu" |
| 12 ofert SP bez pozycji (same zamki) | Tonaż 0, wartość normalnie |
| 0 ofert rozstrzygniętych w filtrze | Skuteczność `—`, nigdy `0%` |
| Szkice | Poza metrykami handlowymi, widoczne osobno |
| `deleted_at` | Zawsze wykluczone |
| Pusty okres | Czytelny stan pusty zamiast pustych wykresów |
| Oferty PLN mają `exchange_rate` NULL | Nieistotne — bierzemy gotowe `*_pln` |
| >1000 wierszy z PostgREST | `.limit(50000)` obowiązkowo |

## Weryfikacja

1. **Kontrola krzyżowa SQL** — każda liczba KPI policzona drugi raz zapytaniem
   bezpośrednio w bazie i porównana z ekranem. Dwie niezależne drogi do tej samej
   liczby.
2. `npm run build` — strict `tsc`, identyczny z Netlify CI.
3. E2E przez Claude_Browser — filtry, render wykresów, akcja domknięcia statusu.
4. **Zero testowych ofert na produkcji.** Moduł tylko czyta; zapis statusu
   testowany na ofercie już rozstrzygniętej, ze stanem przywróconym po teście.

## Poza zakresem v1

- Zakładki Produkty i Klienci (10 wykresów) — faza druga
- Eksport do PDF/Excel
- Cele sprzedażowe i realizacja planu
- Supabase Auth, role, widoki prywatne per handlowiec
- Triggery logujące zmiany statusu w tabelach ofertowych
- Vitest
