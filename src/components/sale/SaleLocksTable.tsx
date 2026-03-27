import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleLock } from '../../types';

interface EditingCell {
  id: string;
  field: 'price_eur_mb' | 'weight_kg_m';
}

export default function SaleLocksTable() {
  const [locks, setLocks]             = useState<SaleLock[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving]           = useState<string | null>(null);
  const [toast, setToast]             = useState('');

  useEffect(() => { loadLocks(); }, []);

  async function loadLocks() {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('sale_locks')
      .select('*')
      .order('sort_order');
    if (err) {
      setError('Błąd ładowania cennika zamków: ' + err.message);
    } else {
      setLocks(data as SaleLock[]);
    }
    setLoading(false);
  }

  function startEdit(id: string, field: 'price_eur_mb' | 'weight_kg_m', currentValue: number) {
    setEditingCell({ id, field });
    setEditingValue(String(currentValue));
  }

  async function commitEdit() {
    if (!editingCell) return;
    const parsed = parseFloat(editingValue);
    if (isNaN(parsed) || parsed <= 0) {
      setEditingCell(null);
      return;
    }

    const { id, field } = editingCell;
    const lock = locks.find(l => l.id === id);
    if (!lock || lock[field] === parsed) {
      setEditingCell(null);
      return;
    }

    const cellKey = `${id}|${field}`;
    setSaving(cellKey);

    const { error: err } = await supabase
      .from('sale_locks')
      .update({ [field]: parsed, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (err) {
      showToast('Błąd zapisu: ' + err.message);
    } else {
      setLocks(prev => prev.map(l => l.id === id ? { ...l, [field]: parsed } : l));
      showToast('Zapisano ✓');
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

  function EditableCell({ lock, field, unit }: {
    lock: SaleLock;
    field: 'price_eur_mb' | 'weight_kg_m';
    unit: string;
  }) {
    const isEditing = editingCell?.id === lock.id && editingCell?.field === field;
    const isSaving  = saving === `${lock.id}|${field}`;
    const value     = lock[field];

    if (isEditing) {
      return (
        <input
          type="number"
          min={0.01}
          step={field === 'price_eur_mb' ? 1 : 0.01}
          autoFocus
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditingCell(null);
          }}
          className="w-24 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );
    }

    return (
      <button
        onClick={() => startEdit(lock.id, field, value)}
        disabled={isSaving}
        className="w-full text-right px-3 py-1.5 rounded transition-colors text-sm font-medium text-gray-800 hover:bg-blue-50 hover:text-blue-800"
      >
        {isSaving ? (
          <span className="text-blue-400 text-xs">...</span>
        ) : (
          <>{value.toFixed(2)} <span className="text-gray-400 font-normal text-xs">{unit}</span></>
        )}
      </button>
    );
  }

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
          <h2 className="text-lg font-semibold text-gray-800">Cennik zamków</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Ceny EUR/mb · kliknij komórkę aby edytować · Enter lub kliknij poza aby zapisać
          </p>
        </div>
        <button onClick={loadLocks} className="text-xs text-blue-700 hover:underline self-start sm:self-auto">
          ↺ Odśwież
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                Zamek
              </th>
              <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                Cena EUR/mb
              </th>
              <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                Masa kg/mb
              </th>
            </tr>
          </thead>
          <tbody>
            {locks.map((lock, idx) => (
              <tr
                key={lock.id}
                className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${!lock.active ? 'opacity-40' : ''}`}
              >
                <td className="px-4 py-2.5 font-semibold text-gray-800">
                  {lock.name}
                  {!lock.active && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">(nieaktywny)</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <EditableCell lock={lock} field="price_eur_mb" unit="EUR/mb" />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <EditableCell lock={lock} field="weight_kg_m" unit="kg/mb" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="text-xs text-gray-400">
        Źródło: Katalog Intra BV 2025 · ceny netto EUR za metr bieżący
      </div>
    </div>
  );
}
