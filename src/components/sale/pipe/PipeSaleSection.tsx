import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client, PipeSaleOffer } from '../../../types';
import PipeSaleCalculator from './PipeSaleCalculator';
import PipeOffersTable from './PipeOffersTable';
import ClientsTable from '../../ClientsTable';

// Komponent kontrolowany — analogicznie do SaleSection.
// W fazie 2 oferty rur są ładowane z bazy i wyświetlane w zakładce "Oferty SR".

export type PipeSaleTab = 'calculator' | 'offers' | 'clients';

interface Props {
  clients: Client[];
  onClientAdded: (c: Client) => void;
  onClientsChange: (clients: Client[]) => void;
  activeTab: PipeSaleTab;
  onTabChange: (tab: PipeSaleTab) => void;
  onOffersCountChange: (count: number) => void;
}

export default function PipeSaleSection({
  clients, onClientAdded, onClientsChange,
  activeTab, onTabChange, onOffersCountChange,
}: Props) {
  const [offers, setOffers]   = useState<PipeSaleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    // Tabele pipe_sale_* mogą jeszcze nie istnieć (przed wykonaniem migracji SQL).
    // W takim przypadku wyświetlamy info zamiast błędu — kalkulator i klienci pozostają dostępne.
    try {
      const { data, error: err } = await supabase
        .from('pipe_sale_offers')
        .select('*, client:clients(*), items:pipe_sale_offer_items(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (err) {
        // Wykrywanie "tabela nieistnieje" w 3 wariantach:
        //   PGRST205 → cache schemy PostgREST (Supabase): "Could not find the table"
        //   42P01    → kod PostgreSQL "undefined_table" (rzucany gdy schemat nie obejmuje tabeli)
        //   tekst    → fallback gdy supabase-js opakuje błąd w inny sposób
        const msg = (err.message || '').toLowerCase();
        const tableMissing =
          err.code === 'PGRST205' ||
          err.code === '42P01' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table');

        if (tableMissing) {
          setError('Migracja SQL pipe_sale jeszcze nie wykonana. Uruchom docs/migrations/2026-05-13-pipe-sale.sql w Supabase SQL Editor — wtedy lista ofert zacznie działać.');
        } else {
          setError('Błąd ładowania ofert rur: ' + err.message);
        }
        setOffers([]);
        onOffersCountChange(0);
      } else {
        const offs = (data ?? []) as PipeSaleOffer[];
        setOffers(offs);
        onOffersCountChange(offs.length);
      }
    } catch (e) {
      setError('Błąd ładowania ofert rur: ' + (e instanceof Error ? e.message : String(e)));
      setOffers([]);
      onOffersCountChange(0);
    }
    setLoading(false);
  }

  function handleOfferSaved(offer: PipeSaleOffer) {
    setOffers(prev => {
      const updated = [offer, ...prev];
      onOffersCountChange(updated.length);
      return updated;
    });
    onTabChange('offers');
  }

  function handleOffersChange(next: PipeSaleOffer[]) {
    setOffers(next);
    onOffersCountChange(next.length);
  }

  return (
    <div>
      {activeTab === 'calculator' && (
        <PipeSaleCalculator
          clients={clients}
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
          <PipeOffersTable offers={offers} onOffersChange={handleOffersChange} clients={clients} />
        )
      )}
      {activeTab === 'clients' && (
        <ClientsTable clients={clients} onClientsChange={onClientsChange} />
      )}
    </div>
  );
}
