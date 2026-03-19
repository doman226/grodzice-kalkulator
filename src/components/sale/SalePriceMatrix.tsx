import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleWarehouse, SaleSteeelGrade, SaleProfile, SalePrice } from '../../types';

// Typ klucza komórki edytowanej
interface EditingCell {
  warehouseId: string;
  profileName: string;
  gradeId: string;
}

export default function SalePriceMatrix() {
  const [warehouses, setWarehouses]   = useState<SaleWarehouse[]>([]);
  const [grades, setGrades]           = useState<SaleSteeelGrade[]>([]);
  const [profiles, setProfiles]       = useState<SaleProfile[]>([]);
  const [prices, setPrices]           = useState<SalePrice[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [selectedWh, setSelectedWh]   = useState('');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving]           = useState<string | null>(null); // klucz komórki
  const [toast, setToast]             = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    const [whRes, grRes, prRes, spRes] = await Promise.all([
      supabase.from('sale_warehouses').select('*').eq('active', true).order('id'),
      supabase.from('sale_steel_grades').select('*').order('sort_order'),
      supabase.from('sale_profiles').select('*').eq('active', true).order('name'),
      supabase.from('sale_prices').select('*'),
    ]);
    if (whRes.error || grRes.error || prRes.error || spRes.error) {
      setError('Błąd ładowania danych cennika.');
    } else {
      setWarehouses(whRes.data as SaleWarehouse[]);
      setGrades(grRes.data as SaleSteeelGrade[]);
      setProfiles(prRes.data as SaleProfile[]);
      setPrices(spRes.data as SalePrice[]);
      if (whRes.data.length > 0) setSelectedWh(whRes.data[0].id);
    }
    setLoading(false);
  }

  // Mapa: warehouse → profil → gatunek → SalePrice
  const priceMap = useCallback(() => {
    const map: Record<string, Record<string, Record<string, SalePrice>>> = {};
    for (const p of prices) {
      if (!map[p.warehouse_id]) map[p.warehouse_id] = {};
      if (!map[p.warehouse_id][p.profile_name]) map[p.warehouse_id][p.profile_name] = {};
      map[p.warehouse_id][p.profile_name][p.steel_grade] = p;
    }
    return map;
  }, [prices]);

  function cellKey(whId: string, prof: string, grade: string) {
    return `${whId}|${prof}|${grade}`;
  }

  function startEdit(whId: string, profileName: string, gradeId: string, currentPrice: number | null) {
    setEditingCell({ warehouseId: whId, profileName, gradeId });
    setEditingValue(currentPrice != null ? String(currentPrice) : '');
  }

  async function commitEdit() {
    if (!editingCell) return;
    const { warehouseId, profileName, gradeId } = editingCell;
    const parsed = parseFloat(editingValue);
    const newPrice = isNaN(parsed) || editingValue.trim() === '' ? null : parsed;

    const map = priceMap();
    const existing = map[warehouseId]?.[profileName]?.[gradeId];
    const key = cellKey(warehouseId, profileName, gradeId);

    // Bez zmian
    if (existing && existing.price_eur_t === newPrice) {
      setEditingCell(null);
      return;
    }

    setSaving(key);

    if (existing) {
      // UPDATE
      const { error: err } = await supabase
        .from('sale_prices')
        .update({ price_eur_t: newPrice, available: newPrice != null, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (err) {
        setToast('Błąd zapisu: ' + err.message);
      } else {
        setPrices(prev => prev.map(p =>
          p.id === existing.id ? { ...p, price_eur_t: newPrice, available: newPrice != null } : p
        ));
        showToast('Zapisano ✓');
      }
    } else if (newPrice != null) {
      // INSERT (nowa komórka – np. Oleśnica + nowy profil)
      const { data, error: err } = await supabase
        .from('sale_prices')
        .insert({ warehouse_id: warehouseId, profile_name: profileName, steel_grade: gradeId, price_eur_t: newPrice, available: true })
        .select()
        .single();
      if (err) {
        setToast('Błąd zapisu: ' + err.message);
      } else {
        setPrices(prev => [...prev, data as SalePrice]);
        showToast('Dodano ✓');
      }
    }

    setSaving(null);
    setEditingCell(null);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 text-sm">{error}</div>
  );

  const map = priceMap();
  const selectedWarehouse = warehouses.find(w => w.id === selectedWh);

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Macierz cen sprzedaży</h2>
          <p className="text-xs text-gray-400 mt-0.5">Ceny w EUR/t netto · kliknij komórkę aby edytować · Enter lub kliknij poza komórką aby zapisać</p>
        </div>
        <button onClick={loadAll} className="text-xs text-blue-700 hover:underline self-start sm:self-auto">
          ↺ Odśwież
        </button>
      </div>

      {/* Wybór magazynu — zakładki */}
      <div className="flex gap-1 border-b border-gray-200">
        {warehouses.map(wh => (
          <button
            key={wh.id}
            onClick={() => setSelectedWh(wh.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              selectedWh === wh.id
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {wh.name}
          </button>
        ))}
      </div>

      {/* Tabela macierzy */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide w-28">
                Profil
              </th>
              {grades.map(g => (
                <th key={g.id} className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile, idx) => {
              const rowPrices = map[selectedWh]?.[profile.name] ?? {};
              return (
                <tr
                  key={profile.id}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-2.5 font-semibold text-gray-800 text-xs whitespace-nowrap">
                    {profile.name}
                    <span className="ml-1 text-gray-400 font-normal">{profile.weight_kg_per_m} kg/m</span>
                  </td>
                  {grades.map(g => {
                    const cell = rowPrices[g.id];
                    const isEditing = editingCell?.warehouseId === selectedWh
                      && editingCell?.profileName === profile.name
                      && editingCell?.gradeId === g.id;
                    const isSaving = saving === cellKey(selectedWh, profile.name, g.id);
                    const price = cell?.price_eur_t;
                    const unavailable = !cell || price == null;

                    return (
                      <td key={g.id} className="px-2 py-1.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-20 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(selectedWh, profile.name, g.id, price ?? null)}
                            disabled={isSaving}
                            className={`w-full text-right px-3 py-1.5 rounded transition-colors text-sm font-medium ${
                              unavailable
                                ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                                : 'text-gray-800 hover:bg-blue-50 hover:text-blue-800'
                            }`}
                          >
                            {isSaving ? (
                              <span className="text-blue-400 text-xs">...</span>
                            ) : unavailable ? (
                              <span className="text-xs">—</span>
                            ) : (
                              <>{price} <span className="text-gray-400 font-normal text-xs">EUR/t</span></>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-gray-200 bg-white inline-block" />
          Cena aktywna – kliknij aby edytować
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-300 text-sm font-medium">—</span>
          Brak ceny (niedostępne) – kliknij aby dodać
        </span>
        {selectedWarehouse?.id === 'mag_olesnica' && (
          <span className="text-amber-600 font-medium">
            ⚠ Oleśnica: dostępne tylko VL603 i VL604 w gatunkach S270GP i S355GP
          </span>
        )}
      </div>

      {/* Historia aktualizacji */}
      <div className="text-xs text-gray-400 text-right">
        Źródło: Pricelist Sheetpiles N · dane wg katalogu Intra BV 2025
      </div>
    </div>
  );
}
