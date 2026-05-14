import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import type { Profile, RentalPrices, Client, Offer, RoadPlateProfile, RoadPlateRentalPrices } from './types';
import Calculator from './components/Calculator';
import ProfileTable from './components/ProfileTable';
import PriceSettings from './components/PriceSettings';
import ClientsTable from './components/ClientsTable';
import OffersTable from './components/OffersTable';
import RoadPlateProfilesTable from './components/RoadPlateProfilesTable';
import RoadPlatePriceSettings from './components/RoadPlatePriceSettings';
import RoadPlateCalculator from './components/RoadPlateCalculator';
import SaleSection from './components/sale/SaleSection';
import PipeSaleSection from './components/sale/pipe/PipeSaleSection';
import type { PipeSaleTab } from './components/sale/pipe/PipeSaleSection';

type Mode = 'rental' | 'sale';
type RentalSubMode = 'sheet_pile' | 'road_plate';
type SaleSubMode = 'sheet_pile' | 'pipe';
type Tab = 'calculator' | 'profiles' | 'prices' | 'clients' | 'offers';
type SaleTab = 'calculator' | 'offers' | 'clients' | 'prices' | 'profiles';

function App() {
  const [mode, setMode] = useState<Mode>('rental');
  const [rentalSubMode, setRentalSubMode] = useState<RentalSubMode>('sheet_pile');
  const [saleSubMode, setSaleSubMode]     = useState<SaleSubMode>('sheet_pile');
  const [activeTab, setActiveTab]         = useState<Tab>('calculator');
  const [saleActiveTab, setSaleActiveTab] = useState<SaleTab>('calculator');
  const [pipeSaleActiveTab, setPipeSaleActiveTab] = useState<PipeSaleTab>('calculator');
  const [saleOffersCount, setSaleOffersCount] = useState(0);
  const [pipeSaleOffersCount, setPipeSaleOffersCount] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prices, setPrices] = useState<RentalPrices | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  // Płyty drogowe — ładowane osobno, ignorujemy błąd jeśli migracja SQL jeszcze nie wykonana
  const [roadPlateProfiles, setRoadPlateProfiles] = useState<RoadPlateProfile[]>([]);
  const [roadPlatePrices, setRoadPlatePrices] = useState<RoadPlateRentalPrices | null>(null);
  const [roadPlateOffers, setRoadPlateOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    let cancelled = false;

    try {
      const [profilesRes, pricesRes, clientsRes, offersRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('active', true).order('name'),
        supabase.from('rental_prices').select('*').single(),
        supabase.from('clients').select('*').eq('active', true).order('name'),
        supabase.from('offers').select('*, client:clients(*), items:offer_items(*)').eq('item_type', 'sheet_pile').order('created_at', { ascending: false }),
      ]);

      if (cancelled) return;

      if (profilesRes.error) throw profilesRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (offersRes.error) throw offersRes.error;

      setProfiles(profilesRes.data as Profile[]);
      setPrices(pricesRes.data as RentalPrices);
      setClients(clientsRes.data as Client[]);
      setOffers(offersRes.data as Offer[]);
    } catch (err) {
      if (!cancelled) {
        setError('Błąd podczas ładowania danych. Sprawdź połączenie z bazą danych.');
        console.error(err);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    // Płyty drogowe — osobne ładowanie, niekrytyczne (migracja SQL może być jeszcze niewykonana)
    try {
      const [rpProfilesRes, rpPricesRes, rpOffersRes] = await Promise.all([
        supabase.from('road_plate_profiles').select('*').eq('active', true).order('thickness_mm', { ascending: false }),
        supabase.from('road_plate_rental_prices').select('*').single(),
        supabase.from('offers').select('*, client:clients(*), items:offer_items(*)').eq('item_type', 'road_plate').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      if (!rpProfilesRes.error && rpProfilesRes.data) {
        setRoadPlateProfiles(rpProfilesRes.data as RoadPlateProfile[]);
      }
      if (!rpPricesRes.error && rpPricesRes.data) {
        setRoadPlatePrices(rpPricesRes.data as RoadPlateRentalPrices);
      }
      if (!rpOffersRes.error && rpOffersRes.data) {
        setRoadPlateOffers(rpOffersRes.data as Offer[]);
      }
    } catch {
      // Tabele road_plate_* jeszcze nie istnieją — migracja oczekuje wykonania
    }

    // Zwróć funkcję czyszczącą (do użycia przez wywołującego jeśli potrzeba)
    return () => { cancelled = true; };
  }

  function handleOfferSaved(offer: Offer) {
    // Routing per item_type: oferty płyt idą do osobnego stanu, grodzice do oryginalnego.
    if (offer.item_type === 'road_plate') {
      setRoadPlateOffers(prev => [offer, ...prev]);
    } else {
      setOffers(prev => [offer, ...prev]);
    }
    setActiveTab('offers');
  }

  const offersBadgeCount = rentalSubMode === 'road_plate' ? roadPlateOffers.length : offers.length;
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'calculator', label: 'Kalkulator' },
    { id: 'offers',     label: 'Oferty',          badge: offersBadgeCount || undefined },
    { id: 'clients',    label: 'Klienci',        badge: clients.length || undefined },
    { id: 'profiles',   label: rentalSubMode === 'road_plate' ? 'Profile płyt' : 'Profile grodzic' },
    { id: 'prices',     label: 'Ustawienia cen' },
  ];

  const saleTabs: { id: SaleTab; label: string; badge?: number }[] = [
    { id: 'calculator', label: 'Kalkulator' },
    { id: 'offers',     label: 'Oferty SP',  badge: saleOffersCount  || undefined },
    { id: 'clients',    label: 'Klienci',    badge: clients.length   || undefined },
    { id: 'prices',     label: 'Cennik' },
    { id: 'profiles',   label: 'Profile' },
  ];

  // Faza 2: rury mają kalkulator, oferty SR i klientów.
  const pipeSaleTabs: { id: PipeSaleTab; label: string; badge?: number }[] = [
    { id: 'calculator', label: 'Kalkulator' },
    { id: 'offers',     label: 'Oferty SR',  badge: pipeSaleOffersCount || undefined },
    { id: 'clients',    label: 'Klienci',    badge: clients.length        || undefined },
  ];

  // Wspólna lista zakładek dla nawigacji — string id, bo trzy różne discriminated unions.
  const currentTabs: { id: string; label: string; badge?: number }[] =
    mode === 'rental'
      ? tabs
      : saleSubMode === 'pipe'
        ? pipeSaleTabs
        : saleTabs;

  const currentActiveTab: string =
    mode === 'rental'
      ? activeTab
      : saleSubMode === 'pipe'
        ? pipeSaleActiveTab
        : saleActiveTab;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-md px-2 py-1 shadow-sm">
                <img src="/header-logo.png" alt="Intra B.V." className="h-10 w-auto" />
              </div>
              <p className="text-blue-200 text-sm">
                {mode === 'sale'
                  ? (saleSubMode === 'pipe'
                      ? 'Kalkulator Sprzedaży Rur Stalowych'
                      : 'Kalkulator Sprzedaży Grodzic Stalowych')
                  : rentalSubMode === 'road_plate'
                  ? 'Kalkulator Wynajmu Płyt Drogowych'
                  : 'Kalkulator Wynajmu Grodzic Stalowych'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Toggle WYNAJEM / SPRZEDAŻ */}
              <div className="flex rounded-lg overflow-hidden border border-blue-600 text-sm font-semibold">
                <button
                  onClick={() => setMode('rental')}
                  className={`px-4 py-2 transition-colors ${
                    mode === 'rental'
                      ? 'bg-white text-blue-900'
                      : 'bg-transparent text-blue-200 hover:bg-blue-800'
                  }`}
                >
                  Wynajem
                </button>
                <button
                  onClick={() => setMode('sale')}
                  className={`px-4 py-2 transition-colors ${
                    mode === 'sale'
                      ? 'bg-white text-blue-900'
                      : 'bg-transparent text-blue-200 hover:bg-blue-800'
                  }`}
                >
                  Sprzedaż
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-toggle GRODZICE / PŁYTY DROGOWE — widoczny tylko w trybie wynajmu */}
        {mode === 'rental' && (
          <div className="max-w-7xl mx-auto px-4 pb-3">
            <div className="flex rounded-lg overflow-hidden border border-blue-700 text-xs font-medium w-fit">
              <button
                onClick={() => setRentalSubMode('sheet_pile')}
                className={`px-4 py-1.5 transition-colors ${
                  rentalSubMode === 'sheet_pile'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
                }`}
              >
                Grodzice
              </button>
              <button
                onClick={() => setRentalSubMode('road_plate')}
                className={`px-4 py-1.5 transition-colors ${
                  rentalSubMode === 'road_plate'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
                }`}
              >
                Płyty drogowe
              </button>
            </div>
          </div>
        )}

        {/* Sub-toggle GRODZICE / RURY STALOWE — widoczny tylko w trybie sprzedaży */}
        {mode === 'sale' && (
          <div className="max-w-7xl mx-auto px-4 pb-3">
            <div className="flex rounded-lg overflow-hidden border border-blue-700 text-xs font-medium w-fit">
              <button
                onClick={() => setSaleSubMode('sheet_pile')}
                className={`px-4 py-1.5 transition-colors ${
                  saleSubMode === 'sheet_pile'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
                }`}
              >
                Grodzice
              </button>
              <button
                onClick={() => setSaleSubMode('pipe')}
                className={`px-4 py-1.5 transition-colors ${
                  saleSubMode === 'pipe'
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
                }`}
              >
                Rury stalowe
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {currentTabs.map((tab) => {
              const isActive = currentActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (mode === 'rental') setActiveTab(tab.id as Tab);
                    else if (saleSubMode === 'pipe') setPipeSaleActiveTab(tab.id as PipeSaleTab);
                    else setSaleActiveTab(tab.id as SaleTab);
                  }}
                  className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? 'border-white text-white bg-blue-800'
                      : 'border-transparent text-blue-200 hover:text-white hover:bg-blue-800'
                  }`}
                >
                  {tab.label}
                  {tab.badge !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive ? 'bg-white text-blue-900' : 'bg-blue-700 text-blue-100'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
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
        ) : mode === 'sale' ? (
          saleSubMode === 'pipe' ? (
            <PipeSaleSection
              clients={clients}
              onClientAdded={(c) => setClients(prev => [...prev, c])}
              onClientsChange={setClients}
              activeTab={pipeSaleActiveTab}
              onTabChange={setPipeSaleActiveTab}
              onOffersCountChange={setPipeSaleOffersCount}
            />
          ) : (
            <SaleSection
              clients={clients}
              onClientAdded={(c) => setClients(prev => [...prev, c])}
              onClientsChange={setClients}
              activeTab={saleActiveTab}
              onTabChange={setSaleActiveTab}
              onOffersCountChange={setSaleOffersCount}
            />
          )
        ) : rentalSubMode === 'road_plate' ? (
          <>
            {activeTab === 'calculator' && (
              roadPlatePrices && roadPlateProfiles.length > 0 ? (
                <RoadPlateCalculator
                  profiles={roadPlateProfiles}
                  prices={roadPlatePrices}
                  clients={clients}
                  onClientAdded={(c) => setClients(prev => [...prev, c])}
                  onOfferSaved={handleOfferSaved}
                />
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                  <h2 className="text-lg font-semibold text-red-800 mb-2">Brak danych do kalkulatora</h2>
                  <p className="text-sm text-red-700">
                    {roadPlateProfiles.length === 0 ? 'Dodaj przynajmniej jeden profil w zakładce "Profile płyt".' : 'Brak cennika — uruchom migrację SQL.'}
                  </p>
                </div>
              )
            )}
            {activeTab === 'offers' && prices && (
              <OffersTable
                offers={roadPlateOffers}
                onOffersChange={setRoadPlateOffers}
                profiles={profiles}
                prices={prices}
                clients={clients}
                itemType="road_plate"
                roadPlateProfiles={roadPlateProfiles}
                roadPlatePrices={roadPlatePrices ?? undefined}
              />
            )}
            {activeTab === 'clients' && (
              <ClientsTable clients={clients} onClientsChange={setClients} />
            )}
            {activeTab === 'profiles' && (
              <RoadPlateProfilesTable profiles={roadPlateProfiles} onProfilesChange={setRoadPlateProfiles} />
            )}
            {activeTab === 'prices' && (
              roadPlatePrices ? (
                <RoadPlatePriceSettings prices={roadPlatePrices} onPricesChange={setRoadPlatePrices} />
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                  <h2 className="text-lg font-semibold text-red-800 mb-2">Brak cennika płyt drogowych</h2>
                  <p className="text-sm text-red-700">Uruchom migrację SQL z <code>docs/migrations/2026-04-27-road-plates.sql</code></p>
                </div>
              )
            )}
          </>
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
            {activeTab === 'offers' && prices && (
              <OffersTable
                offers={offers}
                onOffersChange={setOffers}
                profiles={profiles}
                prices={prices}
                clients={clients}
              />
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

      <footer className="mt-12 border-t border-gray-200 py-6 text-center text-xs text-gray-400 space-y-1">
        <p>© {new Date().getFullYear()} Intra B.V. – Dane techniczne wg Katalogu Intra BV 2025</p>
        <p>wszelkie prawa zastrzeżone · autor: Piotr Domański</p>
      </footer>
    </div>
  );
}

export default App;
