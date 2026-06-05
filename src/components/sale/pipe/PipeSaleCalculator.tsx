import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatNumber, formatEUR, formatPLN } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import { fetchNBPRate, formatNBPDate } from '../../../lib/nbp';
import type { NBPRate } from '../../../lib/nbp';
import type { Client, PipeSaleOffer, SaleLock, SaleSteeelGrade } from '../../../types';
import PipeSaveOfferModal from './PipeSaveOfferModal';
import type { PipeItemSnapshot, PipeOfferTotals, LockSnapshot } from './PipeSaveOfferModal';
import {
  PIPE_PRODUCT_TYPES,
  PIPE_CONDITIONS,
  PIPE_NORMS,
  PIPE_NORM_GRADES,
  PIPE_NORM_DESCRIPTIONS,
  PIPE_SURFACES,
  isCertifiedCondition,
  pipeKgPerM,
  NO_CERT_STEEL_GRADE,
  PIPE_WAREHOUSES,
  PIPE_WAREHOUSE_CUSTOM,
} from '../../../lib/pipeConstants';
import type {
  PipeProductType,
  PipeCondition,
  PipeNorm,
  PipeSurface,
} from '../../../lib/pipeConstants';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface PipeCalcItem {
  uid: string;
  productType: PipeProductType;
  condition: PipeCondition;
  norm: PipeNorm;
  steelGrade: string;
  surface: PipeSurface;
  diameterMm: number;
  wallThicknessMm: number;
  quantitySzt: number | '';
  lengthM: number | '';
  costPricePerTon: number;   // cena zakupu (w walucie oferty)
  sellPricePerTon: number;   // cena sprzedaży (w walucie oferty)
}

interface ItemResult {
  valid: boolean;
  kgPerM: number;
  totalLengthM: number;
  massT: number;
  costTotal: number;
  sellTotal: number;
  marginPct: number | null;  // null gdy brak ceny sprzedaży
}

// Zamki — katalog współdzielony sale_locks. Ceny zawsze w EUR (jak w grodzicach).
interface PipeLockCalcItem {
  uid: string;
  lockName: string;
  steelGrade: string;        // gatunek stali – informacyjnie
  quantitySzt: number | '';
  lengthM: number | '';
  priceEurMb: number;        // zawsze EUR – nie przeliczamy przy zmianie waluty
  sellPriceEurMb: number;
}

interface LockItemResult {
  valid: boolean;
  totalEUR: number;
  totalPLN: number;
  totalSellEUR: number;
  totalSellPLN: number;
  marginPct: number | null;
  massT: number;
}

// Progi i kolory marży — identyczne z SaleCalculator (grodzice).
function marginColor(pct: number): string {
  if (pct < 0)   return 'text-red-600 bg-red-50 border-red-200';
  if (pct < 5)   return 'text-orange-600 bg-orange-50 border-orange-200';
  if (pct < 10)  return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-green-700 bg-green-50 border-green-200';
}

function marginLabel(pct: number): string {
  if (pct < 0)  return '⚠ poniżej kosztu!';
  if (pct < 5)  return 'niska marża';
  if (pct < 10) return 'normalna marża';
  return 'dobra marża';
}

// ─── Pomocnicze ───────────────────────────────────────────────────────────────

function defaultItem(): PipeCalcItem {
  const norm: PipeNorm = 'EN10219-1/2';
  return {
    uid: crypto.randomUUID(),
    productType: PIPE_PRODUCT_TYPES[0],
    condition: PIPE_CONDITIONS[0],
    norm,
    steelGrade: PIPE_NORM_GRADES[norm][0],
    surface: PIPE_SURFACES[0],
    diameterMm: 168.3,
    wallThicknessMm: 6.3,
    quantitySzt: '',
    lengthM: '',
    costPricePerTon: 0,
    sellPricePerTon: 0,
  };
}

// ─── Komponent ────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  locks?: SaleLock[];
  onClientAdded: (c: Client) => void;
  onOfferSaved: (offer: PipeSaleOffer) => void;
}

export default function PipeSaleCalculator({ clients, locks = [], onClientAdded, onOfferSaved }: Props) {
  const [items, setItems] = useState<PipeCalcItem[]>([defaultItem()]);
  const [lockItems, setLockItems] = useState<PipeLockCalcItem[]>([]);
  const [grades, setGrades] = useState<SaleSteeelGrade[]>([]);
  const [currency, setCurrency] = useState<'EUR' | 'PLN'>('EUR');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // --- NBP ---
  const [nbpRate, setNbpRate]       = useState<NBPRate>({ rate: 4.25, date: '', source: 'ręczny' });
  const [nbpLoading, setNbpLoading] = useState(false);
  const [nbpError, setNbpError]     = useState('');
  const [manualRate, setManualRate] = useState(false);
  const exchangeRate = nbpRate.rate;

  // --- "Zastosuj cenę do wszystkich pozycji" (jak w grodzicach: dotyczy ceny sprzedaży) ---
  const [applyAllSellPrice, setApplyAllSellPrice] = useState<number>(0);

  // --- Dostawa (analogicznie do SaleCalculator) ---
  const TRUCK_CAPACITY_T = 24.5;
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>('');
  const [customDeliveryTrucks, setCustomDeliveryTrucks] = useState<number | ''>('');
  const [deliveryPaidBy, setDeliveryPaidBy]             = useState<'dap_included' | 'dap_extra' | 'fca' | 'cif'>('dap_included');
  const [deliveryFrom, setDeliveryFrom]                 = useState<string>(PIPE_WAREHOUSES[0]);
  const [deliveryTo, setDeliveryTo]                     = useState('');
  const [taskName, setTaskName]                         = useState('');

  useEffect(() => { loadNBP(); }, []);

  // Gatunki stali dla zamków (informacyjnie) — z grodzicowego słownika sale_steel_grades
  useEffect(() => {
    supabase.from('sale_steel_grades').select('*').order('sort_order')
      .then(({ data }) => { if (data) setGrades(data as SaleSteeelGrade[]); });
  }, []);

  async function loadNBP() {
    setNbpLoading(true);
    setNbpError('');
    try {
      const result = await fetchNBPRate();
      setNbpRate(result);
      setManualRate(false);
    } catch {
      setNbpError('Nie udało się pobrać kursu NBP. Wpisz ręcznie.');
    }
    setNbpLoading(false);
  }

  function handleManualRateChange(val: string) {
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      setNbpRate({ rate: parsed, date: '', source: 'ręczny' });
      setManualRate(true);
    }
  }

  // Konwersja cen przy toggle EUR↔PLN — używa wspólnego helpera
  // convertCurrencyValue (src/lib/currency.ts) z precision='whole'
  // (PLN do całych, EUR do 2dp — konwencja sprzedaży).
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');
    setItems(prev => prev.map(item => ({
      ...item,
      costPricePerTon: conv(item.costPricePerTon),
      sellPricePerTon: conv(item.sellPricePerTon),
    })));
    // Transport "w walucie oferty" (patrz docs/CURRENCY-CONVERSION-PATTERN.md).
    setDeliveryCostPerTruck(prev =>
      typeof prev !== 'number' ? prev : conv(prev),
    );
    setCurrency(newCurrency);
  }

  function applyPriceToAll() {
    if (applyAllSellPrice <= 0) return;
    setItems(prev => prev.map(i => ({ ...i, sellPricePerTon: applyAllSellPrice })));
  }

  // --- Zarządzanie pozycjami ---
  function addItem() {
    setItems(prev => [...prev, defaultItem()]);
  }

  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<PipeCalcItem>) {
    setItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Reset gatunku, jeśli po zmianie normy obecny gatunek nie pasuje.
      if ('norm' in patch) {
        const allowed = PIPE_NORM_GRADES[updated.norm];
        if (!allowed.includes(updated.steelGrade)) {
          updated.steelGrade = allowed[0];
        }
      }
      // Zmiana stanu materiału:
      //   bez atestu → norma "nie dotyczy" (select zablokowany), gatunek → min. S235JRH
      //   powrót do z atestem → gatunek prawidłowy (reset jeśli był min. S235JRH)
      if ('condition' in patch) {
        if (!isCertifiedCondition(updated.condition)) {
          updated.steelGrade = NO_CERT_STEEL_GRADE;
        } else if (!PIPE_NORM_GRADES[updated.norm].includes(updated.steelGrade)) {
          updated.steelGrade = PIPE_NORM_GRADES[updated.norm][0];
        }
      }
      return updated;
    }));
  }

  // --- Zarządzanie zamkami (logika 1:1 z SaleCalculator) ---
  function addLockItem() {
    if (!locks.length) return;
    const def = locks[0];
    setLockItems(prev => [...prev, {
      uid:            crypto.randomUUID(),
      lockName:       def.name,
      steelGrade:     grades[0]?.id ?? '',
      quantitySzt:    '',
      lengthM:        '',
      priceEurMb:     def.price_eur_mb,
      sellPriceEurMb: def.price_eur_mb,
    }]);
  }

  function removeLockItem(uid: string) {
    setLockItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateLockItem(uid: string, patch: Partial<PipeLockCalcItem>) {
    setLockItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // przy zmianie typu zamka – auto-uzupełnij cenę z cennika
      if ('lockName' in patch) {
        const def = locks.find(l => l.name === patch.lockName);
        if (def) {
          updated.priceEurMb     = def.price_eur_mb;
          updated.sellPriceEurMb = def.price_eur_mb;
        }
      }
      return updated;
    }));
  }

  // --- Obliczenia per pozycja ---
  const results: ItemResult[] = useMemo(
    () => items.map(it => {
      const kgPerM = pipeKgPerM(it.diameterMm, it.wallThicknessMm);
      const qty = Number(it.quantitySzt) || 0;
      const lengthM = Number(it.lengthM) || 0;
      if (kgPerM <= 0 || qty <= 0 || lengthM <= 0) {
        return { valid: false, kgPerM, totalLengthM: 0, massT: 0, costTotal: 0, sellTotal: 0, marginPct: null };
      }
      const totalLengthM = qty * lengthM;
      // Zaokrąglenie do 3dp zgodnie z konwencją CLAUDE.md
      // (wyświetlana masa × cena = wyświetlana wartość).
      const massT = Math.round((totalLengthM * kgPerM) / 1000 * 1000) / 1000;
      const costTotal = massT * (it.costPricePerTon || 0);
      const sellTotal = massT * (it.sellPricePerTon || 0);
      // Marża handlowa liczona od ceny sprzedaży (jak w SaleCalculator). null gdy brak sell.
      const marginPct = sellTotal > 0 ? ((sellTotal - costTotal) / sellTotal) * 100 : null;
      return { valid: true, kgPerM, totalLengthM, massT, costTotal, sellTotal, marginPct };
    }),
    [items],
  );

  // --- Sumy ---
  const totals = useMemo(() => {
    let totalLengthM = 0;
    let totalMassT = 0;
    let totalCost = 0;
    let totalSell = 0;
    for (const r of results) {
      if (!r.valid) continue;
      totalLengthM += r.totalLengthM;
      totalMassT  += r.massT;
      totalCost   += r.costTotal;
      totalSell   += r.sellTotal;
    }
    // Marża ważona = (suma sprzedaży − suma kosztu) / suma sprzedaży × 100.
    const totalMarginPct = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : null;
    return { totalLengthM, totalMassT, totalCost, totalSell, totalMarginPct };
  }, [results]);

  // --- Obliczenia zamków (1:1 z SaleCalculator) ---
  const lockResults = useMemo((): LockItemResult[] =>
    lockItems.map(item => {
      const def = locks.find(l => l.name === item.lockName);
      const quantityMb = (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0);
      if (!def || quantityMb <= 0 || item.priceEurMb <= 0) {
        return { valid: false, totalEUR: 0, totalPLN: 0, totalSellEUR: 0, totalSellPLN: 0, marginPct: null, massT: 0 };
      }
      const totalEUR     = quantityMb * item.priceEurMb;
      const totalSellEUR = quantityMb * item.sellPriceEurMb;
      const marginPct    = item.sellPriceEurMb > 0
        ? ((item.sellPriceEurMb - item.priceEurMb) / item.sellPriceEurMb) * 100
        : null;
      return {
        valid: true,
        totalEUR,
        totalPLN:     totalEUR * exchangeRate,
        totalSellEUR,
        totalSellPLN: totalSellEUR * exchangeRate,
        marginPct,
        massT: (quantityMb * def.weight_kg_m) / 1000,
      };
    }),
    [lockItems, locks, exchangeRate]
  );

  const lockTotals = useMemo(() => {
    let totalEUR = 0, totalPLN = 0, totalSellEUR = 0, totalSellPLN = 0, totalMassT = 0;
    for (const r of lockResults) {
      if (!r.valid) continue;
      totalEUR += r.totalEUR; totalPLN += r.totalPLN;
      totalSellEUR += r.totalSellEUR; totalSellPLN += r.totalSellPLN;
      totalMassT += r.massT;
    }
    return { totalEUR, totalPLN, totalSellEUR, totalSellPLN, totalMassT };
  }, [lockResults]);

  function fmtMoney(val: number): string {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.round(val * 100) / 100) + ' ' + currency;
  }

  // ─── Snapshoty do zapisu (dla PipeSaveOfferModal) ────────────────────────
  const snapshots = useMemo<PipeItemSnapshot[]>(
    () => items.flatMap((it, idx) => {
      const r = results[idx];
      if (!r.valid) return [];
      const certified = isCertifiedCondition(it.condition);
      return [{
        productType:      it.productType,
        condition:        it.condition,
        norm:             certified ? it.norm : '',                              // '' → NULL w bazie
        normDescription:  certified ? PIPE_NORM_DESCRIPTIONS[it.norm] : 'nie dotyczy',
        steelGrade:       it.steelGrade,
        surface:          it.surface,
        diameterMm:       it.diameterMm,
        wallThicknessMm:  it.wallThicknessMm,
        quantitySzt:      Number(it.quantitySzt) || 0,
        lengthM:          Number(it.lengthM) || 0,
        kgPerM:           r.kgPerM,
        totalLengthM:     r.totalLengthM,
        massT:            r.massT,
        costPricePerTon:  it.costPricePerTon || 0,
        sellPricePerTon:  it.sellPricePerTon || 0,
        costTotal:        r.costTotal,
        sellTotal:        r.sellTotal,
        marginPct:        r.marginPct,
      }];
    }),
    [items, results],
  );

  // Snapshot zamków do PipeSaveOfferModal (tylko poprawne pozycje)
  const lockSnapshot = useMemo<LockSnapshot[]>(() =>
    lockItems.flatMap((item, idx) => {
      const r = lockResults[idx];
      if (!r.valid) return [];
      return [{
        lockName:       item.lockName,
        steelGrade:     item.steelGrade,
        quantitySzt:    Number(item.quantitySzt) || 0,
        lengthM:        Number(item.lengthM) || 0,
        quantityMb:     (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0),
        priceEurMb:     item.priceEurMb,
        sellPriceEurMb: item.sellPriceEurMb,
        totalEUR:       r.totalEUR,
        totalPLN:       r.totalPLN,
        totalSellEUR:   r.totalSellEUR,
        totalSellPLN:   r.totalSellPLN,
        massT:          r.massT,
      }];
    }),
    [lockItems, lockResults]
  );

  const offerTotals: PipeOfferTotals = useMemo(() => ({
    totalLengthM:   totals.totalLengthM,
    totalMassT:     totals.totalMassT,
    totalCost:      totals.totalCost,
    totalSell:      totals.totalSell,
    totalMarginPct: totals.totalMarginPct,
  }), [totals]);

  // Obliczenia dostawy — auto-szacunek aut + totale (1:1 wzór z SaleCalculator)
  const deliveryCalc = useMemo(() => {
    if (totals.totalMassT + lockTotals.totalMassT <= 0) return null;
    const combinedMassT   = totals.totalMassT + lockTotals.totalMassT;
    const autoTrucks      = Math.ceil(combinedMassT / TRUCK_CAPACITY_T);
    const trucks          = typeof customDeliveryTrucks === 'number' && customDeliveryTrucks > 0
      ? customDeliveryTrucks : autoTrucks;
    const costPerTruck    = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    // PLN canonical (dla zapisu w bazie jako delivery_cost_total — w PLN)
    const totalCostPLN    = currency === 'PLN' ? totalInCurrency : totalInCurrency * exchangeRate;
    return { combinedMassT, autoTrucks, trucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [totals.totalMassT, lockTotals.totalMassT, customDeliveryTrucks, deliveryCostPerTruck, currency, exchangeRate]);

  // Snapshot dostawy do PipeSaveOfferModal — null gdy brak masy lub FCA (klient sam)
  const deliverySnapshot = useMemo(() => {
    if (!deliveryCalc || deliveryPaidBy === 'fca' || deliveryPaidBy === 'cif') {
      return { paidBy: deliveryPaidBy, trucks: 0, costPerTruck: 0, totalCostPLN: 0, from: deliveryFrom, to: deliveryTo };
    }
    return {
      paidBy:       deliveryPaidBy,
      trucks:       deliveryCalc.trucks,
      costPerTruck: deliveryCalc.costPerTruck,
      totalCostPLN: deliveryCalc.totalCostPLN,
      from:         deliveryFrom,
      to:           deliveryTo,
    };
  }, [deliveryCalc, deliveryPaidBy, deliveryFrom, deliveryTo]);

  // Tryb własnego magazynu — gdy deliveryFrom nie jest żadnym ze stałych magazynów
  const isCustomWarehouse = !(PIPE_WAREHOUSES as readonly string[]).includes(deliveryFrom);

  // Każda dodana pozycja musi mieć dodatnią ilość i długość — pusta/0 blokuje zapis
  const allItemsValid = items.length > 0 && results.every(r => r.valid);
  const hasEmptyItems = items.length > 0 && !allItemsValid;
  // Walidacja zamków (pusta pozycja zamka blokuje zapis — analogicznie do rur)
  const hasValidLocks = lockResults.some(r => r.valid);
  const hasEmptyLocks = lockItems.length > 0 && !lockResults.every(r => r.valid);
  // Rury poprawne i z ceną sprzedaży > 0 (gdy są jakieś rury)
  const pipesPriced   = snapshots.length > 0 && snapshots.every(s => s.sellPricePerTon > 0);
  // Zapis możliwy gdy: poprawnie wycenione rury LUB poprawne zamki (oferta samych zamków),
  // i żadna pozycja (rura/zamek) nie jest pusta.
  const canSave =
    ((allItemsValid && pipesPriced) || (items.length === 0 && hasValidLocks)) &&
    !hasEmptyItems && !hasEmptyLocks;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── KURS NBP + WALUTA + APPLY ── (układ 1:1 z SaleCalculator) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Kurs EUR/PLN z NBP */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kurs EUR/PLN</label>
            {nbpLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                Pobieranie kursu NBP...
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={nbpRate.rate.toFixed(4)}
                  onChange={e => handleManualRateChange(e.target.value)}
                  className={`w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    manualRate ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'
                  }`}
                />
                <div className="text-xs">
                  {manualRate ? (
                    <span className="text-amber-600 font-medium">ręczny</span>
                  ) : (
                    <span className="text-green-600 font-medium">
                      NBP {nbpRate.date ? `· ${formatNBPDate(nbpRate.date)}` : ''}
                    </span>
                  )}
                  <button
                    onClick={loadNBP}
                    disabled={nbpLoading}
                    className="ml-2 text-blue-600 hover:underline disabled:opacity-40"
                    title="Pobierz aktualny kurs z NBP"
                  >
                    {nbpLoading ? '...' : '↺'}
                  </button>
                </div>
              </div>
            )}
            {nbpError && (
              <p className="text-xs text-amber-600 mt-1">{nbpError}</p>
            )}
          </div>

          {/* Waluta oferty */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Waluta oferty</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
              {(['EUR', 'PLN'] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => handleCurrencyChange(cur)}
                  className={`px-4 py-1.5 transition-colors ${
                    currency === cur ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>

          {/* Zastosuj cenę sprzedaży do wszystkich pozycji */}
          <div className="ml-auto">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zastosuj cenę do wszystkich pozycji</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} step={1}
                value={applyAllSellPrice || ''}
                placeholder={`${currency}/t`}
                onChange={e => setApplyAllSellPrice(parseFloat(e.target.value) || 0)}
                className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={applyPriceToAll}
                className="px-3 py-1.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors"
              >
                Zastosuj
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pozycje ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">Pozycje oferty</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={addItem}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              + Dodaj pozycję
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!canSave}
              title={!canSave ? 'Uzupełnij ilość/długość i cenę sprzedaży > 0 w każdej pozycji' : 'Zapisz ofertę do bazy z numerem SR/YYYY/NNN'}
              className="px-3 py-1.5 text-sm font-medium bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Zapisz ofertę
            </button>
          </div>
        </div>

        {hasEmptyItems && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-4 text-red-700 text-sm text-center font-medium">
            Uzupełnij ilość i długość we wszystkich pozycjach — pozycje bez wartości nie mogą zostać zapisane.
          </div>
        )}

        {items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Brak pozycji · kliknij „Dodaj pozycję" aby rozpocząć
          </p>
        )}

        <div className="space-y-4">
          {items.map((item, idx) => {
            const r = results[idx];
            const allowedGrades = PIPE_NORM_GRADES[item.norm];
            const certified = isCertifiedCondition(item.condition);
            const normDescription = certified ? PIPE_NORM_DESCRIPTIONS[item.norm] : 'nie dotyczy';

            return (
              <div key={item.uid} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Pozycja #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(item.uid)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      Usuń
                    </button>
                  )}
                </div>

                {/* Pola wyboru (typ / stan / powierzchnia / norma / gatunek / opis) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  <Field label="Typ produktu">
                    <select
                      value={item.productType}
                      onChange={e => updateItem(item.uid, { productType: e.target.value as PipeProductType })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PIPE_PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>

                  <Field label="Stan materiału">
                    <select
                      value={item.condition}
                      onChange={e => updateItem(item.uid, { condition: e.target.value as PipeCondition })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PIPE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>

                  <Field label="Powierzchnia">
                    <select
                      value={item.surface}
                      onChange={e => updateItem(item.uid, { surface: e.target.value as PipeSurface })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PIPE_SURFACES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>

                  <Field label="Norma">
                    {certified ? (
                      <select
                        value={item.norm}
                        onChange={e => updateItem(item.uid, { norm: e.target.value as PipeNorm })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PIPE_NORMS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ) : (
                      // Bez atestu → norma nie obowiązuje; select zablokowany
                      <div className="w-full px-2 py-1.5 rounded-lg text-sm border bg-gray-100 border-gray-300 text-gray-400 italic">
                        nie dotyczy
                      </div>
                    )}
                  </Field>

                  <Field label="Gatunek stali">
                    {certified ? (
                      <select
                        value={item.steelGrade}
                        onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {allowedGrades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ) : (
                      // Bez atestu → gatunek niegwarantowany; deklarujemy minimum
                      <div className="w-full px-2 py-1.5 rounded-lg text-sm border bg-gray-100 border-gray-300 text-gray-500">
                        {NO_CERT_STEEL_GRADE}
                      </div>
                    )}
                  </Field>

                  <Field label="Opis normy produkcyjnej">
                    <div className={`px-2 py-1.5 rounded-lg text-sm border ${
                      certified
                        ? 'bg-white border-gray-300 text-gray-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700 italic'
                    }`}>
                      {normDescription}
                    </div>
                  </Field>
                </div>

                {/* Pola liczbowe (wymiary, ilość, ceny) */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  <Field label="Ø zewn. [mm]">
                    <input
                      type="number" step="0.1" min={0}
                      value={item.diameterMm}
                      onChange={e => updateItem(item.uid, { diameterMm: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </Field>
                  <Field label="Grubość ścianki [mm]">
                    <input
                      type="number" step="0.1" min={0}
                      value={item.wallThicknessMm}
                      onChange={e => updateItem(item.uid, { wallThicknessMm: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </Field>
                  <Field label="Ilość [szt]">
                    <input
                      type="number" step={1} min={0} placeholder="np. 10"
                      value={item.quantitySzt}
                      onChange={e => updateItem(item.uid, { quantitySzt: e.target.value === '' ? '' : (parseInt(e.target.value, 10) || 0) })}
                      className={`w-full px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${!(Number(item.quantitySzt) > 0) ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`}
                    />
                  </Field>
                  <Field label="Długość 1 szt [m]">
                    <input
                      type="number" step="0.01" min={0} placeholder="np. 12"
                      value={item.lengthM}
                      onChange={e => updateItem(item.uid, { lengthM: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                      className={`w-full px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 ${!(Number(item.lengthM) > 0) ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`}
                    />
                  </Field>
                  <Field label={`Cena zakupu [${currency}/t]`}>
                    <input
                      type="number" step="0.01" min={0}
                      value={item.costPricePerTon || ''}
                      placeholder={`${currency}/t`}
                      onChange={e => updateItem(item.uid, { costPricePerTon: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </Field>
                  <Field label={`Cena sprz. [${currency}/t]`}>
                    <input
                      type="number" step="0.01" min={0}
                      value={item.sellPricePerTon || ''}
                      placeholder={`${currency}/t`}
                      onChange={e => updateItem(item.uid, { sellPricePerTon: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </Field>
                </div>

                {/* Wyniki obliczeń */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-gray-200">
                  <Metric
                    label="kg/m"
                    value={r.kgPerM > 0 ? formatNumber(r.kgPerM, 3) : '—'}
                  />
                  <Metric
                    label="Łączna długość"
                    value={r.valid ? `${formatNumber(r.totalLengthM, 2)} m` : '—'}
                  />
                  <Metric
                    label="Masa"
                    value={r.valid ? `${formatNumber(r.massT, 3)} t` : '—'}
                  />
                  <Metric
                    label="Koszt pozycji"
                    value={r.valid ? fmtMoney(r.costTotal) : '—'}
                  />
                  <Metric
                    label="Wartość pozycji"
                    value={r.valid ? fmtMoney(r.sellTotal) : '—'}
                    highlight
                  />
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Marża</div>
                    {r.marginPct === null ? (
                      <div className="text-base font-semibold text-gray-400">—</div>
                    ) : (
                      <>
                        <div className={`inline-block px-2 py-0.5 rounded-md border text-sm font-semibold ${marginColor(r.marginPct)}`}>
                          {formatNumber(r.marginPct, 1)}%
                          <span className="ml-1 text-xs font-normal opacity-80">· {marginLabel(r.marginPct)}</span>
                        </div>
                        {/* Marża kwotowa = wartość sprzedaży − koszt */}
                        <div className="text-xs text-gray-600 mt-0.5">{fmtMoney(r.sellTotal - r.costTotal)}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ZAMKI ── (katalog współdzielony sale_locks) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">🔗 Zamki</h2>
            <p className="text-xs text-gray-400 mt-0.5">Cena za metr bieżący [{currency}/mb] · wyliczenie niezależne od rur</p>
          </div>
          <button onClick={addLockItem}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
            + Dodaj zamek
          </button>
        </div>

        {lockItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Brak zamków · kliknij „Dodaj zamek" aby dodać pozycję
          </p>
        ) : (
          <div className="space-y-3">
            {lockItems.map((item, idx) => {
              const r      = lockResults[idx];
              const def    = locks.find(l => l.name === item.lockName);
              const defPrice = def?.price_eur_mb ?? 0;
              const priceChanged = item.priceEurMb !== defPrice && defPrice > 0;
              const displayCostMb = currency === 'PLN'
                ? Math.round(item.priceEurMb * exchangeRate * 100) / 100
                : item.priceEurMb;
              const displaySellMb = currency === 'PLN'
                ? Math.round(item.sellPriceEurMb * exchangeRate * 100) / 100
                : item.sellPriceEurMb;
              const displayDefPrice = currency === 'PLN'
                ? Math.round(defPrice * exchangeRate * 100) / 100
                : defPrice;

              const quantityMb = (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0);
              const lockQtyInvalid = !(Number(item.quantitySzt) > 0);
              const lockLenInvalid = !(Number(item.lengthM) > 0);

              return (
                <div key={item.uid} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">

                    {/* 1. Typ zamka */}
                    <div className="sm:col-span-3">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Typ zamka</label>}
                      <select value={item.lockName}
                        onChange={e => updateLockItem(item.uid, { lockName: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {locks.map(l => (
                          <option key={l.id} value={l.name}>{l.name} ({l.weight_kg_m} kg/mb)</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Gatunek stali */}
                    <div className="sm:col-span-2">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek</label>}
                      <select value={item.steelGrade}
                        onChange={e => updateLockItem(item.uid, { steelGrade: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {grades.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Ilość [szt.] */}
                    <div className="sm:col-span-1">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość [szt.]</label>}
                      <input type="number" min={1} step={1} placeholder="np. 10"
                        value={item.quantitySzt}
                        onChange={e => updateLockItem(item.uid, { quantitySzt: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                        className={`w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 ${lockQtyInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                    </div>

                    {/* 4. Długość [m] */}
                    <div className="sm:col-span-1">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Dł. [m]</label>}
                      <input type="number" min={0.1} step={0.1} placeholder="np. 12"
                        value={item.lengthM}
                        onChange={e => updateLockItem(item.uid, { lengthM: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0) })}
                        className={`w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 ${lockLenInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                    </div>

                    {/* mb (obliczone) */}
                    <div className="sm:col-span-1">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Łącznie [mb]</label>}
                      <div className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-right text-gray-600 min-h-[38px] flex items-center justify-end">
                        {quantityMb > 0 ? formatNumber(quantityMb, 1) : <span className="text-gray-400">—</span>}
                      </div>
                    </div>

                    {/* 5. Cena kosztu [currency]/mb */}
                    <div className="sm:col-span-2">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Cena kosztu [{currency}/mb]</label>}
                      <input type="number" min={0} step={0.5}
                        value={displayCostMb || ''}
                        onChange={e => {
                          const parsed = parseFloat(e.target.value) || 0;
                          updateLockItem(item.uid, { priceEurMb: currency === 'PLN' ? parsed / exchangeRate : parsed });
                        }}
                        className={`w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold ${
                          priceChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'
                        }`} />
                      {priceChanged && (
                        <button onClick={() => updateLockItem(item.uid, { priceEurMb: defPrice })}
                          className="text-xs text-blue-600 underline mt-0.5">
                          przywróć ({displayDefPrice} {currency}/mb)
                        </button>
                      )}
                    </div>

                    {/* 5b. Cena sprzedaży [currency]/mb */}
                    <div className="sm:col-span-2">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Cena sprzedaży [{currency}/mb]</label>}
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} step={0.01}
                          value={displaySellMb || ''}
                          onChange={e => {
                            const parsed = parseFloat(e.target.value) || 0;
                            updateLockItem(item.uid, { sellPriceEurMb: currency === 'PLN' ? parsed / exchangeRate : parsed });
                          }}
                          className="w-full border rounded px-2 py-2 text-sm border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {r.valid && r.marginPct !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap inline-block mt-0.5 ${
                          r.marginPct >= 10 ? 'bg-green-100 text-green-700' :
                          r.marginPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-red-100 text-red-700'
                        }`}>
                          {r.marginPct.toFixed(1)}% {r.marginPct >= 10 ? 'dobra marża' : r.marginPct >= 0 ? 'niska marża' : 'strata'}
                        </span>
                      )}
                    </div>

                    {/* 6. Masa [t] */}
                    <div className="sm:col-span-1">
                      {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Masa [t]</label>}
                      <div className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-right font-semibold text-gray-800 min-h-[38px] flex items-center justify-end">
                        {r.valid ? formatNumber(r.massT, 3) : <span className="text-gray-400">—</span>}
                      </div>
                    </div>

                    {/* Usuń */}
                    <div className="sm:col-span-1 flex justify-end">
                      <button onClick={() => removeLockItem(item.uid)}
                        className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
                        title="Usuń zamek">✕</button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Podsumowanie zamków */}
            {lockTotals.totalEUR > 0 && (
              <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Podsumowanie zamków</p>
                <div className="flex flex-wrap gap-8">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Wartość sprzedaży</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {currency === 'EUR'
                        ? `${formatEUR(lockTotals.totalSellEUR)} EUR`
                        : `${formatPLN(lockTotals.totalSellPLN)} PLN`}
                    </p>
                    <p className="text-sm text-blue-700 mt-0.5">
                      {currency === 'EUR'
                        ? `≈ ${formatPLN(lockTotals.totalSellPLN)} PLN`
                        : `≈ ${formatEUR(lockTotals.totalSellEUR)} EUR`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      koszt: {currency === 'EUR'
                        ? `${formatEUR(lockTotals.totalEUR)} EUR`
                        : `${formatPLN(lockTotals.totalPLN)} PLN`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Masa zamków</p>
                    <p className="text-2xl font-bold text-gray-800">{formatNumber(lockTotals.totalMassT, 3)} t</p>
                    <p className="text-xs text-gray-400 mt-0.5">łącznie dla {lockItems.filter((_, i) => lockResults[i]?.valid).length} poz.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Podsumowanie ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Podsumowanie</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard label="Łączna długość" value={`${formatNumber(totals.totalLengthM, 2)} m`} />
          <SummaryCard label="Łączna masa"    value={`${formatNumber(totals.totalMassT, 3)} t`} />
          <SummaryCard label="Koszt łączny"   value={fmtMoney(totals.totalCost)} />
          <SummaryCard label="Suma oferty"    value={fmtMoney(totals.totalSell)} highlight />
          <div className={`p-4 rounded-lg border ${
            totals.totalMarginPct === null
              ? 'bg-gray-50 border-gray-200'
              : marginColor(totals.totalMarginPct)
          }`}>
            <div className="text-xs text-gray-600 mb-1">Marża ważona</div>
            {totals.totalMarginPct === null ? (
              <div className="text-lg font-bold text-gray-400">—</div>
            ) : (
              <>
                <div className="text-lg font-bold">{formatNumber(totals.totalMarginPct, 1)}%</div>
                {/* Marża kwotowa łączna = suma sprzedaży − suma kosztu */}
                <div className="text-sm font-semibold">{fmtMoney(totals.totalSell - totals.totalCost)}</div>
                <div className="text-xs font-normal opacity-80">{marginLabel(totals.totalMarginPct)}</div>
              </>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Zapis ofert do bazy aktywny. Edycja zapisanych ofert i generowanie PDF — faza 3.
        </p>
      </div>

      {/* ── DOSTAWA ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Koszty dostawy</h2>
        <p className="text-xs text-gray-400 mb-1">
          Ładowność auta: <strong className="text-gray-600">24,5 t</strong>
          {deliveryCalc ? (
            <>
              {' · '}Masa łączna:{' '}
              <strong className="text-gray-700">{formatNumber(deliveryCalc.combinedMassT, 3)} t</strong>
              {' · '}Szacowane auta:{' '}
              <strong className="text-gray-700">{deliveryCalc.autoTrucks}</strong>
            </>
          ) : (
            <span> · Masa łączna: <strong className="text-gray-500">—</strong> (brak pozycji)</span>
          )}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          {deliveryCalc && deliveryCalc.combinedMassT > 0 && (
            <>
              {Math.ceil(deliveryCalc.combinedMassT / TRUCK_CAPACITY_T) === 1
                ? `${formatNumber(deliveryCalc.combinedMassT, 3)} t mieści się na 1 aucie`
                : `${formatNumber(deliveryCalc.combinedMassT, 3)} t ÷ 24,5 t = ${deliveryCalc.autoTrucks} aut (zaokrąglone w górę)`
              }
            </>
          )}
        </p>

        {/* Opcja dostawy – 3 radio */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Opcja dostawy:</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {([
              { val: 'dap_included', label: 'DAP – dostawa w cenie',     desc: 'Intra organizuje i pokrywa koszt' },
              { val: 'dap_extra',    label: 'DAP – refaktura na klienta', desc: 'Intra organizuje, klient płaci osobno' },
              { val: 'fca',          label: 'FCA – odbiór własny',        desc: 'Klient podstawia własne auto' },
              { val: 'cif',          label: 'CIF – odbiór z portu',       desc: 'Klient odbiera z portu docelowego' },
            ] as const).map(({ val, label, desc }) => (
              <label key={val} className={`flex-1 flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                deliveryPaidBy === val ? 'border-blue-700 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="radio" name="pipeDeliveryPaidBy" value={val}
                  checked={deliveryPaidBy === val}
                  onChange={() => setDeliveryPaidBy(val)}
                  className="accent-blue-900 mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">{label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Liczba aut + Koszt/auto — ukryte dla FCA */}
        {deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Liczba aut</label>
              <input
                type="number" min={1} step={1}
                value={customDeliveryTrucks === '' ? 1 : customDeliveryTrucks}
                onChange={e => setCustomDeliveryTrucks(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Auto-szacunek z masy: {deliveryCalc?.autoTrucks ?? '—'} aut
                {deliveryCalc && typeof customDeliveryTrucks === 'number' && customDeliveryTrucks > 0
                  && customDeliveryTrucks !== deliveryCalc.autoTrucks
                  && <span className="text-amber-500 ml-1">(zmienione ręcznie)</span>}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Koszt / auto [{currency}]
              </label>
              <input
                type="number" min={0} step={currency === 'EUR' ? 10 : 100}
                value={deliveryCostPerTruck}
                placeholder={currency === 'EUR' ? 'np. 600' : 'np. 2500'}
                onChange={e => setDeliveryCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Nazwa zadania (opcjonalnie) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
          <input type="text" value={taskName} maxLength={35}
            onChange={e => setTaskName(e.target.value)}
            placeholder="np. Budowa S5 odcinek Korzeńsko"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Trasa: Skąd + Dokąd */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {deliveryPaidBy === 'fca' ? 'Odbiór z magazynu' : deliveryPaidBy === 'cif' ? 'Odbiór z portu' : 'Magazyn wysyłki'}
            </label>
            <select
              value={isCustomWarehouse ? PIPE_WAREHOUSE_CUSTOM : deliveryFrom}
              onChange={e => setDeliveryFrom(e.target.value === PIPE_WAREHOUSE_CUSTOM ? '' : e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PIPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
              <option value={PIPE_WAREHOUSE_CUSTOM}>— wpisz własny adres —</option>
            </select>
            {isCustomWarehouse && (
              <input
                type="text"
                value={deliveryFrom}
                placeholder="np. Magazyn klienta, ul. ..., miasto"
                onChange={e => setDeliveryFrom(e.target.value)}
                className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
          {deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dokąd</label>
              <input
                type="text" value={deliveryTo}
                placeholder="ul. Przykładowa 1, Warszawa"
                onChange={e => setDeliveryTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Podsumowanie kosztów dostawy (DAP gdy wpisano koszt) */}
        {deliveryCalc && deliveryCalc.costPerTruck > 0 && deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
          <div className="mt-2 pt-4 border-t border-gray-100">
            <div className={`inline-block rounded-lg px-5 py-3 text-right ${deliveryPaidBy === 'dap_extra' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'}`}>
              <p className="text-xs text-gray-500 mb-0.5">
                {deliveryCalc.trucks} {deliveryCalc.trucks === 1 ? 'auto' : deliveryCalc.trucks <= 4 ? 'auta' : 'aut'} ×{' '}
                {currency === 'EUR' ? `${formatEUR(deliveryCalc.costPerTruck)} EUR` : `${formatPLN(deliveryCalc.costPerTruck)} PLN`}
              </p>
              <p className="text-xl font-bold text-gray-800">
                {currency === 'EUR' ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR` : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
              </p>
              <p className={`text-xs font-medium mt-0.5 ${deliveryPaidBy === 'dap_extra' ? 'text-orange-600' : 'text-gray-500'}`}>
                {deliveryPaidBy === 'dap_extra' ? '⚠ Refaktura na klienta' : 'Koszt po stronie Intra B.V.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal zapisu oferty */}
      {showSaveModal && (
        <PipeSaveOfferModal
          clients={clients}
          items={snapshots}
          lockItems={lockSnapshot}
          totals={offerTotals}
          currency={currency}
          exchangeRate={exchangeRate}
          delivery={deliverySnapshot}
          taskName={taskName}
          onClose={() => setShowSaveModal(false)}
          onClientAdded={onClientAdded}
          onSaved={(offer) => {
            setShowSaveModal(false);
            onOfferSaved(offer);
          }}
        />
      )}
    </div>
  );
}

// ─── Wewnętrzne komponenty wizualne ───────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-semibold ${highlight ? 'text-blue-900' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${
      highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-blue-900' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}
