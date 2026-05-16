import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client, RoadPlateProfile, RoadPlateSaleOffer, RoadPlateSalePrice } from '../../../types';
import RoadPlateSaleCalculator from './RoadPlateSaleCalculator';
import RoadPlateSaleOffersTable from './RoadPlateSaleOffersTable';
import ClientsTable from '../../ClientsTable';

// Komponent kontrolowany — analogicznie do PipeSaleSection i SaleSection.
// Etap 5: dodana pełna tabela ofert (RoadPlateSaleOffersTable) + edit modal.
// Etap 7 doda prices i profiles.

export type RoadPlateSaleTab = 'calculator' | 'offers' | 'clients';

interface Props {
  clients: Client[];
  profiles: RoadPlateProfile[];
  onClientAdded: (c: Client) => void;
  onClientsChange: (clients: Client[]) => void;
  activeTab: RoadPlateSaleTab;
  onTabChange: (tab: RoadPlateSaleTab) => void;
  onOffersCountChange: (count: number) => void;
}

export default function RoadPlateSaleSection({
  clients, profiles, onClientAdded, onClientsChange,
  activeTab, onTabChange, onOffersCountChange,
}: Props) {
  const [offers, setOffers]   = useState<RoadPlateSaleOffer[]>([]);
  const [prices, setPrices]   = useState<RoadPlateSalePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    // Tabele road_plate_sale_* mogą jeszcze nie istnieć (przed wykonaniem migracji SQL).
    // Wzorzec wykrywania "tabela nieistnieje" identyczny jak w PipeSaleSection.
    try {
      const [offersRes, pricesRes] = await Promise.all([
        supabase
          .from('road_plate_sale_offers')
          .select('*, client:clients(*), items:road_plate_sale_offer_items(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('road_plate_sale_prices')
          .select('*'),
      ]);

      // Najpierw oferty
      if (offersRes.error) {
        const msg = (offersRes.error.message || '').toLowerCase();
        const tableMissing =
          offersRes.error.code === 'PGRST205' ||
          offersRes.error.code === '42P01' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table');

        if (tableMissing) {
          setError('Migracja SQL road_plate_sale jeszcze nie wykonana. Uruchom docs/migrations/2026-05-16-road-plate-sale.sql w Supabase SQL Editor.');
        } else {
          setError('Błąd ładowania ofert płyt: ' + offersRes.error.message);
        }
        setOffers([]);
        onOffersCountChange(0);
      } else {
        const offs = (offersRes.data ?? []) as RoadPlateSaleOffer[];
        setOffers(offs);
        onOffersCountChange(offs.length);
      }

      // Potem cennik (niekrytyczny — kalkulator zadziała bez auto-lookup, sell wpisany ręcznie)
      if (!pricesRes.error && pricesRes.data) {
        setPrices(pricesRes.data as RoadPlateSalePrice[]);
      }
    } catch (e) {
      setError('Błąd ładowania danych płyt: ' + (e instanceof Error ? e.message : String(e)));
      setOffers([]);
      onOffersCountChange(0);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: RoadPlateSaleOffer) {
    setOffers(prev => {
      const updated = [offer, ...prev];
      onOffersCountChange(updated.length);
      return updated;
    });
    onTabChange('offers');
  }

  return (
    <div>
      {activeTab === 'calculator' && (
        <RoadPlateSaleCalculator
          clients={clients}
          profiles={profiles}
          prices={prices}
          onClientAdded={onClientAdded}
          onOfferSaved={handleOfferSaved}
        />
      )}
      {activeTab === 'offers' && (
        loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
          </div>
        ) : error ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800 text-sm">
            <strong>Uwaga:</strong> {error}
            <button onClick={loadData} className="ml-3 underline text-blue-700">Spróbuj ponownie</button>
          </div>
        ) : (
          <RoadPlateSaleOffersTable
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
    </div>
  );
}
