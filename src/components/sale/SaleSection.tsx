import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client, SaleOffer, SaleProfile } from '../../types';
import SaleCalculator from './SaleCalculator';
import SalePriceMatrix from './SalePriceMatrix';
import SaleProfilesTable from './SaleProfilesTable';
import SaleOffersTable from './SaleOffersTable';

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
}

type SaleTab = 'calculator' | 'prices' | 'profiles' | 'offers';

const SALE_TABS: { id: SaleTab; label: string }[] = [
  { id: 'calculator', label: 'Kalkulator' },
  { id: 'prices',     label: 'Cennik' },
  { id: 'profiles',   label: 'Profile VL' },
  { id: 'offers',     label: 'Oferty SP' },
];

export default function SaleSection({ clients, onClientAdded }: Props) {
  const [activeTab, setActiveTab]   = useState<SaleTab>('calculator');
  const [profiles, setProfiles]     = useState<SaleProfile[]>([]);
  const [saleOffers, setSaleOffers] = useState<SaleOffer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    const [profilesRes, offersRes] = await Promise.all([
      supabase.from('sale_profiles').select('*').order('name'),
      supabase
        .from('sale_offers')
        .select('*, client:clients(*), items:sale_offer_items(*)')
        .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error || offersRes.error) {
      setError('Błąd ładowania danych.');
    } else {
      setProfiles(profilesRes.data as SaleProfile[]);
      setSaleOffers(offersRes.data as SaleOffer[]);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: SaleOffer) {
    setSaleOffers(prev => [offer, ...prev]);
    setActiveTab('offers');
  }

  const offersCount = saleOffers.length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Nawigacja */}
        <div className="flex border-b border-gray-200">
          {SALE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-blue-700 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.id === 'offers' && offersCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === 'offers' ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {offersCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 text-sm text-center">
              {error}
              <button onClick={loadData} className="ml-3 underline">Spróbuj ponownie</button>
            </div>
          ) : (
            <>
              {activeTab === 'calculator' && (
                <SaleCalculator
                  clients={clients}
                  onClientAdded={onClientAdded}
                  onOfferSaved={handleOfferSaved}
                />
              )}
              {activeTab === 'prices'   && <SalePriceMatrix />}
              {activeTab === 'profiles' && (
                <SaleProfilesTable profiles={profiles} onProfilesChange={setProfiles} />
              )}
              {activeTab === 'offers'   && (
                <SaleOffersTable
                  offers={saleOffers}
                  onOffersChange={setSaleOffers}
                  clients={clients}
                  saleProfiles={profiles}
                  onClientAdded={onClientAdded}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
