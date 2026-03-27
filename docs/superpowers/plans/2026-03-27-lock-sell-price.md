# Lock Sell Price (Cena Sprzedaży Zamków) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sell price (EUR/mb) and margin display to lock items (zamki) throughout the sale module — calculator, save/edit modals, and PDF.

**Architecture:** Locks currently only have cost price (`price_eur_mb`). We add a parallel `sell_price_eur_mb` field (defaults to cost, manually overridable) that flows from SaleCalculator → SaveSaleOfferModal → DB → EditSaleOfferModal / SaleOfferPDF. DB gets 3 new columns in `sale_offer_lock_items`. Old offers fall back to `total_eur` (cost) in PDF.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (PostgreSQL), @react-pdf/renderer, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add sell fields to `SaleOfferLockItem` |
| `src/components/sale/SaleCalculator.tsx` | Add `sellPriceEurMb` to item state + UI; sell totals; combined margin block |
| `src/components/sale/SaveSaleOfferModal.tsx` | `LockSnapshot` gets sell fields; DB INSERT uses sell columns |
| `src/components/sale/EditSaleOfferModal.tsx` | `EditableLockItem` gets `sellPriceEurMb`; load/save sell; UI input; sell totals |
| `src/components/sale/SaleOfferPDF.tsx` | Lock table uses `sell_price_eur_mb`/`sell_eur_total`; fallback for old offers |
| **Supabase SQL (manual)** | `ALTER TABLE sale_offer_lock_items ADD COLUMN ...` |

---

## Task 1: Database Migration (Supabase)

**Files:** None in codebase — run SQL in Supabase Dashboard → SQL Editor

- [ ] **Step 1: Run migration SQL in Supabase**

```sql
ALTER TABLE sale_offer_lock_items
  ADD COLUMN IF NOT EXISTS sell_price_eur_mb NUMERIC,
  ADD COLUMN IF NOT EXISTS sell_eur_total    NUMERIC,
  ADD COLUMN IF NOT EXISTS sell_pln_total    NUMERIC;
```

- [ ] **Step 2: Verify columns exist**

In Supabase → Table Editor → `sale_offer_lock_items` — confirm 3 new nullable columns appear.

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add sell fields to `SaleOfferLockItem`**

Find the `SaleOfferLockItem` interface and add 3 optional fields after `mass_t`:

```typescript
export interface SaleOfferLockItem {
  id: string;
  offer_id: string;
  lock_name: string;
  steel_grade?: string | null;
  quantity_szt?: number | null;
  length_m?: number | null;
  quantity_mb: number;
  price_eur_mb: number;          // cost price (unchanged)
  total_eur: number;             // cost total (unchanged)
  total_pln: number;             // cost total PLN (unchanged)
  sell_price_eur_mb?: number | null;  // NEW – sell price per mb
  sell_eur_total?: number | null;     // NEW – sell total EUR
  sell_pln_total?: number | null;     // NEW – sell total PLN
  mass_t: number;
  sort_order: number;
  weight_kg_m?: number | null;
}
```

- [ ] **Step 2: Build to verify no TS errors**

Run in cmd.exe / PowerShell: `npm run build`
Expected: clean build (no new errors)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add sell_price_eur_mb/sell_eur_total/sell_pln_total to SaleOfferLockItem"
```

---

## Task 3: SaleCalculator — Lock Item State & UI

**Files:**
- Modify: `src/components/sale/SaleCalculator.tsx`

This is the biggest task. Work through it in sub-steps.

### 3a — Extend interfaces and state

- [ ] **Step 1: Add `sellPriceEurMb` to `SaleLockCalcItem`**

Find `interface SaleLockCalcItem` (around line 36) and add one field:

```typescript
interface SaleLockCalcItem {
  uid: string;
  lockName: string;
  steelGrade: string;
  quantitySzt: number;
  lengthM: number;
  priceEurMb: number;       // cost price (unchanged)
  sellPriceEurMb: number;   // NEW – sell price, default = priceEurMb
}
```

- [ ] **Step 2: Add sell fields to `LockItemResult`**

Find `interface LockItemResult` (around line 45) and extend:

```typescript
interface LockItemResult {
  valid: boolean;
  totalEUR: number;         // cost total (unchanged)
  totalPLN: number;         // cost total PLN (unchanged)
  totalSellEUR: number;     // NEW
  totalSellPLN: number;     // NEW
  marginPct: number | null; // NEW – null when cost = 0
  massT: number;
}
```

### 3b — Update `addLockItem` and `updateLockItem`

- [ ] **Step 3: Seed `sellPriceEurMb` in `addLockItem`**

Find `function addLockItem()` (around line 238). After the `priceEurMb` assignment, set `sellPriceEurMb` to the same value:

```typescript
function addLockItem() {
  const def = locks[0];
  setLockItems(prev => [...prev, {
    uid: crypto.randomUUID(),
    lockName:       def?.name       ?? '',
    steelGrade:     '',
    quantitySzt:    1,
    lengthM:        12,
    priceEurMb:     def?.price_eur_mb ?? 0,
    sellPriceEurMb: def?.price_eur_mb ?? 0,   // NEW – default = cost
  }]);
}
```

- [ ] **Step 4: Update `updateLockItem` — reset `sellPriceEurMb` when `lockName` changes**

Find `function updateLockItem(uid, patch)` (around line 255). When patch contains `lockName`, also update both price fields:

```typescript
function updateLockItem(uid: string, patch: Partial<SaleLockCalcItem>) {
  setLockItems(prev => prev.map(item => {
    if (item.uid !== uid) return item;
    const updated = { ...item, ...patch };
    if (patch.lockName !== undefined) {
      const def = locks.find(l => l.name === patch.lockName);
      if (def) {
        updated.priceEurMb     = def.price_eur_mb;
        updated.sellPriceEurMb = def.price_eur_mb;   // NEW – reset to cost on lock change
      }
    }
    return updated;
  }));
}
```

### 3c — Update `lockResults` and `lockTotals` useMemos

- [ ] **Step 5: Extend `lockResults` useMemo**

Find `const lockResults = useMemo(...)` (around line 290). Add sell calculations:

```typescript
const lockResults = useMemo((): LockItemResult[] =>
  lockItems.map(item => {
    const def = locks.find(l => l.name === item.lockName);
    const quantityMb = item.quantitySzt * item.lengthM;
    const invalid = { valid: false, totalEUR: 0, totalPLN: 0, totalSellEUR: 0, totalSellPLN: 0, marginPct: null, massT: 0 };
    if (!def || quantityMb <= 0 || item.priceEurMb <= 0) return invalid;
    const totalEUR     = quantityMb * item.priceEurMb;
    const totalPLN     = totalEUR * exchangeRate;
    const totalSellEUR = quantityMb * item.sellPriceEurMb;
    const totalSellPLN = totalSellEUR * exchangeRate;
    const massT        = (quantityMb * def.weight_kg_m) / 1000;
    const marginPct    = item.priceEurMb > 0
      ? ((item.sellPriceEurMb - item.priceEurMb) / item.priceEurMb) * 100
      : null;
    return { valid: true, totalEUR, totalPLN, totalSellEUR, totalSellPLN, marginPct, massT };
  }),
  [lockItems, locks, exchangeRate]
);
```

- [ ] **Step 6: Extend `lockTotals` useMemo**

Find `const lockTotals = useMemo(...)` (around line 305). Add sell totals:

```typescript
const lockTotals = useMemo(() => {
  let totalEUR = 0, totalPLN = 0, totalSellEUR = 0, totalSellPLN = 0, totalMassT = 0;
  for (const r of lockResults) {
    if (!r.valid) continue;
    totalEUR     += r.totalEUR;
    totalPLN     += r.totalPLN;
    totalSellEUR += r.totalSellEUR;
    totalSellPLN += r.totalSellPLN;
    totalMassT   += r.massT;
  }
  return { totalEUR, totalPLN, totalSellEUR, totalSellPLN, totalMassT };
}, [lockResults]);
```

### 3d — Fix downstream references to `lockTotals`

- [ ] **Step 7: Update `lockSellCurrency` and `totalForClientInCurrency`**

Find around line 361:
```typescript
// BEFORE:
const lockSellCurrency = currency === 'EUR' ? lockTotals.totalEUR : lockTotals.totalPLN;

// AFTER:
const lockSellCurrency = currency === 'EUR' ? lockTotals.totalSellEUR : lockTotals.totalSellPLN;
```

- [ ] **Step 8: Update `LockSnapshot` shape passed to `SaveSaleOfferModal`**

**PREREQUISITE:** Task 4 Step 1 must be completed first (adds `sellPriceEurMb?` etc. to `LockSnapshot`). Otherwise the new fields below will cause a TS error since `LockSnapshot` won't know about them yet.

Find the call site where `lockItems` are mapped to `LockSnapshot[]` before being passed to `SaveSaleOfferModal` (look for the `lockSnapshot` or similar variable, or the prop passed directly). Add sell fields:

```typescript
// Find the mapping of lockItems → LockSnapshot[]:
lockItems.map((item, i) => {
  const r = lockResults[i];
  return {
    lockName:       item.lockName,
    steelGrade:     item.steelGrade,
    quantitySzt:    item.quantitySzt,
    lengthM:        item.lengthM,
    quantityMb:     item.quantitySzt * item.lengthM,
    priceEurMb:     item.priceEurMb,
    sellPriceEurMb: item.sellPriceEurMb,          // NEW
    totalEUR:       r?.valid ? r.totalEUR : 0,
    totalPLN:       r?.valid ? r.totalPLN : 0,
    totalSellEUR:   r?.valid ? r.totalSellEUR : 0, // NEW
    totalSellPLN:   r?.valid ? r.totalSellPLN : 0, // NEW
    massT:          r?.valid ? r.massT : 0,
  };
})
```

### 3e — UI: add sell price input and margin badge per lock item

- [ ] **Step 9: Add sell price input and margin badge in lock item row**

Find the lock items render section (around line 707 equivalent in SaleCalculator — the `.map` over `lockItems` that renders the grid). After the existing `priceEurMb` input, add a sell price input and margin badge. Pattern exactly mirrors grodzice section:

```tsx
{/* Cena kosztu [EUR/mb] — existing, readonly label change */}
<div>
  <label className="text-xs text-gray-500">Cena kosztu [EUR/mb]</label>
  <input
    type="number" min={0} step={0.01}
    value={item.priceEurMb}
    onChange={e => updateLockItem(item.uid, { priceEurMb: parseFloat(e.target.value) || 0 })}
    className="w-full border rounded px-2 py-1 text-sm"
  />
</div>

{/* Cena sprzedaży [EUR/mb] — NEW */}
<div>
  <label className="text-xs text-gray-500">Cena sprzedaży [EUR/mb]</label>
  <div className="flex items-center gap-2">
    <input
      type="number" min={0} step={0.01}
      value={item.sellPriceEurMb}
      onChange={e => updateLockItem(item.uid, { sellPriceEurMb: parseFloat(e.target.value) || 0 })}
      className="w-full border rounded px-2 py-1 text-sm border-blue-400 focus:ring-blue-500"
    />
    {result?.valid && result.marginPct !== null && (
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
        result.marginPct >= 10 ? 'bg-green-100 text-green-700' :
        result.marginPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
      }`}>
        {result.marginPct.toFixed(1)}% {result.marginPct >= 10 ? 'dobra marża' : result.marginPct >= 0 ? 'niska marża' : 'strata'}
      </span>
    )}
  </div>
</div>
```

Note: access `lockResults[idx]` as `result` inside the map callback.

### 3f — Update "Koszt własny vs Sprzedaż" totals block

- [ ] **Step 10: Add locks to combined margin block**

Find the totals/margin block in SaleCalculator (the section showing overall `totalCostEUR`, `totalSellEUR`, margin %). Update to include lock cost and sell:

```typescript
// Combined totals for the margin block:
const combinedCostEUR = totals.totalCostEUR + lockTotals.totalEUR;
const combinedSellEUR = totals.totalSellEUR + lockTotals.totalSellEUR;
const combinedMarginPct = combinedCostEUR > 0
  ? ((combinedSellEUR - combinedCostEUR) / combinedCostEUR) * 100
  : null;
```

In the JSX of the margin block, replace references to `totals.totalCostEUR` / `totals.totalSellEUR` / overall margin with these combined values. Keep displaying grodzice-only margin separately if the block currently shows per-section breakdown — add a "Zamki" row if locks exist.

- [ ] **Step 11: Build to verify no TS errors**

Run: `npm run build`
Expected: clean build

- [ ] **Step 12: Manual test in browser**

Run: `npm run dev` → add a lock item → confirm sell price input appears, defaults to cost, margin badge updates live.

- [ ] **Step 13: Commit**

```bash
git add src/components/sale/SaleCalculator.tsx
git commit -m "feat: cena sprzedaży i marża dla zamków w kalkulatorze sprzedaży"
```

---

## Task 4: SaveSaleOfferModal — LockSnapshot and DB INSERT

**Files:**
- Modify: `src/components/sale/SaveSaleOfferModal.tsx`

- [ ] **Step 1: Add sell fields to `LockSnapshot` interface (as optional)**

Find `export interface LockSnapshot` (near top of file, around line 10). Add 3 optional fields — keeping them optional avoids build errors if the SaleCalculator snapshot mapping is updated before this step:

```typescript
export interface LockSnapshot {
  lockName: string;
  steelGrade: string;
  quantitySzt: number;
  lengthM: number;
  quantityMb: number;
  priceEurMb: number;
  sellPriceEurMb?: number;   // NEW (optional – required after Task 3 Step 8)
  totalEUR: number;           // cost total
  totalPLN: number;           // cost total PLN
  totalSellEUR?: number;      // NEW (optional)
  totalSellPLN?: number;      // NEW (optional)
  massT: number;
}
```

**IMPORTANT:** This step must be completed BEFORE Task 3 Step 8 (snapshot mapping in SaleCalculator), because SaleCalculator imports `LockSnapshot` from this file. Run `npm run build` after this step to confirm no regressions.

- [ ] **Step 2: Add sell columns to DB INSERT**

Find the `.insert(lockItems.map(...))` call for `sale_offer_lock_items` (around line 241). Add 3 new fields:

```typescript
.insert(lockItems.map((item, idx) => ({
  offer_id:          savedOffer.id,
  lock_name:         item.lockName,
  steel_grade:       item.steelGrade || null,
  quantity_szt:      item.quantitySzt,
  length_m:          item.lengthM,
  quantity_mb:       item.quantityMb,
  price_eur_mb:      item.priceEurMb,
  sell_price_eur_mb: item.sellPriceEurMb,   // NEW
  total_eur:         item.totalEUR,
  total_pln:         item.totalPLN,
  sell_eur_total:    item.totalSellEUR,      // NEW
  sell_pln_total:    item.totalSellPLN,      // NEW
  mass_t:            item.massT,
  sort_order:        idx,
})))
```

- [ ] **Step 3: Fix `total_sell_eur` / `total_sell_pln` in `sale_offers` INSERT to use sell totals**

Find the INSERT to `sale_offers` (look for `total_sell_eur: totals.totalSellEUR + lockTotalEUR`). Replace `lockTotalEUR` with sell:

```typescript
// Find and replace the lockTotalEUR/lockTotalPLN variable declarations:
const lockTotalSellEUR = lockItems.reduce((s, i) => s + (i.totalSellEUR ?? 0), 0);
const lockTotalSellPLN = lockItems.reduce((s, i) => s + (i.totalSellPLN ?? 0), 0);

// In INSERT:
total_sell_eur: totals.totalSellEUR + lockTotalSellEUR,
total_sell_pln: totals.totalSellPLN + lockTotalSellPLN,
```

- [ ] **Step 4: Fix `totalForClientCurrency` display in modal preview**

Find the `totalForClientCurrency` variable in `SaveSaleOfferModal` (used to display the total for the client in the modal UI). Update it to use sell totals for locks:

```typescript
// Find the lockTotalEUR/lockTotalPLN used in the display formula and replace with sell totals:
const totalForClientCurrency = (currency === 'EUR'
  ? totals.totalSellEUR + lockTotalSellEUR
  : totals.totalSellPLN + lockTotalSellPLN
) + deliveryCostCurrency;
```

Also find the two JSX sub-rows that show "Wartość sprzedaży EUR" and "Wartość sprzedaży PLN" (around lines 345 and 349 of current file). These currently use `lockTotalEUR`/`lockTotalPLN` directly — replace both with `lockTotalSellEUR`/`lockTotalSellPLN`.

- [ ] **Step 5: Update preview display per lock item**

Find the preview row showing lock details (around line 327: `{item.lockName} – {item.quantityMb} mb × {item.priceEurMb} EUR/mb`). Update to also show sell price:

```tsx
{item.lockName} – {item.quantityMb.toFixed(1)} mb × {item.priceEurMb} EUR/mb (koszt) / {item.sellPriceEurMb ?? item.priceEurMb} EUR/mb (sprzedaż)
```

- [ ] **Step 6: Build and commit**

Run: `npm run build` — expect clean build.

```bash
git add src/components/sale/SaveSaleOfferModal.tsx
git commit -m "feat: zapisuj sell_price_eur_mb/sell_eur_total/sell_pln_total zamków do bazy"
```

---

## Task 5: EditSaleOfferModal — Load, Edit, Save Sell Price

**Files:**
- Modify: `src/components/sale/EditSaleOfferModal.tsx`

### 5a — Extend `EditableLockItem` and loading

- [ ] **Step 1: Add `sellPriceEurMb` to `EditableLockItem`**

Find `interface EditableLockItem` (around line 11):

```typescript
interface EditableLockItem {
  uid: string;
  lockName: string;
  steelGrade: string;
  quantitySzt: number;
  lengthM: number;
  priceEurMb: number;
  sellPriceEurMb: number;   // NEW
  weightKgM: number;
}
```

- [ ] **Step 2: Load `sell_price_eur_mb` from DB (with fallback)**

Find `function lockItemsFromOffer(offer)` (around line 87). Add field with fallback for old offers:

```typescript
function lockItemsFromOffer(offer: SaleOffer): EditableLockItem[] {
  if (!offer.lock_items || offer.lock_items.length === 0) return [];
  return offer.lock_items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item: SaleOfferLockItem) => ({
      uid:           crypto.randomUUID(),
      lockName:      item.lock_name,
      steelGrade:    item.steel_grade ?? '',
      quantitySzt:   item.quantity_szt ?? 0,
      lengthM:       item.length_m ?? 0,
      priceEurMb:    item.price_eur_mb ?? 0,
      sellPriceEurMb: item.sell_price_eur_mb ?? item.price_eur_mb ?? 0,  // fallback for old offers
      weightKgM:     item.weight_kg_m ?? 0,
    }));
}
```

### 5b — Update `addLockItem` and `updateLockItem`

- [ ] **Step 3: Seed `sellPriceEurMb` in `addLockItem`**

Find `addLockItem()` in EditSaleOfferModal (around line 248). Add `sellPriceEurMb` alongside `priceEurMb`:

```typescript
function addLockItem() {
  const def = locks[0];
  setEditLockItems(prev => [...prev, {
    uid:           crypto.randomUUID(),
    lockName:      def?.name ?? '',
    steelGrade:    '',
    quantitySzt:   1,
    lengthM:       12,
    priceEurMb:    def?.price_eur_mb ?? 0,
    sellPriceEurMb: def?.price_eur_mb ?? 0,   // NEW
    weightKgM:     def?.weight_kg_m ?? 0,
  }]);
}
```

- [ ] **Step 4: Reset `sellPriceEurMb` in `updateLockItem` when lockName changes**

Find `updateLockItem(uid, patch)` (around line 259). Same pattern as SaleCalculator:

```typescript
function updateLockItem(uid: string, patch: Partial<EditableLockItem>) {
  setEditLockItems(prev => prev.map(item => {
    if (item.uid !== uid) return item;
    const updated = { ...item, ...patch };
    if (patch.lockName !== undefined) {
      const def = locks.find(l => l.name === patch.lockName);
      if (def) {
        updated.priceEurMb     = def.price_eur_mb;
        updated.sellPriceEurMb = def.price_eur_mb;   // NEW – reset to cost on lock change
        updated.weightKgM      = def.weight_kg_m;
      }
    }
    return updated;
  }));
}
```

### 5c — Update `lockTotals` useMemo

- [ ] **Step 5: Add sell totals to `lockTotals`**

Find `const lockTotals = useMemo(...)` (around line 305):

```typescript
const lockTotals = useMemo(() => {
  let totalEUR = 0, totalPLN = 0, totalSellEUR = 0, totalSellPLN = 0;
  for (const item of editLockItems) {
    const qMb  = item.quantitySzt * item.lengthM;
    const eur  = qMb * item.priceEurMb;
    const sell = qMb * item.sellPriceEurMb;        // NEW
    totalEUR     += eur;
    totalPLN     += eur * exchangeRate;
    totalSellEUR += sell;                           // NEW
    totalSellPLN += sell * exchangeRate;            // NEW
  }
  return { totalEUR, totalPLN, totalSellEUR, totalSellPLN };
}, [editLockItems, exchangeRate]);
```

- [ ] **Step 6: Fix `totalForClientInCurrency` to use sell**

Find line ~356:
```typescript
// BEFORE:
const totalForClientInCurrency = (isEUR ? totals.totalSellEUR + lockTotals.totalEUR : totals.totalSellPLN + lockTotals.totalPLN) + deliveryCostCurrency;

// AFTER:
const totalForClientInCurrency = (isEUR
  ? totals.totalSellEUR + lockTotals.totalSellEUR
  : totals.totalSellPLN + lockTotals.totalSellPLN
) + deliveryCostCurrency;
```

- [ ] **Step 7: Fix `total_sell_eur` / `total_sell_pln` in DB UPDATE to use sell totals**

Find the UPDATE to `sale_offers` (around line 389):
```typescript
// BEFORE:
total_sell_eur: totals.totalSellEUR + lockTotals.totalEUR,
total_sell_pln: totals.totalSellPLN + lockTotals.totalPLN,

// AFTER:
total_sell_eur: totals.totalSellEUR + lockTotals.totalSellEUR,
total_sell_pln: totals.totalSellPLN + lockTotals.totalSellPLN,
```

### 5d — DB INSERT for lock items (save sell fields)

- [ ] **Step 8: Add sell columns to lock items INSERT on save**

Find the INSERT to `sale_offer_lock_items` inside `handleSave` (around line 467):

```typescript
return {
  offer_id:          offer.id,
  lock_name:         item.lockName,
  steel_grade:       item.steelGrade || null,
  quantity_szt:      item.quantitySzt,
  length_m:          item.lengthM,
  quantity_mb:       quantityMb,
  price_eur_mb:      item.priceEurMb,
  sell_price_eur_mb: item.sellPriceEurMb,          // NEW
  total_eur:         quantityMb * item.priceEurMb,
  total_pln:         quantityMb * item.priceEurMb * exchangeRate,
  sell_eur_total:    quantityMb * item.sellPriceEurMb,       // NEW
  sell_pln_total:    quantityMb * item.sellPriceEurMb * exchangeRate,  // NEW
  mass_t:            massT,
  sort_order:        idx,
};
```

### 5e — UI: add sell price input and margin badge

- [ ] **Step 9: Add sell price input and margin badge per lock item in edit UI**

Find the lock items render loop in EditSaleOfferModal JSX (around line 707). After the `priceEurMb` input, add:

```tsx
{/* Cena kosztu [EUR/mb] — existing input — change label to "Cena kosztu [EUR/mb]" if not already */}

{/* Cena sprzedaży [EUR/mb] — NEW */}
<div className="flex flex-col gap-1">
  <label className="text-xs text-gray-500">Cena sprzedaży [EUR/mb]</label>
  <div className="flex items-center gap-2">
    <input
      type="number" min={0} step={0.01}
      value={item.sellPriceEurMb}
      onChange={e => updateLockItem(item.uid, { sellPriceEurMb: parseFloat(e.target.value) || 0 })}
      className="w-24 border rounded px-2 py-1 text-sm border-blue-400"
    />
    {(() => {
      const qMb = item.quantitySzt * item.lengthM;
      const sellEur = qMb * item.sellPriceEurMb;
      const costEur = qMb * item.priceEurMb;
      const marginPct = item.priceEurMb > 0
        ? ((item.sellPriceEurMb - item.priceEurMb) / item.priceEurMb) * 100
        : null;
      return marginPct !== null ? (
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          marginPct >= 10 ? 'bg-green-100 text-green-700' :
          marginPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                             'bg-red-100 text-red-700'
        }`}>
          {marginPct.toFixed(1)}%
        </span>
      ) : null;
    })()}
  </div>
</div>
```

- [ ] **Step 10: Update lock items sum row to show sell total**

Find the sum row at the bottom of the lock items section (around line 781). Add a sell total display alongside the existing EUR total:

```tsx
{/* Add sell total next to cost total */}
<span className="text-xs text-gray-500">Koszt: {formatEUR(lockTotals.totalEUR)} EUR</span>
<span className="text-xs font-medium text-blue-700">Sprzedaż: {formatEUR(lockTotals.totalSellEUR)} EUR</span>
```

- [ ] **Step 11: Build and commit**

Run: `npm run build` — expect clean build.

```bash
git add src/components/sale/EditSaleOfferModal.tsx
git commit -m "feat: cena sprzedaży i marża zamków w edycji oferty sprzedaży"
```

---

## Task 6: SaleOfferPDF — Use Sell Price for Locks

**Files:**
- Modify: `src/components/sale/SaleOfferPDF.tsx`

- [ ] **Step 1: Use `sell_eur_total` (with fallback) for `locksTotalEUR`**

Find around line 210:
```typescript
// BEFORE:
const locksTotalEUR = sortedLocks.reduce((sum, l) => sum + (l.total_eur ?? 0), 0);
const locksTotalPLN = sortedLocks.reduce((sum, l) => sum + (l.total_pln ?? 0), 0);

// AFTER (fallback to total_eur for old offers that have no sell_eur_total):
const locksTotalEUR = sortedLocks.reduce((sum, l) => sum + (l.sell_eur_total ?? l.total_eur ?? 0), 0);
const locksTotalPLN = sortedLocks.reduce((sum, l) => sum + (l.sell_pln_total ?? l.total_pln ?? 0), 0);
```

- [ ] **Step 2: Use `sell_price_eur_mb` in lock table rows**

Find the lock table row render (around line 369, the `.map` over `sortedLocks`). Find the `price_eur_mb` and `total_eur` column cells. Change to use sell values with fallback:

```typescript
// For EUR/mb column:
{formatEUR(lock.sell_price_eur_mb ?? lock.price_eur_mb)} EUR/mb

// For Wartość EUR column:
{formatEUR(lock.sell_eur_total ?? lock.total_eur)} EUR
```

- [ ] **Step 3: Build and commit**

Run: `npm run build` — expect clean build.

```bash
git add src/components/sale/SaleOfferPDF.tsx
git commit -m "feat: PDF zamków używa ceny sprzedaży (sell_price_eur_mb/sell_eur_total)"
```

---

## Task 7: End-to-End Manual Test

- [ ] **Step 1: Test calculator**
  - Open http://localhost:5173 → Sprzedaż → Kalkulator
  - Add grodzice item + lock item
  - Verify lock item shows "Cena kosztu" and "Cena sprzedaży" inputs
  - Change sell price on lock → verify margin badge updates
  - Verify "Koszt własny vs Sprzedaż" block shows combined margin

- [ ] **Step 2: Save offer and verify DB**
  - Save offer with locks
  - In Supabase → Table Editor → `sale_offer_lock_items` → verify `sell_price_eur_mb`, `sell_eur_total`, `sell_pln_total` are populated
  - In `sale_offers` → verify `total_sell_eur` = grodzice sell + locks sell

- [ ] **Step 3: Test PDF generation**
  - Generate PDF PL and PDF EN for new offer
  - Verify lock section shows sell price (not cost price)
  - Verify total amount is correct (grodzice sell + locks sell + transport if applicable)

- [ ] **Step 4: Test edit modal**
  - Open newly saved offer in edit modal
  - Verify lock items show sell price correctly loaded
  - Change sell price → save → regenerate PDF → verify updated value

- [ ] **Step 5: Test backwards compatibility**
  - Open an old offer (saved before this feature) in edit modal
  - Verify sell price defaults to cost price (fallback works)
  - Generate PDF → verify lock amounts reasonable (fallback to `total_eur`)

- [ ] **Step 6: Final push**

```bash
git push origin main
```

---

## Summary of DB Changes

```sql
-- Run once in Supabase SQL Editor (Task 1):
ALTER TABLE sale_offer_lock_items
  ADD COLUMN IF NOT EXISTS sell_price_eur_mb NUMERIC,
  ADD COLUMN IF NOT EXISTS sell_eur_total    NUMERIC,
  ADD COLUMN IF NOT EXISTS sell_pln_total    NUMERIC;
```

No changes to `sale_locks` table. No changes to `sale_offers` schema (columns already exist).
