import { useState, useMemo } from 'react';
import type { Profile, RentalPrices } from '../types';
import { calculate, calculateRentalCost, COMPARISON_WEEKS, formatPLN, formatNumber } from '../lib/calculations';

interface Props {
  profiles: Profile[];
  prices: RentalPrices;
}

export default function Calculator({ profiles, prices }: Props) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const [quantity, setQuantity] = useState<number>(10);
  const [lengthM, setLengthM] = useState<number>(12);
  const [rentalWeeks, setRentalWeeks] = useState<number>(8);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId]
  );

  const result = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0 || rentalWeeks <= 0) return null;
    return calculate(quantity, lengthM, selectedProfile.weight_kg_per_m, selectedProfile.width_mm, rentalWeeks, prices);
  }, [selectedProfile, quantity, lengthM, rentalWeeks, prices]);

  const comparisonData = useMemo(() => {
    if (!selectedProfile || quantity <= 0 || lengthM <= 0) return [];
    const totalLengthM = quantity * lengthM;
    const massT = (totalLengthM * selectedProfile.weight_kg_per_m) / 1000;
    return COMPARISON_WEEKS.map((weeks) => ({
      weeks,
      cost: calculateRentalCost(massT, weeks, prices),
      massT,
    }));
  }, [selectedProfile, quantity, lengthM, prices]);

  const isValid = selectedProfile && quantity > 0 && lengthM > 0 && rentalWeeks > 0;

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Wyniki kalkulacji</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <ResultCard
              label="Całkowita długość"
              value={formatNumber(result.totalLengthM, 2)}
              unit="m"
            />
            <ResultCard
              label="Masa całkowita"
              value={formatNumber(result.massT, 3)}
              unit="t"
            />
            <ResultCard
              label="Powierzchnia ścianki"
              value={formatNumber(result.wallAreaM2, 2)}
              unit="m²"
            />
            <ResultCard
              label="Koszt wynajmu"
              value={formatPLN(result.rentalCostPLN)}
              unit="PLN"
              highlight
            />
            <ResultCard
              label="Koszt / m²"
              value={formatPLN(result.costPerM2)}
              unit="PLN/m²"
            />
            <ResultCard
              label="Koszt / tonę"
              value={formatPLN(result.costPerTon)}
              unit="PLN/t"
            />
          </div>

          {/* Zestawienie cenowe */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Zestawienie cenowe
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 rounded-tl-lg">Okres</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Koszt [PLN]</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 rounded-tr-lg">PLN/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map(({ weeks, cost, massT: mass }) => {
                    const wallArea = quantity * lengthM * ((selectedProfile?.width_mm ?? 600) / 1000);
                    const isSelected = weeks === rentalWeeks;
                    return (
                      <tr
                        key={weeks}
                        className={`border-t border-gray-100 ${isSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}`}
                        onClick={() => setRentalWeeks(weeks)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="px-4 py-2 text-gray-700">
                          {weeks} tyg.
                          {weeks === prices.base_weeks && (
                            <span className="ml-2 text-xs text-blue-600 font-normal">(minimum)</span>
                          )}
                          {weeks === prices.threshold_weeks && (
                            <span className="ml-2 text-xs text-orange-600 font-normal">(4 miesiące)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-800">{formatPLN(cost)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {wallArea > 0 ? formatPLN(cost / wallArea) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-400 text-xs hidden md:table-cell">
                          {mass > 0 ? `${formatPLN(cost / mass)} PLN/t` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">Kliknij wiersz aby wybrać okres wynajmu</p>
          </div>
        </div>
      )}

      {!isValid && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-yellow-700 text-sm text-center">
          Wypełnij wszystkie pola powyżej, aby zobaczyć wyniki kalkulacji.
        </div>
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
