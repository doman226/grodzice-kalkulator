import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client, PipeSaleOffer, PipeSaleOfferItem, PipeSaleOfferLockItem, OfferStatus, SaleLock, SaleSteeelGrade } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import ClientSearchInput from '../../ClientSearchInput';
import { SALES_REPS } from '../../../lib/constants';
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
  PIPE_WAREHOUSE_DELIVERY_OPTIONS,
} from '../../../lib/pipeConstants';
import type {
  PipeProductType,
  PipeCondition,
  PipeNorm,
  PipeSurface,
} from '../../../lib/pipeConstants';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface EditablePipeItem {
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
  costPricePerTon: number;   // w walucie oferty (snapshot)
  sellPricePerTon: number;
}

// Zamek edytowalny — lustro PipeLockCalcItem z kalkulatora. Ceny zawsze w EUR.
interface EditableLockItem {
  uid: string;
  lockName: string;
  steelGrade: string;
  quantitySzt: number | '';
  lengthM: number | '';
  priceEurMb: number;
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

interface Props {
  offer: PipeSaleOffer;
  clients: Client[];
  locks?: SaleLock[];
  onSaved: (offer: PipeSaleOffer) => void;
  onClose: () => void;
  mode?: 'edit' | 'copy';
}

// ─── Stałe i pomocnicze ─────────────────────────────────────────────────────

const TRUCK_CAPACITY_T = 24.5;

const STATUS_LABELS: Record<OfferStatus, string> = {
  szkic:     'Szkic',
  wysłana:   'Wysłana',
  przyjęta:  'Przyjęta',
  odrzucona: 'Odrzucona',
};

// Mapowanie z pozycji w bazie na edytowalny rekord lokalny.
// Norma w bazie może być NULL (gdy stan bez atestu) — pre-fill na pierwszą valid normę
// żeby <select> miał valid value; faktyczny zapis ponownie wyzeruje normę jeśli stan = "bez atestu".
function itemsFromOffer(offer: PipeSaleOffer): EditablePipeItem[] {
  if (!offer.items || offer.items.length === 0) {
    return [{
      uid: crypto.randomUUID(),
      productType: PIPE_PRODUCT_TYPES[0],
      condition: PIPE_CONDITIONS[0],
      norm: 'EN10219-1/2',
      steelGrade: PIPE_NORM_GRADES['EN10219-1/2'][0],
      surface: PIPE_SURFACES[0],
      diameterMm: 168.3,
      wallThicknessMm: 6.3,
      quantitySzt: '',
      lengthM: '',
      costPricePerTon: 0,
      sellPricePerTon: 0,
    }];
  }
  return offer.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => ({
      uid: crypto.randomUUID(),
      productType: (PIPE_PRODUCT_TYPES.includes(item.product_type as PipeProductType)
        ? item.product_type
        : PIPE_PRODUCT_TYPES[0]) as PipeProductType,
      condition: (PIPE_CONDITIONS.includes(item.condition as PipeCondition)
        ? item.condition
        : PIPE_CONDITIONS[0]) as PipeCondition,
      // norma w bazie może być NULL — fallback na EN10219-1/2 dla UI, faktyczny zapis poprawnie wyzeruje
      norm: (item.norm && PIPE_NORMS.includes(item.norm as PipeNorm)
        ? item.norm
        : 'EN10219-1/2') as PipeNorm,
      steelGrade: item.steel_grade,
      surface: (PIPE_SURFACES.includes(item.surface as PipeSurface)
        ? item.surface
        : PIPE_SURFACES[0]) as PipeSurface,
      diameterMm: item.diameter_mm,
      wallThicknessMm: item.wall_thickness_mm,
      quantitySzt: item.quantity_szt,
      lengthM: item.length_m,
      costPricePerTon: item.cost_price_per_ton ?? 0,
      sellPricePerTon: item.sell_price_per_ton ?? 0,
    }));
}

// Mapowanie pozycji zamków z oferty na edytowalne rekordy. Ceny w bazie są w EUR.
function lockItemsFromOffer(offer: PipeSaleOffer): EditableLockItem[] {
  return (offer.lock_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(l => ({
      uid: crypto.randomUUID(),
      lockName:       l.lock_name,
      steelGrade:     l.steel_grade ?? '',
      quantitySzt:    l.quantity_szt ?? '',
      lengthM:        l.length_m ?? '',
      priceEurMb:     l.price_eur_mb,
      sellPriceEurMb: l.sell_price_eur_mb ?? l.price_eur_mb,
    }));
}

// Margin coloring — 1:1 z PipeSaleCalculator
function marginColor(pct: number): string {
  if (pct < 0)   return 'text-red-600 bg-red-50 border-red-200';
  if (pct < 5)   return 'text-orange-600 bg-orange-50 border-orange-200';
  if (pct < 10)  return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-green-700 bg-green-50 border-green-200';
}

// ─── Komponent ───────────────────────────────────────────────────────────────

export default function PipeEditOfferModal({ offer, clients, locks = [], onSaved, onClose, mode = 'edit' }: Props) {
  const isCopy = mode === 'copy';
  // ── Stan: lazy initial dla pre-fillu ──
  const [editItems, setEditItems]     = useState<EditablePipeItem[]>(() => itemsFromOffer(offer));
  const [editLocks, setEditLocks]     = useState<EditableLockItem[]>(() => lockItemsFromOffer(offer));
  const [grades, setGrades]           = useState<SaleSteeelGrade[]>([]);
  const [clientId, setClientId]       = useState(offer.client_id ?? '');
  const [taskName, setTaskName]       = useState(offer.task_name ?? '');
  const [status, setStatus]           = useState<OfferStatus>(offer.status);
  const [preparedBy, setPreparedBy]   = useState(offer.prepared_by ?? SALES_REPS[0].name);
  const [notes, setNotes]             = useState(offer.notes ?? '');
  const [validDays, setValidDays]     = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);

  // ── Waluta ──
  const [currency, setCurrency]         = useState<'EUR' | 'PLN'>((offer.currency ?? 'EUR') as 'EUR' | 'PLN');
  const [exchangeRate, setExchangeRate] = useState(offer.exchange_rate ?? 4.25);

  // ── Dostawa: reverse-calc kosztu/auto z totalu jeśli zapisana wartość brakuje ──
  const [deliveryTrucks, setDeliveryTrucks]             = useState<number | ''>(offer.delivery_trucks ?? '');
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>(() => {
    if (offer.delivery_cost_per_truck != null) return offer.delivery_cost_per_truck;
    if (offer.delivery_cost_total && offer.delivery_trucks && offer.delivery_trucks > 0) {
      const rate = offer.exchange_rate ?? 4.25;
      // delivery_cost_total to PLN canonical — przelicz na walutę oferty per truck
      const totalInCurrency = offer.currency === 'EUR'
        ? offer.delivery_cost_total / rate
        : offer.delivery_cost_total;
      return totalInCurrency / offer.delivery_trucks;
    }
    return '';
  });
  const [deliveryPaidBy, setDeliveryPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca' | 'cif'>(
    (offer.delivery_paid_by as 'dap_included' | 'dap_extra' | 'fca' | 'cif') ?? 'dap_included'
  );
  // Magazyn wysyłki — wartość spoza listy (np. stara oferta "Magazyn dostawcy")
  // automatycznie trafia do trybu własnego (pole tekstowe).
  const [deliveryFrom, setDeliveryFrom] = useState<string>(offer.delivery_from ?? PIPE_WAREHOUSES[0]);
  const [deliveryTo, setDeliveryTo]     = useState(offer.delivery_to ?? '');

  // ── Warunki dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>(
    (offer.delivery_timeline as 'huta' | 'magazyn') ?? 'magazyn'
  );
  const [campaignWeeks, setCampaignWeeks]                 = useState(offer.campaign_weeks ?? '');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState(offer.campaign_delivery_weeks ?? '');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState(offer.warehouse_delivery_time ?? '5–7 dni roboczych');
  const [deliveryTerms, setDeliveryTerms]                 = useState<'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF'>(
    (offer.delivery_terms as 'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF') ?? 'DAP'
  );
  const [fcaLocation, setFcaLocation] = useState(offer.fca_location ?? '');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Gatunki stali zamków (informacyjnie) — z grodzicowego słownika sale_steel_grades
  useEffect(() => {
    supabase.from('sale_steel_grades').select('*').order('sort_order')
      .then(({ data }) => { if (data) setGrades(data as SaleSteeelGrade[]); });
  }, []);

  // Tryb własnego magazynu — gdy deliveryFrom nie jest żadnym ze stałych magazynów
  const isCustomWarehouse = !(PIPE_WAREHOUSES as readonly string[]).includes(deliveryFrom);

  // ── Zarządzanie pozycjami ──
  function addItem() {
    const norm: PipeNorm = 'EN10219-1/2';
    setEditItems(prev => [...prev, {
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
    }]);
  }

  function removeItem(uid: string) {
    setEditItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<EditablePipeItem>) {
    setEditItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Reset gatunku jeśli po zmianie normy obecny gatunek nie pasuje
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

  // ── Zarządzanie zamkami (1:1 z PipeSaleCalculator) ──
  function addLockItem() {
    if (!locks.length) return;
    const def = locks[0];
    setEditLocks(prev => [...prev, {
      uid: crypto.randomUUID(), lockName: def.name, steelGrade: grades[0]?.id ?? '',
      quantitySzt: '', lengthM: '', priceEurMb: def.price_eur_mb, sellPriceEurMb: def.price_eur_mb,
    }]);
  }
  function removeLockItem(uid: string) {
    setEditLocks(prev => prev.filter(i => i.uid !== uid));
  }
  function updateLockItem(uid: string, patch: Partial<EditableLockItem>) {
    setEditLocks(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      if ('lockName' in patch) {
        const def = locks.find(l => l.name === patch.lockName);
        if (def) { updated.priceEurMb = def.price_eur_mb; updated.sellPriceEurMb = def.price_eur_mb; }
      }
      return updated;
    }));
  }

  // ── Konwersja cen przy zmianie waluty ──
  // Używa wspólnego helpera convertCurrencyValue (src/lib/currency.ts).
  // Sprzedaż używa precision='whole' (PLN do całych, EUR do 2dp).
  // UWAGA: ceny zamków (editLocks) są zawsze w EUR — NIE przeliczamy ich tutaj.
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');
    setEditItems(prev => prev.map(item => ({
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

  // ── Obliczenia per pozycja ──
  const itemResults = useMemo(() =>
    editItems.map(it => {
      const kgPerM = pipeKgPerM(it.diameterMm, it.wallThicknessMm);
      const qty = Number(it.quantitySzt) || 0;
      const lengthM = Number(it.lengthM) || 0;
      if (kgPerM <= 0 || qty <= 0 || lengthM <= 0) {
        return null;
      }
      const totalLengthM = qty * lengthM;
      const massT        = Math.round(totalLengthM * kgPerM / 1000 * 1000) / 1000;
      const costTotal    = massT * (it.costPricePerTon || 0);
      const sellTotal    = massT * (it.sellPricePerTon || 0);
      const marginPct    = sellTotal > 0 ? ((sellTotal - costTotal) / sellTotal) * 100 : null;
      return { kgPerM, totalLengthM, massT, costTotal, sellTotal, marginPct };
    }),
    [editItems],
  );

  const totals = useMemo(() => {
    let totalLengthM = 0, totalMassT = 0, totalCost = 0, totalSell = 0;
    for (const r of itemResults) {
      if (!r) continue;
      totalLengthM += r.totalLengthM;
      totalMassT   += r.massT;
      totalCost    += r.costTotal;
      totalSell    += r.sellTotal;
    }
    const totalMarginPct = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : null;
    return { totalLengthM, totalMassT, totalCost, totalSell, totalMarginPct };
  }, [itemResults]);

  // ── Obliczenia zamków (1:1 z PipeSaleCalculator) ──
  const lockResults = useMemo((): LockItemResult[] =>
    editLocks.map(item => {
      const def = locks.find(l => l.name === item.lockName);
      const quantityMb = (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0);
      if (!def || quantityMb <= 0 || item.priceEurMb <= 0) {
        return { valid: false, totalEUR: 0, totalPLN: 0, totalSellEUR: 0, totalSellPLN: 0, marginPct: null, massT: 0 };
      }
      const totalEUR     = quantityMb * item.priceEurMb;
      const totalSellEUR = quantityMb * item.sellPriceEurMb;
      const marginPct    = item.sellPriceEurMb > 0
        ? ((item.sellPriceEurMb - item.priceEurMb) / item.sellPriceEurMb) * 100 : null;
      return {
        valid: true, totalEUR, totalPLN: totalEUR * exchangeRate,
        totalSellEUR, totalSellPLN: totalSellEUR * exchangeRate,
        marginPct, massT: (quantityMb * def.weight_kg_m) / 1000,
      };
    }),
    [editLocks, locks, exchangeRate]
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

  // ── Dostawa: auto-szacunek + totale (1:1 z PipeSaleCalculator) ──
  const deliveryCalc = useMemo(() => {
    if (totals.totalMassT + lockTotals.totalMassT <= 0) return null;
    const combinedMassT   = totals.totalMassT + lockTotals.totalMassT;
    const autoTrucks      = Math.ceil(combinedMassT / TRUCK_CAPACITY_T);
    const trucks          = typeof deliveryTrucks === 'number' && deliveryTrucks > 0
      ? deliveryTrucks : autoTrucks;
    const costPerTruck    = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    const totalCostPLN    = currency === 'PLN' ? totalInCurrency : totalInCurrency * exchangeRate;
    return { combinedMassT, autoTrucks, trucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [totals.totalMassT, lockTotals.totalMassT, deliveryTrucks, deliveryCostPerTruck, currency, exchangeRate]);

  // Denominacja — zawsze EUR/PLN niezależnie od currency oferty
  const totalSellEUR = currency === 'EUR' ? totals.totalSell : totals.totalSell / exchangeRate;
  const totalSellPLN = currency === 'PLN' ? totals.totalSell : totals.totalSell * exchangeRate;
  const totalCostEUR = currency === 'EUR' ? totals.totalCost : totals.totalCost / exchangeRate;

  // ─── Zapis (strategia A: UPDATE → DELETE all items → INSERT new items) ─────

  async function handleSave() {
    const hasValidLocks = lockResults.some(r => r.valid);
    if (!clientId) return setError('Wybierz klienta.');
    if (editItems.length === 0 && !hasValidLocks)
      return setError('Dodaj przynajmniej jedną pozycję (rura lub zamek).');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    // Sprawdź czy wszystkie pozycje mają sellPrice > 0 i poprawną geometrię
    const invalidItem = editItems.findIndex(it => {
      const kgPerM = pipeKgPerM(it.diameterMm, it.wallThicknessMm);
      return kgPerM <= 0 || !(Number(it.quantitySzt) > 0) || !(Number(it.lengthM) > 0) || (it.sellPricePerTon || 0) <= 0;
    });
    if (invalidItem >= 0) {
      return setError(`Pozycja #${invalidItem + 1}: cena sprzedaży > 0 i poprawne wymiary są wymagane.`);
    }

    // Każdy dodany zamek musi mieć ilość i długość > 0 (pusta pozycja blokuje zapis)
    const invalidLock = editLocks.findIndex((_, i) => !lockResults[i].valid);
    if (editLocks.length > 0 && invalidLock >= 0) {
      return setError(`Zamek #${invalidLock + 1}: uzupełnij ilość i długość (> 0).`);
    }

    setSaving(true);
    setError('');

    const hasTransport = deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && deliveryCalc !== null && deliveryCalc.costPerTruck > 0;

    // Wspólny payload oferty (bez offer_number/id — różnią się tryby edit vs copy)
    const offerPayload = {
      client_id:                 clientId,
      task_name:                 taskName.trim() || null,
      status:                    isCopy ? 'szkic' : status,   // kopia zawsze startuje jako szkic
      notes:                     notes.trim() || null,
      valid_days:                validDays,
      payment_days:              paymentDays,
      prepared_by:               preparedBy,
      currency,
      exchange_rate:             exchangeRate,
      total_cost_eur:            (totalCostEUR + lockTotals.totalEUR)     || null,
      total_sell_eur:            (totalSellEUR + lockTotals.totalSellEUR) || null,
      total_sell_pln:            (totalSellPLN + lockTotals.totalSellPLN) || null,
      margin_pct:                totals.totalMarginPct,
      delivery_trucks:           hasTransport ? deliveryCalc!.trucks       : null,
      delivery_cost_per_truck:   hasTransport ? deliveryCalc!.costPerTruck : null,
      delivery_cost_total:       hasTransport ? deliveryCalc!.totalCostPLN : null,
      delivery_paid_by:          deliveryPaidBy,
      delivery_from:             deliveryFrom.trim() || null,
      delivery_to:               deliveryTo.trim()   || null,
      delivery_timeline:         deliveryTimeline,
      campaign_weeks:            deliveryTimeline === 'huta'    ? campaignWeeks.trim()             : null,
      campaign_delivery_weeks:   deliveryTimeline === 'huta'    ? campaignDeliveryWeeks.trim() || null : null,
      warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime            : null,
      delivery_terms:            deliveryTerms,
      fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
    };

    // Pozycje BEZ offer_id — wstrzykiwane przy .insert() (nowe ID dla kopii, stare dla edycji)
    const newItemsPayload = editItems.flatMap((it, idx) => {
      const r = itemResults[idx];
      if (!r) return [];
      const certified = isCertifiedCondition(it.condition);
      const sellEurTotal = currency === 'EUR' ? r.sellTotal : r.sellTotal / exchangeRate;
      const sellPlnTotal = currency === 'PLN' ? r.sellTotal : r.sellTotal * exchangeRate;
      return [{
        product_type:       it.productType,
        condition:          it.condition,
        norm:               certified ? it.norm : null,                              // NULL gdy bez atestu
        norm_description:   certified ? PIPE_NORM_DESCRIPTIONS[it.norm] : 'nie dotyczy',
        steel_grade:        it.steelGrade,
        surface:            it.surface,
        diameter_mm:        it.diameterMm,
        wall_thickness_mm:  it.wallThicknessMm,
        quantity_szt:       Number(it.quantitySzt) || 0,
        length_m:           Number(it.lengthM) || 0,
        kg_per_m:           r.kgPerM,
        total_length_m:     r.totalLengthM,
        mass_t:             r.massT,
        cost_price_per_ton: it.costPricePerTon || null,
        sell_price_per_ton: it.sellPricePerTon,
        cost_total:         r.costTotal || null,
        sell_total:         r.sellTotal,
        sell_eur_total:     sellEurTotal,
        sell_pln_total:     sellPlnTotal,
        margin_pct:         r.marginPct,
        sort_order:         idx,
      }];
    });

    // Pozycje zamków BEZ offer_id — wstrzykiwane przy .insert()
    const newLockPayload = editLocks.flatMap((item, idx) => {
      const r = lockResults[idx];
      if (!r.valid) return [];
      return [{
        lock_name:         item.lockName,
        steel_grade:       item.steelGrade || null,
        quantity_szt:      Number(item.quantitySzt) || 0,
        length_m:          Number(item.lengthM) || 0,
        quantity_mb:       (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0),
        price_eur_mb:      item.priceEurMb,
        sell_price_eur_mb: item.sellPriceEurMb,
        total_eur:         r.totalEUR,
        total_pln:         r.totalPLN,
        sell_eur_total:    r.totalSellEUR,
        sell_pln_total:    r.totalSellPLN,
        mass_t:            r.massT,
        sort_order:        idx,
      }];
    });

    if (isCopy) {
      // ── KOPIA: INSERT nowej oferty (numer nadaje trigger DB: SR/YYYY/NNN) ──
      const { data: newOffer, error: insertOfferErr } = await supabase
        .from('pipe_sale_offers')
        .insert({ ...offerPayload, offer_number: '', deleted_at: null })
        .select('*, client:clients(*)')
        .single();

      if (insertOfferErr) {
        setSaving(false);
        return setError('Błąd zapisu kopii oferty: ' + insertOfferErr.message);
      }

      const saved = newOffer as PipeSaleOffer;
      const rollbackCopy = () =>
        supabase.from('pipe_sale_offers').update({ deleted_at: new Date().toISOString() }).eq('id', saved.id);

      // Pozycje rur (pomiń gdy kopia samych zamków)
      let insertedItems: PipeSaleOfferItem[] = [];
      if (newItemsPayload.length > 0) {
        const { data, error: insertItemsErr } = await supabase
          .from('pipe_sale_offer_items')
          .insert(newItemsPayload.map(it => ({ ...it, offer_id: saved.id })))
          .select();
        if (insertItemsErr) {
          await rollbackCopy();
          setSaving(false);
          return setError('Błąd zapisu pozycji kopii – oferta anulowana. Spróbuj ponownie: ' + insertItemsErr.message);
        }
        insertedItems = (data ?? []) as PipeSaleOfferItem[];
      }

      // Pozycje zamków kopii
      let copiedLocks: PipeSaleOfferLockItem[] = [];
      if (newLockPayload.length > 0) {
        const { data, error: lockErr } = await supabase
          .from('pipe_sale_offer_lock_items')
          .insert(newLockPayload.map(it => ({ ...it, offer_id: saved.id })))
          .select();
        if (lockErr) {
          await rollbackCopy();
          setSaving(false);
          return setError('Błąd kopiowania zamków – oferta anulowana: ' + lockErr.message);
        }
        copiedLocks = (data ?? []) as PipeSaleOfferLockItem[];
      }

      setSaving(false);
      saved.items = insertedItems;
      saved.lock_items = copiedLocks;
      onSaved(saved);
      return;
    }

    // ── EDYCJA: UPDATE → DELETE all items → INSERT new items (saga) ──
    // KROK 1: UPDATE oferty
    const { data: updatedOffer, error: updateErr } = await supabase
      .from('pipe_sale_offers')
      .update(offerPayload)
      .eq('id', offer.id)
      .select('*, client:clients(*)')
      .single();

    if (updateErr) {
      setSaving(false);
      return setError('Błąd aktualizacji oferty: ' + updateErr.message);
    }

    // KROK 2: DELETE wszystkich starych pozycji oferty (rury)
    const { error: deleteErr } = await supabase
      .from('pipe_sale_offer_items')
      .delete()
      .eq('offer_id', offer.id);

    if (deleteErr) {
      setSaving(false);
      return setError('Błąd usuwania starych pozycji: ' + deleteErr.message);
    }

    // KROK 2b: DELETE starych zamków
    const { error: deleteLockErr } = await supabase
      .from('pipe_sale_offer_lock_items')
      .delete()
      .eq('offer_id', offer.id);

    if (deleteLockErr) {
      setSaving(false);
      return setError('Błąd usuwania starych zamków: ' + deleteLockErr.message);
    }

    // KROK 3: INSERT nowych pozycji rur (pomiń gdy oferta samych zamków)
    let insertedItems: PipeSaleOfferItem[] = [];
    if (newItemsPayload.length > 0) {
      const { data, error: insertErr } = await supabase
        .from('pipe_sale_offer_items')
        .insert(newItemsPayload.map(it => ({ ...it, offer_id: offer.id })))
        .select();
      if (insertErr) {
        setSaving(false);
        return setError('Błąd zapisu nowych pozycji: ' + insertErr.message + ' (UWAGA: stare pozycje zostały usunięte — otwórz edycję ponownie aby naprawić)');
      }
      insertedItems = (data ?? []) as PipeSaleOfferItem[];
    }

    // KROK 4: INSERT nowych zamków
    let savedLocks: PipeSaleOfferLockItem[] = [];
    if (newLockPayload.length > 0) {
      const { data, error: insertLockErr } = await supabase
        .from('pipe_sale_offer_lock_items')
        .insert(newLockPayload.map(it => ({ ...it, offer_id: offer.id })))
        .select();
      if (insertLockErr) {
        setSaving(false);
        return setError('Błąd zapisu zamków: ' + insertLockErr.message + ' (UWAGA: stare pozycje zostały usunięte — otwórz edycję ponownie aby naprawić)');
      }
      savedLocks = (data ?? []) as PipeSaleOfferLockItem[];
    }

    setSaving(false);
    const saved = updatedOffer as PipeSaleOffer;
    saved.items = insertedItems;
    saved.lock_items = savedLocks;
    onSaved(saved);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function fmtMoney(val: number): string {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Math.round(val * 100) / 100) + ' ' + currency;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 max-h-[92vh] flex flex-col">

        {/* Nagłówek */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{isCopy ? 'Kopiuj ofertę sprzedaży rur' : 'Edytuj ofertę sprzedaży rur'}</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{isCopy ? `na podstawie ${offer.offer_number}` : offer.offer_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">

          {/* Nazwa zadania (opcjonalnie) */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nazwa zadania (opcjonalnie)</label>
            <input type="text" value={taskName} maxLength={35} onChange={e => setTaskName(e.target.value)} placeholder="np. Budowa S5 odcinek Korzeńsko" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ── Klient + Status + Waluta + Kurs ── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Klient</label>
              <ClientSearchInput clients={clients} value={clientId} onChange={setClientId} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Status">
                <select value={status} onChange={e => setStatus(e.target.value as OfferStatus)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s =>
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  )}
                </select>
              </Field>
              <Field label="Waluta">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
                  {(['EUR', 'PLN'] as const).map(cur => (
                    <button key={cur} onClick={() => handleCurrencyChange(cur)}
                      className={`flex-1 px-2 py-1.5 transition-colors ${
                        currency === cur ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}>{cur}</button>
                  ))}
                </div>
              </Field>
              <Field label="Kurs EUR/PLN">
                <input type="number" min={0} step={0.0001} value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 4.25)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
              </Field>
            </div>
          </section>

          {/* ── Dane oferty ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Dane oferty</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Przygotował">
                <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {SALES_REPS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Ważność oferty [dni]">
                <input type="number" min={1} value={validDays}
                  onChange={e => setValidDays(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </Field>
              <Field label="Termin płatności [dni]">
                <input type="number" min={0} value={paymentDays}
                  onChange={e => setPaymentDays(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </Field>
            </div>
          </section>

          {/* ── Pozycje rur ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Pozycje oferty</h4>
              <button onClick={addItem}
                className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj pozycję
              </button>
            </div>

            <div className="space-y-3">
              {editItems.map((item, idx) => {
                const r = itemResults[idx];
                const allowedGrades = PIPE_NORM_GRADES[item.norm];
                const certified = isCertifiedCondition(item.condition);
                const normDescription = certified ? PIPE_NORM_DESCRIPTIONS[item.norm] : 'nie dotyczy';

                return (
                  <div key={item.uid} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">Pozycja #{idx + 1}</span>
                      {editItems.length > 1 && (
                        <button onClick={() => removeItem(item.uid)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium">Usuń</button>
                      )}
                    </div>

                    {/* Pola katalogowe */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                      <Field label="Typ produktu">
                        <select value={item.productType}
                          onChange={e => updateItem(item.uid, { productType: e.target.value as PipeProductType })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Stan materiału">
                        <select value={item.condition}
                          onChange={e => updateItem(item.uid, { condition: e.target.value as PipeCondition })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                      <Field label="Powierzchnia">
                        <select value={item.surface}
                          onChange={e => updateItem(item.uid, { surface: e.target.value as PipeSurface })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_SURFACES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Field>
                      <Field label="Norma">
                        {certified ? (
                          <select value={item.norm}
                            onChange={e => updateItem(item.uid, { norm: e.target.value as PipeNorm })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                            {PIPE_NORMS.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : (
                          <div className="w-full px-2 py-1.5 rounded text-sm border bg-gray-100 border-gray-300 text-gray-400 italic">
                            nie dotyczy
                          </div>
                        )}
                      </Field>
                      <Field label="Gatunek stali">
                        {certified ? (
                          <select value={item.steelGrade}
                            onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                            {allowedGrades.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        ) : (
                          <div className="w-full px-2 py-1.5 rounded text-sm border bg-gray-100 border-gray-300 text-gray-500">
                            {NO_CERT_STEEL_GRADE}
                          </div>
                        )}
                      </Field>
                      <Field label="Opis normy produkcyjnej">
                        <div className={`px-2 py-1.5 rounded text-sm border ${
                          certified
                            ? 'bg-white border-gray-300 text-gray-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700 italic'
                        }`}>{normDescription}</div>
                      </Field>
                    </div>

                    {/* Pola liczbowe */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
                      <Field label="Ø zewn. [mm]">
                        <input type="number" step="0.1" min={0} value={item.diameterMm}
                          onChange={e => updateItem(item.uid, { diameterMm: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label="Grubość [mm]">
                        <input type="number" step="0.1" min={0} value={item.wallThicknessMm}
                          onChange={e => updateItem(item.uid, { wallThicknessMm: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label="Ilość [szt]">
                        <input type="number" step={1} min={0} placeholder="np. 10" value={item.quantitySzt}
                          onChange={e => updateItem(item.uid, { quantitySzt: e.target.value === '' ? '' : (parseInt(e.target.value, 10) || 0) })}
                          className={`w-full px-2 py-1.5 border rounded text-sm ${!(Number(item.quantitySzt) > 0) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                      </Field>
                      <Field label="Długość [m]">
                        <input type="number" step="0.01" min={0} placeholder="np. 12" value={item.lengthM}
                          onChange={e => updateItem(item.uid, { lengthM: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                          className={`w-full px-2 py-1.5 border rounded text-sm ${!(Number(item.lengthM) > 0) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                      </Field>
                      <Field label={`Cena zakupu [${currency}/t]`}>
                        <input type="number" step="0.01" min={0} value={item.costPricePerTon || ''}
                          placeholder={`${currency}/t`}
                          onChange={e => updateItem(item.uid, { costPricePerTon: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label={`Cena sprz. [${currency}/t]`}>
                        <input type="number" step="0.01" min={0} value={item.sellPricePerTon || ''}
                          placeholder={`${currency}/t`}
                          onChange={e => updateItem(item.uid, { sellPricePerTon: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                    </div>

                    {/* Wyniki obliczeń */}
                    {r && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-200 text-xs">
                        <div><span className="text-gray-500">kg/m:</span> <strong>{formatNumber(r.kgPerM, 3)}</strong></div>
                        <div><span className="text-gray-500">Masa:</span> <strong>{formatNumber(r.massT, 3)} t</strong></div>
                        <div><span className="text-gray-500">Wartość:</span> <strong className="text-blue-900">{fmtMoney(r.sellTotal)}</strong></div>
                        <div>
                          <span className="text-gray-500">Marża:</span>{' '}
                          {r.marginPct === null
                            ? <span className="text-gray-400">—</span>
                            : <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-semibold ${marginColor(r.marginPct)}`}>
                                {formatNumber(r.marginPct, 1)}%
                              </span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Podsumowanie */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <div><span className="text-gray-600">Pozycji:</span> <strong>{editItems.length}</strong></div>
              <div><span className="text-gray-600">Masa:</span> <strong>{formatNumber(totals.totalMassT, 3)} t</strong></div>
              <div><span className="text-gray-600">Koszt łączny:</span> <strong>{fmtMoney(totals.totalCost)}</strong></div>
              <div><span className="text-gray-600">Suma oferty:</span> <strong className="text-blue-900">{fmtMoney(totals.totalSell)}</strong></div>
            </div>
          </section>

          {/* ── Zamki ── (katalog współdzielony sale_locks) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">🔗 Zamki</h4>
              <button onClick={addLockItem}
                className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj zamek
              </button>
            </div>
            {editLocks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Brak zamków · kliknij „Dodaj zamek" aby dodać pozycję</p>
            ) : (
              <div className="space-y-3">
                {editLocks.map((item, idx) => {
                  const r = lockResults[idx];
                  const def = locks.find(l => l.name === item.lockName);
                  const defPrice = def?.price_eur_mb ?? 0;
                  const priceChanged = item.priceEurMb !== defPrice && defPrice > 0;
                  const displayCostMb = currency === 'PLN' ? Math.round(item.priceEurMb * exchangeRate * 100) / 100 : item.priceEurMb;
                  const displaySellMb = currency === 'PLN' ? Math.round(item.sellPriceEurMb * exchangeRate * 100) / 100 : item.sellPriceEurMb;
                  const displayDefPrice = currency === 'PLN' ? Math.round(defPrice * exchangeRate * 100) / 100 : defPrice;
                  const quantityMb = (Number(item.quantitySzt) || 0) * (Number(item.lengthM) || 0);
                  const lockQtyInvalid = !(Number(item.quantitySzt) > 0);
                  const lockLenInvalid = !(Number(item.lengthM) > 0);
                  return (
                    <div key={item.uid} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-3">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Typ zamka</label>}
                          <select value={item.lockName} onChange={e => updateLockItem(item.uid, { lockName: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                            {locks.map(l => <option key={l.id} value={l.name}>{l.name} ({l.weight_kg_m} kg/mb)</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek</label>}
                          <select value={item.steelGrade} onChange={e => updateLockItem(item.uid, { steelGrade: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                            {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-1">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość</label>}
                          <input type="number" min={1} step={1} placeholder="np. 10" value={item.quantitySzt}
                            onChange={e => updateLockItem(item.uid, { quantitySzt: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                            className={`w-full border rounded-lg px-2 py-2 text-sm ${lockQtyInvalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                        </div>
                        <div className="sm:col-span-1">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Dł. [m]</label>}
                          <input type="number" min={0.1} step={0.1} placeholder="np. 12" value={item.lengthM}
                            onChange={e => updateLockItem(item.uid, { lengthM: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0) })}
                            className={`w-full border rounded-lg px-2 py-2 text-sm ${lockLenInvalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                        </div>
                        <div className="sm:col-span-1">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">[mb]</label>}
                          <div className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-right text-gray-600 min-h-[38px] flex items-center justify-end">
                            {quantityMb > 0 ? formatNumber(quantityMb, 1) : <span className="text-gray-400">—</span>}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Koszt [{currency}/mb]</label>}
                          <input type="number" min={0} step={0.5} value={displayCostMb || ''}
                            onChange={e => { const parsed = parseFloat(e.target.value) || 0; updateLockItem(item.uid, { priceEurMb: currency === 'PLN' ? parsed / exchangeRate : parsed }); }}
                            className={`w-full border rounded-lg px-2 py-2 text-sm font-semibold ${priceChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-300 bg-white'}`} />
                          {priceChanged && (
                            <button onClick={() => updateLockItem(item.uid, { priceEurMb: defPrice })} className="text-xs text-blue-600 underline mt-0.5">
                              przywróć ({displayDefPrice} {currency}/mb)
                            </button>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Sprzedaż [{currency}/mb]</label>}
                          <input type="number" min={0} step={0.01} value={displaySellMb || ''}
                            onChange={e => { const parsed = parseFloat(e.target.value) || 0; updateLockItem(item.uid, { sellPriceEurMb: currency === 'PLN' ? parsed / exchangeRate : parsed }); }}
                            className="w-full border rounded px-2 py-2 text-sm border-blue-400" />
                          {r.valid && r.marginPct !== null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${r.marginPct >= 10 ? 'bg-green-100 text-green-700' : r.marginPct >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {r.marginPct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="sm:col-span-12 flex justify-end">
                          <button onClick={() => removeLockItem(item.uid)} className="text-xs text-red-600 hover:text-red-800 font-medium">Usuń zamek</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {lockTotals.totalEUR > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                    <div><span className="text-gray-600">Wartość zamków:</span>{' '}
                      <strong className="text-blue-900">{currency === 'EUR' ? `${formatEUR(lockTotals.totalSellEUR)} EUR` : `${formatPLN(lockTotals.totalSellPLN)} PLN`}</strong></div>
                    <div><span className="text-gray-600">Masa zamków:</span> <strong>{formatNumber(lockTotals.totalMassT, 3)} t</strong></div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Koszty dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Koszty dostawy</h4>
            <p className="text-xs text-gray-400 mb-2">
              Ładowność auta: <strong>24,5 t</strong>
              {deliveryCalc && <> · Szacowane auta: <strong>{deliveryCalc.autoTrucks}</strong></>}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              {([
                { val: 'dap_included', label: 'DAP – dostawa w cenie' },
                { val: 'dap_extra',    label: 'DAP – refaktura na klienta' },
                { val: 'fca',          label: 'FCA – odbiór własny' },
                { val: 'cif',          label: 'CIF – odbiór z portu' },
              ] as const).map(({ val, label }) => (
                <label key={val} className={`flex-1 flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer text-sm ${
                  deliveryPaidBy === val ? 'border-blue-700 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="pipeEditPaidBy" value={val}
                    checked={deliveryPaidBy === val}
                    onChange={() => setDeliveryPaidBy(val)}
                    className="accent-blue-900" />
                  <span className="text-xs font-semibold">{label}</span>
                </label>
              ))}
            </div>
            {deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                <Field label="Liczba aut">
                  <input type="number" min={1} step={1}
                    value={deliveryTrucks === '' ? (deliveryCalc?.autoTrucks ?? 1) : deliveryTrucks}
                    onChange={e => setDeliveryTrucks(parseInt(e.target.value, 10) || '')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label={`Koszt / auto [${currency}]`}>
                  <input type="number" min={0} value={deliveryCostPerTruck}
                    placeholder={currency === 'EUR' ? 'np. 600' : 'np. 2500'}
                    onChange={e => setDeliveryCostPerTruck(parseFloat(e.target.value) || '')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label="Magazyn wysyłki">
                  <select
                    value={isCustomWarehouse ? PIPE_WAREHOUSE_CUSTOM : deliveryFrom}
                    onChange={e => setDeliveryFrom(e.target.value === PIPE_WAREHOUSE_CUSTOM ? '' : e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                    {PIPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                    <option value={PIPE_WAREHOUSE_CUSTOM}>— wpisz własny adres —</option>
                  </select>
                  {isCustomWarehouse && (
                    <input type="text" value={deliveryFrom}
                      placeholder="np. Magazyn klienta, ul. ..., miasto"
                      onChange={e => setDeliveryFrom(e.target.value)}
                      className="w-full mt-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  )}
                </Field>
                <Field label="Dokąd">
                  <input type="text" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
              </div>
            )}
            {(deliveryPaidBy === 'fca' || deliveryPaidBy === 'cif') && (
              <Field label={deliveryPaidBy === 'cif' ? 'Odbiór z portu (CIF)' : 'Magazyn odbioru (FCA)'}>
                <select
                  value={isCustomWarehouse ? PIPE_WAREHOUSE_CUSTOM : deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value === PIPE_WAREHOUSE_CUSTOM ? '' : e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                  {PIPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                  <option value={PIPE_WAREHOUSE_CUSTOM}>— wpisz własny adres —</option>
                </select>
                {isCustomWarehouse && (
                  <input type="text" value={deliveryFrom}
                    placeholder="np. Magazyn klienta, ul. ..., miasto"
                    onChange={e => setDeliveryFrom(e.target.value)}
                    className="w-full mt-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                )}
              </Field>
            )}
            {deliveryCalc && deliveryCalc.costPerTruck > 0 && deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
              <p className="text-xs text-gray-600 mt-2">
                Razem transport: <strong>
                  {deliveryCalc.trucks} {deliveryCalc.trucks === 1 ? 'auto' : deliveryCalc.trucks <= 4 ? 'auta' : 'aut'} ×{' '}
                  {currency === 'EUR' ? `${formatEUR(deliveryCalc.costPerTruck)} EUR` : `${formatPLN(deliveryCalc.costPerTruck)} PLN`}{' = '}
                  {currency === 'EUR' ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR` : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                </strong>
              </p>
            )}
          </section>

          {/* ── Termin dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Termin dostawy</h4>
            <div className="flex gap-2 mb-2">
              {(['magazyn', 'huta'] as const).map(t => (
                <button key={t} onClick={() => setDeliveryTimeline(t)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    deliveryTimeline === t ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300'
                  }`}>
                  {t === 'magazyn' ? 'Z magazynu' : 'Kampania huty'}
                </button>
              ))}
            </div>
            {deliveryTimeline === 'magazyn' ? (
              <Field label="Czas dostawy z magazynu">
                <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                  {PIPE_WAREHOUSE_DELIVERY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tygodnie kampanii">
                  <input type="text" value={campaignWeeks} onChange={e => setCampaignWeeks(e.target.value)}
                    placeholder="np. 50/51"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label="Tygodnie dostawy">
                  <input type="text" value={campaignDeliveryWeeks} onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                    placeholder="np. 52/01"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
              </div>
            )}
          </section>

          {/* ── Warunki dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Warunki dostawy (incoterm)</h4>
            <div className="flex gap-2 mb-2 flex-wrap">
              {(['DAP', 'DAP_EXTRA', 'FCA', 'CIF'] as const).map(t => (
                <button key={t} onClick={() => setDeliveryTerms(t)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    deliveryTerms === t ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300'
                  }`}>
                  {t === 'DAP' ? 'DAP (transport w cenie)'
                    : t === 'DAP_EXTRA' ? 'DAP + transport extra'
                    : t === 'FCA' ? 'FCA (odbiór własny)'
                    : 'CIF (odbiór z portu)'}
                </button>
              ))}
            </div>
            {deliveryTerms === 'FCA' && (
              <Field label="Lokalizacja magazynu odbioru">
                <input type="text" value={fcaLocation} onChange={e => setFcaLocation(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </Field>
            )}
          </section>

          {/* ── Notatki ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notatki</h4>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="opcjonalne uwagi do oferty"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </section>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 font-medium">
            {saving ? 'Zapisywanie…' : isCopy ? 'Zapisz kopię' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pomocniczy ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
