# Opcjonalne pole "Nazwa zadania" w ofertach (wszystkie moduły)

**Data:** 2026-05-21
**Status:** zaakceptowany projekt (przed planem implementacji)

## Cel

Dodać opcjonalne pole **"Nazwa zadania"** (nazwa projektu/budowy), wpisywane na
etapie kalkulatora, wyświetlane w PDF jako ostatnia linia bloku "Dane klienta".
Pole pojawia się w PDF **tylko gdy zostało wypełnione** (opcjonalne).

Zakres: **wszystkie 5 modułów** generujących oferty/PDF.

## Kontekst i ograniczenia

- PDF generowany jest **z zapisanej oferty** (`OffersTable.handleDownloadPDF` i
  analogiczne czytają obiekt oferty z DB) — pole musi przejść przez DB, więc
  wymagana jest nowa kolumna w tabelach ofert.
- Każdy moduł ma własny łańcuch: kalkulator → modal zapisu → tabela DB → typ TS
  → komponent PDF → modal edycji. 5 niemal identycznych ścieżek.
- Blok "Dane klienta" w PDF (`metaRight`) ma **42% szerokości strony (~215pt)**.
- Czcionka Roboto jest **proporcjonalna** — liczba znaków to przybliżenie
  szerokości. Render dowiódł: 35 znaków mieszanych mieści się w jednej linii,
  40 znaków z szerokimi literami zawija się.

## Decyzje projektowe (uzgodnione z użytkownikiem)

| Decyzja | Wybór |
|---|---|
| Zakres | Wszystkie 5 modułów |
| Format w PDF | Etykieta "Zadanie:" + nazwa (EN: "Project:") |
| Gwarancja jednej linii | Limit znaków w kalkulatorze: **maxLength = 35** |
| Pozycja | Ostatnia linia w kolumnie "Dane klienta" (42%, do prawej) |
| Edytowalność | Pole edytowalne w kalkulatorze **i** w modalu zapisu (prefill), oraz w modalu edycji |

## Model danych (DB)

Nowa kolumna `task_name TEXT` (nullable, bez default) — 4 migracje Supabase:

| Tabela | Moduł |
|---|---|
| `offers` | wynajem grodzic + płyt (wspólna tabela) |
| `sale_offers` | sprzedaż grodzic |
| `pipe_sale_offers` | sprzedaż rur |
| `road_plate_sale_offers` | sprzedaż płyt drogowych |

Migracja: `ALTER TABLE <t> ADD COLUMN task_name TEXT;` (nullable — istniejące
oferty mają NULL, PDF ich nie pokazuje = zachowanie wsteczne bez zmian).

## Typy TS (`src/types/index.ts`)

Dodać `task_name?: string` do interfejsów: `Offer`, `SaleOffer`,
`PipeSaleOffer`, `RoadPlateSaleOffer`.

## Kalkulatory — input (5 plików)

Opcjonalne pole tekstowe "Nazwa zadania (opcjonalnie)", `maxLength={35}`,
stan `const [taskName, setTaskName] = useState('')`, przekazywany jako prop do
modala zapisu.

- `Calculator.tsx`
- `RoadPlateCalculator.tsx`
- `sale/SaleCalculator.tsx`
- `sale/pipe/PipeSaleCalculator.tsx`
- `sale/roadplate/RoadPlateSaleCalculator.tsx`

## Modale zapisu — persystencja (5 plików)

Nowy prop `taskName` (initial), lokalny stan edytowalny (prefill z propa),
`maxLength={35}` na inpucie. W payloadzie INSERT: `task_name: taskName.trim() || null`.

- `SaveOfferModal.tsx`
- `SaveRoadPlateOfferModal.tsx`
- `sale/SaveSaleOfferModal.tsx`
- `sale/pipe/PipeSaveOfferModal.tsx`
- `sale/roadplate/RoadPlateSaveOfferModal.tsx`

## Modale edycji (5 plików)

Pole edytowalne, init z `offer.task_name ?? ''`, zapis w UPDATE payload.
**Kopiowanie ofert** (`mode='copy'`): `task_name` przenosi się przez payload —
zweryfikować, że jest w wydzielanym `offerPayload` każdej ścieżki copy.

- `EditOfferModal.tsx`
- `EditRoadPlateOfferModal.tsx`
- `sale/EditSaleOfferModal.tsx`
- `sale/pipe/PipeEditOfferModal.tsx`
- `sale/roadplate/RoadPlateEditOfferModal.tsx`

## PDF — wyświetlanie (5 komponentów)

Warunkowa ostatnia linia w bloku `metaRight`, po ostatniej linii klienta:

```tsx
{offer.task_name && (
  <Text style={[s.metaLine, { textAlign: 'right', color: C.navy }]}>
    <Text style={s.metaBold}>{t.taskLabel} </Text>{offer.task_name}
  </Text>
)}
```

- `OfferPDF.tsx`
- `RoadPlateOfferPDF.tsx`
- `sale/SaleOfferPDF.tsx`
- `sale/pipe/PipeOfferPDF.tsx`
- `sale/roadplate/RoadPlateSaleOfferPDF.tsx`

### Lokalizacja etykiety (`src/lib/pdfStrings.ts`)

Nowe pole `taskLabel: string` w 5 interfejsach: `RentalPdfStrings`,
`SalePdfStrings`, `PipeSalePdfStrings`, `RoadPlateRentalPdfStrings`,
`RoadPlateSalePdfStrings`. Wartości — w `_pl` **i** `_en` każdego (inaczej błąd
kompilacji TS, co jest pożądanym zabezpieczeniem):
- PL: `'Zadanie:'`
- EN: `'Project:'`

Wartość `task_name` (wpisana przez usera) **nie jest tłumaczona**.

## Gwarancja jednej linii

`maxLength={35}` na każdym inpucie (kalkulator + modale). Zweryfikowane realnym
renderem react-pdf:
- 35 znaków mieszanych ("Przebudowa drogi wojewodzkiej nr 34") → jedna linia ✓
- 40 znaków z szerokimi literami → zawija ✗
- Ryzyko szczątkowe: nazwy ALL-CAPS ~38+ znaków mogą zawinąć — akceptowalne.

## Weryfikacja

- `npm run build` (strict tsc — wyłapie brak `taskLabel` w EN/PL i niezgodności typów).
- Render PDF każdego modułu z wypełnionym i pustym `task_name` (workflow render
  w Node + pomiar z CLAUDE.md) — potwierdzić jedną linię i opcjonalność.
- Migracje DB zastosowane przez Supabase MCP (`apply_migration`) na 4 tabelach.

## Poza zakresem (YAGNI)

- Auto-zmniejszanie czcionki / obcinanie wielokropkiem (odrzucone — limit znaków wystarcza).
- Pole na poziomie klienta (reużywalne) — to atrybut per-oferta, nie per-klient.
- Tłumaczenie wartości nazwy zadania.
