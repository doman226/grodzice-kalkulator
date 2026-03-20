import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client, SaleOffer, SaleProfile } from '../../types';
import SaleCalculator from './SaleCalculator';
import SalePriceMatrix from './SalePriceMatrix';
import SaleProfilesTable from './SaleProfilesTable';
import SaleOffersTable from './SaleOffersTable';
import ClientsTable from '../ClientsTable';

type SaleTab = 'calculator' | 'offers' | 'clients' | 'prices' | 'profiles';

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onClientsChange: (clients: Client[]) => void;
  activeTab: SaleTab;
  onTabChange: (tab: SaleTab) => void;
  onOffersCountChange: (count: number) => void;
}

export default function SaleSection({ clients, onClientAdded, onClientsChange, activeTab, onTabChange, onOffersCountChange }: Props) {
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
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error || offersRes.error) {
      setError('Błąd ładowania danych.');
    } else {
      setProfiles(profilesRes.data as SaleProfile[]);
      const offers = offersRes.data as SaleOffer[];
      setSaleOffers(offers);
      onOffersCountChange(offers.length);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: SaleOffer) {
    setSaleOffers(prev => {
      const updated = [offer, ...prev];
      onOffersCountChange(updated.length);
      return updated;
    });
    onTabChange('offers');
  }

  function handleOffersChange(offers: SaleOffer[]) {
    setSaleOffers(offers);
    onOffersCountChange(offers.length);
  }

  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center text-red-700 text-sm">
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
          {activeTab === 'offers' && (
            <SaleOffersTable
              offers={saleOffers}
              onOffersChange={handleOffersChange}
              clients={clients}
              saleProfiles={profiles}
              onClientAdded={onClientAdded}
            />
          )}
          {activeTab === 'clients'  && (
            <ClientsTable clients={clients} onClientsChange={onClientsChange} />
          )}
          {activeTab === 'prices'   && <SalePriceMatrix />}
          {activeTab === 'profiles' && (
            <SaleProfilesTable profiles={profiles} onProfilesChange={setProfiles} />
          )}
        </>
      )}
    </div>
  );
}
