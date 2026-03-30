import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client, SaleOffer, SaleOfferItem, SaleProfile, SaleOfferLockItem } from '../../types';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';
import ClientSearchInput from '../ClientSearchInput';

interface Warehouse { id: string; name: string; }
interface SalePrice { warehouse_id: string; profile_name: string; steel_grade: string; price_eur_t: number | null; }
interface LockDef   { id: string; name: string; price_eur_mb: number; weight_kg_m: number; sort_order: number; }

interface EditableLockItem {
  uid: string;
  lockName: string;
  steelGrade: string;
  quantitySzt: number;
  lengthM: number;
  priceEurMb: number;
  sellPriceEurMb: number;   // cena sprzedaży [EUR/mb]
  weightKgM: number;  // z cennika – do wyliczenia mass_t przy zapisie
}

// ─── Stałe ───────────────────────────────────────────────────────────────────

const SALES_REPS = [
  { name: 'Szymon Sobczak',    phone: '579 376 107' },
  { name: 'Mateusz Cieślicki', phone: '579 141 243' },
  { name: 'Marzena Sobczak',   phone: '579 241 508' },
  { name: 'Piotr Domański',    phone: '729 393 743' },
];

const WAREHOUSE_DELIVERY_OPTIONS = [
  'do 3 dni roboczych',
  '3–5 dni roboczych',
  '5–7 dni roboczych',
  '7–10 dni roboczych',
  'do 2 tygodni',
  'do ustalenia',
];

// ─── Typy ────────────────────────────────────────────────────────────────────

interface EditableItem {
  uid: string;
  profileName: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
  isPaired: boolean;
  warehouseId: string;
  costEurT: number;
  sellEurT: number;
}

interface Props {
  offer: SaleOffer;
  clients: Client[];
  saleProfiles: SaleProfile[];
  onSaved: (offer: SaleOffer) => void;
  onClose: () => void;
  onClientAdded?: (c: Client) => void;
}

// ─── Pomocnicze ──────────────────────────────────────────────────────────────

function itemsFromOffer(offer: SaleOffer): EditableItem[] {
  if (!offer.items || offer.items.length === 0) {
    return [{
      uid: crypto.randomUUID(), profileName: '', steelGrade: '',
      quantity: 1, lengthM: 12, isPaired: false, warehouseId: '', costEurT: 0, sellEurT: 0,
    }];
  }
  return offer.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => ({
      uid: crypto.randomUUID(),
      profileName: item.profile_name,
      steelGrade:  item.steel_grade,
      quantity:    item.quantity,
      lengthM:     item.length_m,
      isPaired:    item.is_paired,
      warehouseId: (item as { warehouse_id?: string }).warehouse_id ?? '',
      costEurT:    item.cost_eur_t  ?? 0,
      sellEurT:    item.sell_eur_t  ?? 0,
    }));
}

function lockItemsFromOffer(offer: SaleOffer): EditableLockItem[] {
  if (!offer.lock_items || offer.lock_items.length === 0) return [];
  return offer.lock_items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item: SaleOfferLockItem) => ({
      uid:         crypto.randomUUID(),
      lockName:    item.lock_name,
      steelGrade:  item.steel_grade ?? '',
      // Jeśli stara oferta bez szt/długości – traktuj mb jako 1 szt × mb
      quantitySzt: item.quantity_szt ?? 1,
      lengthM:     item.length_m ?? item.quantity_mb,
      priceEurMb:     item.price_eur_mb,
      sellPriceEurMb: item.sell_price_eur_mb ?? item.price_eur_mb ?? 0,
      weightKgM:      item.mass_t > 0 && item.quantity_mb > 0
        ? (item.mass_t * 1000) / item.quantity_mb
        : 0,
    }));
}

// ─── Komponent ───────────────────────────────────────────────────────────────

export default function EditSaleOfferModal({
  offer, clients, saleProfiles, onSaved, onClose,
}: Props) {

  // ── Dane słownikowe (z DB) ──
  const [steelGrades, setSteelGrades] = useState<{ id: string; name: string }[]>([]);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [prices,      setPrices]      = useState<SalePrice[]>([]);
  const [lockDefs,    setLockDefs]    = useState<LockDef[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('sale_steel_grades').select('id, name').order('sort_order'),
      supabase.from('sale_warehouses').select('id, name').order('name'),
      supabase.from('sale_prices').select('warehouse_id, profile_name, steel_grade, price_eur_t'),
      supabase.from('sale_locks').select('id, name, price_eur_mb, weight_kg_m, sort_order').eq('active', true).order('sort_order'),
    ]).then(([gradesRes, warehousesRes, pricesRes, locksRes]) => {
      if (gradesRes.data)     setSteelGrades(gradesRes.data as { id: string; name: string }[]);
      if (warehousesRes.data) setWarehouses(warehousesRes.data as Warehouse[]);
      if (pricesRes.data)     setPrices(pricesRes.data as SalePrice[]);
      if (locksRes.data)      setLockDefs(locksRes.data as LockDef[]);
    });
  }, []);

  // Normalizuj gatunki stali: mapuj legacy wartości (nazwy/lowercase) na poprawne id
  useEffect(() => {
    if (steelGrades.length === 0) return;
    setEditItems(prev => prev.map(item => {
      if (!item.steelGrade) return { ...item, steelGrade: steelGrades[0].id };
      // Jeśli dokładnie pasuje do id – zostawia
      if (steelGrades.some(g => g.id === item.steelGrade)) return item;
      // Szuka po id case-insensitive (np. "s270gp" → "S270GP")
      const byId = steelGrades.find(g => g.id.toLowerCase() === item.steelGrade.toLowerCase());
      if (byId) return { ...item, steelGrade: byId.id };
      // Szuka po name case-insensitive (legacy: wartość była name zamiast id)
      const byName = steelGrades.find(g => g.name.toLowerCase() === item.steelGrade.toLowerCase());
      if (byName) return { ...item, steelGrade: byName.id };
      return item;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steelGrades]);

  // ── Mapa cennikowa: warehouseId → profileName → steelGrade → price ──
  const priceMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, number | null>>> = {};
    for (const p of prices) {
      if (!map[p.warehouse_id]) map[p.warehouse_id] = {};
      if (!map[p.warehouse_id][p.profile_name]) map[p.warehouse_id][p.profile_name] = {};
      map[p.warehouse_id][p.profile_name][p.steel_grade] = p.price_eur_t;
    }
    return map;
  }, [prices]);

  function lookupCostPrice(warehouseId: string, profileName: string, steelGrade: string): number {
    return priceMap[warehouseId]?.[profileName]?.[steelGrade] ?? 0;
  }

  // ── Pozycje ──
  const [editItems,     setEditItems]     = useState<EditableItem[]>(() => itemsFromOffer(offer));
  const [editLockItems, setEditLockItems] = useState<EditableLockItem[]>(() => lockItemsFromOffer(offer));

  // ── Podstawowe pola ──
  const [clientId,    setClientId]    = useState(offer.client_id ?? '');
  const [preparedBy,  setPreparedBy]  = useState(offer.prepared_by ?? SALES_REPS[0].name);
  const [notes,       setNotes]       = useState(offer.notes ?? '');
  const [validDays,   setValidDays]   = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);

  // ── Waluta ──
  const [currency,     setCurrency]     = useState<'EUR' | 'PLN'>((offer.currency ?? 'EUR') as 'EUR' | 'PLN');
  const [exchangeRate, setExchangeRate] = useState(offer.exchange_rate ?? 4.25);

  // ── Transport ──
  const [deliveryTrucks,       setDeliveryTrucks]       = useState<number | ''>(offer.delivery_trucks ?? '');
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>(() => {
    if (offer.delivery_cost_per_truck != null) return offer.delivery_cost_per_truck;
    // Reverse-calculate from total when delivery_cost_per_truck was not stored
    if (offer.delivery_cost_total && offer.delivery_trucks && offer.delivery_trucks > 0) {
      const rate = offer.exchange_rate ?? 4.25;
      const totalInCurrency = offer.currency === 'EUR'
        ? offer.delivery_cost_total / rate
        : offer.delivery_cost_total;
      return totalInCurrency / offer.delivery_trucks;
    }
    return '';
  });
  const [deliveryPaidBy, setDeliveryPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca'>(() => {
    const v = offer.delivery_paid_by as string | undefined;
    if (v === 'intra')  return 'dap_included';
    if (v === 'klient') return 'dap_extra';
    return (v as 'dap_included' | 'dap_extra' | 'fca') ?? 'dap_included';
  });
  const [deliveryFrom, setDeliveryFrom] = useState(offer.delivery_from ?? '');
  const [deliveryTo,   setDeliveryTo]   = useState(offer.delivery_to   ?? '');

  // ── Warunki oferty ──
  const [deliveryTimeline,      setDeliveryTimeline]      = useState<'huta' | 'magazyn'>(offer.delivery_timeline ?? 'magazyn');
  const [campaignWeeks,         setCampaignWeeks]         = useState(offer.campaign_weeks         ?? '');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState(offer.campaign_delivery_weeks ?? '');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState(offer.warehouse_delivery_time ?? '5–7 dni roboczych');
  const [deliveryTerms,         setDeliveryTerms]         = useState<'DAP' | 'FCA'>(offer.delivery_terms ?? 'DAP');
  const [fcaLocation,           setFcaLocation]           = useState(offer.fca_location ?? '');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // ── Zarządzanie pozycjami ──
  function addItem() {
    const wh   = warehouses[0]?.id ?? '';
    const prof = saleProfiles[0]?.name ?? '';
    const gr   = steelGrades[0]?.id ?? '';
    setEditItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      profileName: prof, steelGrade: gr,
      quantity: 1, lengthM: 12, isPaired: false,
      warehouseId: wh,
      costEurT: lookupCostPrice(wh, prof, gr),
      sellEurT: 0,
    }]);
  }
  function removeItem(uid: string) {
    setEditItems(prev => prev.filter(i => i.uid !== uid));
  }
  function updateItem(uid: string, patch: Partial<EditableItem>) {
    setEditItems(prev => prev.map(i => {
      if (i.uid !== uid) return i;
      const next = { ...i, ...patch };
      // Auto-uzupełnij cenę kosztu gdy zmienia się magazyn, profil lub gatunek
      if ('warehouseId' in patch || 'profileName' in patch || 'steelGrade' in patch) {
        next.costEurT = lookupCostPrice(next.warehouseId, next.profileName, next.steelGrade);
      }
      return next;
    }));
  }

  // ── Zarządzanie zamkami ──
  function addLockItem() {
    if (!lockDefs.length) return;
    const def = lockDefs[0];
    setEditLockItems(prev => [...prev, {
      uid:            crypto.randomUUID(),
      lockName:       def.name,
      steelGrade:     '',
      quantitySzt:    10,
      lengthM:        12,
      priceEurMb:     def.price_eur_mb,
      sellPriceEurMb: def.price_eur_mb ?? 0,
      weightKgM:      def.weight_kg_m,
    }]);
  }
  function removeLockItem(uid: string) {
    setEditLockItems(prev => prev.filter(i => i.uid !== uid));
  }
  function updateLockItem(uid: string, patch: Partial<EditableLockItem>) {
    setEditLockItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      if ('lockName' in patch) {
        const def = lockDefs.find(l => l.name === patch.lockName);
        if (def) { updated.priceEurMb = def.price_eur_mb; updated.sellPriceEurMb = def.price_eur_mb; updated.weightKgM = def.weight_kg_m; }
      }
      return updated;
    }));
  }

  // ── Wyliczenia pozycji ──
  const itemResults = useMemo(() =>
    editItems.map(item => {
      const profile = saleProfiles.find(p => p.name === item.profileName);
      if (!profile || item.quantity <= 0 || item.lengthM <= 0) return null;
      const totalLengthM  = item.quantity * item.lengthM * (item.isPaired ? 2 : 1);
      const massT         = Math.round(totalLengthM * profile.weight_kg_per_m / 1000 * 1000) / 1000;
      const wallAreaM2    = totalLengthM * (profile.width_mm / 1000);
      // costEurT / sellEurT trzymają wartość w walucie oferty (EUR lub PLN)
      // priceScale konwertuje do EUR – identyczna logika jak SaleCalculator
      const priceScale    = currency === 'PLN' ? 1 / exchangeRate : 1;
      const costEurTotal  = item.costEurT * massT * priceScale;
      const sellEurTotal  = item.sellEurT * massT * priceScale;
      const sellPlnTotal  = sellEurTotal * exchangeRate;
      const marginPct     = sellEurTotal > 0 ? ((sellEurTotal - costEurTotal) / sellEurTotal) * 100 : 0;
      return { totalLengthM, massT, wallAreaM2, costEurTotal, sellEurTotal, sellPlnTotal, marginPct };
    }),
    [editItems, saleProfiles, exchangeRate, currency]
  );

  const totals = useMemo(() => {
    let totalMassT = 0, totalCostEUR = 0, totalSellEUR = 0, totalSellPLN = 0;
    for (const r of itemResults) {
      if (!r) continue;
      totalMassT    += r.massT;
      totalCostEUR  += r.costEurTotal;
      totalSellEUR  += r.sellEurTotal;
      totalSellPLN  += r.sellPlnTotal;
    }
    const overallMarginPct = totalSellEUR > 0
      ? ((totalSellEUR - totalCostEUR) / totalSellEUR) * 100 : 0;
    return { totalMassT, totalCostEUR, totalSellEUR, totalSellPLN, overallMarginPct };
  }, [itemResults]);

  // Sumy zamków – do wliczenia do total_sell_eur/pln przy zapisie
  const lockTotals = useMemo(() => {
    let totalEUR = 0, totalPLN = 0, totalSellEUR = 0, totalSellPLN = 0;
    for (const item of editLockItems) {
      const qMb  = item.quantitySzt * item.lengthM;
      const eur  = qMb * item.priceEurMb;
      const sell = qMb * item.sellPriceEurMb;
      totalEUR     += eur;
      totalPLN     += eur * exchangeRate;
      totalSellEUR += sell;
      totalSellPLN += sell * exchangeRate;
    }
    return { totalEUR, totalPLN, totalSellEUR, totalSellPLN };
  }, [editLockItems, exchangeRate]);

  const isEUR = currency === 'EUR';

  // ── Zmiana waluty – konwertuje ceny pozycji (identyczna logika jak SaleCalculator) ──
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    setEditItems(prev => prev.map(item => ({
      ...item,
      costEurT: item.costEurT
        ? newCurrency === 'PLN'
          ? Math.round(item.costEurT * exchangeRate)
          : Math.round((item.costEurT / exchangeRate) * 100) / 100
        : 0,
      sellEurT: item.sellEurT
        ? newCurrency === 'PLN'
          ? Math.round(item.sellEurT * exchangeRate)
          : Math.round((item.sellEurT / exchangeRate) * 100) / 100
        : 0,
    })));
    setCurrency(newCurrency);
  }

  // ── Koszty transportu (identyczna logika jak SaleCalculator) ──
  const TRUCK_CAPACITY_T = 24.5;
  const deliveryCalc = useMemo(() => {
    // Masa łączna = grodzice + zamki (przy ofercie samych zamków totals.totalMassT = 0)
    const lockMassT = editLockItems.reduce((s, item) => {
      const qMb = item.quantitySzt * item.lengthM;
      return s + (item.weightKgM > 0 ? qMb * item.weightKgM / 1000 : 0);
    }, 0);
    const combinedMassT = totals.totalMassT + lockMassT;
    if (combinedMassT <= 0 && typeof deliveryCostPerTruck !== 'number') return null;
    const autoTrucks   = combinedMassT > 0 ? Math.ceil(combinedMassT / TRUCK_CAPACITY_T) : 1;
    const manualTrucks = typeof deliveryTrucks === 'number' && deliveryTrucks > 0 ? deliveryTrucks : null;
    const trucks       = manualTrucks ?? autoTrucks;
    const cpt          = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * cpt;
    const totalCostPLN    = currency === 'EUR' ? totalInCurrency * exchangeRate : totalInCurrency;
    return { trucks, autoTrucks, costPerTruck: cpt, totalInCurrency, totalCostPLN, combinedMassT };
  }, [totals.totalMassT, editLockItems, deliveryTrucks, deliveryCostPerTruck, currency, exchangeRate]);

  const deliveryCostCurrency     = (deliveryPaidBy === 'dap_included' && deliveryCalc) ? deliveryCalc.totalInCurrency : 0;
  const totalForClientInCurrency = (isEUR
    ? totals.totalSellEUR + lockTotals.totalSellEUR
    : totals.totalSellPLN + lockTotals.totalSellPLN
  ) + deliveryCostCurrency;

  // ── Zapis ──
  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (editItems.length === 0 && editLockItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję (grodzice lub zamki).');
    const hasValidItem = editItems.length === 0 || itemResults.some((r, i) => r !== null && editItems[i].profileName);
    if (editItems.length > 0 && !hasValidItem) return setError('Brak prawidłowych pozycji grodzic. Sprawdź nazwy profili.');
    const itemsWithProfile = editItems.filter(i => i.profileName);
    const validGradeIds = steelGrades.map(g => g.id);
    const missingGrade = steelGrades.length > 0 && itemsWithProfile.some(i => !i.steelGrade || !validGradeIds.includes(i.steelGrade));
    if (missingGrade) return setError('Wybierz prawidłowy gatunek stali dla wszystkich pozycji.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    setSaving(true);
    setError('');

    const hasTransport = deliveryPaidBy !== 'fca' && deliveryCalc !== null && deliveryCalc.costPerTruck > 0;

    const { data, error: err } = await supabase
      .from('sale_offers')
      .update({
        client_id:                 clientId,
        notes:                     notes.trim() || null,
        valid_days:                validDays,
        payment_days:              paymentDays,
        prepared_by:               preparedBy,
        currency,
        exchange_rate:             exchangeRate,
        total_cost_eur:            totals.totalCostEUR,
        total_sell_eur:            totals.totalSellEUR + lockTotals.totalSellEUR,
        total_sell_pln:            totals.totalSellPLN + lockTotals.totalSellPLN,
        margin_pct:                totals.overallMarginPct,
        delivery_trucks:           hasTransport ? deliveryCalc!.trucks         : null,
        delivery_cost_per_truck:   hasTransport ? deliveryCalc!.costPerTruck   : null,
        delivery_cost_total:       hasTransport ? deliveryCalc!.totalCostPLN   : null,
        delivery_paid_by:          deliveryPaidBy,
        delivery_from:             deliveryFrom.trim() || null,
        delivery_to:               deliveryTo.trim()   || null,
        delivery_timeline:         deliveryTimeline,
        campaign_weeks:            deliveryTimeline === 'huta'    ? campaignWeeks.trim()         : null,
        campaign_delivery_weeks:   deliveryTimeline === 'huta'    ? campaignDeliveryWeeks.trim() || null : null,
        warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime        : null,
        delivery_terms:            deliveryTerms,
        fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
        updated_at:                new Date().toISOString(),
      })
      .eq('id', offer.id)
      .select('*, client:clients(*)')
      .single();

    if (err) { setSaving(false); return setError('Błąd zapisu oferty: ' + err.message); }

    // Usuń stare pozycje
    const { error: deleteErr } = await supabase
      .from('sale_offer_items')
      .delete()
      .eq('offer_id', offer.id);

    if (deleteErr) {
      setSaving(false);
      return setError('Błąd usuwania pozycji: ' + deleteErr.message);
    }

    // Wstaw nowe pozycje
    const newItemsPayload = editItems.flatMap((item, idx) => {
      const r = itemResults[idx];
      if (!r || !item.profileName) return [];
      const wh = warehouses.find(w => w.id === item.warehouseId);
      return [{
        offer_id:       offer.id,
        warehouse_id:   item.warehouseId || null,
        warehouse_name: wh?.name ?? null,
        profile_name:   item.profileName,
        steel_grade:    item.steelGrade,
        quantity:       item.quantity,
        length_m:       item.lengthM,
        is_paired:      item.isPaired,
        total_length_m: r.totalLengthM,
        mass_t:         r.massT,
        wall_area_m2:   r.wallAreaM2,
        cost_eur_t:     item.costEurT || null,
        sell_eur_t:     item.sellEurT || null,
        cost_eur_total: r.costEurTotal || null,
        sell_eur_total: r.sellEurTotal || null,
        sell_pln_total: r.sellPlnTotal || null,
        margin_pct:     r.marginPct,
        sort_order:     idx,
      }];
    });

    const { data: insertedItems, error: insertErr } = await supabase
      .from('sale_offer_items')
      .insert(newItemsPayload)
      .select();

    if (insertErr) {
      setSaving(false);
      return setError('Błąd dodawania pozycji: ' + insertErr.message);
    }

    // Zamki: usuń stare i wstaw nowe, pobierz wynik z ID
    let savedLockItems: SaleOfferLockItem[] = [];
    await supabase.from('sale_offer_lock_items').delete().eq('offer_id', offer.id);
    if (editLockItems.length > 0) {
      const { data: insertedLocks, error: locksErr } = await supabase
        .from('sale_offer_lock_items')
        .insert(editLockItems.map((item, idx) => {
          const quantityMb = item.quantitySzt * item.lengthM;
          const massT = item.weightKgM > 0 ? (quantityMb * item.weightKgM) / 1000 : 0;
          return {
            offer_id:     offer.id,
            lock_name:    item.lockName,
            steel_grade:  item.steelGrade || null,
            quantity_szt: item.quantitySzt,
            length_m:     item.lengthM,
            quantity_mb:  quantityMb,
            price_eur_mb:     item.priceEurMb,
            total_eur:        quantityMb * item.priceEurMb,
            total_pln:        quantityMb * item.priceEurMb * exchangeRate,
            sell_price_eur_mb: item.sellPriceEurMb,
            sell_eur_total:   quantityMb * item.sellPriceEurMb,
            sell_pln_total:   quantityMb * item.sellPriceEurMb * exchangeRate,
            mass_t:           massT,
            sort_order:       idx,
          };
        }))
        .select();
      if (locksErr) {
        setSaving(false);
        return setError('Błąd zapisu zamków: ' + locksErr.message);
      }
      savedLockItems = (insertedLocks ?? []) as SaleOfferLockItem[];
    }

    setSaving(false);
    const updatedOffer = data as SaleOffer;
    updatedOffer.items      = (insertedItems ?? []) as SaleOfferItem[];
    updatedOffer.lock_items = savedLockItems;
    onSaved(updatedOffer);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">

        {/* Nagłówek */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Edytuj ofertę sprzedaży</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{offer.offer_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">

          {/* ══════════════════════════════════════════════
              POZYCJE OFERTY
          ══════════════════════════════════════════════ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Pozycje oferty</h4>
              <button onClick={addItem}
                className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj pozycję
              </button>
            </div>

            <div className="space-y-2">
              {editItems.map((item, idx) => {
                const r = itemResults[idx];
                const profileValid = saleProfiles.some(p => p.name === item.profileName);
                return (
                  <div key={item.uid} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                    {/* Wiersz 1: profil, gatunek, magazyn, ilość, długość */}
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Profil</p>}
                        <select
                          value={item.profileName}
                          onChange={e => updateItem(item.uid, { profileName: e.target.value })}
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            !profileValid && item.profileName ? 'border-red-300' : 'border-gray-300'
                          }`}
                        >
                          <option value="">— wybierz —</option>
                          {saleProfiles.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                          {/* Zachowaj oryginalny profil jeśli nie ma go na liście */}
                          {item.profileName && !saleProfiles.some(p => p.name === item.profileName) && (
                            <option value={item.profileName}>{item.profileName} (?)</option>
                          )}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Gatunek stali</p>}
                        <select
                          value={item.steelGrade}
                          onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— wybierz —</option>
                          {steelGrades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          {/* zachowaj oryginalną wartość jeśli nie ma jej na liście (legacy) */}
                          {item.steelGrade && !steelGrades.some(g => g.id === item.steelGrade) && (
                            <option value={item.steelGrade}>{item.steelGrade}</option>
                          )}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Magazyn</p>}
                        <select
                          value={item.warehouseId}
                          onChange={e => updateItem(item.uid, { warehouseId: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— wybierz —</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Ilość</p>}
                        <input type="number" min={1} value={item.quantity}
                          onChange={e => updateItem(item.uid, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Dług.[m]</p>}
                        <input type="number" min={0.1} step={0.5} value={item.lengthM}
                          onChange={e => updateItem(item.uid, { lengthM: Math.max(0.1, parseFloat(e.target.value) || 0) })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <p className="text-xs text-gray-400 mb-1">Masa [t]</p>}
                        <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-sm text-gray-700 min-h-[34px] flex items-center gap-1">
                          {r ? (
                            <>
                              <span className="font-semibold">{formatNumber(r.massT, 3)} t</span>
                              {item.isPaired && <span className="text-blue-600 text-xs">×2</span>}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end items-end">
                        <button onClick={() => removeItem(item.uid)}
                          className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors text-xs"
                          title="Usuń pozycję">
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Wiersz 2: ceny + is_paired + marża */}
                    <div className="grid grid-cols-12 gap-2 items-center pt-1 border-t border-gray-100">
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-400 mb-1">
                          Koszt {isEUR ? '[EUR/t]' : '[PLN/t]'}
                        </label>
                        <input type="number" min={0} step={1} value={item.costEurT}
                          onChange={e => updateItem(item.uid, { costEurT: parseFloat(e.target.value) || 0 })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-400 mb-1">
                          Sprzedaż {isEUR ? '[EUR/t]' : '[PLN/t]'}
                        </label>
                        <input type="number" min={0} step={1} value={item.sellEurT}
                          onChange={e => updateItem(item.uid, { sellEurT: parseFloat(e.target.value) || 0 })}
                          className="w-full border border-orange-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-orange-50"
                        />
                      </div>
                      <div className="col-span-3 flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={item.isPaired}
                            onChange={e => updateItem(item.uid, { isPaired: e.target.checked })}
                            className="accent-blue-700 w-4 h-4" />
                          <span className="text-xs text-gray-600">Podwójna ścianka (×2)</span>
                        </label>
                      </div>
                      {r && (
                        <div className="col-span-3 text-right">
                          <p className="text-xs text-gray-400">Wartość sprzedaży</p>
                          <p className="text-sm font-semibold text-gray-800">
                            {isEUR ? `${formatEUR(r.sellEurTotal)} EUR` : `${formatPLN(r.sellPlnTotal)} PLN`}
                          </p>
                          <p className={`text-xs font-semibold ${
                            r.marginPct < 0 ? 'text-red-600' : r.marginPct < 5 ? 'text-orange-600' : 'text-green-700'
                          }`}>
                            marża: {r.marginPct.toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Suma grodzic */}
              {itemResults.some(r => r !== null) && (
                <div className="flex justify-between text-sm font-semibold text-blue-900 pt-2 border-t border-gray-200 px-1">
                  <span>Suma grodzic:</span>
                  <span className="flex gap-4">
                    <span className="text-gray-600 font-normal">
                      Koszt: {isEUR ? `${formatEUR(totals.totalCostEUR)} EUR` : `${formatPLN(totals.totalCostEUR * exchangeRate)} PLN`}
                    </span>
                    <span>
                      Sprzedaż: {isEUR ? `${formatEUR(totals.totalSellEUR)} EUR` : `${formatPLN(totals.totalSellPLN)} PLN`}
                    </span>
                    <span className="text-gray-500 font-normal">· {formatNumber(totals.totalMassT, 3)} t</span>
                  </span>
                </div>
              )}
            </div>

          </div>

          {/* ── ZAMKI ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🔗 Zamki</p>
              <button onClick={addLockItem}
                className="px-2 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj zamek
              </button>
            </div>
            <div className="p-4">
              {editLockItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Brak zamków · kliknij „Dodaj zamek"</p>
              ) : (
                <div className="space-y-2">
                  {editLockItems.map((item, idx) => {
                    const def      = lockDefs.find(l => l.name === item.lockName);
                    const defPrice = def?.price_eur_mb ?? 0;
                    const qMb      = item.quantitySzt * item.lengthM;
                    const massT    = item.weightKgM > 0 ? (qMb * item.weightKgM) / 1000 : 0;

                    return (
                      <div key={item.uid} className="p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                        {/* Wiersz 1: typ, gatunek, szt., długość, cena koszt, masa, usuń */}
                        <div className="grid grid-cols-12 gap-2 items-end">
                          {/* Typ zamka */}
                          <div className="col-span-3">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Typ zamka</p>}
                            <select value={item.lockName}
                              onChange={e => updateLockItem(item.uid, { lockName: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              {lockDefs.map(l => (
                                <option key={l.id} value={l.name}>{l.name}</option>
                              ))}
                              {!lockDefs.some(l => l.name === item.lockName) && (
                                <option value={item.lockName}>{item.lockName}</option>
                              )}
                            </select>
                          </div>
                          {/* Gatunek */}
                          <div className="col-span-2">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Gatunek</p>}
                            <select value={item.steelGrade}
                              onChange={e => updateLockItem(item.uid, { steelGrade: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">—</option>
                              {steelGrades.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </div>
                          {/* Ilość szt. */}
                          <div className="col-span-1">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Szt.</p>}
                            <input type="number" min={1} step={1} value={item.quantitySzt}
                              onChange={e => updateLockItem(item.uid, { quantitySzt: Math.max(1, parseInt(e.target.value) || 1) })}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          {/* Długość */}
                          <div className="col-span-1">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Dł. [m]</p>}
                            <input type="number" min={0.1} step={0.1} value={item.lengthM}
                              onChange={e => updateLockItem(item.uid, { lengthM: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          {/* Cena/mb (koszt) */}
                          <div className="col-span-2">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Koszt {isEUR ? 'EUR' : 'PLN'}/mb</p>}
                            <input type="number" min={0} step={0.5}
                              value={isEUR ? item.priceEurMb : Math.round(item.priceEurMb * exchangeRate * 100) / 100}
                              onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                updateLockItem(item.uid, { priceEurMb: isEUR ? v : v / exchangeRate });
                              }}
                              className={`w-full border rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                item.priceEurMb !== defPrice && defPrice > 0 ? 'border-amber-400 bg-amber-50' : 'border-blue-300 bg-blue-50'
                              }`} />
                          </div>
                          {/* Masa [t] */}
                          <div className="col-span-2">
                            {idx === 0 && <p className="text-xs text-gray-400 mb-1">Masa [t]</p>}
                            <div className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right text-gray-600">
                              {formatNumber(massT, 3)}
                            </div>
                          </div>
                          {/* Usuń */}
                          <div className="col-span-1 flex justify-end items-end">
                            <button onClick={() => removeLockItem(item.uid)}
                              className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200"
                              title="Usuń">✕</button>
                          </div>
                        </div>
                        {/* Wiersz 2: cena sprzedaży */}
                        <div className="pt-1 border-t border-gray-100 flex items-center gap-4">
                          {/* Cena sprzedaży [waluta/mb] */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">Cena sprzedaży [{isEUR ? 'EUR' : 'PLN'}/mb]</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min={0} step={0.01}
                                value={isEUR ? item.sellPriceEurMb : Math.round(item.sellPriceEurMb * exchangeRate * 100) / 100}
                                onChange={e => {
                                  const v = parseFloat(e.target.value) || 0;
                                  updateLockItem(item.uid, { sellPriceEurMb: isEUR ? v : v / exchangeRate });
                                }}
                                className="w-24 border rounded px-2 py-1 text-sm border-blue-400"
                              />
                              {(() => {
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
                        </div>
                      </div>
                    );
                  })}
                  {/* Suma zamków */}
                  {editLockItems.length > 0 && (
                    <div className="flex justify-between text-sm font-semibold text-blue-900 pt-2 border-t border-gray-200 px-1">
                      <span>Suma zamków:</span>
                      <span className="flex gap-4">
                        <span className="text-gray-600 font-normal">
                          Koszt: {isEUR ? `${formatEUR(lockTotals.totalEUR)} EUR` : `${formatPLN(lockTotals.totalPLN)} PLN`}
                        </span>
                        <span>
                          Sprzedaż: {isEUR ? `${formatEUR(lockTotals.totalSellEUR)} EUR` : `${formatPLN(lockTotals.totalSellPLN)} PLN`}
                        </span>
                        <span className="text-gray-500 font-normal">· {formatNumber(editLockItems.reduce((s, item) => s + (item.weightKgM > 0 ? (item.quantitySzt * item.lengthM) * item.weightKgM / 1000 : 0), 0), 3)} t</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Podsumowanie oferty ── */}
          {(totals.totalMassT > 0 || editLockItems.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-1">Podsumowanie</p>
              <div className="pt-1 border-t border-blue-200 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Masa łączna:</span>{' '}
                  <strong>{formatNumber(
                    totals.totalMassT + editLockItems.reduce((s, item) => s + (item.weightKgM > 0 ? (item.quantitySzt * item.lengthM) * item.weightKgM / 1000 : 0), 0),
                    3
                  )} t</strong>
                </div>
                <div>
                  <span className="text-gray-500">Kurs EUR:</span>{' '}
                  <strong>{exchangeRate.toFixed(4)} PLN</strong>
                </div>
              </div>
              <div className="pt-2 border-t border-blue-200 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Wartość sprzedaży (EUR):</span>
                  <strong>{formatEUR(totals.totalSellEUR + lockTotals.totalSellEUR)} EUR</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Wartość sprzedaży (PLN):</span>
                  <strong>{formatPLN(totals.totalSellPLN + lockTotals.totalSellPLN)} PLN</strong>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                  <span className="text-gray-600 font-medium">Marża łączna:</span>
                  <strong className={totals.overallMarginPct < 0 ? 'text-red-600' : totals.overallMarginPct < 5 ? 'text-orange-600' : 'text-green-700'}>
                    {totals.overallMarginPct.toFixed(1)}%
                  </strong>
                </div>
                {deliveryCalc && deliveryCalc.costPerTruck > 0 && deliveryPaidBy !== 'fca' && (
                  <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                    <span className={deliveryPaidBy === 'dap_extra' ? 'text-orange-600' : 'text-gray-500'}>
                      Dostawa ({deliveryCalc.trucks} aut{deliveryCalc.trucks > 1 ? 'a' : ''})
                      {deliveryPaidBy === 'dap_extra' && <span className="ml-1 font-medium">[refaktura]</span>}:
                    </span>
                    <strong className={deliveryPaidBy === 'dap_extra' ? 'text-orange-600' : ''}>
                      {isEUR
                        ? `${formatEUR(deliveryCalc.totalCostPLN / exchangeRate)} EUR`
                        : `${formatPLN(deliveryCalc.totalCostPLN)} PLN`}
                    </strong>
                  </div>
                )}
                {deliveryPaidBy === 'fca' && (
                  <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                    <span className="text-gray-500">Dostawa:</span>
                    <strong className="text-green-700">FCA – odbiór własny</strong>
                  </div>
                )}
                {deliveryPaidBy === 'dap_included' && deliveryCalc && deliveryCalc.costPerTruck > 0 && (
                  <div className="flex justify-between text-sm font-semibold pt-1 border-t border-blue-200 text-blue-900">
                    <span>Łącznie dla klienta:</span>
                    <span>{isEUR ? `${formatEUR(totalForClientInCurrency)} EUR` : `${formatPLN(totalForClientInCurrency)} PLN`}</span>
                  </div>
                )}
                {(deliveryFrom || deliveryTo) && deliveryPaidBy !== 'fca' && (
                  <p className="text-xs text-gray-500 mt-1">🚛 {deliveryFrom}{deliveryTo ? ` → ${deliveryTo}` : ''}</p>
                )}
                {deliveryPaidBy === 'fca' && deliveryFrom && (
                  <p className="text-xs text-gray-500 mt-1">📦 Odbiór z: {deliveryFrom}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Waluta i kurs EUR ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Waluta oferty</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waluta</label>
                <div className="flex gap-2">
                  {(['EUR', 'PLN'] as const).map(c => (
                    <button key={c} onClick={() => handleCurrencyChange(c)}
                      className={`flex-1 py-2 text-sm rounded-lg border-2 font-medium transition-colors ${
                        currency === c ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kurs EUR/PLN</label>
                <input type="number" min={1} step={0.0001} value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 4.25)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── Klient ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Klient <span className="text-red-500">*</span>
            </label>
            <ClientSearchInput clients={clients} value={clientId} onChange={setClientId} />
          </div>

          {/* ── Opiekun handlowy ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opiekun handlowy</label>
            <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SALES_REPS.map(r => (
                <option key={r.name} value={r.name}>{r.name} – tel. {r.phone}</option>
              ))}
            </select>
          </div>

          {/* ── Transport ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Transport</p>
            </div>
            <div className="p-4 space-y-4">

              {/* Opcja transportu */}
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { val: 'dap_included', label: 'DAP – w cenie',      desc: 'Transport wliczony w cenę' },
                  { val: 'dap_extra',    label: 'DAP – refaktura',     desc: 'Transport na klienta' },
                  { val: 'fca',          label: 'FCA – odbiór własny', desc: 'Klient odbiera własnym transportem' },
                ] as const).map(({ val, label, desc }) => (
                  <label key={val} className={`flex-1 flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    deliveryPaidBy === val
                      ? val === 'dap_extra' ? 'border-orange-500 bg-orange-50'
                        : 'border-blue-700 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input type="radio" name="editSaleDeliveryPaidBy" value={val}
                        checked={deliveryPaidBy === val}
                        onChange={() => setDeliveryPaidBy(val)}
                        className="accent-blue-900" />
                      <span className={`text-sm font-semibold ${
                        deliveryPaidBy === val && val === 'dap_extra' ? 'text-orange-700'
                        : deliveryPaidBy === val ? 'text-blue-800'
                        : 'text-gray-700'
                      }`}>{label}</span>
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5 ml-5">{desc}</span>
                  </label>
                ))}
              </div>

              {/* Pola kosztów – widoczne gdy nie FCA */}
              {deliveryPaidBy !== 'fca' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Liczba aut</label>
                    <input type="number" min={1} step={1}
                      value={deliveryTrucks === '' ? (deliveryCalc?.autoTrucks ?? 1) : deliveryTrucks}
                      onChange={e => setDeliveryTrucks(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Ładowność: 24,5 t · Szacunek: <strong>{deliveryCalc?.autoTrucks ?? '—'}</strong> aut
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Koszt / auto [{isEUR ? 'EUR' : 'PLN'}]
                    </label>
                    <input type="number" min={0} step={100}
                      value={deliveryCostPerTruck}
                      placeholder={isEUR ? 'np. 300' : 'np. 1500'}
                      onChange={e => setDeliveryCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {deliveryCalc && deliveryCalc.costPerTruck > 0 && (
                    <div className="col-span-2">
                      <p className={`text-sm font-semibold ${deliveryPaidBy === 'dap_extra' ? 'text-orange-700' : 'text-gray-700'}`}>
                        Łączny koszt transportu:{' '}
                        {isEUR
                          ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR`
                          : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                        {isEUR && <span className="text-xs font-normal text-gray-400 ml-1">
                          ({formatPLN(deliveryCalc.totalCostPLN)} PLN)
                        </span>}
                        {deliveryPaidBy === 'dap_extra' && (
                          <span className="ml-2 text-xs text-orange-600 font-normal">– refaktura na klienta</span>
                        )}
                        {deliveryPaidBy === 'dap_included' && (
                          <span className="ml-2 text-xs text-blue-600 font-normal">– wliczony w cenę</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Trasa */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {deliveryPaidBy === 'fca' ? 'Odbiór z (FCA)' : 'Załadunek z'}
                  </label>
                  <input type="text" value={deliveryFrom} onChange={e => setDeliveryFrom(e.target.value)}
                    placeholder="np. Oleśnica"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {deliveryPaidBy !== 'fca' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dostawa do</label>
                    <input type="text" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)}
                      placeholder="np. Warszawa"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              WARUNKI OFERTY
          ══════════════════════════════════════════════ */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Warunki oferty</p>
            </div>
            <div className="p-4 space-y-5">

              {/* Termin dostawy */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Termin dostawy</p>
                <div className="flex gap-4 mb-3">
                  {([
                    { val: 'magazyn', label: 'Z magazynu' },
                    { val: 'huta',    label: 'Z huty (produkcja)' },
                  ] as const).map(opt => (
                    <label key={opt.val} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="editDeliveryTimeline" value={opt.val}
                        checked={deliveryTimeline === opt.val}
                        onChange={() => setDeliveryTimeline(opt.val)}
                        className="accent-blue-900" />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>

                {deliveryTimeline === 'magazyn' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Szacowany czas dostawy</label>
                    <select
                      value={WAREHOUSE_DELIVERY_OPTIONS.includes(warehouseDeliveryTime) ? warehouseDeliveryTime : '__custom__'}
                      onChange={e => {
                        if (e.target.value !== '__custom__') setWarehouseDeliveryTime(e.target.value);
                        else setWarehouseDeliveryTime('');
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {WAREHOUSE_DELIVERY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      <option value="__custom__">── Wpisz własny ──</option>
                    </select>
                    {!WAREHOUSE_DELIVERY_OPTIONS.includes(warehouseDeliveryTime) && (
                      <input
                        type="text"
                        value={warehouseDeliveryTime}
                        onChange={e => setWarehouseDeliveryTime(e.target.value)}
                        placeholder="np. 2–3 tygodnie, natychmiastowo..."
                        autoFocus
                        className="mt-2 w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Na PDF: „z magazynu, {warehouseDeliveryTime}"
                    </p>
                  </div>
                )}

                {deliveryTimeline === 'huta' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Tydzień kampanii <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={campaignWeeks}
                          onChange={e => setCampaignWeeks(e.target.value)}
                          placeholder="np. 50/51"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Wstępny termin dostaw</label>
                        <input type="text" value={campaignDeliveryWeeks}
                          onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                          placeholder="np. 51/52"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                      Na PDF: „produkcja w planowanej kampanii w tyg. <strong>{campaignWeeks || '??'}</strong>
                      {campaignDeliveryWeeks && ` – dostawy wstępnie możliwe od tyg. ${campaignDeliveryWeeks}`}
                      {' '}– do potwierdzenia po zakończonej produkcji."
                    </div>
                  </div>
                )}
              </div>

              {/* Warunki dostawy (Incoterms) */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Warunki dostawy (Incoterms)</p>
                <div className="flex gap-4 mb-3">
                  {([
                    { val: 'DAP', label: 'DAP – dostawa w cenie' },
                    { val: 'FCA', label: 'FCA – odbiór własny' },
                  ] as const).map(opt => (
                    <label key={opt.val} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="editDeliveryTerms" value={opt.val}
                        checked={deliveryTerms === opt.val}
                        onChange={() => setDeliveryTerms(opt.val)}
                        className="accent-blue-900" />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {deliveryTerms === 'FCA' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Lokalizacja magazynu odbioru <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={fcaLocation}
                      onChange={e => setFcaLocation(e.target.value)}
                      placeholder="np. Oleśnica, ul. Przemysłowa 1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Na PDF: „FCA ({fcaLocation || '...'})"
                    </p>
                  </div>
                )}
              </div>

              {/* Termin płatności */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Termin płatności</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 0,  label: 'Przedpłata 100%' },
                    { val: 30, label: '30 dni od faktury' },
                    { val: 60, label: '60 dni od faktury' },
                    { val: 90, label: '90 dni od faktury' },
                  ].map(opt => (
                    <label key={opt.val}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                        paymentDays === opt.val
                          ? 'border-blue-700 bg-blue-50 text-blue-800 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}>
                      <input type="radio" name="editPaymentDays" value={opt.val}
                        checked={paymentDays === opt.val}
                        onChange={() => setPaymentDays(opt.val)}
                        className="accent-blue-900" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Ważność oferty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ważność oferty [dni]</label>
                <div className="flex gap-2">
                  {[1, 3, 7, 14].map(d => (
                    <button key={d} onClick={() => setValidDays(d)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        validDays === d
                          ? 'border-blue-700 bg-blue-700 text-white font-medium'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}>
                      {d === 1 ? '24h' : `${d} dni`}
                    </button>
                  ))}
                  <input type="number" min={1} value={validDays}
                    onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* ── Notatki ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notatki do oferty</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Opcjonalne uwagi wewnętrzne..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Stopka */}
        <div className="p-6 border-t border-gray-100 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            Zapis: UPDATE + przebudowa pozycji oferty
          </p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              Anuluj
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
              {saving ? 'Zapisywanie...' : 'Zapisz zmiany SP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
