import { useState, useEffect, useMemo } from 'react';
import { formatEUR, formatPLN, formatNumber, formatRound } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import { fetchNBPRate, formatNBPDate } from '../../../lib/nbp';
import type { NBPRate } from '../../../lib/nbp';
import type { Client, BeamProfile, BeamSalePrices, BeamSaleOffer } from '../../../types';
import { BEAM_STEEL_GRADES } from '../../../types';
import BeamSaveSaleOfferModal from './BeamSaveSaleOfferModal';
import type { BeamSaleItemSnapshot } from './BeamSaveSaleOfferModal';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface BeamSaleCalcItem {
  uid: string;
  profileId: string;
  steelGrade: string;
  quantityPcs: number | '';
  lengthM: number | '';
  costPerTon: number;   // w walucie widoku
  sellPerTon: number;   // w walucie widoku
}

interface ItemResult {
  valid: boolean;
  totalLengthM: number;
  massT: number;
  costEUR: number;
  sellEUR: number;
  marginPct: number;
  profile: BeamProfile | null;
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
  profiles: BeamProfile[];   // wspólny katalog beam_profiles (tylko odczyt)
  prices: BeamSalePrices;    // cennik 1-wierszowy (domyślna sprzedaż/koszt)
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onOfferSaved: (offer: BeamSaleOffer) => void;
}

export default function BeamSaleCalculator({ profiles, prices, clients, onClientAdded, onOfferSaved }: Props) {
  // --- Waluta i kurs (start PLN — domyślna cena 3800 PLN/t bez przeliczania) ---
  const [nbpRate, setNbpRate]       = useState<NBPRate>({ rate: 4.25, date: '', source: 'ręczny' });
  const [nbpLoading, setNbpLoading] = useState(false);
  const [nbpError, setNbpError]     = useState('');
  const [manualRate, setManualRate] = useState(false);
  const [currency, setCurrency]     = useState<'EUR' | 'PLN'>('PLN');
  const exchangeRate = nbpRate.rate;

  // Domyślne ceny z cennika przeliczone do podanej waluty widoku.
  // PLN kanoniczne; EUR = /kurs zaokrąglone do 2dp (pre-fill, nie toggle — toggle robi convertCurrencyValue).
  function defaultPricesInCurrency(cur: 'EUR' | 'PLN', rate: number) {
    const conv = (pln: number) => pln <= 0 ? 0 : (cur === 'PLN' ? pln : Math.round((pln / rate) * 100) / 100);
    return {
      sell: conv(prices.default_sell_price_per_ton_pln),
      cost: conv(prices.default_cost_price_per_ton_pln),
    };
  }

  // --- Pozycje (start: 1 pusta pozycja z pre-fill cen; waluta startowa = PLN) ---
  const [items, setItems] = useState<BeamSaleCalcItem[]>(() => [{
    uid: crypto.randomUUID(),
    profileId: profiles[0]?.id ?? '',
    steelGrade: BEAM_STEEL_GRADES[0],
    quantityPcs: '',
    lengthM: '',
    costPerTon: prices.default_cost_price_per_ton_pln > 0 ? prices.default_cost_price_per_ton_pln : 0,
    sellPerTon: prices.default_sell_price_per_ton_pln > 0 ? prices.default_sell_price_per_ton_pln : 0,
  }]);

  const [applyAllSellPrice, setApplyAllSellPrice] = useState<number>(0);
  const [showSaveModal, setShowSaveModal]         = useState(false);
  const [showItemError, setShowItemError]         = useState(false);

  // --- Dostawa ---
  const TRUCK_CAPACITY_T = 24.5;
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>('');
  const [customDeliveryTrucks, setCustomDeliveryTrucks] = useState<number | ''>('');
  const [deliveryPaidBy, setDeliveryPaidBy]             = useState<'dap_included' | 'dap_extra' | 'fca' | 'cif'>('dap_included');
  const [deliveryFrom, setDeliveryFrom]                 = useState('Magazyn Intra B.V.');
  const [deliveryTo, setDeliveryTo]                     = useState('');
  const [taskName, setTaskName]                         = useState('');
  const [isUsed, setIsUsed]                             = useState(false);

  useEffect(() => { loadNBP(); }, []);

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

  // --- Zarządzanie pozycjami ---
  function addItem() {
    const defaults = defaultPricesInCurrency(currency, exchangeRate);
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      profileId: profiles[0]?.id ?? '',
      steelGrade: BEAM_STEEL_GRADES[0],
      quantityPcs: '',
      lengthM: '',
      costPerTon: defaults.cost,
      sellPerTon: defaults.sell,
    }]);
  }

  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<BeamSaleCalcItem>) {
    setItems(prev => prev.map(i => i.uid === uid ? { ...i, ...patch } : i));
  }

  function applyPriceToAll() {
    if (applyAllSellPrice <= 0) return;
    setItems(prev => prev.map(i => ({ ...i, sellPerTon: applyAllSellPrice })));
  }

  // Handler zmiany waluty — konwertuje ceny pozycji przez wspólny helper
  // convertCurrencyValue (precision 'whole' — konwencja sprzedaży).
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');
    setItems(prev => prev.map(item => ({
      ...item,
      costPerTon: conv(item.costPerTon),
      sellPerTon: conv(item.sellPerTon),
    })));
    setApplyAllSellPrice(prev => prev > 0 ? conv(prev) : prev);
    setDeliveryCostPerTruck(prev =>
      typeof prev !== 'number' ? prev : conv(prev),
    );
    setCurrency(newCurrency);
  }

  // --- Obliczenia per pozycja (masa = szt × L × kg/m / 1000, zaokrąglona do 3dp) ---
  const itemResults = useMemo((): ItemResult[] =>
    items.map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? null;
      const qty = Number(item.quantityPcs) || 0;
      const lengthM = Number(item.lengthM) || 0;
      if (!profile || qty <= 0 || lengthM <= 0) {
        return { valid: false, totalLengthM: 0, massT: 0, costEUR: 0, sellEUR: 0, marginPct: 0, profile: null };
      }
      const totalLengthM = qty * lengthM;
      const massT = Math.round((totalLengthM * profile.weight_kg_per_m) / 1000 * 1000) / 1000;
      // Ceny w stanie są w bieżącej walucie — przeliczamy do EUR do obliczeń
      const priceScale = currency === 'EUR' ? 1 : 1 / exchangeRate;
      const costEUR    = massT * (item.costPerTon || 0) * priceScale;
      const sellEUR    = massT * (item.sellPerTon || 0) * priceScale;
      const marginPct  = sellEUR > 0 ? ((sellEUR - costEUR) / sellEUR) * 100 : 0;
      return { valid: true, totalLengthM, massT, costEUR, sellEUR, marginPct, profile };
    }),
    [items, profiles, currency, exchangeRate]
  );

  // --- Sumy łączne ---
  const totals = useMemo(() => {
    let totalMassT = 0, totalLengthM = 0, totalCostEUR = 0, totalSellEUR = 0;
    for (const r of itemResults) {
      if (!r.valid) continue;
      totalMassT   += r.massT;
      totalLengthM += r.totalLengthM;
      totalCostEUR += r.costEUR;
      totalSellEUR += r.sellEUR;
    }
    const overallMarginPct = totalSellEUR > 0 ? ((totalSellEUR - totalCostEUR) / totalSellEUR) * 100 : 0;
    const totalSellPLN     = totalSellEUR * exchangeRate;
    const totalCostPLN     = totalCostEUR * exchangeRate;
    return { totalMassT, totalLengthM, totalCostEUR, totalSellEUR, overallMarginPct, totalSellPLN, totalCostPLN };
  }, [itemResults, exchangeRate]);

  const isValid          = totals.totalMassT > 0;
  const hasAllSellPrices = items.every(i => i.sellPerTon > 0);
  const allItemsValid    = items.length > 0 && itemResults.every(r => r.valid);
  const canSave          = isValid && hasAllSellPrices && allItemsValid;

  // --- Dostawa ---
  const deliveryCalc = useMemo(() => {
    if (totals.totalMassT <= 0) return null;
    const autoTrucks      = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const trucks          = typeof customDeliveryTrucks === 'number' && customDeliveryTrucks > 0
      ? customDeliveryTrucks : autoTrucks;
    const costPerTruck    = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    const totalCostPLN    = currency === 'EUR'
      ? totalInCurrency * exchangeRate
      : totalInCurrency;
    return { trucks, autoTrucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [totals.totalMassT, deliveryCostPerTruck, customDeliveryTrucks, currency, exchangeRate]);

  const deliveryCostCurrency = (deliveryPaidBy === 'dap_included' && deliveryCalc) ? deliveryCalc.totalInCurrency : 0;
  const sellCurrency         = currency === 'EUR' ? totals.totalSellEUR : totals.totalSellPLN;
  const totalForClientInCurrency = sellCurrency + deliveryCostCurrency;
  // Efektywna cena/t — transport w liczniku gdy DAP w cenie
  const effectivePerTon = totals.totalMassT > 0 ? (sellCurrency + deliveryCostCurrency) / totals.totalMassT : 0;

  function handleSaveClick() {
    if (!canSave) { setShowItemError(true); return; }
    setShowItemError(false);
    setShowSaveModal(true);
  }

  const defaultsInView = defaultPricesInCurrency(currency, exchangeRate);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── KURS I WALUTA ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-6">
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Waluta oferty</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
              {(['PLN', 'EUR'] as const).map(cur => (
                <button key={cur} onClick={() => handleCurrencyChange(cur)}
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
                placeholder={`${currency}/t`}
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
          <h2 className="text-lg font-semibold text-gray-800">Dwuteowniki wyceny</h2>
          <button onClick={addItem}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
            + Dodaj pozycję
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, idx) => {
            const r = itemResults[idx];
            const qtyInvalid = !(Number(item.quantityPcs) > 0);
            const lenInvalid = !(Number(item.lengthM) > 0);
            const sellChanged = defaultsInView.sell > 0 && item.sellPerTon !== defaultsInView.sell;
            const costChanged = defaultsInView.cost > 0 && item.costPerTon !== defaultsInView.cost;

            return (
              <div key={item.uid} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">

                {/* Wiersz 1: Profil | Gatunek | Ilość | Długość | Masa | Usuń */}
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">

                  {/* Profil */}
                  <div className="sm:col-span-4">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Profil dwuteownika</label>}
                    <select value={item.profileId} onChange={e => updateItem(item.uid, { profileId: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.series}) – {p.weight_kg_per_m} kg/m</option>)}
                    </select>
                  </div>

                  {/* Gatunek */}
                  <div className="sm:col-span-3">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek stali</label>}
                    <select value={item.steelGrade} onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {BEAM_STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {/* Ilość */}
                  <div className="sm:col-span-1">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość</label>}
                    <input type="number" min={1} step={1} placeholder="np. 10" value={item.quantityPcs}
                      onChange={e => updateItem(item.uid, { quantityPcs: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                      className={`w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 ${qtyInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                  </div>

                  {/* Długość */}
                  <div className="sm:col-span-2">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Dług. [m]</label>}
                    <input type="number" min={0.5} step={0.5} placeholder="np. 12" value={item.lengthM}
                      onChange={e => updateItem(item.uid, { lengthM: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0) })}
                      className={`w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 ${lenInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
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
                    <button onClick={() => removeItem(item.uid)}
                      className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
                      title="Usuń pozycję">✕</button>
                  </div>
                </div>

                {/* Wiersz 2: Ceny i marża */}
                <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-gray-200">

                  {/* Cena kosztu */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Cena kosztu [{currency}/t]
                      {costChanged && (
                        <button onClick={() => updateItem(item.uid, { costPerTon: defaultsInView.cost })}
                          className="ml-1 text-blue-600 underline font-normal">
                          (przywróć {defaultsInView.cost})
                        </button>
                      )}
                    </label>
                    <input type="number" min={0} step={1} value={item.costPerTon || ''}
                      placeholder="wpisz..."
                      onChange={e => updateItem(item.uid, { costPerTon: parseFloat(e.target.value) || 0 })}
                      className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    <p className="text-xs text-gray-400 mt-0.5">
                      {defaultsInView.cost > 0
                        ? `z cennika: ${defaultsInView.cost} ${currency}/t`
                        : 'brak domyślnej — wpisz ręcznie'}
                    </p>
                  </div>

                  {/* Cena sprzedaży */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Cena sprzedaży [{currency}/t]
                      {sellChanged && (
                        <button onClick={() => updateItem(item.uid, { sellPerTon: defaultsInView.sell })}
                          className="ml-1 text-blue-600 underline font-normal">
                          (przywróć {defaultsInView.sell})
                        </button>
                      )}
                    </label>
                    <input type="number" min={0} step={1} value={item.sellPerTon || ''}
                      placeholder="wpisz..."
                      onChange={e => updateItem(item.uid, { sellPerTon: parseFloat(e.target.value) || 0 })}
                      className="w-28 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 font-semibold" />
                    {defaultsInView.sell > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">z cennika: {defaultsInView.sell} {currency}/t</p>
                    )}
                  </div>

                  {/* Marża */}
                  {r.valid && item.sellPerTon > 0 && item.costPerTon > 0 && (
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
                      <p>{formatNumber(r.totalLengthM, 1)} m · {formatNumber(r.massT, 3)} t</p>
                      {item.sellPerTon > 0 && (() => {
                        const sellInCurrency = currency === 'PLN' ? r.sellEUR * exchangeRate : r.sellEUR;
                        return (
                          <p className="font-semibold text-gray-800">
                            {currency === 'PLN'
                              ? <>{formatPLN(sellInCurrency)} PLN <span className="font-normal text-gray-400">· {formatEUR(r.sellEUR)} EUR</span></>
                              : <>{formatEUR(r.sellEUR)} EUR</>
                            }
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Podsumowanie pozycji */}
          {isValid && totals.totalSellEUR > 0 && (
            <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Podsumowanie dwuteowników</p>
              <div className="flex flex-wrap gap-8">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Wartość sprzedaży</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {currency === 'EUR'
                      ? `${formatEUR(totals.totalSellEUR)} EUR`
                      : `${formatPLN(totals.totalSellPLN)} PLN`}
                  </p>
                  <p className="text-sm text-blue-700 mt-0.5">
                    {currency === 'EUR'
                      ? `≈ ${formatPLN(totals.totalSellPLN)} PLN`
                      : `≈ ${formatEUR(totals.totalSellEUR)} EUR`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    koszt: {currency === 'EUR'
                      ? `${formatEUR(totals.totalCostEUR)} EUR`
                      : `${formatPLN(totals.totalCostPLN)} PLN`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Masa dwuteowników</p>
                  <p className="text-2xl font-bold text-gray-800">{formatNumber(totals.totalMassT, 3)} t</p>
                  <p className="text-xs text-gray-400 mt-0.5">łącznie dla {itemResults.filter(r => r.valid).length} poz.</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Cena sprzedaży / t</p>
                  <p className="text-2xl font-bold text-gray-800">{effectivePerTon > 0 ? formatRound(effectivePerTon) : '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{currency}/t{deliveryCostCurrency > 0 ? ' (z transportem)' : ''}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── WYNIKI ŁĄCZNE ── */}
      {isValid && (
        <div className="space-y-4">

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
                        <th className="text-right px-4 py-2 font-semibold">Koszt {currency}/t</th>
                        <th className="text-right px-4 py-2 font-semibold">Sprzedaż {currency}/t</th>
                        <th className="text-right px-4 py-2 font-semibold">Marża %</th>
                        <th className="text-right px-4 py-2 font-semibold">Wartość [{currency}]</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemResults.map((r, idx) => r.valid && (
                        <tr key={items[idx].uid} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium text-gray-800">
                            {r.profile!.name}
                            <span className="text-gray-400 text-xs ml-1">{items[idx].steelGrade}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatNumber(r.massT, 3)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{items[idx].costPerTon}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-800">{items[idx].sellPerTon}</td>
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
              Ładowność auta: <strong className="text-gray-600">24,5 t</strong>
              {deliveryCalc ? (
                <>
                  {' · '}Masa łączna:{' '}
                  <strong className="text-gray-700">{formatNumber(totals.totalMassT, 3)} t</strong>
                  {' · '}Szacowane auta:{' '}
                  <strong className="text-gray-700">{deliveryCalc.autoTrucks}</strong>
                </>
              ) : (
                <span> · Masa łączna: <strong className="text-gray-500">—</strong> (brak pozycji)</span>
              )}
            </p>

            {/* Opcja dostawy – 4 kafelki */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Opcja dostawy:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { val: 'dap_included', label: 'DAP – dostawa w cenie',      desc: 'Intra organizuje i pokrywa koszt' },
                  { val: 'dap_extra',    label: 'DAP – refaktura na klienta',  desc: 'Intra organizuje, klient płaci osobno' },
                  { val: 'fca',          label: 'FCA – odbiór własny',         desc: 'Klient podstawia własne auto' },
                  { val: 'cif',          label: 'CIF – odbiór z portu',        desc: 'Klient odbiera z portu docelowego' },
                ] as const).map(({ val, label, desc }) => (
                  <label key={val} className={`flex-1 flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    deliveryPaidBy === val ? 'border-blue-700 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="beamSaleDeliveryPaidBy" value={val}
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

            {/* Pola kosztów – ukryte dla FCA/CIF */}
            {deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Liczba aut</label>
                  <input
                    type="number" min={1} step={1}
                    value={customDeliveryTrucks === '' ? 1 : customDeliveryTrucks}
                    onChange={e => setCustomDeliveryTrucks(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Auto-szacunek z masy: {deliveryCalc?.autoTrucks ?? '—'} aut
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
                placeholder="np. Budowa hali – Wrocław"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Trasa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {deliveryPaidBy === 'fca' ? 'Odbiór z (magazyn)' : deliveryPaidBy === 'cif' ? 'Odbiór z (port)' : 'Skąd'}
                </label>
                <input
                  type="text" value={deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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

            {/* Podsumowanie kosztów – dla DAP gdy wpisano koszt */}
            {deliveryCalc && deliveryCalc.costPerTruck > 0 && deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
              <div className="mt-2 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                <div className={`rounded-lg px-5 py-3 text-right ${deliveryPaidBy === 'dap_extra' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">
                    {deliveryCalc.trucks} auto{deliveryCalc.trucks > 1 ? 'a' : ''} ×{' '}
                    {currency === 'EUR' ? `${formatEUR(deliveryCalc.costPerTruck)} EUR` : `${formatPLN(deliveryCalc.costPerTruck)} PLN`}
                  </p>
                  <p className="text-xl font-bold text-gray-800">
                    {currency === 'EUR' ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR` : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${deliveryPaidBy === 'dap_extra' ? 'text-orange-600' : 'text-gray-500'}`}>
                    {deliveryPaidBy === 'dap_extra' ? '⚠ Refaktura na klienta' : 'Koszt po stronie Intra B.V.'}
                  </p>
                </div>
                {deliveryPaidBy === 'dap_included' && hasAllSellPrices && (
                  <div className="bg-blue-900 rounded-lg px-5 py-3 text-white">
                    <p className="text-blue-200 text-xs mb-0.5">Łączna kwota dla klienta (dwuteowniki + dostawa)</p>
                    <p className="text-2xl font-bold">
                      {currency === 'EUR' ? `${formatEUR(totalForClientInCurrency)} EUR` : `${formatPLN(totalForClientInCurrency)} PLN`}
                    </p>
                    <p className="text-blue-300 text-xs mt-0.5">
                      {currency === 'EUR'
                        ? `dwuteowniki ${formatEUR(totals.totalSellEUR)} + dostawa ${formatEUR(deliveryCalc.totalInCurrency)} EUR`
                        : `dwuteowniki ${formatPLN(totals.totalSellPLN)} + dostawa ${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                    </p>
                  </div>
                )}
                {deliveryPaidBy === 'dap_extra' && hasAllSellPrices && (
                  <div className="bg-blue-900 rounded-lg px-5 py-3 text-white">
                    <p className="text-blue-200 text-xs mb-0.5">Kwota sprzedaży (na ofercie)</p>
                    <p className="text-2xl font-bold">
                      {currency === 'EUR'
                        ? `${formatEUR(totals.totalSellEUR)} EUR`
                        : `${formatPLN(totals.totalSellPLN)} PLN`}
                    </p>
                    <p className="text-orange-300 text-xs mt-0.5">
                      + {currency === 'EUR' ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR` : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`} dostawa (refaktura)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dwuteowniki używane – atrybut produktu/oferty, poza sekcją transportu */}
          <div className="mb-3">
            <label className={`flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
              isUsed ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}>
              <input type="checkbox" checked={isUsed} onChange={e => setIsUsed(e.target.checked)}
                className="accent-amber-600 mt-0.5 w-4 h-4" />
              <span>
                <span className={`block text-sm font-semibold ${isUsed ? 'text-amber-800' : 'text-gray-800'}`}>
                  {isUsed ? '⚠️ ' : ''}Dwuteowniki używane
                </span>
                <span className={`block text-xs mt-0.5 ${isUsed ? 'text-amber-700' : 'text-gray-400'}`}>
                  {isUsed
                    ? 'W PDF: bez normy, bez certyfikatu + dopisek o śladach użytkowania (zamiast standardowych warunków technicznych).'
                    : 'Zaznacz dla oferty na dwuteowniki używane.'}
                </span>
              </span>
            </label>
          </div>

          {/* Przycisk zapisu oferty */}
          {showItemError && !canSave && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-3 text-red-700 text-sm text-center font-medium">
              Uzupełnij ilość, długość i ceny sprzedaży we wszystkich pozycjach — pozycje bez wartości nie mogą zostać zapisane.
            </div>
          )}
          <button
            onClick={handleSaveClick}
            disabled={!canSave}
            className="w-full py-3 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
            title={!canSave ? 'Uzupełnij ilość/długość i ceny sprzedaży we wszystkich pozycjach' : ''}
          >
            💾 Zapisz jako ofertę SH
          </button>
        </div>
      )}

      {!isValid && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-yellow-700 text-sm text-center">
          Dodaj przynajmniej jedną pozycję z poprawnymi danymi, aby zobaczyć wyniki kalkulacji.
        </div>
      )}

      {/* Modal zapisu */}
      {showSaveModal && canSave && (() => {
        const snapshot: BeamSaleItemSnapshot[] = items
          .map((item, idx): BeamSaleItemSnapshot | null => {
            const r = itemResults[idx];
            if (!r.valid || !r.profile) return null;
            return {
              profileId:    item.profileId,
              profileName:  r.profile.name,
              series:       r.profile.series,
              weightKgPerM: r.profile.weight_kg_per_m,
              steelGrade:   item.steelGrade,
              quantityPcs:  Number(item.quantityPcs) || 0,
              lengthM:      Number(item.lengthM) || 0,
              totalLengthM: r.totalLengthM,
              massT:        r.massT,
              costPerTon:   item.costPerTon,
              sellPerTon:   item.sellPerTon,
              costTotal:    r.massT * (item.costPerTon || 0),
              sellTotal:    r.massT * (item.sellPerTon || 0),
              sellValueEUR: r.sellEUR,
              sellValuePLN: r.sellEUR * exchangeRate,
              marginPct:    r.marginPct,
            };
          })
          .filter((s): s is BeamSaleItemSnapshot => s !== null);

        return (
          <BeamSaveSaleOfferModal
            clients={clients}
            items={snapshot}
            totals={{
              totalMassT:       totals.totalMassT,
              totalCostEUR:     totals.totalCostEUR,
              totalSellEUR:     totals.totalSellEUR,
              totalSellPLN:     totals.totalSellPLN,
              overallMarginPct: totals.overallMarginPct,
            }}
            currency={currency}
            exchangeRate={exchangeRate}
            nbpDate={nbpRate.date}
            taskName={taskName}
            isUsed={isUsed}
            delivery={deliveryCalc ? {
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
