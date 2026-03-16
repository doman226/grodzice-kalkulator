import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Profile, RentalPrices, Client, Offer } from './types';
import Calculator from './components/Calculator';
import ProfileTable from './components/ProfileTable';
import PriceSettings from './components/PriceSettings';
import ClientsTable from './components/ClientsTable';
import OffersTable from './components/OffersTable';
import { formatPLN } from './lib/calculations';

type Tab = 'calculator' | 'profiles' | 'prices' | 'clients' | 'offers';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('calculator');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prices, setPrices] = useState<RentalPrices | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, pricesRes, clientsRes, offersRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('active', true).order('name'),
        supabase.from('rental_prices').select('*').single(),
        supabase.from('clients').select('*').eq('active', true).order('name'),
        supabase.from('offers').select('*, client:clients(*)').order('created_at', { ascending: false }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (offersRes.error) throw offersRes.error;

      setProfiles(profilesRes.data as Profile[]);
      setPrices(pricesRes.data as RentalPrices);
      setClients(clientsRes.data as Client[]);
      setOffers(offersRes.data as Offer[]);
    } catch (err) {
      setError('Błąd podczas ładowania danych. Sprawdź połączenie z bazą danych.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleOfferSaved(offer: Offer) {
    setOffers(prev => [offer, ...prev]);
    setActiveTab('offers');
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'calculator', label: 'Kalkulator' },
    { id: 'clients', label: 'Klienci', badge: clients.length || undefined },
    { id: 'offers', label: 'Oferty', badge: offers.length || undefined },
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
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-white text-white bg-blue-800'
                    : 'border-transparent text-blue-200 hover:text-white hover:bg-blue-800'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === tab.id ? 'bg-white text-blue-900' : 'bg-blue-700 text-blue-100'
                  }`}>
                    {tab.badge}
                  </span>
                )}
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
            <button onClick={loadData} className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'calculator' && prices && (
              <Calculator
                profiles={profiles}
                prices={prices}
                clients={clients}
                onClientAdded={(c) => setClients(prev => [...prev, c])}
                onOfferSaved={handleOfferSaved}
              />
            )}
            {activeTab === 'clients' && (
              <ClientsTable clients={clients} onClientsChange={setClients} />
            )}
            {activeTab === 'offers' && (
              <OffersTable offers={offers} onOffersChange={setOffers} />
            )}
            {activeTab === 'profiles' && (
              <ProfileTable profiles={profiles} onProfilesChange={setProfiles} />
            )}
            {activeTab === 'prices' && prices && (
              <PriceSettings prices={prices} onPricesChange={setPrices} />
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
