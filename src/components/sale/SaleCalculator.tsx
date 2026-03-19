import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';
import { fetchNBPRate, formatNBPDate } from '../../lib/nbp';
import type { NBPRate } from '../../lib/nbp';
import type { Client, SaleOffer, SaleWarehouse, SaleSteeelGrade, SaleProfile, SalePrice } from '../../types';
import SaveSaleOfferModal from './SaveSaleOfferModal';
import type { SaleItemSnapshot } from './SaveSaleOfferModal';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface SaleCalcItem {
  uid: string;
  warehouseId: string;
  profileName: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
  isPaired: boolean;
  costPriceEurT: number;
  sellPriceEurT: number;
}

interface ItemResult {
  valid: boolean;
  piles: number;
  totalLengthM: number;
  massT: number;
  wallAreaM2: number;
  costEUR: number;
  sellEUR: number;
  marginPct: number;
  profile: SaleProfile | null;
}

// ─── Pomocnicze ───────────────────────────────────────────────────────────────

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

// ─── Komponent ────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onOfferSaved: (offer: SaleOffer) => void;
}

export default function SaleCalculator({ clients, onClientAdded, onOfferSaved }: Props) {
  // --- Dane z bazy ---
  const [warehouses, setWarehouses] = useState<SaleWarehouse[]>([]);
  const [grades,     setGrades]     = useState<SaleSteeelGrade[]>([]);
  const [profiles,   setProfiles]   = useState<SaleProfile[]>([]);
  const [prices,     setPrices]     = useState<SalePrice[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dbError,    setDbError]    = useState('');

  // --- Stan kalkulatora ---
  const [items, setItems] = useState<SaleCalcItem[]>([]);
  const [nbpRate, setNbpRate]           = useState<NBPRate>({ rate: 4.25, date: '', source: 'ręczny' });
  const [nbpLoading, setNbpLoading]     = useState(false);
  const [nbpError, setNbpError]         = useState('');
  const [manualRate, setManualRate]     = useState(false);
  const [currency, setCurrency]         = useState<'EUR' | 'PLN'>('EUR');
  const [applyAllSellPrice, setApplyAllSellPrice] = useState<number>(0);
  const [showSaveModal, setShowSaveModal]         = useState(false);

  // Dostawa
  const TRUCK_CAPACITY_T = 24.5;
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>('');
  const [customDeliveryTrucks, setCustomDeliveryTrucks] = useState<number | ''>('');
  const [deliveryPaidBy, setDeliveryPaidBy]             = useState<'intra' | 'klient'>('intra');
  const [deliveryFrom, setDeliveryFrom]                 = useState('Magazyn Intra B.V.');
  const [deliveryTo, setDeliveryTo]                     = useState('');

  const exchangeRate = nbpRate.rate;

  useEffect(() => { loadData(); loadNBP(); }, []);

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

  async function loadData() {
    setLoading(true);
    setDbError('');
    const [whRes, grRes, prRes, spRes] = await Promise.all([
      supabase.from('sale_warehouses').select('*').eq('active', true).order('id'),
      supabase.from('sale_steel_grades').select('*').order('sort_order'),
      supabase.from('sale_profiles').select('*').eq('active', true).order('name'),
      supabase.from('sale_prices').select('*'),
    ]);
    if (whRes.error || grRes.error || prRes.error || spRes.error) {
      setDbError('Błąd ładowania danych. Odśwież stronę.');
      setLoading(false);
      return;
    }
    const whs  = whRes.data as SaleWarehouse[];
    const grs  = grRes.data as SaleSteeelGrade[];
    const prs  = prRes.data as SaleProfile[];
    const sps  = spRes.data as SalePrice[];
    setWarehouses(whs);
    setGrades(grs);
    setProfiles(prs);
    setPrices(sps);

    // Inicjalizuj pierwszą pozycję gdy dane gotowe
    if (whs.length && prs.length && grs.length) {
      const defaultWh      = whs[0].id;
      const defaultProfile = prs[0].name;
      const defaultGrade   = grs[0].id;
      const costPrice = sps.find(
        p => p.warehouse_id === defaultWh && p.profile_name === defaultProfile && p.steel_grade === defaultGrade
      )?.price_eur_t ?? 0;

      setItems([{
        uid: crypto.randomUUID(),
        warehouseId: defaultWh,
        profileName: defaultProfile,
        steelGrade: defaultGrade,
        quantity: 10,
        lengthM: 12,
        isPaired: false,
        costPriceEurT: costPrice ?? 0,
        sellPriceEurT: 0,
      }]);
    }
    setLoading(false);
  }

  // Mapa cennikowa: warehouse → profil → gatunek → cena
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

  // --- Zarządzanie pozycjami ---
  function addItem() {
    const wh   = warehouses[0]?.id ?? '';
    const prof = profiles[0]?.name ?? '';
    const gr   = grades[0]?.id ?? '';
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      warehouseId: wh, profileName: prof, steelGrade: gr,
      quantity: 10, lengthM: 12,
      isPaired: false,
      costPriceEurT: lookupCostPrice(wh, prof, gr),
      sellPriceEurT: 0,
    }]);
  }

  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<SaleCalcItem>) {
    setItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Jeśli zmienił się magazyn/profil/gatunek → auto-aktualizuj cenę kosztu
      if ('warehouseId' in patch || 'profileName' in patch || 'steelGrade' in patch) {
        updated.costPriceEurT = lookupCostPrice(
          updated.warehouseId, updated.profileName, updated.steelGrade
        );
      }
      return updated;
    }));
  }

  function applyPriceToAll() {
    if (applyAllSellPrice <= 0) return;
    setItems(prev => prev.map(i => ({ ...i, sellPriceEurT: applyAllSellPrice })));
  }

  // --- Obliczenia per pozycja ---
  const itemResults = useMemo((): ItemResult[] =>
    items.map(item => {
      const profile = profiles.find(p => p.name === item.profileName) ?? null;
      if (!profile || item.quantity <= 0 || item.lengthM <= 0) {
        return { valid: false, piles: 0, totalLengthM: 0, massT: 0, wallAreaM2: 0, costEUR: 0, sellEUR: 0, marginPct: 0, profile: null };
      }
      const piles        = item.isPaired ? item.quantity * 2 : item.quantity;
      const totalLengthM = piles * item.lengthM;
      const massT        = (totalLengthM * profile.weight_kg_per_m) / 1000;
      const wallAreaM2   = totalLengthM * (profile.width_mm / 1000);
      const costEUR      = massT * (item.costPriceEurT || 0);
      const sellEUR      = massT * (item.sellPriceEurT || 0);
      const marginPct    = sellEUR > 0 ? ((sellEUR - costEUR) / sellEUR) * 100 : 0;
      return { valid: true, piles, totalLengthM, massT, wallAreaM2, costEUR, sellEUR, marginPct, profile };
    }),
    [items, profiles]
  );

  // --- Sumy łączne ---
  const totals = useMemo(() => {
    let totalMassT = 0, totalWallAreaM2 = 0, totalCostEUR = 0, totalSellEUR = 0;
    for (const r of itemResults) {
      if (!r.valid) continue;
      totalMassT      += r.massT;
      totalWallAreaM2 += r.wallAreaM2;
      totalCostEUR    += r.costEUR;
      totalSellEUR    += r.sellEUR;
    }
    const overallMarginPct  = totalSellEUR > 0 ? ((totalSellEUR - totalCostEUR) / totalSellEUR) * 100 : 0;
    const totalSellPLN      = totalSellEUR * exchangeRate;
    const totalCostPLN      = totalCostEUR * exchangeRate;
    const sellPerTon        = totalMassT > 0 ? totalSellEUR / totalMassT : 0;
    const sellPerM2         = totalWallAreaM2 > 0 ? totalSellEUR / totalWallAreaM2 : 0;
    return { totalMassT, totalWallAreaM2, totalCostEUR, totalSellEUR, overallMarginPct, totalSellPLN, totalCostPLN, sellPerTon, sellPerM2 };
  }, [itemResults, exchangeRate]);

  const isValid = totals.totalMassT > 0;
  const hasAllSellPrices = items.every(i => i.sellPriceEurT > 0);

  // Obliczenia dostawy
  // costPerTruck wpisywany jest w aktualnej walucie (EUR lub PLN)
  // totalCostPLN = zawsze PLN → do zapisu w DB i do totalForClientPLN
  const deliveryCalc = useMemo(() => {
    if (!isValid) return null;
    const autoTrucks   = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const trucks       = typeof customDeliveryTrucks === 'number' && customDeliveryTrucks > 0
      ? customDeliveryTrucks : autoTrucks;
    const costPerTruck = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    const totalCostPLN    = currency === 'EUR'
      ? totalInCurrency * exchangeRate
      : totalInCurrency;
    return { trucks, autoTrucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [isValid, totals.totalMassT, deliveryCostPerTruck, customDeliveryTrucks, currency, exchangeRate]);

  const deliveryCostPLN       = (deliveryPaidBy === 'intra' && deliveryCalc) ? deliveryCalc.totalCostPLN    : 0;
  const deliveryCostCurrency  = (deliveryPaidBy === 'intra' && deliveryCalc) ? deliveryCalc.totalInCurrency : 0;
  const totalForClientPLN     = totals.totalSellPLN + deliveryCostPLN;
  // Łącznie w wybranej walucie: towary + dostawa (obie w tej samej jednostce)
  const totalForClientInCurrency = (currency === 'EUR' ? totals.totalSellEUR : totals.totalSellPLN) + deliveryCostCurrency;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  if (dbError) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 text-sm">{dbError}</div>
  );

  return (
    <div className="space-y-6">

      {/* ── KURS I WALUTA ── */}
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
                  {(manualRate || nbpError) && (
                    <button
                      onClick={loadNBP}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      ↺ pobierz NBP
                    </button>
                  )}
                </div>
              </div>
            )}
            {nbpError && (
              <p className="text-xs text-amber-600 mt-1">{nbpError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Waluta oferty</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
              {(['EUR', 'PLN'] as const).map(cur => (
                <button key={cur} onClick={() => setCurrency(cur)}
                  className={`px-4 py-1.5 transition-colors ${currency === cur ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {cur}
                </button>
              ))}
            </div>
          </div>
          {/* Szybka cena sprzedaży dla wszystkich */}
          <div className="ml-auto">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zastosuj cenę do wszystkich pozycji</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} step={1}
                value={applyAllSellPrice || ''}
                placeholder="EUR/t"
                onChange={e => setApplyAllSellPrice(parseFloat(e.target.value) || 0)}
                className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={applyPriceToAll}
                className="px-3 py-1.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors">
                Zastosuj
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── POZYCJE WYCENY ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Pozycje wyceny</h2>
          <button onClick={addItem}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
            + Dodaj pozycję
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, idx) => {
            const r = itemResults[idx];
            const warehouse = warehouses.find(w => w.id === item.warehouseId);
            const costFromMatrix = lookupCostPrice(item.warehouseId, item.profileName, item.steelGrade);
            const costChanged = item.costPriceEurT !== costFromMatrix && costFromMatrix > 0;

            return (
              <div key={item.uid} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">

                {/* Wiersz 1: Magazyn | Profil | Gatunek | Ilość | Długość | Parowane | [Usuń] */}
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">

                  {/* Magazyn */}
                  <div className="sm:col-span-3">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Magazyn</label>}
                    <select value={item.warehouseId} onChange={e => updateItem(item.uid, { warehouseId: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>

                  {/* Profil */}
                  <div className="sm:col-span-3">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Profil VL</label>}
                    <select value={item.profileName} onChange={e => updateItem(item.uid, { profileName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {profiles.map(p => <option key={p.id} value={p.name}>{p.name} ({p.weight_kg_per_m} kg/m)</option>)}
                    </select>
                  </div>

                  {/* Gatunek */}
                  <div className="sm:col-span-2">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek</label>}
                    <select value={item.steelGrade} onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>

                  {/* Ilość */}
                  <div className="sm:col-span-1">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość</label>}
                    <input type="number" min={1} step={1} value={item.quantity}
                      onChange={e => updateItem(item.uid, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Długość */}
                  <div className="sm:col-span-1">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Dług. [m]</label>}
                    <input type="number" min={0.5} step={0.5} value={item.lengthM}
                      onChange={e => updateItem(item.uid, { lengthM: Math.max(0.5, parseFloat(e.target.value) || 0.5) })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Parowane */}
                  <div className="sm:col-span-1 flex flex-col items-center">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Parowane</label>}
                    <label className="flex items-center gap-1 cursor-pointer mt-1">
                      <input type="checkbox" checked={item.isPaired}
                        onChange={e => updateItem(item.uid, { isPaired: e.target.checked })}
                        className="w-4 h-4 accent-blue-700 rounded" />
                      <span className="text-xs text-gray-500">×2</span>
                    </label>
                  </div>

                  {/* Masa */}
                  <div className="sm:col-span-1">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Masa [t]</label>}
                    <div className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-right font-semibold text-gray-800 min-h-[38px] flex items-center justify-end">
                      {r.valid ? formatNumber(r.massT, 3) : <span className="text-gray-400">—</span>}
                    </div>
                  </div>

                  {/* Usuń */}
                  <div className="sm:col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(item.uid)}
                        className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
                        title="Usuń pozycję">✕</button>
                    )}
                  </div>
                </div>

                {/* Wiersz 2: Ceny i marża */}
                <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-gray-200">

                  {/* Cena kosztu */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Cena kosztu [EUR/t]
                      {costChanged && (
                        <button onClick={() => updateItem(item.uid, { costPriceEurT: costFromMatrix })}
                          className="ml-1 text-blue-600 underline font-normal">
                          (przywróć {costFromMatrix})
                        </button>
                      )}
                    </label>
                    <input type="number" min={0} step={1} value={item.costPriceEurT || ''}
                      onChange={e => updateItem(item.uid, { costPriceEurT: parseFloat(e.target.value) || 0 })}
                      className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    <p className="text-xs text-gray-400 mt-0.5">
                      {costFromMatrix > 0
                        ? `z cennika: ${costFromMatrix} EUR/t`
                        : <span className="text-amber-500">⚠ brak w cenniku dla {warehouse?.name}</span>}
                    </p>
                  </div>

                  {/* Cena sprzedaży */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cena sprzedaży [EUR/t]</label>
                    <input type="number" min={0} step={1} value={item.sellPriceEurT || ''}
                      placeholder="wpisz..."
                      onChange={e => updateItem(item.uid, { sellPriceEurT: parseFloat(e.target.value) || 0 })}
                      className="w-28 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 font-semibold" />
                  </div>

                  {/* Marża */}
                  {r.valid && item.sellPriceEurT > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Marża</label>
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${marginColor(r.marginPct)}`}>
                        <span>{r.marginPct.toFixed(1)}%</span>
                        <span className="text-xs font-normal">{marginLabel(r.marginPct)}</span>
                      </div>
                    </div>
                  )}

                  {/* Mini wyniki */}
                  {r.valid && (
                    <div className="ml-auto text-right text-xs text-gray-500 space-y-0.5">
                      <p>{r.isPaired && <span className="text-blue-600 font-medium">×2 parowane · </span>}
                        {formatNumber(r.totalLengthM, 1)} m · {formatNumber(r.massT, 3)} t</p>
                      {item.sellPriceEurT > 0 && (
                        <p className="font-semibold text-gray-800">
                          {currency === 'PLN'
                            ? <>{formatPLN(r.sellEUR * exchangeRate)} PLN <span className="font-normal text-gray-400">· {formatEUR(r.sellEUR)} EUR</span></>
                            : <>{formatEUR(r.sellEUR)} EUR</>
                          }
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── WYNIKI ŁĄCZNE ── */}
      {isValid && (
        <div className="space-y-4">

          {/* Dane fizyczne */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Dane łączne</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Masa łączna" value={formatNumber(totals.totalMassT, 3)} unit="t" />
              <StatCard label="Powierzchnia ścianki" value={formatNumber(totals.totalWallAreaM2, 2)} unit="m²" />
              <StatCard label="Cena sprzedaży / t" value={totals.sellPerTon > 0 ? formatEUR(totals.sellPerTon) : '—'} unit="EUR/t" />
              <StatCard label="Cena sprzedaży / m²" value={totals.sellPerM2 > 0 ? formatEUR(totals.sellPerM2) : '—'} unit="EUR/m²" />
            </div>
            {items.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Rozkład pozycji</p>
                {itemResults.map((r, idx) => r.valid && (
                  <div key={items[idx].uid} className="flex justify-between text-sm text-gray-600">
                    <span>
                      {items[idx].profileName}
                      {items[idx].isPaired && <span className="text-blue-600 text-xs ml-1">(×2)</span>}
                      {' '}– {items[idx].quantity} szt. × {items[idx].lengthM} m
                      <span className="text-gray-400 ml-1">({items[idx].steelGrade.toUpperCase()})</span>
                    </span>
                    <span className="font-medium">{formatNumber(r.massT, 3)} t</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Koszt vs Sprzedaż vs Marża */}
          {hasAllSellPrices && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Koszt własny vs Sprzedaż
                <span className="ml-2 text-xs text-gray-400 font-normal">(marża widoczna tylko wewnętrznie)</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Koszt */}
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Koszt własny</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {currency === 'PLN'
                      ? `${formatPLN(totals.totalCostPLN)} PLN`
                      : `${formatEUR(totals.totalCostEUR)} EUR`}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {currency === 'PLN'
                      ? `≈ ${formatEUR(totals.totalCostEUR)} EUR`
                      : `≈ ${formatPLN(totals.totalCostPLN)} PLN`}
                  </p>
                </div>

                {/* Sprzedaż */}
                <div className="rounded-xl border border-blue-200 p-4 bg-blue-900 text-white">
                  <p className="text-xs font-medium text-blue-300 uppercase tracking-wide mb-2">Cena sprzedaży</p>
                  <p className="text-2xl font-bold">
                    {currency === 'EUR'
                      ? `${formatEUR(totals.totalSellEUR)} EUR`
                      : `${formatPLN(totals.totalSellPLN)} PLN`}
                  </p>
                  {currency === 'EUR'
                    ? <p className="text-sm text-blue-300 mt-1">≈ {formatPLN(totals.totalSellPLN)} PLN</p>
                    : <p className="text-sm text-blue-300 mt-1">= {formatEUR(totals.totalSellEUR)} EUR</p>
                  }
                </div>

                {/* Marża */}
                <div className={`rounded-xl border p-4 ${marginColor(totals.overallMarginPct)}`}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-2 opacity-70">Marża łączna</p>
                  <p className="text-2xl font-bold">{totals.overallMarginPct.toFixed(1)}%</p>
                  <p className="text-sm mt-1 font-medium">{marginLabel(totals.overallMarginPct)}</p>
                  <p className="text-xs mt-1 opacity-70">
                    zysk: {currency === 'PLN'
                      ? `${formatPLN((totals.totalSellEUR - totals.totalCostEUR) * exchangeRate)} PLN`
                      : `${formatEUR(totals.totalSellEUR - totals.totalCostEUR)} EUR`}
                  </p>
                </div>
              </div>

              {/* Tabelka per pozycja jeśli wiele */}
              {items.length > 1 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
                        <th className="text-left px-4 py-2 font-semibold">Pozycja</th>
                        <th className="text-right px-4 py-2 font-semibold">Masa [t]</th>
                        <th className="text-right px-4 py-2 font-semibold">Koszt EUR/t</th>
                        <th className="text-right px-4 py-2 font-semibold">Sprzedaż EUR/t</th>
                        <th className="text-right px-4 py-2 font-semibold">Marża %</th>
                        <th className="text-right px-4 py-2 font-semibold">Wartość [{currency}]</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemResults.map((r, idx) => r.valid && (
                        <tr key={items[idx].uid} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium text-gray-800">
                            {items[idx].profileName}
                            {items[idx].isPaired && <span className="text-blue-600 text-xs ml-1">×2</span>}
                            <span className="text-gray-400 text-xs ml-1">{items[idx].steelGrade.toUpperCase()}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatNumber(r.massT, 3)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{items[idx].costPriceEurT}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-800">{items[idx].sellPriceEurT}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${r.marginPct < 0 ? 'text-red-600' : r.marginPct < 5 ? 'text-orange-600' : 'text-green-700'}`}>
                            {r.marginPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-gray-800">
                            {currency === 'PLN'
                              ? `${formatPLN(r.sellEUR * exchangeRate)} PLN`
                              : `${formatEUR(r.sellEUR)} EUR`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!hasAllSellPrices && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-700 text-sm text-center">
              Wpisz ceny sprzedaży dla wszystkich pozycji, aby zobaczyć podsumowanie marży.
            </div>
          )}

          {/* ── DOSTAWA ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Koszty dostawy</h2>
            <p className="text-xs text-gray-400 mb-4">
              Ładowność auta: 24,5 t · Szacowana liczba aut:{' '}
              <strong className="text-gray-700">{deliveryCalc?.autoTrucks ?? '—'}</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Koszt / auto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Koszt dostawy / auto [{currency}]
                </label>
                <input
                  type="number" min={0} step={currency === 'EUR' ? 10 : 100}
                  value={deliveryCostPerTruck}
                  placeholder={currency === 'EUR' ? 'np. 600' : 'np. 2500'}
                  onChange={e => setDeliveryCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Liczba aut */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Liczba aut{' '}
                  <span className="text-xs text-gray-400 font-normal">
                    (auto: {deliveryCalc?.autoTrucks ?? '—'})
                  </span>
                </label>
                <input
                  type="number" min={1} step={1}
                  value={customDeliveryTrucks}
                  placeholder={String(deliveryCalc?.autoTrucks ?? '—')}
                  onChange={e => setCustomDeliveryTrucks(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Skąd */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skąd</label>
                <input
                  type="text" value={deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dokąd */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dokąd</label>
                <input
                  type="text" value={deliveryTo}
                  placeholder="ul. Przykładowa 1, Warszawa"
                  onChange={e => setDeliveryTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Kto płaci + podsumowanie */}
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Koszt dostawy po stronie:</p>
                <div className="flex gap-4">
                  {(['intra', 'klient'] as const).map(val => (
                    <label key={val} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="deliveryPaidBy" value={val}
                        checked={deliveryPaidBy === val}
                        onChange={() => setDeliveryPaidBy(val)}
                        className="accent-blue-900" />
                      <span className="font-medium">{val === 'intra' ? 'Intra B.V.' : 'Klient'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {deliveryCalc && deliveryCalc.costPerTruck > 0 && (
                <div className={`ml-auto rounded-lg px-5 py-3 text-right ${
                  deliveryPaidBy === 'klient' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <p className="text-xs text-gray-500 mb-0.5">
                    {deliveryCalc.trucks} auto{deliveryCalc.trucks > 1 ? 'a' : ''} ×{' '}
                    {currency === 'EUR'
                      ? `${formatEUR(deliveryCalc.costPerTruck)} EUR`
                      : `${formatPLN(deliveryCalc.costPerTruck)} PLN`}
                  </p>
                  <p className="text-xl font-bold text-gray-800">
                    {currency === 'EUR'
                      ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR`
                      : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${deliveryPaidBy === 'klient' ? 'text-orange-600' : 'text-gray-500'}`}>
                    {deliveryPaidBy === 'klient' ? '⚠ Koszt po stronie klienta' : 'Koszt po stronie Intra B.V.'}
                  </p>
                </div>
              )}
            </div>

            {/* Łączna kwota dla klienta */}
            {deliveryCalc && deliveryCalc.costPerTruck > 0 && hasAllSellPrices && (
              <div className={`mt-4 rounded-xl p-4 ${
                deliveryPaidBy === 'intra'
                  ? 'bg-blue-900 text-white'
                  : 'bg-orange-50 border border-orange-200'
              }`}>
                {deliveryPaidBy === 'intra' ? (
                  <>
                    <p className="text-blue-200 text-xs mb-0.5">Łączna kwota dla klienta (towary + dostawa)</p>
                    <p className="text-2xl font-bold">
                      {currency === 'EUR'
                        ? `${formatEUR(totalForClientInCurrency)} EUR`
                        : `${formatPLN(totalForClientInCurrency)} PLN`}
                    </p>
                    <p className="text-sm text-blue-300 mt-0.5">
                      {currency === 'EUR' ? (
                        <>towary {formatEUR(totals.totalSellEUR)} EUR + dostawa {formatEUR(deliveryCalc.totalInCurrency)} EUR</>
                      ) : (
                        <>towary {formatPLN(totals.totalSellPLN)} PLN + dostawa {formatPLN(deliveryCalc.totalInCurrency)} PLN</>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-orange-700 text-sm font-medium">Klient sam organizuje dostawę</p>
                    <p className="text-orange-600 text-xs mt-0.5">
                      +{' '}
                      {currency === 'EUR'
                        ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR`
                        : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                      {' '}dostawa (po stronie klienta)
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Przycisk zapisu oferty */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!hasAllSellPrices}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-green-700 rounded-xl hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title={!hasAllSellPrices ? 'Wpisz ceny sprzedaży dla wszystkich pozycji' : ''}
            >
              💾 Zapisz jako ofertę SP
            </button>
          </div>
        </div>
      )}

      {/* Modal zapisu */}
      {showSaveModal && (() => {
        const snapshot: SaleItemSnapshot[] = items
          .map((item, idx) => {
            const r   = itemResults[idx];
            const wh  = warehouses.find(w => w.id === item.warehouseId);
            if (!r.valid) return null;
            return {
              warehouseId:   item.warehouseId,
              warehouseName: wh?.name ?? '',
              profileName:   item.profileName,
              steelGrade:    item.steelGrade,
              quantity:      item.quantity,
              lengthM:       item.lengthM,
              isPaired:      item.isPaired,
              totalLengthM:  r.totalLengthM,
              massT:         r.massT,
              wallAreaM2:    r.wallAreaM2,
              costEurT:      item.costPriceEurT,
              sellEurT:      item.sellPriceEurT,
              costEurTotal:  r.costEUR,
              sellEurTotal:  r.sellEUR,
              marginPct:     r.marginPct,
            } satisfies SaleItemSnapshot;
          })
          .filter((s): s is SaleItemSnapshot => s !== null);

        return (
          <SaveSaleOfferModal
            clients={clients}
            items={snapshot}
            totals={totals}
            currency={currency}
            exchangeRate={exchangeRate}
            nbpDate={nbpRate.date}
            delivery={deliveryCalc && deliveryCalc.costPerTruck > 0 ? {
              trucks:       deliveryCalc.trucks,
              costPerTruck: deliveryCalc.costPerTruck,
              totalCostPLN: deliveryCalc.totalCostPLN,
              paidBy:       deliveryPaidBy,
              from:         deliveryFrom,
              to:           deliveryTo,
            } : null}
            onSaved={offer => { onOfferSaved(offer); setShowSaveModal(false); }}
            onClose={() => setShowSaveModal(false)}
            onClientAdded={onClientAdded}
          />
        );
      })()}
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{unit}</p>
    </div>
  );
}
