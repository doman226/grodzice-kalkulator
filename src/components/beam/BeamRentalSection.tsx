import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client, BeamProfile, BeamRentalPrices, BeamRentalOffer } from '../../types';
import BeamCalculator from './BeamCalculator';
import BeamOffersTable from './BeamOffersTable';
import BeamProfilesTable from './BeamProfilesTable';
import BeamPriceSettings from './BeamPriceSettings';
import ClientsTable from '../ClientsTable';

// Komponent kontrolowany — analogicznie do RoadPlateSaleSection / PipeSaleSection.
// Ładuje własne dane (beam_profiles, beam_rental_prices, beam_rental_offers)
// i renderuje 5 zakładek. App.tsx steruje activeTab / offersCount.

export type BeamRentalTab = 'calculator' | 'offers' | 'clients' | 'profiles' | 'prices';

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onClientsChange: (clients: Client[]) => void;
  activeTab: BeamRentalTab;
  onTabChange: (tab: BeamRentalTab) => void;
  onOffersCountChange: (count: number) => void;
}

export default function BeamRentalSection({
  clients, onClientAdded, onClientsChange,
  activeTab, onTabChange, onOffersCountChange,
}: Props) {
  const [profiles, setProfiles] = useState<BeamProfile[]>([]);
  const [prices, setPrices]     = useState<BeamRentalPrices | null>(null);
  const [offers, setOffers]     = useState<BeamRentalOffer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [profilesRes, pricesRes, offersRes] = await Promise.all([
        supabase.from('beam_profiles').select('*').eq('active', true).order('series').order('name'),
        supabase.from('beam_rental_prices').select('*').single(),
        supabase
          .from('beam_rental_offers')
          .select('*, client:clients(*), items:beam_rental_offer_items(*)')
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
          setError('Migracja SQL beam_rental jeszcze nie wykonana. Uruchom docs/migrations/2026-07-07-beam-rental.sql w Supabase.');
        } else {
          setError('Błąd ładowania ofert dwuteowników: ' + offersRes.error.message);
        }
        setOffers([]);
        onOffersCountChange(0);
      } else {
        const offs = (offersRes.data ?? []) as BeamRentalOffer[];
        setOffers(offs);
        onOffersCountChange(offs.length);
      }

      if (!profilesRes.error && profilesRes.data) {
        setProfiles(profilesRes.data as BeamProfile[]);
      }
      if (!pricesRes.error && pricesRes.data) {
        setPrices(pricesRes.data as BeamRentalPrices);
      }
    } catch (e) {
      setError('Błąd ładowania danych dwuteowników: ' + (e instanceof Error ? e.message : String(e)));
      setOffers([]);
      onOffersCountChange(0);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: BeamRentalOffer) {
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
          <BeamCalculator
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
              {profiles.length === 0 ? 'Dodaj przynajmniej jeden profil w zakładce „Profile dwuteowników".' : 'Brak cennika — uruchom migrację SQL beam_rental.'}
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
        ) : prices ? (
          <BeamOffersTable
            offers={offers}
            onOffersChange={(next) => { setOffers(next); onOffersCountChange(next.length); }}
            profiles={profiles}
            prices={prices}
            clients={clients}
          />
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800 text-sm">Brak cennika — uruchom migrację SQL.</div>
        )
      )}

      {activeTab === 'clients' && (
        <ClientsTable clients={clients} onClientsChange={onClientsChange} />
      )}

      {activeTab === 'profiles' && (
        loading ? spinner : (
          <BeamProfilesTable profiles={profiles} onProfilesChange={setProfiles} />
        )
      )}

      {activeTab === 'prices' && (
        loading ? spinner : (prices ? (
          <BeamPriceSettings prices={prices} onPricesChange={setPrices} />
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Brak cennika dwuteowników</h2>
            <p className="text-sm text-red-700">Uruchom migrację SQL <code>docs/migrations/2026-07-07-beam-rental.sql</code></p>
          </div>
        ))
      )}
    </div>
  );
}
