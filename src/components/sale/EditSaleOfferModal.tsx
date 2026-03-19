import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client, SaleOffer, SaleOfferItem, SaleProfile } from '../../types';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';

interface Warehouse { id: string; name: string; }
interface SalePrice { warehouse_id: string; profile_name: string; steel_grade: string; price_eur_t: number | null; }

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

// ─── Komponent ───────────────────────────────────────────────────────────────

export default function EditSaleOfferModal({
  offer, clients, saleProfiles, onSaved, onClose,
}: Props) {

  // ── Dane słownikowe (z DB) ──
  const [steelGrades, setSteelGrades] = useState<string[]>([]);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [prices,      setPrices]      = useState<SalePrice[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('sale_steel_grades').select('name').order('sort_order'),
      supabase.from('sale_warehouses').select('id, name').order('name'),
      supabase.from('sale_prices').select('warehouse_id, profile_name, steel_grade, price_eur_t'),
    ]).then(([gradesRes, warehousesRes, pricesRes]) => {
      if (gradesRes.data)    setSteelGrades(gradesRes.data.map((r: { name: string }) => r.name));
      if (warehousesRes.data) setWarehouses(warehousesRes.data as Warehouse[]);
      if (pricesRes.data)    setPrices(pricesRes.data as SalePrice[]);
    });
  }, []);

  // Normalizuj gatunki stali w załadowanych pozycjach (dopasowanie case-insensitive)
  useEffect(() => {
    if (steelGrades.length === 0) return;
    setEditItems(prev => prev.map(item => {
      if (!item.steelGrade) return { ...item, steelGrade: steelGrades[0] };
      if (steelGrades.includes(item.steelGrade)) return item;
      const normalized = steelGrades.find(g => g.toLowerCase() === item.steelGrade.toLowerCase());
      return normalized ? { ...item, steelGrade: normalized } : item;
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
  const [editItems, setEditItems] = useState<EditableItem[]>(() => itemsFromOffer(offer));

  // ── Podstawowe pola ──
  const [clientId,    setClientId]    = useState(offer.client_id ?? '');
  const [preparedBy,  setPreparedBy]  = useState(offer.prepared_by ?? SALES_REPS[0].name);
  const [notes,       setNotes]       = useState(offer.notes ?? '');
  const [validDays,   setValidDays]   = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);

  // ── Waluta ──
  const [currency,     setCurrency]     = useState<'EUR' | 'PLN'>(offer.currency as 'EUR' | 'PLN');
  const [exchangeRate, setExchangeRate] = useState(offer.exchange_rate ?? 4.25);

  // ── Transport ──
  const [deliveryTrucks,       setDeliveryTrucks]       = useState<number | ''>(offer.delivery_trucks ?? '');
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>(offer.delivery_cost_per_truck ?? '');
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
    const gr   = steelGrades[0] ?? '';
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

  // ── Wyliczenia pozycji ──
  const itemResults = useMemo(() =>
    editItems.map(item => {
      const profile = saleProfiles.find(p => p.name === item.profileName);
      if (!profile || item.quantity <= 0 || item.lengthM <= 0) return null;
      const totalLengthM  = item.quantity * item.lengthM * (item.isPaired ? 2 : 1);
      const massT         = totalLengthM * profile.weight_kg_per_m / 1000;
      const wallAreaM2    = totalLengthM * (profile.width_mm / 1000);
      const costEurTotal  = item.costEurT * massT;
      const sellEurTotal  = item.sellEurT * massT;
      const sellPlnTotal  = sellEurTotal * exchangeRate;
      const marginPct     = sellEurTotal > 0 ? ((sellEurTotal - costEurTotal) / sellEurTotal) * 100 : 0;
      return { totalLengthM, massT, wallAreaM2, costEurTotal, sellEurTotal, sellPlnTotal, marginPct };
    }),
    [editItems, saleProfiles, exchangeRate]
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

  // ── Koszty transportu ──
  const trucks       = typeof deliveryTrucks       === 'number' ? deliveryTrucks       : 0;
  const costPerTruck = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
  const deliveryCostInCurrency = trucks * costPerTruck;
  const deliveryCostTotalPLN   = currency === 'EUR'
    ? deliveryCostInCurrency * exchangeRate
    : deliveryCostInCurrency;

  // ── Zapis ──
  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (editItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję.');
    const hasValidItem = itemResults.some((r, i) => r !== null && editItems[i].profileName);
    if (!hasValidItem) return setError('Brak prawidłowych pozycji. Sprawdź nazwy profili.');
    const itemsWithProfile = editItems.filter(i => i.profileName);
    const missingGrade = itemsWithProfile.some(i => !i.steelGrade || !steelGrades.includes(i.steelGrade));
    if (missingGrade) return setError('Wybierz prawidłowy gatunek stali dla wszystkich pozycji.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    setSaving(true);
    setError('');

    const hasTransport = deliveryPaidBy !== 'fca' && costPerTruck > 0 && trucks > 0;

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
        total_sell_eur:            totals.totalSellEUR,
        total_sell_pln:            totals.totalSellPLN,
        margin_pct:                totals.overallMarginPct,
        delivery_trucks:           hasTransport ? trucks    : null,
        delivery_cost_per_truck:   hasTransport ? costPerTruck : null,
        delivery_cost_total:       hasTransport ? deliveryCostTotalPLN : null,
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

    setSaving(false);
    const updatedOffer = data as SaleOffer;
    updatedOffer.items = (insertedItems ?? []) as SaleOfferItem[];
    onSaved(updatedOffer);
  }

  const isEUR = currency === 'EUR';

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
                          {steelGrades.map(g => <option key={g} value={g}>{g}</option>)}
                          {/* zachowaj oryginalną wartość jeśli nie ma jej na liście */}
                          {item.steelGrade && !steelGrades.includes(item.steelGrade) && (
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
                        {editItems.length > 1 && (
                          <button onClick={() => removeItem(item.uid)}
                            className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors text-xs">
                            ✕
                          </button>
                        )}
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
                            {isEUR ? `${formatEUR(r.sellEurTotal)} EUR` : `${formatPLN(r.sellEurTotal)} PLN`}
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
            </div>

            {/* Podsumowanie pozycji */}
            {totals.totalMassT > 0 && (
              <div className="mt-3 flex flex-wrap gap-4 text-sm px-1">
                <span className="text-gray-500">Masa łączna: <strong className="text-gray-800">{formatNumber(totals.totalMassT, 3)} t</strong></span>
                <span className="text-gray-500">Wartość:
                  <strong className="text-blue-900 ml-1">
                    {isEUR ? `${formatEUR(totals.totalSellEUR)} EUR` : `${formatPLN(totals.totalSellPLN)} PLN`}
                  </strong>
                </span>
                <span className={`font-semibold ${
                  totals.overallMarginPct < 0 ? 'text-red-600' : totals.overallMarginPct < 5 ? 'text-orange-600' : 'text-green-700'
                }`}>
                  Marża łączna: {totals.overallMarginPct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

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
                    <button key={c} onClick={() => setCurrency(c)}
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
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— wybierz klienta —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.country === 'PL' ? c.nip : c.vat_number})
                </option>
              ))}
            </select>
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
                    <label className="block text-xs text-gray-500 mb-1">
                      Liczba aut
                    </label>
                    <input type="number" min={1} step={1}
                      value={deliveryTrucks}
                      placeholder="np. 2"
                      onChange={e => setDeliveryTrucks(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
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
                  {costPerTruck > 0 && trucks > 0 && (
                    <div className="col-span-2">
                      <p className={`text-sm font-semibold ${deliveryPaidBy === 'dap_extra' ? 'text-orange-700' : 'text-gray-700'}`}>
                        Łączny koszt transportu:{' '}
                        {isEUR
                          ? `${formatEUR(deliveryCostInCurrency)} EUR`
                          : `${formatPLN(deliveryCostInCurrency)} PLN`}
                        {isEUR && <span className="text-xs font-normal text-gray-400 ml-1">
                          ({formatPLN(deliveryCostTotalPLN)} PLN)
                        </span>}
                        {deliveryPaidBy === 'dap_extra' && (
                          <span className="ml-2 text-xs text-orange-600 font-normal">– refaktura na klienta</span>
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
                    <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {WAREHOUSE_DELIVERY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
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
