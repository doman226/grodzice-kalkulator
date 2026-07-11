import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client, BeamProfile, BeamSalePrices, BeamSaleOffer } from '../../../types';
import BeamSaleCalculator from './BeamSaleCalculator';
import BeamSaleOffersTable from './BeamSaleOffersTable';
import BeamSalePriceSettings from './BeamSalePriceSettings';
import ClientsTable from '../../ClientsTable';

// Komponent kontrolowany — analogicznie do BeamRentalSection / RoadPlateSaleSection.
// Ładuje własne dane (beam_profiles [wspólny katalog z wynajmem OH — tylko odczyt],
// beam_sale_prices, beam_sale_offers) i renderuje 4 zakładki.
// App.tsx steruje activeTab / offersCount.

export type BeamSaleTab = 'calculator' | 'offers' | 'clients' | 'prices';

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onClientsChange: (clients: Client[]) => void;
  activeTab: BeamSaleTab;
  onTabChange: (tab: BeamSaleTab) => void;
  onOffersCountChange: (count: number) => void;
}

export default function BeamSaleSection({
  clients, onClientAdded, onClientsChange,
  activeTab, onTabChange, onOffersCountChange,
}: Props) {
  const [profiles, setProfiles] = useState<BeamProfile[]>([]);
  const [prices, setPrices]     = useState<BeamSalePrices | null>(null);
  const [offers, setOffers]     = useState<BeamSaleOffer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [profilesRes, pricesRes, offersRes] = await Promise.all([
        supabase.from('beam_profiles').select('*').eq('active', true).order('series').order('name'),
        supabase.from('beam_sale_prices').select('*').single(),
        supabase
          .from('beam_sale_offers')
          .select('*, client:clients(*), items:beam_sale_offer_items(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      if (offersRes.error) {
        const msg = (offersRes.error.message || '').toLowerCase();
        const tableMissing =
          offersRes.error.code === 'PGRST205' ||
          offersRes.error.code === '42P01' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table');
        if (tableMissing) {
          setError('Migracja SQL beam_sale jeszcze nie wykonana. Uruchom docs/migrations/2026-07-10-beam-sale.sql w Supabase.');
        } else {
          setError('Błąd ładowania ofert sprzedaży dwuteowników: ' + offersRes.error.message);
        }
        setOffers([]);
        onOffersCountChange(0);
      } else {
        const offs = (offersRes.data ?? []) as BeamSaleOffer[];
        setOffers(offs);
        onOffersCountChange(offs.length);
      }

      if (!profilesRes.error && profilesRes.data) {
        setProfiles(profilesRes.data as BeamProfile[]);
      }
      if (!pricesRes.error && pricesRes.data) {
        setPrices(pricesRes.data as BeamSalePrices);
      }
    } catch (e) {
      setError('Błąd ładowania danych sprzedaży dwuteowników: ' + (e instanceof Error ? e.message : String(e)));
      setOffers([]);
      onOffersCountChange(0);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: BeamSaleOffer) {
    setOffers(prev => {
      const updated = [offer, ...prev];
      onOffersCountChange(updated.length);
      return updated;
    });
    onTabChange('offers');
  }

  const spinner = (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  return (
    <div>
      {activeTab === 'calculator' && (
        loading ? spinner : (prices && profiles.length > 0 ? (
          <BeamSaleCalculator
            profiles={profiles}
            prices={prices}
            clients={clients}
            onClientAdded={onClientAdded}
            onOfferSaved={handleOfferSaved}
          />
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Brak danych do kalkulatora</h2>
            <p className="text-sm text-red-700">
              {profiles.length === 0
                ? 'Dodaj przynajmniej jeden profil w zakładce Wynajem → Dwuteowniki → Profile dwuteowników (wspólny katalog).'
                : 'Brak cennika — uruchom migrację SQL beam_sale.'}
            </p>
          </div>
        ))
      )}

      {activeTab === 'offers' && (
        loading ? spinner : error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800 text-sm">
            <strong>Uwaga:</strong> {error}
            <button onClick={loadData} className="ml-3 underline text-blue-700">Spróbuj ponownie</button>
          </div>
        ) : (
          <BeamSaleOffersTable
            offers={offers}
            onOffersChange={(next) => { setOffers(next); onOffersCountChange(next.length); }}
            clients={clients}
            profiles={profiles}
            onClientAdded={onClientAdded}
          />
        )
      )}

      {activeTab === 'clients' && (
        <ClientsTable clients={clients} onClientsChange={onClientsChange} />
      )}

      {activeTab === 'prices' && (
        loading ? spinner : (prices ? (
          <BeamSalePriceSettings prices={prices} onPricesChange={setPrices} />
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Brak cennika sprzedaży dwuteowników</h2>
            <p className="text-sm text-red-700">Uruchom migrację SQL <code>docs/migrations/2026-07-10-beam-sale.sql</code></p>
          </div>
        ))
      )}
    </div>
  );
}
