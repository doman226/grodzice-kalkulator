import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Profile, RentalPrices } from './types';
import Calculator from './components/Calculator';
import ProfileTable from './components/ProfileTable';
import PriceSettings from './components/PriceSettings';
import { formatPLN } from './lib/calculations';

type Tab = 'calculator' | 'profiles' | 'prices';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('calculator');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prices, setPrices] = useState<RentalPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, pricesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('active', true).order('name'),
        supabase.from('rental_prices').select('*').single(),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (pricesRes.error) throw pricesRes.error;

      setProfiles(profilesRes.data as Profile[]);
      setPrices(pricesRes.data as RentalPrices);
    } catch (err) {
      setError('Błąd podczas ładowania danych. Sprawdź połączenie z bazą danych.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'calculator', label: 'Kalkulator' },
    { id: 'profiles', label: 'Profile grodzic' },
    { id: 'prices', label: 'Ustawienia cen' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-wide">Intra B.V.</h1>
              <p className="text-blue-200 text-sm">Kalkulator Wynajmu Grodzic Stalowych</p>
            </div>
            {prices && (
              <div className="inline-flex items-center bg-blue-800 rounded-full px-4 py-1.5 text-sm font-medium">
                <span className="text-blue-300 mr-1">Aktualna stawka:</span>
                <span className="text-white font-bold">
                  {formatPLN(prices.base_price_pln)} PLN/t za {prices.base_weeks} tyg.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-white text-white bg-blue-800'
                    : 'border-transparent text-blue-200 hover:text-white hover:bg-blue-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto mb-4" />
              <p className="text-gray-500">Ładowanie danych...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center">
            <p className="text-red-700 font-medium">{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'calculator' && prices && (
              <Calculator profiles={profiles} prices={prices} />
            )}
            {activeTab === 'profiles' && (
              <ProfileTable
                profiles={profiles}
                onProfilesChange={setProfiles}
              />
            )}
            {activeTab === 'prices' && prices && (
              <PriceSettings
                prices={prices}
                onPricesChange={setPrices}
              />
            )}
          </>
        )}
      </main>

      <footer className="mt-12 border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Intra B.V. – Dane techniczne wg Katalogu Intra BV 2025
      </footer>
    </div>
  );
}

export default App;
