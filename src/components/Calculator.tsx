import { useState, useMemo, useEffect } from 'react';
import type { Profile, RentalPrices, Client, Offer } from '../types';
import { calculateRentalCost, formatPLN, formatNumber } from '../lib/calculations';
import SaveOfferModal, { type OfferItemInput } from './SaveOfferModal';

interface Props {
  profiles: Profile[];
  prices: RentalPrices;
  clients: Client[];
  onClientAdded: (client: Client) => void;
  onOfferSaved: (offer: Offer) => void;
}

const STEEL_GRADES = ['min. S270GP', 'S270GP', 'min. S355GP', 'S355GP'];

interface CalcItem {
  uid: string;
  profileId: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
}

export default function Calculator({ profiles, prices, clients, onClientAdded, onOfferSaved }: Props) {
  const [items, setItems] = useState<CalcItem[]>([
    { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', steelGrade: STEEL_GRADES[0], quantity: 10, lengthM: 12 },
  ]);
  const [rentalWeeks, setRentalWeeks] = useState<number>(8);
  const [displayUnit, setDisplayUnit] = useState<'weeks' | 'months'>('weeks');
  const weeksToMonths = (w: number) => w / 4;
  const monthsToWeeks = (m: number) => Math.max(1, m * 4);

  // Cena PLN/t wpisywana ręcznie przez handlowca (domyślnie z globalnych ustawień)
  const [pricePerTon, setPricePerTon] = useState<number>(prices.base_price_pln);
  const [pricePerWeek1, setPricePerWeek1] = useState<number>(prices.price_per_week_1);
  // Cennik szkód i napraw (override globalnych ustawień dla tej oferty)
  const [lossPrice, setLossPrice] = useState<number>(prices.loss_price_pln ?? 3950);
  const [sortingPrice, setSortingPrice] = useState<number>(prices.sorting_price_pln ?? 99);
  const [grindingPrice, setGrindingPrice] = useState<number>(prices.grinding_price_pln ?? 250);
  const [weldingPrice, setWeldingPrice] = useState<number>(prices.welding_price_pln ?? 250);
  const [cuttingPrice, setCuttingPrice] = useState<number>(prices.cutting_price_pln ?? 59);
  const [repairPrice, setRepairPrice] = useState<number>(prices.repair_price_pln ?? 250);

  // Gdy globalne stawki się zmienią (po zapisie w Ustawieniach cen), resetuj lokalne ceny
  useEffect(() => {
    setPricePerTon(prices.base_price_pln);
    setPricePerWeek1(prices.price_per_week_1);
    setLossPrice(prices.loss_price_pln ?? 3950);
    setSortingPrice(prices.sorting_price_pln ?? 99);
    setGrindingPrice(prices.grinding_price_pln ?? 250);
    setWeldingPrice(prices.welding_price_pln ?? 250);
    setCuttingPrice(prices.cutting_price_pln ?? 59);
    setRepairPrice(prices.repair_price_pln ?? 250);
  }, [prices.updated_at]);

  const [showSaveModal, setShowSaveModal] = useState(false);

  // Transport
  const TRUCK_CAPACITY_T = 24.5;
  const [transportCostPerTruck, setTransportCostPerTruck] = useState<number | ''>('');
  const [customTrucks, setCustomTrucks] = useState<number | ''>('');
  const [transportPaidBy, setTransportPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca'>('dap_included');
  const [transportFrom, setTransportFrom] = useState('Magazyn Intra B.V.');
  const [transportTo, setTransportTo] = useState('');

  // --- Zarządzanie pozycjami ---
  function addItem() {
    setItems(prev => [
      ...prev,
      { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', steelGrade: STEEL_GRADES[0], quantity: 10, lengthM: 12 },
    ]);
  }

  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<CalcItem>) {
    setItems(prev => prev.map(i => i.uid === uid ? { ...i, ...patch } : i));
  }

  // --- Wyliczenia per pozycja ---
  const itemResults = useMemo(() =>
    items.map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? null;
      if (!profile || item.quantity <= 0 || item.lengthM <= 0) {
        return { profile, totalLengthM: 0, massT: 0, wallAreaM2: 0, valid: false };
      }
      const totalLengthM = item.quantity * item.lengthM;
      const massT = (totalLengthM * profile.weight_kg_per_m) / 1000;
      const wallAreaM2 = totalLengthM * (profile.width_mm / 1000);
      return { profile, totalLengthM, massT, wallAreaM2, valid: true };
    }),
    [items, profiles]
  );

  // --- Sumy łączne ---
  const totals = useMemo(() => {
    let totalLengthM = 0, totalMassT = 0, totalWallAreaM2 = 0;
    for (const r of itemResults) {
      if (!r.valid) continue;
      totalLengthM += r.totalLengthM;
      totalMassT += r.massT;
      totalWallAreaM2 += r.wallAreaM2;
    }
    return { totalLengthM, totalMassT, totalWallAreaM2 };
  }, [itemResults]);

  const isValid = totals.totalMassT > 0;

  // Koszt = masa [t] × cena [PLN/t]
  const rentalCost = useMemo(() =>
    isValid ? calculateRentalCost(totals.totalMassT, pricePerTon) : 0,
    [totals.totalMassT, pricePerTon, isValid]
  );

  const transportCalc = useMemo(() => {
    if (!isValid) return null;
    const autoTrucks = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const trucks = typeof customTrucks === 'number' && customTrucks > 0 ? customTrucks : autoTrucks;
    const costPerTruck = typeof transportCostPerTruck === 'number' ? transportCostPerTruck : 0;
    return { trucks, autoTrucks, costPerTruck, totalCost: trucks * costPerTruck };
  }, [isValid, totals.totalMassT, transportCostPerTruck, customTrucks]);

  const totalCostInclTransport = useMemo(() => {
    const transportAdd = (transportPaidBy === 'dap_included' && transportCalc) ? transportCalc.totalCost : 0;
    return rentalCost + transportAdd;
  }, [rentalCost, transportCalc, transportPaidBy]);

  // Dane do SaveOfferModal
  const offerItems = useMemo((): OfferItemInput[] =>
    items.flatMap((item, idx) => {
      const r = itemResults[idx];
      if (!r.profile || !r.valid) return [];
      return [{
        profileId: item.profileId,
        profileName: r.profile.name,
        profileType: r.profile.type,
        steelGrade: item.steelGrade,
        quantity: item.quantity,
        lengthM: item.lengthM,
        totalLengthM: r.totalLengthM,
        massT: r.massT,
        wallAreaM2: r.wallAreaM2,
      }];
    }),
    [items, itemResults]
  );

  // Ceny przekazywane do oferty – base_price_pln = ręcznie wpisana cena PLN/t
  const effectivePricesForOffer = useMemo(() => ({
    ...prices,
    base_price_pln: pricePerTon,
    price_per_week_1: pricePerWeek1,
    loss_price_pln: lossPrice,
    sorting_price_pln: sortingPrice,
    grinding_price_pln: grindingPrice,
    welding_price_pln: weldingPrice,
    cutting_price_pln: cuttingPrice,
    repair_price_pln: repairPrice,
  }), [prices, pricePerTon, pricePerWeek1, lossPrice, sortingPrice, grindingPrice, weldingPrice, cuttingPrice, repairPrice]);

  return (
    <div className="space-y-6">

      {/* ── POZYCJE OFERTY ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Pozycje oferty</h2>
          <button
            onClick={addItem}
            className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            + Dodaj pozycję
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const r = itemResults[idx];
            const profile = r.profile;
            return (
              <div key={item.uid} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 bg-gray-50 rounded-lg border border-gray-200">
                {/* Profil */}
                <div className="sm:col-span-3">
                  {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Profil grodzicy</label>}
                  <select
                    value={item.profileId}
                    onChange={e => updateItem(item.uid, { profileId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                    ))}
                  </select>
                  {profile && (
                    <p className="text-xs text-gray-400 mt-0.5">{profile.weight_kg_per_m} kg/m · {profile.width_mm} mm</p>
                  )}
                </div>

                {/* Gatunek stali */}
                <div className="sm:col-span-3">
                  {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek stali</label>}
                  <select
                    value={item.steelGrade}
                    onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STEEL_GRADES.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Ilość */}
                <div className="sm:col-span-2">
                  {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość [szt.]</label>}
                  <input
                    type="number" min={1} step={1}
                    value={item.quantity}
                    onChange={e => updateItem(item.uid, { quantity: Math.max(1, parseInt(e.target.value) || 0) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Długość */}
                <div className="sm:col-span-2">
                  {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Długość [m]</label>}
                  <input
                    type="number" min={0.1} step={0.5}
                    value={item.lengthM}
                    onChange={e => updateItem(item.uid, { lengthM: Math.max(0.1, parseFloat(e.target.value) || 0) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Masa tej pozycji */}
                <div className="sm:col-span-3">
                  {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Masa pozycji</label>}
                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-700 min-h-[38px] flex items-center">
                    {r.valid
                      ? <span className="font-semibold">{formatNumber(r.massT, 3)} t</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </div>
                </div>

                {/* Usuń */}
                <div className="sm:col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(item.uid)}
                      className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors"
                      title="Usuń pozycję"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Okres dzierżawy (tylko informacyjny) */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-gray-700">Podstawowy okres dzierżawy</span>
            <span className="text-xs text-gray-400">(informacyjnie – nie wpływa na cenę)</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
              <button type="button"
                onClick={() => setDisplayUnit('weeks')}
                className={`px-3 py-1.5 transition-colors ${displayUnit === 'weeks' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Tygodnie</button>
              <button type="button"
                onClick={() => setDisplayUnit('months')}
                className={`px-3 py-1.5 transition-colors ${displayUnit === 'months' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Miesiące</button>
            </div>
          </div>
          <div className="flex items-end gap-4 max-w-sm">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Tygodnie</label>
              <input
                type="number" min={1} step={1}
                value={rentalWeeks}
                onChange={e => setRentalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="pb-2 text-gray-400 text-sm">=</div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Miesiące</label>
              <input
                type="number" min={0.1} step={0.5}
                value={weeksToMonths(rentalWeeks)}
                onChange={e => setRentalWeeks(monthsToWeeks(parseFloat(e.target.value) || 0))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Na ofercie wyświetli się: <strong>{displayUnit === 'weeks' ? `${rentalWeeks} tygodni` : (() => { const m = weeksToMonths(rentalWeeks); if (m === 1) return '1 miesiąc'; if (m % 10 >= 2 && m % 10 <= 4 && (m % 100 < 10 || m % 100 >= 20)) return `${m} miesiące`; return `${m} miesięcy`; })()}</strong>
          </p>
        </div>

        {/* Cena wynajmu PLN/t */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cena wynajmu [PLN/t]</label>
              <input
                type="number" min={0} step={1}
                value={pricePerTon}
                onChange={e => setPricePerTon(parseFloat(e.target.value) || 0)}
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 font-semibold"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">Każdy kolejny tydzień [PLN/t]</label>
              <input
                type="number" min={0} step={1}
                value={pricePerWeek1}
                onChange={e => setPricePerWeek1(parseFloat(e.target.value) || 0)}
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Cennik szkód i napraw */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">Cennik szkód i napraw</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Zagubienie / strata [PLN/t]', value: lossPrice, set: setLossPrice },
              { label: 'Sortowanie i czyszczenie [PLN/t]', value: sortingPrice, set: setSortingPrice },
              { label: 'Szlifowanie spawów [PLN/mb]', value: grindingPrice, set: setGrindingPrice },
              { label: 'Spawanie otworów pod kotwy [PLN/szt]', value: weldingPrice, set: setWeldingPrice },
              { label: 'Głowica tnąca [PLN/cięcie]', value: cuttingPrice, set: setCuttingPrice },
              { label: 'Naprawa zamków [PLN/mb]', value: repairPrice, set: setRepairPrice },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type="number" min={0} step={1}
                  value={value}
                  onChange={e => set(parseFloat(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── WYNIKI ── */}
      {isValid && (
        <>
          {/* Dane wynajmu */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Dane wynajmu – łącznie</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ResultCard label="Masa całkowita" value={formatNumber(totals.totalMassT, 3)} unit="t" />
              <ResultCard label="Powierzchnia ścianki" value={formatNumber(totals.totalWallAreaM2, 2)} unit="m²" />
            </div>
            {items.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Rozkład pozycji</p>
                <div className="space-y-1">
                  {itemResults.map((r, idx) => r.valid && (
                    <div key={items[idx].uid} className="flex justify-between text-sm text-gray-600">
                      <span>{r.profile!.name} – {items[idx].quantity} szt. × {items[idx].lengthM} m</span>
                      <span className="font-medium">{formatNumber(r.massT, 3)} t</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Koszt dzierżawy */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Koszt dzierżawy</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ResultCard label="Koszt łączny" value={formatPLN(totalCostInclTransport)} unit="PLN" highlight />
              <ResultCard label="Każdy kolejny tydzień" value={formatPLN(totals.totalMassT * pricePerWeek1)} unit="PLN/tydz." />
              <ResultCard label="Koszt / m²" value={formatPLN(totals.totalWallAreaM2 > 0 ? totalCostInclTransport / totals.totalWallAreaM2 : 0)} unit="PLN/m²" />
              <ResultCard label="Koszt / tonę" value={formatPLN(totals.totalMassT > 0 ? totalCostInclTransport / totals.totalMassT : 0)} unit="PLN/t" />
            </div>
          </div>

          {/* Transport */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Koszty transportu</h2>
            <p className="text-xs text-gray-400 mb-4">
              Ładowność 1 auta: ~{TRUCK_CAPACITY_T} t &nbsp;·&nbsp;
              Masa: {formatNumber(totals.totalMassT, 3)} t &nbsp;·&nbsp;
              Szacowana liczba aut: <strong className="text-gray-700">{transportCalc?.autoTrucks ?? '—'}</strong>
            </p>

            {/* Opcja transportu – 3 przyciski */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Opcja transportu:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { val: 'dap_included', label: 'DAP – transport w cenie', desc: 'Intra organizuje i pokrywa koszt' },
                  { val: 'dap_extra',    label: 'DAP – refaktura na klienta', desc: 'Intra organizuje, klient płaci osobno' },
                  { val: 'fca',          label: 'FCA – odbiór własny',        desc: 'Klient podstawia swoje auto' },
                ] as const).map(({ val, label, desc }) => (
                  <label key={val} className={`flex-1 flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    transportPaidBy === val ? 'border-blue-700 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="transportPaidBy" value={val} checked={transportPaidBy === val}
                      onChange={() => setTransportPaidBy(val)} className="accent-blue-900 mt-0.5" />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Pola kosztów – ukryte dla FCA */}
            {transportPaidBy !== 'fca' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Koszt transportu / auto [PLN]</label>
                  <input type="number" min={0} step={100} value={transportCostPerTruck} placeholder="np. 2500"
                    onChange={e => setTransportCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Liczba aut
                    {typeof customTrucks === 'number' && customTrucks > 0 && (
                      <span className="ml-1 text-xs text-amber-600 font-normal">(ręcznie)</span>
                    )}
                  </label>
                  <input type="number" min={1} step={1}
                    value={customTrucks}
                    placeholder={String(transportCalc?.autoTrucks ?? '—')}
                    onChange={e => setCustomTrucks(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {/* Trasa – zawsze widoczna */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {transportPaidBy === 'fca' ? 'Odbiór z (magazyn)' : 'Załadunek (magazyn)'}
                </label>
                <input type="text" value={transportFrom} onChange={e => setTransportFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {transportPaidBy !== 'fca' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dostawa (adres budowy)</label>
                  <input type="text" value={transportTo} placeholder="ul. Przykładowa 1, Warszawa"
                    onChange={e => setTransportTo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>

            {/* Podsumowanie kosztów */}
            {transportCalc && transportCalc.costPerTruck > 0 && transportPaidBy !== 'fca' && (
              <div className="mt-2 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                <div className={`rounded-lg px-5 py-3 text-right ${transportPaidBy === 'dap_extra' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">{transportCalc.trucks} auto{transportCalc.trucks > 1 ? 'a' : ''} × {formatPLN(transportCalc.costPerTruck)} PLN</p>
                  <p className="text-xl font-bold text-gray-800">{formatPLN(transportCalc.totalCost)} PLN</p>
                  <p className={`text-xs font-medium mt-0.5 ${transportPaidBy === 'dap_extra' ? 'text-orange-600' : 'text-gray-500'}`}>
                    {transportPaidBy === 'dap_extra' ? '⚠ Refaktura na klienta' : 'Koszt po stronie Intra B.V.'}
                  </p>
                </div>
                {transportPaidBy === 'dap_included' && (
                  <div className="bg-blue-900 rounded-lg px-5 py-3 text-white">
                    <p className="text-blue-200 text-xs mb-0.5">Łączny koszt dla klienta (dzierżawa + transport)</p>
                    <p className="text-2xl font-bold">{formatPLN(rentalCost + transportCalc.totalCost)} PLN</p>
                    <p className="text-blue-300 text-xs mt-0.5">
                      dzierżawa {formatPLN(rentalCost)} + transport {formatPLN(transportCalc.totalCost)} PLN
                    </p>
                  </div>
                )}
                {transportPaidBy === 'dap_extra' && (
                  <div className="bg-blue-900 rounded-lg px-5 py-3 text-white">
                    <p className="text-blue-200 text-xs mb-0.5">Koszt dzierżawy (na ofercie)</p>
                    <p className="text-2xl font-bold">{formatPLN(rentalCost)} PLN</p>
                    <p className="text-orange-300 text-xs mt-0.5">+ {formatPLN(transportCalc.totalCost)} PLN transport (osobna faktura)</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Przycisk zapisu */}
          <button
            onClick={() => setShowSaveModal(true)}
            className="w-full py-3 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            💾 Zapisz jako ofertę
          </button>
        </>
      )}

      {!isValid && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-yellow-700 text-sm text-center">
          Dodaj przynajmniej jedną pozycję z poprawnymi danymi, aby zobaczyć wyniki kalkulacji.
        </div>
      )}

      {/* Modal zapisu */}
      {showSaveModal && isValid && transportCalc && (
        <SaveOfferModal
          clients={clients}
          offerItems={offerItems}
          rentalWeeks={rentalWeeks}
          displayUnit={displayUnit}
          totals={{ massT: totals.totalMassT, wallAreaM2: totals.totalWallAreaM2, totalLengthM: totals.totalLengthM, rentalCostPLN: rentalCost, costPerM2: totals.totalWallAreaM2 > 0 ? totalCostInclTransport / totals.totalWallAreaM2 : 0, costPerTon: totals.totalMassT > 0 ? totalCostInclTransport / totals.totalMassT : 0 }}
          transport={{ trucks: transportCalc.trucks, costPerTruck: transportCalc.costPerTruck, totalCost: transportCalc.totalCost, paidBy: transportPaidBy, from: transportFrom, to: transportTo }}
          prices={effectivePricesForOffer}
          onClientAdded={onClientAdded}
          onSaved={(offer) => { onOfferSaved(offer); setShowSaveModal(false); }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

interface ResultCardProps { label: string; value: string; unit: string; highlight?: boolean; }
function ResultCard({ label, value, unit, highlight = false }: ResultCardProps) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-blue-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-blue-200' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${highlight ? 'text-blue-300' : 'text-gray-400'}`}>{unit}</p>
    </div>
  );
}
