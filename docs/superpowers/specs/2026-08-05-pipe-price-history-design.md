# Filtr ofert rur po średnicy (moduł SR)

**Data:** 2026-08-05
**Status:** zrealizowany

> **Historia zmiany zakresu.** Pierwsza wersja tego dokumentu opisywała
> rozbudowany panel „historia cen": płaską listę pozycji, filtry gatunku i
> ścianki, tolerancję ±10%, przełącznik walut i pasek statystyk. Użytkownik
> ocenił to jako przerost formy — potrzebny jest **prosty filtr**. Poniżej
> zakres faktycznie wdrożony; odrzucone pomysły są na końcu, gdyby kiedyś
> wróciły.

## Cel

Handlowiec wpisuje średnicę w pole wyszukiwania nad listą ofert SR i widzi
tylko te oferty, które zawierają rurę o tej średnicy — żeby podejrzeć ceny
i warunki z wcześniejszych wycen.

## Rozwiązanie

Rozszerzenie **istniejącego** pola wyszukiwania w `PipeOffersTable`. Żadnego
nowego komponentu, panelu ani zakładki.

Filtr (`PipeOffersTable.filtered`) dopasowuje ofertę, gdy zachodzi którykolwiek
warunek — numer oferty, nazwa klienta **lub** średnica w pozycjach:

```ts
const asNumber = Number(q.replace(',', '.'));
const matchesDiameter =
  Number.isFinite(asNumber) && asNumber > 0 &&
  (o.items ?? []).some(it => it.diameter_mm === asNumber);
```

Szczegóły:
- **Dopasowanie dokładne** — `508` znajduje Ø508, nie Ø559.
- **Przecinek jako separator dziesiętny** — `219,1` działa jak `219.1`
  (polska klawiatura numeryczna).
- Tekst niebędący liczbą (`NaN`) po prostu nie aktywuje tej gałęzi — wyszukiwanie
  po numerze i kliencie działa jak dotąd.
- Podpowiedź w polu: „Szukaj po numerze, kliencie lub średnicy…".

## Dlaczego to wystarcza

Dane są już w pamięci: `PipeSaleSection` ładuje oferty z pozycjami
(`items:pipe_sale_offer_items(*)`) i z filtrem `deleted_at IS NULL`. Filtr działa
lokalnie — zero zapytań, zero migracji, zero zmian w bazie. Ceny i warunki
handlowiec ogląda rozwijając „pozycje" przy znalezionej ofercie, jak dotychczas.

## Weryfikacja

- `npm run build` (strict tsc — jak Netlify CI).
- Smoke test na danych produkcyjnych, **tylko do odczytu**: wpisać średnicę
  obecną w bazie (lista się zawęża), wpisać nieistniejącą (pusty wynik),
  wpisać numer oferty i fragment nazwy klienta (działa jak wcześniej).

## Znane ograniczenia

- Filtr obejmuje oferty załadowane przez `PipeSaleSection`. PostgREST zwraca
  max 1000 wierszy (limit projektu 5000), w bazie jest 104 oferty SR — zapas
  na lata.

## Poza zakresem (odrzucone jako nadmiarowe)

Rozważane i **świadomie odrzucone** — do ewentualnego powrotu, jeśli praktyka
pokaże potrzebę:

- płaska lista pozycji zamiast listy ofert („historia cen"),
- filtry gatunku i grubości ścianki,
- tolerancja średnicy ±10%,
- przełącznik waluty EUR/PLN z normalizacją kursem oferty,
- pasek statystyk (liczba pozycji, średnia cena/t, zakres),
- filtrowanie po parametrach w pozostałych modułach.
