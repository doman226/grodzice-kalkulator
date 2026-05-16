import { useState, useEffect, useMemo } from 'react';
import { formatNumber, formatEUR, formatPLN, formatRound } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import { fetchNBPRate, formatNBPDate } from '../../../lib/nbp';
import type { NBPRate } from '../../../lib/nbp';
import type {
  Client,
  RoadPlateProfile,
  RoadPlateSalePrice,
  RoadPlateSaleOffer,
  RoadPlateSaleSteelGrade,
} from '../../../types';
import { ROAD_PLATE_SALE_STEEL_GRADES } from '../../../types';
import RoadPlateSaveOfferModal from './RoadPlateSaveOfferModal';
import type { RoadPlateSaleItemSnapshot } from './RoadPlateSaveOfferModal';

// ─── Typy lokalne ────────────────────────────────────────────────────────────

interface CalcItem {
  uid: string;
  profileId: string;
  steelGrade: RoadPlateSaleSteelGrade;
  quantity: number;
  costPriceEurT: number;   // cena w bieżącej walucie (mimo nazwy "EurT" — konwencja z SaleCalculator)
  sellPriceEurT: number;   // cena w bieżącej walucie
}

interface ItemResult {
  valid: boolean;
  profile: RoadPlateProfile | null;
  areaPerPlateM2: number;
  totalAreaM2: number;
  massT: number;
  costInCurrency: number;
  sellInCurrency: number;
  costEUR: number;
  sellEUR: number;
  marginPct: number | null;
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
  profiles: RoadPlateProfile[];
  prices: RoadPlateSalePrice[];
  onClientAdded: (c: Client) => void;
  onOfferSaved: (offer: RoadPlateSaleOffer) => void;
}

// Presety lokalizacji (same jak w pozostałych kalkulatorach — patrz CLAUDE.md)
const WAREHOUSE_PRESET    = 'Cieśle 42, 56400, PL';
const WAREHOUSE_PRESET_CZ = 'Pohraniční 3272/130, 703 00 Ostrava, CZ';

export default function RoadPlateSaleCalculator({
  clients, profiles, prices, onClientAdded, onOfferSaved,
}: Props) {
  // --- NBP ---
  const [nbpRate, setNbpRate]       = useState<NBPRate>({ rate: 4.25, date: '', source: 'ręczny' });
  const [nbpLoading, setNbpLoading] = useState(false);
  const [nbpError, setNbpError]     = useState('');
  const [manualRate, setManualRate] = useState(false);
  const exchangeRate = nbpRate.rate;

  // --- Waluta i stan pozycji ---
  const [currency, setCurrency] = useState<'EUR' | 'PLN'>('EUR');
  const [items, setItems]       = useState<CalcItem[]>([]);

  // --- Bulk apply ---
  const [applyAllSellPrice, setApplyAllSellPrice] = useState<number>(0);

  // --- Transport ---
  const TRUCK_CAPACITY_T = 24.5;
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>('');
  const [customDeliveryTrucks, setCustomDeliveryTrucks] = useState<number | ''>('');
  const [deliveryPaidBy, setDeliveryPaidBy]             = useState<'dap_included' | 'dap_extra' | 'fca'>('dap_included');
  const [deliveryFrom, setDeliveryFrom]                 = useState(WAREHOUSE_PRESET);
  const [deliveryTo, setDeliveryTo]                     = useState('');

  // --- Modal zapisu ---
  const [showSaveModal, setShowSaveModal] = useState(false);

  // ─── Mapa cennikowa: profile_id → steel_grade → cena EUR/t ────────────────
  const priceMapEUR = useMemo(() => {
    const map: Record<string, Partial<Record<RoadPlateSaleSteelGrade, number | null>>> = {};
    for (const p of prices) {
      if (!map[p.profile_id]) map[p.profile_id] = {};
      map[p.profile_id][p.steel_grade] = p.price_eur_t;
    }
    return map;
  }, [prices]);

  // Zwraca cenę z cennika już w bieżącej walucie (EUR lub PLN).
  // 0 — gdy ceny brak (NULL/missing) → user wpisze ręcznie.
  function lookupCostInCurrency(profileId: string, steelGrade: RoadPlateSaleSteelGrade): number {
    const eurPrice = priceMapEUR[profileId]?.[steelGrade] ?? null;
    if (eurPrice == null || eurPrice <= 0) return 0;
    return convertCurrencyValue(eurPrice, 'EUR', currency, exchangeRate, 'whole');
  }

  // ─── Inicjalizacja: pierwsza pozycja po załadowaniu profili ────────────────
  useEffect(() => { loadNBP(); }, []);

  useEffect(() => {
    // Dodaj domyślną pozycję, gdy profile załadowane i jeszcze nic nie ma w state
    if (profiles.length > 0 && items.length === 0) {
      const prof = profiles[0];
      const grade: RoadPlateSaleSteelGrade = ROAD_PLATE_SALE_STEEL_GRADES[1]; // 'S270GP' — najpopularniejszy
      setItems([{
        uid: crypto.randomUUID(),
        profileId: prof.id,
        steelGrade: grade,
        quantity: 10,
        costPriceEurT: lookupCostInCurrency(prof.id, grade),
        sellPriceEurT: 0,
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

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

  // ─── Toggle waluty: konwertuj wszystkie ceny stanu jednolicie ──────────────
  // Wzorzec ze CLAUDE.md (CURRENCY-CONVERSION-PATTERN): pojedynczy helper
  // `convertCurrencyValue`, precision='whole' (sprzedaż — PLN do całych).
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');

    setItems(prev => prev.map(item => ({
      ...item,
      costPriceEurT: conv(item.costPriceEurT),
      sellPriceEurT: conv(item.sellPriceEurT),
    })));
    setApplyAllSellPrice(prev => conv(prev));
    setDeliveryCostPerTruck(prev => typeof prev !== 'number' ? prev : conv(prev));
    setCurrency(newCurrency);
  }

  function applyPriceToAll() {
    if (applyAllSellPrice <= 0) return;
    setItems(prev => prev.map(i => ({ ...i, sellPriceEurT: applyAllSellPrice })));
  }

  // ─── Zarządzanie pozycjami ─────────────────────────────────────────────────
  function addItem() {
    if (profiles.length === 0) return;
    const prof = profiles[0];
    const grade: RoadPlateSaleSteelGrade = ROAD_PLATE_SALE_STEEL_GRADES[1];
    setItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      profileId: prof.id,
      steelGrade: grade,
      quantity: 10,
      costPriceEurT: lookupCostInCurrency(prof.id, grade),
      sellPriceEurT: 0,
    }]);
  }

  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<CalcItem>) {
    setItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Auto-aktualizuj cenę kosztu po zmianie profilu lub gatunku
      if ('profileId' in patch || 'steelGrade' in patch) {
        const looked = lookupCostInCurrency(updated.profileId, updated.steelGrade);
        // Jeśli cennik daje > 0 — nadpisz. Jeśli 0 (brak ceny) — zachowaj ręcznie wpisaną wartość.
        if (looked > 0) updated.costPriceEurT = looked;
      }
      return updated;
    }));
  }

  // ─── Obliczenia per pozycja ────────────────────────────────────────────────
  const results: ItemResult[] = useMemo(() =>
    items.map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? null;
      if (!profile || item.quantity <= 0) {
        return { valid: false, profile: null, areaPerPlateM2: 0, totalAreaM2: 0, massT: 0,
          costInCurrency: 0, sellInCurrency: 0, costEUR: 0, sellEUR: 0, marginPct: null };
      }
      const areaPerPlateM2 = profile.sheet_length_m * profile.sheet_width_m;
      const totalAreaM2    = item.quantity * areaPerPlateM2;
      // Zaokrąglenie 3dp zgodnie z CLAUDE.md (wyświetlana masa × cena = wyświetlana wartość)
      const massT          = Math.round(totalAreaM2 * profile.weight_kg_per_m2 / 1000 * 1000) / 1000;
      // Ceny stanu są w bieżącej walucie — totale w tej samej walucie:
      const costInCurrency = massT * (item.costPriceEurT || 0);
      const sellInCurrency = massT * (item.sellPriceEurT || 0);
      // Konwersja do EUR (kanoniczna waluta do agregatów oferty)
      const priceScale     = currency === 'EUR' ? 1 : 1 / exchangeRate;
      const costEUR        = costInCurrency * priceScale;
      const sellEUR        = sellInCurrency * priceScale;
      const marginPct      = sellInCurrency > 0
        ? ((sellInCurrency - costInCurrency) / sellInCurrency) * 100
        : null;
      return { valid: true, profile, areaPerPlateM2, totalAreaM2, massT,
        costInCurrency, sellInCurrency, costEUR, sellEUR, marginPct };
    }),
    [items, profiles, currency, exchangeRate],
  );

  // ─── Sumy ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let totalAreaM2 = 0, totalMassT = 0, totalCostCurrency = 0, totalSellCurrency = 0;
    let totalCostEUR = 0, totalSellEUR = 0;
    for (const r of results) {
      if (!r.valid) continue;
      totalAreaM2       += r.totalAreaM2;
      totalMassT        += r.massT;
      totalCostCurrency += r.costInCurrency;
      totalSellCurrency += r.sellInCurrency;
      totalCostEUR      += r.costEUR;
      totalSellEUR      += r.sellEUR;
    }
    const totalSellPLN  = totalSellEUR * exchangeRate;
    const totalMarginPct = totalSellCurrency > 0
      ? ((totalSellCurrency - totalCostCurrency) / totalSellCurrency) * 100
      : null;
    return { totalAreaM2, totalMassT, totalCostCurrency, totalSellCurrency,
      totalCostEUR, totalSellEUR, totalSellPLN, totalMarginPct };
  }, [results, exchangeRate]);

  const isValid = totals.totalMassT > 0;

  // ─── Transport (analogicznie do innych kalkulatorów) ───────────────────────
  const transportCalc = useMemo(() => {
    if (!isValid) return null;
    const autoTrucks   = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const trucks       = typeof customDeliveryTrucks === 'number' && customDeliveryTrucks > 0 ? customDeliveryTrucks : autoTrucks;
    const costPerTruck = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    return { trucks, autoTrucks, costPerTruck, totalCostCurrency: trucks * costPerTruck };
  }, [isValid, totals.totalMassT, customDeliveryTrucks, deliveryCostPerTruck]);

  // Transport w EUR (do total_sell_eur w ofercie)
  const transportEUR = useMemo(() => {
    if (!transportCalc) return 0;
    return currency === 'EUR' ? transportCalc.totalCostCurrency : transportCalc.totalCostCurrency / exchangeRate;
  }, [transportCalc, currency, exchangeRate]);

  // ─── Snapshoty do zapisu ───────────────────────────────────────────────────
  const snapshots: RoadPlateSaleItemSnapshot[] = useMemo(() =>
    items.flatMap((item, idx): RoadPlateSaleItemSnapshot[] => {
      const r = results[idx];
      if (!r.valid || !r.profile) return [];
      return [{
        profileId:         item.profileId,
        profileName:       r.profile.name,
        steelGrade:        item.steelGrade,
        thicknessMm:       r.profile.thickness_mm,
        sheetLengthM:      r.profile.sheet_length_m,
        sheetWidthM:       r.profile.sheet_width_m,
        weightKgPerM2:     r.profile.weight_kg_per_m2,
        quantitySzt:       item.quantity,
        totalAreaM2:       r.totalAreaM2,
        massT:             r.massT,
        costPricePerTon:   item.costPriceEurT,    // w walucie oferty
        sellPricePerTon:   item.sellPriceEurT,    // w walucie oferty
        costTotal:         r.costInCurrency,
        sellTotal:         r.sellInCurrency,
        sellEurTotal:      r.sellEUR,
        sellPlnTotal:      r.sellEUR * exchangeRate,
        marginPct:         r.marginPct,
      }];
    }),
    [items, results, exchangeRate],
  );

  const canSave = isValid && snapshots.length === items.length && items.every(i => i.sellPriceEurT > 0);

  function moneyLabel(v: number): string {
    return currency === 'EUR' ? `${formatEUR(v)} EUR` : `${formatPLN(v)} PLN`;
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Modal zapisu ── */}
      {showSaveModal && (
        <RoadPlateSaveOfferModal
          clients={clients}
          items={snapshots}
          totals={{
            totalMassT:       totals.totalMassT,
            totalAreaM2:      totals.totalAreaM2,
            totalCostEUR:     totals.totalCostEUR,
            totalSellEUR:     totals.totalSellEUR,
            totalSellPLN:     totals.totalSellPLN,
            overallMarginPct: totals.totalMarginPct ?? 0,
          }}
          currency={currency}
          exchangeRate={exchangeRate}
          nbpDate={nbpRate.date}
          delivery={transportCalc ? {
            trucks:           transportCalc.trucks,
            costPerTruckCurr: transportCalc.costPerTruck,
            totalCostCurr:    transportCalc.totalCostCurrency,
            totalCostEUR:     transportEUR,
            paidBy:           deliveryPaidBy,
            from:             deliveryFrom,
            to:               deliveryTo,
          } : null}
          onSaved={(o) => { setShowSaveModal(false); onOfferSaved(o); }}
          onClose={() => setShowSaveModal(false)}
          onClientAdded={onClientAdded}
        />
      )}

      {/* ─── Pasek waluty i kursu ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Waluta oferty:</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm font-semibold">
              {(['EUR', 'PLN'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => handleCurrencyChange(c)}
                  className={`px-3 py-1.5 transition-colors ${currency === c ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-xs text-gray-500">Kurs EUR/PLN:</span>
            <input
              type="number"
              step={0.0001}
              value={exchangeRate}
              onChange={e => handleManualRateChange(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadNBP}
              disabled={nbpLoading}
              className="text-xs text-blue-700 hover:underline disabled:opacity-50"
              title="Pobierz aktualny kurs z NBP"
            >
              {nbpLoading ? '...' : '↻ NBP'}
            </button>
            <span className="text-xs text-gray-400">
              {manualRate ? '(ręcznie)' : nbpRate.date ? `NBP ${formatNBPDate(nbpRate.date)}` : ''}
            </span>
          </div>
        </div>
        {nbpError && (
          <p className="text-xs text-amber-600 mt-2">{nbpError}</p>
        )}
      </div>

      {/* ─── Pozycje ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Pozycje oferty</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Zastosuj cenę sprzedaży do wszystkich:</label>
            <input
              type="number"
              min={0}
              step={1}
              value={applyAllSellPrice || ''}
              onChange={e => setApplyAllSellPrice(parseFloat(e.target.value) || 0)}
              placeholder={`${currency}/t`}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={applyPriceToAll}
              disabled={applyAllSellPrice <= 0}
              className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
            >
              Zastosuj
            </button>
            <button
              onClick={addItem}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors ml-2"
            >
              + Dodaj pozycję
            </button>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Brak profili płyt drogowych. Dodaj profil w zakładce „Profile płyt" (moduł Wynajem).
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Brak pozycji. Kliknij „+ Dodaj pozycję" aby zacząć.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const r = results[idx];
              const profile = r.profile;
              const cellLookup = lookupCostInCurrency(item.profileId, item.steelGrade);
              const hasPriceInCatalog = cellLookup > 0;

              return (
                <div key={item.uid} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {/* Profil */}
                  <div className="lg:col-span-3">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Profil płyty drogowej</label>}
                    <select
                      value={item.profileId}
                      onChange={e => updateItem(item.uid, { profileId: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sheet_width_m}×{p.sheet_length_m} m, {p.thickness_mm} mm)
                        </option>
                      ))}
                    </select>
                    {profile && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {profile.weight_kg_per_m2} kg/m² · pow. 1 szt. {formatNumber(r.areaPerPlateM2, 2)} m²
                      </p>
                    )}
                  </div>

                  {/* Gatunek */}
                  <div className="lg:col-span-2">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek stali</label>}
                    <select
                      value={item.steelGrade}
                      onChange={e => updateItem(item.uid, { steelGrade: e.target.value as RoadPlateSaleSteelGrade })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {ROAD_PLATE_SALE_STEEL_GRADES.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Ilość */}
                  <div className="lg:col-span-1">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość [szt.]</label>}
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={e => updateItem(item.uid, { quantity: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Cena kosztu */}
                  <div className="lg:col-span-2">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Cena kosztu [{currency}/t]</label>}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.costPriceEurT || ''}
                      onChange={e => updateItem(item.uid, { costPriceEurT: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className={`w-full border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        hasPriceInCatalog ? 'border-gray-300 bg-white' : 'border-amber-300 bg-amber-50'
                      }`}
                      title={hasPriceInCatalog ? 'Cena z cennika — auto-uzupełniona' : 'Brak ceny w cenniku. Wpisz ręcznie lub uzupełnij cennik.'}
                    />
                  </div>

                  {/* Cena sprzedaży */}
                  <div className="lg:col-span-2">
                    {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Cena sprzedaży [{currency}/t]</label>}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.sellPriceEurT || ''}
                      onChange={e => updateItem(item.uid, { sellPriceEurT: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm text-right bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  {/* Wyniki + delete */}
                  <div className="lg:col-span-2 flex items-end justify-between gap-2">
                    <div className="text-xs text-gray-600 leading-tight">
                      <div><strong>{formatNumber(r.massT, 3)}</strong> t</div>
                      <div className="text-gray-500">{moneyLabel(r.sellInCurrency)}</div>
                      {r.marginPct != null && (
                        <div className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium mt-0.5 ${marginColor(r.marginPct)}`}>
                          {r.marginPct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.uid)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1.5 transition-colors"
                      title="Usuń pozycję"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Transport ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Transport</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sposób rozliczenia</label>
            <select
              value={deliveryPaidBy}
              onChange={e => setDeliveryPaidBy(e.target.value as 'dap_included' | 'dap_extra' | 'fca')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="dap_included">DAP – w cenie</option>
              <option value="dap_extra">DAP – refaktura</option>
              <option value="fca">FCA – odbiór własny</option>
            </select>
          </div>

          {deliveryPaidBy !== 'fca' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Liczba aut</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={transportCalc ? `auto: ${transportCalc.autoTrucks}` : 'auto'}
                  value={customDeliveryTrucks === '' ? '' : customDeliveryTrucks}
                  onChange={e => setCustomDeliveryTrucks(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title={`Auto-kalkulacja: ${TRUCK_CAPACITY_T} t/auto`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Koszt 1 auta [{currency}]</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={deliveryCostPerTruck === '' ? '' : deliveryCostPerTruck}
                  onChange={e => setDeliveryCostPerTruck(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Razem transport</label>
                <div className="px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 rounded-lg border border-gray-200 text-right">
                  {transportCalc ? moneyLabel(transportCalc.totalCostCurrency) : '—'}
                </div>
              </div>
            </>
          )}
        </div>

        {deliveryPaidBy !== 'fca' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Załadunek (skąd)</label>
              <div className="flex gap-1 items-stretch">
                <input
                  type="text"
                  value={deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setDeliveryFrom(WAREHOUSE_PRESET)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  title="Preset: Cieśle"
                >
                  PL
                </button>
                <button
                  onClick={() => setDeliveryFrom(WAREHOUSE_PRESET_CZ)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                  title="Preset: Ostrava"
                >
                  CZ
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rozładunek (dokąd)</label>
              <input
                type="text"
                value={deliveryTo}
                onChange={e => setDeliveryTo(e.target.value)}
                placeholder="np. Warszawa, Polska"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── Podsumowanie ──────────────────────────────────────────────────── */}
      {isValid && (
        <div className="bg-blue-900 text-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-3">Podsumowanie</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-blue-200 text-xs uppercase">Masa łączna</p>
              <p className="text-2xl font-bold">{formatNumber(totals.totalMassT, 3)} <span className="text-base text-blue-200">t</span></p>
            </div>
            <div>
              <p className="text-blue-200 text-xs uppercase">Powierzchnia</p>
              <p className="text-2xl font-bold">{formatNumber(totals.totalAreaM2, 1)} <span className="text-base text-blue-200">m²</span></p>
            </div>
            <div>
              <p className="text-blue-200 text-xs uppercase">Koszt razem</p>
              <p className="text-2xl font-bold">{formatRound(totals.totalCostCurrency)} <span className="text-base text-blue-200">{currency}</span></p>
            </div>
            <div>
              <p className="text-blue-200 text-xs uppercase">Sprzedaż razem</p>
              <p className="text-2xl font-bold">{formatRound(totals.totalSellCurrency)} <span className="text-base text-blue-200">{currency}</span></p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm">
              <span className="text-blue-200">Marża ogólna:</span>{' '}
              <span className={`inline-block px-2 py-1 rounded font-semibold ${
                totals.totalMarginPct == null ? 'text-blue-200' :
                totals.totalMarginPct < 0 ? 'bg-red-500/30 text-red-100' :
                totals.totalMarginPct < 5 ? 'bg-orange-500/30 text-orange-100' :
                totals.totalMarginPct < 10 ? 'bg-yellow-500/30 text-yellow-100' :
                'bg-green-500/30 text-green-100'
              }`}>
                {totals.totalMarginPct == null ? '—' : `${totals.totalMarginPct.toFixed(1)}% · ${marginLabel(totals.totalMarginPct)}`}
              </span>
              {transportCalc && transportCalc.totalCostCurrency > 0 && (
                <span className="ml-4 text-blue-200">
                  Transport: {moneyLabel(transportCalc.totalCostCurrency)} ({transportCalc.trucks} aut.)
                </span>
              )}
            </div>
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!canSave}
              className="bg-white text-blue-900 hover:bg-blue-50 disabled:bg-blue-200 disabled:text-blue-400 disabled:cursor-not-allowed text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              title={!canSave ? 'Uzupełnij ceny sprzedaży we wszystkich pozycjach' : 'Zapisz ofertę SPP'}
            >
              {canSave ? '💾 Zapisz ofertę SPP' : 'Uzupełnij ceny sprzedaży'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
