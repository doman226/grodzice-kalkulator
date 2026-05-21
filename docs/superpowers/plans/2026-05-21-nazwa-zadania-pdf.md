# Opcjonalne pole "Nazwa zadania" — Plan implementacji

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać opcjonalne pole "Nazwa zadania" (per-oferta) wpisywane w kalkulatorze, zapisywane w DB i wyświetlane jako ostatnia linia bloku "Dane klienta" w PDF — we wszystkich 5 modułach.

**Architecture:** Nowa nullable kolumna `task_name` w 4 tabelach ofert. Pole płynie: kalkulator (state) → modal zapisu (prop opcjonalny + persystencja) → DB → typ TS → komponent PDF (warunkowy render). Etykieta "Zadanie:"/"Project:" lokalizowana przez `pdfStrings`. Jedna linia gwarantowana przez `maxLength=35` na inpucie.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (PostgreSQL), @react-pdf/renderer. **Brak frameworka testów** — weryfikacja każdego kroku = `npm run build` (strict tsc) + render PDF (workflow z CLAUDE.md). Spec: `docs/superpowers/specs/2026-05-21-nazwa-zadania-pdf-design.md`.

**Uwaga o weryfikacji:** `npm run` uruchamiać przez cmd.exe/PowerShell (Node nie jest w bash PATH). `npm run build` wykona `tsc && vite build` — strict, identyczny z Netlify CI. To zastępuje "uruchom test" z klasycznego TDD.

**Kolejność:** zależności wymuszają: DB → typy → pdfStrings → PDF → modale zapisu (prop OPCJONALNY) → kalkulatory → modale edycji. Opcjonalność propu `taskName?` sprawia, że każdy krok kompiluje się niezależnie.

---

### Task 1: Migracje DB — kolumna `task_name` (4 tabele)

**Narzędzie:** Supabase MCP `apply_migration` (projekt `hliemaqfncptedkxxakt`). Bez zmian w kodzie.

- [ ] **Step 1: Migracja `offers`**

Nazwa migracji: `add_task_name_to_offers`
```sql
ALTER TABLE offers ADD COLUMN IF NOT EXISTS task_name TEXT;
```

- [ ] **Step 2: Migracja `sale_offers`**

```sql
ALTER TABLE sale_offers ADD COLUMN IF NOT EXISTS task_name TEXT;
```

- [ ] **Step 3: Migracja `pipe_sale_offers`**

```sql
ALTER TABLE pipe_sale_offers ADD COLUMN IF NOT EXISTS task_name TEXT;
```

- [ ] **Step 4: Migracja `road_plate_sale_offers`**

```sql
ALTER TABLE road_plate_sale_offers ADD COLUMN IF NOT EXISTS task_name TEXT;
```

- [ ] **Step 5: Weryfikacja**

`list_tables` lub `execute_sql`:
```sql
SELECT table_name FROM information_schema.columns
WHERE column_name = 'task_name'
  AND table_name IN ('offers','sale_offers','pipe_sale_offers','road_plate_sale_offers');
```
Oczekiwane: 4 wiersze.

> Migracje DB nie są commitowane do gita (żyją w Supabase). Brak commitu w tym zadaniu.

---

### Task 2: Typy TS — `task_name?` w 4 interfejsach

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Dodać pole do 4 interfejsów**

W każdym z: `Offer`, `SaleOffer`, `PipeSaleOffer`, `RoadPlateSaleOffer` dodać (przy innych opcjonalnych polach string, np. obok `notes?`):
```ts
  task_name?: string;
```

- [ ] **Step 2: Build**

Run (PowerShell): `npm run build`
Expected: PASS (czyste dodanie pól opcjonalnych).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): pole task_name w 4 interfejsach ofert"
```

---

### Task 3: pdfStrings — `taskLabel` w 5 interfejsach (PL+EN)

**Files:**
- Modify: `src/lib/pdfStrings.ts`

Interfejsy (każdy ma `customerLabel`): `PdfStrings` (sprzedaż grodzic), `RentalPdfStrings`, `RoadPlateRentalPdfStrings`, `PipeSalePdfStrings`, `RoadPlateSalePdfStrings`. Łącznie 5 interfejsów + 10 obiektów (`_pl`/`_en` każdego).

- [ ] **Step 1: Dodać pole do 5 interfejsów**

Bezpośrednio po linii `customerLabel: string;` (lub `customerLabel:   string;`) w KAŻDYM z 5 interfejsów:
```ts
  taskLabel: string;
```

- [ ] **Step 2: Dodać wartości PL (5 obiektów `_pl`)**

Po każdym `customerLabel:` w obiektach PL dodać:
```ts
  taskLabel: 'Zadanie:',
```

- [ ] **Step 3: Dodać wartości EN (5 obiektów `_en`)**

Po każdym `customerLabel:` w obiektach EN dodać:
```ts
  taskLabel: 'Project:',
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS. (Jeśli brak `taskLabel` w którymś obiekcie → tsc zgłosi "Property 'taskLabel' is missing" — to oczekiwane zabezpieczenie, napraw brakujący.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfStrings.ts
git commit -m "feat(pdf): etykieta taskLabel (Zadanie:/Project:) w 5 slownikach"
```

---

### Task 4: PDF — warunkowa linia "Zadanie:" w bloku klienta (5 komponentów)

**Files:**
- Modify: `src/components/OfferPDF.tsx`
- Modify: `src/components/RoadPlateOfferPDF.tsx`
- Modify: `src/components/sale/SaleOfferPDF.tsx`
- Modify: `src/components/sale/pipe/PipeOfferPDF.tsx`
- Modify: `src/components/sale/roadplate/RoadPlateSaleOfferPDF.tsx`

Anchor: w bloku `<View style={s.metaRight}>`, **po ostatnim polu klienta** (zwykle `offer.client.email` lub `offer.client.city`), tuż przed zamknięciem fragmentu klienta.

- [ ] **Step 1: Wstawić linię w każdym z 5 PDF**

Po ostatniej linii danych klienta w `metaRight`:
```tsx
{offer.task_name && (
  <Text style={[s.metaLine, { textAlign: 'right', color: C.navy }]}>
    <Text style={s.metaBold}>{t.taskLabel} </Text>{offer.task_name}
  </Text>
)}
```
Uwaga: zmienna słownika to `t` we wszystkich PDF (np. `const t = RENTAL_PDF_STRINGS[lang]`). `s.metaBold`, `s.metaLine`, `C.navy` istnieją w każdym PDF (zweryfikować nazwę stałej koloru — w niektórych może być `C.navy`/`COLORS.navy`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Render weryfikacyjny (workflow z CLAUDE.md)**

Wyrenderować `OfferPDF` z mock `offer.task_name = 'Budowa S5 odcinek Korzeńsko'` i bez (undefined). Potwierdzić: linia "Zadanie:" pojawia się tylko gdy wypełnione, w jednej linii. (Patrz CLAUDE.md → "Debugowanie układu PDF".)

- [ ] **Step 4: Commit**

```bash
git add src/components/OfferPDF.tsx src/components/RoadPlateOfferPDF.tsx src/components/sale/SaleOfferPDF.tsx src/components/sale/pipe/PipeOfferPDF.tsx src/components/sale/roadplate/RoadPlateSaleOfferPDF.tsx
git commit -m "feat(pdf): warunkowa linia Zadanie w bloku klienta (5 modulow)"
```

---

### Task 5: Modale zapisu — prop opcjonalny + persystencja (5 plików)

**Files:**
- Modify: `src/components/SaveOfferModal.tsx`
- Modify: `src/components/SaveRoadPlateOfferModal.tsx`
- Modify: `src/components/sale/SaveSaleOfferModal.tsx`
- Modify: `src/components/sale/pipe/PipeSaveOfferModal.tsx`
- Modify: `src/components/sale/roadplate/RoadPlateSaveOfferModal.tsx`

- [ ] **Step 1: Dodać prop opcjonalny do interfejsu Props każdego modalu**

```ts
  taskName?: string;
```

- [ ] **Step 2: Stan lokalny edytowalny (prefill z propu)**

W ciele komponentu:
```ts
const [taskName, setTaskName] = useState(props.taskName ?? '');
```
(dostosować do destrukturyzacji propsów w danym pliku)

- [ ] **Step 3: Input w sekcji formularza (obok danych klienta)**

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
  <input type="text" value={taskName} maxLength={35}
    onChange={e => setTaskName(e.target.value)}
    placeholder="np. Budowa S5 odcinek Korzeńsko"
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
</div>
```
(dopasować klasy Tailwind do istniejących inputów w danym modalu)

- [ ] **Step 4: Persystencja w payloadzie INSERT**

W obiekcie wstawianym do tabeli (`.insert({...})`) dodać:
```ts
  task_name: taskName.trim() || null,
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SaveOfferModal.tsx src/components/SaveRoadPlateOfferModal.tsx src/components/sale/SaveSaleOfferModal.tsx src/components/sale/pipe/PipeSaveOfferModal.tsx src/components/sale/roadplate/RoadPlateSaveOfferModal.tsx
git commit -m "feat(modale): pole Nazwa zadania w modalach zapisu + persystencja (5)"
```

---

### Task 6: Kalkulatory — input + przekazanie propu (5 plików)

**Files:**
- Modify: `src/components/Calculator.tsx`
- Modify: `src/components/RoadPlateCalculator.tsx`
- Modify: `src/components/sale/SaleCalculator.tsx`
- Modify: `src/components/sale/pipe/PipeSaleCalculator.tsx`
- Modify: `src/components/sale/roadplate/RoadPlateSaleCalculator.tsx`

- [ ] **Step 1: Stan w każdym kalkulatorze**

Obok innych stanów (np. `transportFrom`):
```ts
const [taskName, setTaskName] = useState('');
```

- [ ] **Step 2: Input w sekcji danych oferty kalkulatora**

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
  <input type="text" value={taskName} maxLength={35}
    onChange={e => setTaskName(e.target.value)}
    placeholder="np. Budowa S5 odcinek Korzeńsko"
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
</div>
```

- [ ] **Step 3: Przekazać prop do modalu zapisu**

W renderze `<SaveOfferModal ... />` (lub odpowiednika) dodać prop:
```tsx
  taskName={taskName}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Calculator.tsx src/components/RoadPlateCalculator.tsx src/components/sale/SaleCalculator.tsx src/components/sale/pipe/PipeSaleCalculator.tsx src/components/sale/roadplate/RoadPlateSaleCalculator.tsx
git commit -m "feat(kalkulatory): input Nazwa zadania + przekazanie do modalu (5)"
```

---

### Task 7: Modale edycji — pole + zapis + weryfikacja kopiowania (5 plików)

**Files:**
- Modify: `src/components/EditOfferModal.tsx`
- Modify: `src/components/EditRoadPlateOfferModal.tsx`
- Modify: `src/components/sale/EditSaleOfferModal.tsx`
- Modify: `src/components/sale/pipe/PipeEditOfferModal.tsx`
- Modify: `src/components/sale/roadplate/RoadPlateEditOfferModal.tsx`

- [ ] **Step 1: Stan init z oferty**

```ts
const [taskName, setTaskName] = useState(offer.task_name ?? '');
```

- [ ] **Step 2: Input (jak w modalu zapisu, Step 3 Task 5)**

- [ ] **Step 3: Zapis w UPDATE payload**

W `offerPayload` / obiekcie UPDATE dodać:
```ts
  task_name: taskName.trim() || null,
```

- [ ] **Step 4: Weryfikacja ścieżki kopiowania (`mode='copy'`)**

Potwierdzić, że `task_name` znajduje się w wydzielanym `offerPayload`, który przy `isCopy` idzie do `.insert()`. Jeśli payload jest budowany jawnie (whitelist pól) — dodać `task_name`. (Patrz CLAUDE.md → wzorzec `mode?: 'edit' | 'copy'`.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditOfferModal.tsx src/components/EditRoadPlateOfferModal.tsx src/components/sale/EditSaleOfferModal.tsx src/components/sale/pipe/PipeEditOfferModal.tsx src/components/sale/roadplate/RoadPlateEditOfferModal.tsx
git commit -m "feat(modale): Nazwa zadania w modalach edycji + kopiowanie (5)"
```

---

### Task 8: Weryfikacja końcowa (build + render + smoke)

- [ ] **Step 1: Pełny build**

Run: `npm run build`
Expected: PASS, brak ostrzeżeń TS6133 (nieużyte zmienne — prefiks `_` jeśli trzeba).

- [ ] **Step 2: Render PDF per moduł**

Dla każdego z 5 PDF wyrenderować ofertę z `task_name` wypełnionym i pustym (workflow render w Node + pomiar z CLAUDE.md). Potwierdzić: linia "Zadanie:" w jednej linii, opcjonalność, brak regresji bloku transportu.

- [ ] **Step 3: Smoke test bazy (opcjonalny)**

`SELECT offer_number, task_name FROM offers WHERE task_name IS NOT NULL LIMIT 5;` po ręcznym zapisie testowej oferty z UI.

- [ ] **Step 4: Push**

```bash
git push origin main
```
(Po pushu zweryfikować deploy Netlify wg CLAUDE.md — SHA/content bundla.)

---

## Mapa plików (podsumowanie)

| Warstwa | Pliki | Zmiana |
|---|---|---|
| DB | 4 tabele (migracje Supabase) | `+ task_name TEXT` |
| Typy | `src/types/index.ts` | `+ task_name?` ×4 interfejsy |
| Słowniki | `src/lib/pdfStrings.ts` | `+ taskLabel` ×5 interfejsy, ×10 obiektów |
| PDF | 5 komponentów `*OfferPDF.tsx` | warunkowa linia w `metaRight` |
| Modale zapisu | 5 plików `Save*Modal.tsx` | prop `taskName?` + input + INSERT |
| Kalkulatory | 5 plików `*Calculator.tsx` | state + input + przekazanie propu |
| Modale edycji | 5 plików `Edit*Modal.tsx` | state + input + UPDATE + copy |

**Razem:** ~19 plików TS + 4 migracje DB. Zmiany mechaniczne, powtarzalne ×5 modułów.
