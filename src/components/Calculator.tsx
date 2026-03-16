import { useState, useMemo } from 'react';
import type { Profile, RentalPrices, Client, Offer } from '../types';
import { calculate, calculateRentalCost, formatPLN, formatNumber } from '../lib/calculations';
import SaveOfferModal from './SaveOfferModal';

interface Props {
  profiles: Profile[];
  prices: RentalPrices;
  clients: Client[];
  onClientAdded: (client: Client) => void;
  onOfferSaved: (offer: Offer) => void;
}

export default function Calculator({ profiles, prices, clients, onClientAdded, onOfferSaved }: Props) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [quantity, setQuantity] = useState<number>(10);
  const [lengthM, setLengthM] = useState<number>(12);
  const [rentalWeeks, setRentalWeeks] = useState<number>(8);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId]
  );

  const result = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0 || rentalWeeks <= 0) return null;
    return calculate(quantity, lengthM, selectedProfile.weight_kg_per_m, selectedProfile.width_mm, rentalWeeks, prices);
  }, [selectedProfile, quantity, lengthM, rentalWeeks, prices]);

  // Dane dla tabeli kolejnych tygodni (od base_weeks+1 do 26)
  const weeklyData = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0) return [];
    const totalLengthM = quantity * lengthM;
    const massT = (totalLengthM * selectedProfile.weight_kg_per_m) / 1000;
    const wallArea = totalLengthM * (selectedProfile.width_mm / 1000);
    const rows = [];
    for (let w = prices.base_weeks + 1; w <= 26; w++) {
      const cost = calculateRentalCost(massT, w, prices);
      const prevCost = calculateRentalCost(massT, w - 1, prices);
      rows.push({
        week: w,
        cost,
        costPerM2: wallArea > 0 ? cost / wallArea : 0,
        costPerTon: massT > 0 ? cost / massT : 0,
        weekRate: cost - prevCost, // koszt samego tego tygodnia
      });
    }
    return rows;
  }, [selectedProfile, quantity, lengthM, prices]);

  const isValid = selectedProfile && quantity > 0 && lengthM > 0 && rentalWeeks > 0;

  const baseCost = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0) return 0;
    const massT = (quantity * lengthM * selectedProfile.weight_kg_per_m) / 1000;
    return calculateRentalCost(massT, prices.base_weeks, prices);
  }, [selectedProfile, quantity, lengthM, prices]);

  const wallArea = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0) return 0;
    return quantity * lengthM * (selectedProfile.width_mm / 1000);
  }, [selectedProfile, quantity, lengthM]);

  return (
    <div className="space-y-6">
      {/* Formularz */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-5">Dane wejściowe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Profil */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Profil grodzicy
            </label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
            {selectedProfile && (
              <p className="text-xs text-gray-400 mt-1">
                {selectedProfile.weight_kg_per_m} kg/m · {selectedProfile.width_mm} mm
              </p>
            )}
          </div>

          {/* Ilość */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ilość sztuk
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Długość */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Długość grodzicy [m]
            </label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={lengthM}
              onChange={(e) => setLengthM(Math.max(0.1, parseFloat(e.target.value) || 0))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tygodnie */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Okres wynajmu [tygodnie]
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={rentalWeeks}
              onChange={(e) => setRentalWeeks(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              ≈ {(rentalWeeks / 4.33).toFixed(1)} miesięcy
            </p>
          </div>
        </div>
      </div>

      {/* Wyniki */}
      {isValid && result && (
        <>
          {/* Przycisk zapisu oferty */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-5 py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              💾 Zapisz jako ofertę
            </button>
          </div>

          {/* Dane fizyczne */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Dane wynajmu</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ResultCard label="Całkowita długość" value={formatNumber(result.totalLengthM, 2)} unit="m" />
              <ResultCard label="Masa całkowita" value={formatNumber(result.massT, 3)} unit="t" />
              <ResultCard label="Powierzchnia ścianki" value={formatNumber(result.wallAreaM2, 2)} unit="m²" />
            </div>
          </div>

          {/* Koszt bazowy – pierwsze N tygodni */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Koszt wynajmu – pierwsze {prices.base_weeks} tygodnie (cena bazowa)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ResultCard
                label={`Koszt za ${prices.base_weeks} tyg.`}
                value={formatPLN(baseCost)}
                unit="PLN"
                highlight
              />
              <ResultCard
                label="Koszt / m²"
                value={formatPLN(wallArea > 0 ? baseCost / wallArea : 0)}
                unit="PLN/m²"
              />
              <ResultCard
                label="Koszt / tonę"
                value={formatPLN(result.massT > 0 ? baseCost / result.massT : 0)}
                unit="PLN/t"
              />
            </div>
            {rentalWeeks !== prices.base_weeks && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">
                  Wybrany okres: {rentalWeeks} tygodni
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ResultCard
                    label={`Koszt za ${rentalWeeks} tyg.`}
                    value={formatPLN(result.rentalCostPLN)}
                    unit="PLN"
                    highlight
                  />
                  <ResultCard label="Koszt / m²" value={formatPLN(result.costPerM2)} unit="PLN/m²" />
                  <ResultCard label="Koszt / tonę" value={formatPLN(result.costPerTon)} unit="PLN/t" />
                </div>
              </div>
            )}
          </div>

          {/* Tabela kolejnych tygodni */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Koszt za każdy kolejny tydzień (od tygodnia {prices.base_weeks + 1})
            </h2>
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
                    const isThreshold = week === prices.threshold_weeks;
                    const isPhase2Start = week === prices.threshold_weeks + 1;
                    return (
                      <>
                        {isPhase2Start && (
                          <tr key={`divider-${week}`}>
                            <td colSpan={5} className="px-4 py-1.5 bg-orange-50 text-orange-700 text-xs font-medium border-t border-orange-200">
                              ↓ Od tygodnia {week} obowiązuje niższa stawka ({formatPLN(prices.price_per_week_2)} PLN/t/tydz.)
                            </td>
                          </tr>
                        )}
                        <tr
                          key={week}
                          onClick={() => setRentalWeeks(week)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50 font-semibold ring-1 ring-inset ring-blue-300'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-2.5 text-gray-700">
                            {week} tyg.
                            {isThreshold && (
                              <span className="ml-2 text-xs text-orange-600 font-normal">(≈4 miesiące)</span>
                            )}
                            {isSelected && (
                              <span className="ml-2 text-xs text-blue-600 font-normal">← wybrany</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            + {formatPLN(weekRate)} PLN
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                            {formatPLN(cost)} PLN
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600">
                            {formatPLN(costPerM2)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500 hidden md:table-cell">
                            {formatPLN(costPerTon)}
                          </td>
                        </tr>
                      </>
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
          Wypełnij wszystkie pola powyżej, aby zobaczyć wyniki kalkulacji.
        </div>
      )}

      {/* Modal zapisu oferty */}
      {showSaveModal && selectedProfile && result && (
        <SaveOfferModal
          clients={clients}
          profile={selectedProfile}
          quantity={quantity}
          lengthM={lengthM}
          rentalWeeks={rentalWeeks}
          result={result}
          onClientAdded={onClientAdded}
          onSaved={(offer) => {
            onOfferSaved(offer);
            setShowSaveModal(false);
          }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

interface ResultCardProps {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}

function ResultCard({ label, value, unit, highlight = false }: ResultCardProps) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-blue-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${highlight ? 'text-blue-200' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${highlight ? 'text-blue-300' : 'text-gray-400'}`}>{unit}</p>
    </div>
  );
}
