import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleProfile } from '../../types';
import SaleCalculator from './SaleCalculator';
import SalePriceMatrix from './SalePriceMatrix';
import SaleProfilesTable from './SaleProfilesTable';

type SaleTab = 'calculator' | 'prices' | 'profiles';

const SALE_TABS: { id: SaleTab; label: string }[] = [
  { id: 'calculator', label: 'Kalkulator' },
  { id: 'prices',     label: 'Cennik' },
  { id: 'profiles',   label: 'Profile VL' },
];

export default function SaleSection() {
  const [activeTab, setActiveTab]   = useState<SaleTab>('calculator');
  const [profiles, setProfiles]     = useState<SaleProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('sale_profiles')
      .select('*')
      .order('name');
    if (err) {
      setError('Błąd ładowania profili.');
    } else {
      setProfiles(data as SaleProfile[]);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Nawigacja modułu sprzedaży */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {SALE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-700 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
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
              <button onClick={loadProfiles} className="ml-3 underline">Spróbuj ponownie</button>
            </div>
          ) : (
            <>
              {activeTab === 'calculator' && <SaleCalculator />}
              {activeTab === 'prices'     && <SalePriceMatrix />}
              {activeTab === 'profiles'   && (
                <SaleProfilesTable profiles={profiles} onProfilesChange={setProfiles} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
