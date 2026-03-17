import { useState, useMemo, Fragment } from 'react';
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

// Pojedyncza pozycja w kalkulatorze (lokalna, nie trafia do DB bezpośrednio)
interface CalcItem {
  uid: string;
  profileId: string;
  quantity: number;
  lengthM: number;
}

export default function Calculator({ profiles, prices, clients, onClientAdded, onOfferSaved }: Props) {
  const [items, setItems] = useState<CalcItem[]>([
    { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', quantity: 10, lengthM: 12 },
  ]);
  const [rentalWeeks, setRentalWeeks] = useState<number>(8);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Indywidualne nadpisanie cen (dla konkretnej oferty)
  const [customBasePricePln, setCustomBasePricePln] = useState<number | ''>('');
  const [customPricePerWeek1, setCustomPricePerWeek1] = useState<number | ''>('');
  const [showCustomPrices, setShowCustomPrices] = useState(false);

  // Efektywne ceny = globalne + nadpisane (jeśli wpisano)
  const effectivePrices = useMemo(() => ({
    ...prices,
    base_price_pln: typeof customBasePricePln === 'number' ? customBasePricePln : prices.base_price_pln,
    price_per_week_1: typeof customPricePerWeek1 === 'number' ? customPricePerWeek1 : prices.price_per_week_1,
  }), [prices, customBasePricePln, customPricePerWeek1]);

  // Transport
  const TRUCK_CAPACITY_T = 23;
  const [transportCostPerTruck, setTransportCostPerTruck] = useState<number | ''>('');
  const [transportPaidBy, setTransportPaidBy] = useState<'intra' | 'klient'>('intra');
  const [transportFrom, setTransportFrom] = useState('Magazyn Intra B.V.');
  const [transportTo, setTransportTo] = useState('');

  // --- Zarządzanie pozycjami ---
  function addItem() {
    setItems(prev => [
      ...prev,
      { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', quantity: 10, lengthM: 12 },
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

  const isValid = totals.totalMassT > 0 && rentalWeeks > 0;

  const rentalCost = useMemo(() =>
    isValid ? calculateRentalCost(totals.totalMassT, rentalWeeks, effectivePrices) : 0,
    [totals.totalMassT, rentalWeeks, effectivePrices, isValid]
  );

  const baseCost = useMemo(() =>
    totals.totalMassT > 0 ? calculateRentalCost(totals.totalMassT, effectivePrices.base_weeks, effectivePrices) : 0,
    [totals.totalMassT, effectivePrices]
  );

  // Dane dla tabeli kolejnych tygodni
  const weeklyData = useMemo(() => {
    if (totals.totalMassT <= 0) return [];
    const rows = [];
    for (let w = effectivePrices.base_weeks + 1; w <= 26; w++) {
      const cost = calculateRentalCost(totals.totalMassT, w, effectivePrices);
      const prevCost = calculateRentalCost(totals.totalMassT, w - 1, effectivePrices);
      rows.push({
        week: w,
        cost,
        costPerM2: totals.totalWallAreaM2 > 0 ? cost / totals.totalWallAreaM2 : 0,
        costPerTon: totals.totalMassT > 0 ? cost / totals.totalMassT : 0,
        weekRate: cost - prevCost,
      });
    }
    return rows;
  }, [totals, effectivePrices]);

  const transportCalc = useMemo(() => {
    if (!isValid) return null;
    const trucks = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const costPerTruck = typeof transportCostPerTruck === 'number' ? transportCostPerTruck : 0;
    return { trucks, costPerTruck, totalCost: trucks * costPerTruck };
  }, [isValid, totals.totalMassT, transportCostPerTruck]);

  // Dane do SaveOfferModal
  const offerItems = useMemo((): OfferItemInput[] =>
    items.flatMap((item, idx) => {
      const r = itemResults[idx];
      if (!r.profile || !r.valid) return [];
      return [{
        profileId: item.profileId,
        profileName: r.profile.name,
        profileType: r.profile.type,
        quantity: item.quantity,
        lengthM: item.lengthM,
        totalLengthM: r.totalLengthM,
        massT: r.massT,
        wallAreaM2: r.wallAreaM2,
      }];
    }),
    [items, itemResults]
  );

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
                <div className="sm:col-span-4">
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
                      ? <><span className="font-semibold">{formatNumber(r.massT, 3)} t</span><span className="text-gray-400 ml-2">{formatNumber(r.totalLengthM, 1)} m</span></>
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

        {/* Okres wynajmu – globalny */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Okres wynajmu [tygodnie]</label>
            <input
              type="number" min={1} step={1}
              value={rentalWeeks}
              onChange={e => setRentalWeeks(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">≈ {(rentalWeeks / 4.33).toFixed(1)} miesięcy</p>
          </div>
        </div>

        {/* Indywidualna wycena */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => { setShowCustomPrices(v => !v); if (showCustomPrices) { setCustomBasePricePln(''); setCustomPricePerWeek1(''); } }}
            className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
          >
            <span className="text-base">{showCustomPrices ? '▼' : '▶'}</span>
            Indywidualna wycena
            {(customBasePricePln !== '' || customPricePerWeek1 !== '') && (
              <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-semibold">aktywna</span>
            )}
          </button>
          {showCustomPrices && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cena bazowa za {prices.base_weeks} tyg. [PLN/t]
                </label>
                <input
                  type="number" min={0} step={1}
                  value={customBasePricePln}
                  placeholder={String(prices.base_price_pln)}
                  onChange={e => setCustomBasePricePln(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                />
                <p className="text-xs text-gray-400 mt-1">Domyślnie: {formatPLN(prices.base_price_pln)} PLN/t</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cena za każdy kolejny tydzień [PLN/t]
                </label>
                <input
                  type="number" min={0} step={1}
                  value={customPricePerWeek1}
                  placeholder={String(prices.price_per_week_1)}
                  onChange={e => setCustomPricePerWeek1(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                />
                <p className="text-xs text-gray-400 mt-1">Domyślnie: {formatPLN(prices.price_per_week_1)} PLN/t</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── WYNIKI ── */}
      {isValid && (
        <>
          {/* Przycisk zapisu */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-5 py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              💾 Zapisz jako ofertę
            </button>
          </div>

          {/* Dane wynajmu */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Dane wynajmu – łącznie</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ResultCard label="Całkowita długość" value={formatNumber(totals.totalLengthM, 2)} unit="m" />
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

          {/* Koszt bazowy */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Koszt wynajmu – pierwsze {prices.base_weeks} tygodnie (cena bazowa)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ResultCard label={`Koszt za ${effectivePrices.base_weeks} tyg.`} value={formatPLN(baseCost)} unit="PLN" highlight />
              <ResultCard label="Koszt / kolejny tydzień" value={formatPLN(totals.totalMassT * effectivePrices.price_per_week_1)} unit="PLN/tydz." highlight />
              <ResultCard label="Koszt / m²" value={formatPLN(totals.totalWallAreaM2 > 0 ? baseCost / totals.totalWallAreaM2 : 0)} unit="PLN/m²" />
              <ResultCard label="Koszt / tonę" value={formatPLN(totals.totalMassT > 0 ? baseCost / totals.totalMassT : 0)} unit="PLN/t" />
            </div>
            {rentalWeeks !== effectivePrices.base_weeks && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Wybrany okres: {rentalWeeks} tygodni</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ResultCard label={`Koszt za ${rentalWeeks} tyg.`} value={formatPLN(rentalCost)} unit="PLN" highlight />
                  <ResultCard label="Koszt / m²" value={formatPLN(totals.totalWallAreaM2 > 0 ? rentalCost / totals.totalWallAreaM2 : 0)} unit="PLN/m²" />
                  <ResultCard label="Koszt / tonę" value={formatPLN(totals.totalMassT > 0 ? rentalCost / totals.totalMassT : 0)} unit="PLN/t" />
                </div>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Koszty transportu</h2>
            <p className="text-xs text-gray-400 mb-4">
              Ładowność 1 auta: ~{TRUCK_CAPACITY_T} t &nbsp;·&nbsp;
              Szacowana liczba aut: <strong className="text-gray-700">{transportCalc?.trucks ?? '—'}</strong>
              <span className="text-gray-500"> (masa: {formatNumber(totals.totalMassT, 3)} t)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Koszt transportu / auto [PLN]</label>
                <input type="number" min={0} step={100} value={transportCostPerTruck} placeholder="np. 2500"
                  onChange={e => setTransportCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Załadunek (magazyn)</label>
                <input type="text" value={transportFrom} onChange={e => setTransportFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dostawa (adres budowy)</label>
                <input type="text" value={transportTo} placeholder="ul. Przykładowa 1, Warszawa"
                  onChange={e => setTransportTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Koszt transportu po stronie:</p>
                <div className="flex gap-3">
                  {(['intra', 'klient'] as const).map(val => (
                    <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="transportPaidBy" value={val} checked={transportPaidBy === val}
                        onChange={() => setTransportPaidBy(val)} className="accent-blue-900" />
                      <span className="text-sm text-gray-700">{val === 'intra' ? 'Intra B.V.' : 'Klienta'}</span>
                    </label>
                  ))}
                </div>
              </div>
              {transportCalc && transportCalc.costPerTruck > 0 && (
                <div className={`ml-auto rounded-lg px-5 py-3 text-right ${transportPaidBy === 'klient' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">{transportCalc.trucks} auto{transportCalc.trucks > 1 ? 'a' : ''} × {formatPLN(transportCalc.costPerTruck)} PLN</p>
                  <p className="text-xl font-bold text-gray-800">{formatPLN(transportCalc.totalCost)} PLN</p>
                  <p className={`text-xs font-medium mt-0.5 ${transportPaidBy === 'klient' ? 'text-orange-600' : 'text-gray-500'}`}>
                    {transportPaidBy === 'klient' ? '⚠ Koszt po stronie klienta' : 'Koszt po stronie Intra B.V.'}
                  </p>
                </div>
              )}
            </div>
            {transportCalc && transportCalc.costPerTruck > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
                <div className="bg-blue-900 rounded-lg px-5 py-3 text-white">
                  <p className="text-blue-200 text-xs mb-0.5">Łączny koszt (wynajem + transport)</p>
                  <p className="text-2xl font-bold">
                    {formatPLN(rentalCost + (transportPaidBy === 'intra' ? transportCalc.totalCost : 0))} PLN
                  </p>
                  {transportPaidBy === 'klient' && (
                    <p className="text-blue-300 text-xs mt-0.5">+ {formatPLN(transportCalc.totalCost)} PLN transport (klient)</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tabela kolejnych tygodni */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Koszt za każdy kolejny tydzień (od tygodnia {prices.base_weeks + 1})</h2>
            <p className="text-xs text-gray-400 mb-4">Kliknij wiersz aby wybrać okres wynajmu</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600 rounded-tl-lg">Tydzień</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Koszt tygodnia [PLN]</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Koszt łączny [PLN]</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right">PLN/m²</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 text-right rounded-tr-lg hidden md:table-cell">PLN/t</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyData.map(({ week, cost, costPerM2, costPerTon, weekRate }) => {
                    const isSelected = week === rentalWeeks;
                    return (
                      <Fragment key={week}>
                        <tr onClick={() => setRentalWeeks(week)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 font-semibold ring-1 ring-inset ring-blue-300' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 text-gray-700">
                            {week} tyg.
                            {isSelected && <span className="ml-2 text-xs text-blue-600 font-normal">← wybrany</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">+ {formatPLN(weekRate)} PLN</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatPLN(cost)} PLN</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{formatPLN(costPerM2)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500 hidden md:table-cell">{formatPLN(costPerTon)}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
          totals={{ massT: totals.totalMassT, wallAreaM2: totals.totalWallAreaM2, totalLengthM: totals.totalLengthM, rentalCostPLN: rentalCost, costPerM2: totals.totalWallAreaM2 > 0 ? rentalCost / totals.totalWallAreaM2 : 0, costPerTon: totals.totalMassT > 0 ? rentalCost / totals.totalMassT : 0 }}
          transport={{ trucks: transportCalc.trucks, costPerTruck: transportCalc.costPerTruck, totalCost: transportCalc.totalCost, paidBy: transportPaidBy, from: transportFrom, to: transportTo }}
          prices={effectivePrices}
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
