import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleProfile } from '../../types';

interface Props {
  profiles: SaleProfile[];
  onProfilesChange: (profiles: SaleProfile[]) => void;
}

// Kolumny edytowalne inline
type EditableField = 'weight_kg_per_m' | 'wall_kg_per_m2' | 'width_mm';

interface EditingCell {
  id: string;
  field: EditableField;
  value: string;
}

// Profile których wagi wymagają weryfikacji z katalogiem Vitkovice
const NEEDS_VERIFICATION = new Set<string>([]);

export default function SaleProfilesTable({ profiles, onProfilesChange }: Props) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [saving, setSaving]           = useState<string | null>(null);
  const [toast, setToast]             = useState('');
  const [error, setError]             = useState('');

  function startEdit(profile: SaleProfile, field: EditableField) {
    setEditingCell({ id: profile.id, field, value: String(profile[field]) });
  }

  async function commitEdit() {
    if (!editingCell) return;
    const parsed = parseFloat(editingCell.value);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Podaj poprawną wartość liczbową większą od 0.');
      return;
    }
    setError('');

    const profile = profiles.find(p => p.id === editingCell.id);
    if (!profile) return;
    if (profile[editingCell.field] === parsed) { setEditingCell(null); return; }

    setSaving(editingCell.id + editingCell.field);

    const { error: err } = await supabase
      .from('sale_profiles')
      .update({ [editingCell.field]: parsed })
      .eq('id', editingCell.id);

    if (err) {
      setError('Błąd zapisu: ' + err.message);
    } else {
      onProfilesChange(profiles.map(p =>
        p.id === editingCell.id ? { ...p, [editingCell.field]: parsed } : p
      ));
      showToast('Zapisano ✓');
    }

    setSaving(null);
    setEditingCell(null);
  }

  async function toggleActive(profile: SaleProfile) {
    const { error: err } = await supabase
      .from('sale_profiles')
      .update({ active: !profile.active })
      .eq('id', profile.id);
    if (err) { setError('Błąd: ' + err.message); return; }
    onProfilesChange(profiles.map(p => p.id === profile.id ? { ...p, active: !profile.active } : p));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function EditableCell({ profile, field, decimals = 1 }: { profile: SaleProfile; field: EditableField; decimals?: number }) {
    const isEditing = editingCell?.id === profile.id && editingCell?.field === field;
    const isSaving  = saving === profile.id + field;
    const value     = profile[field] as number;

    if (isEditing) {
      return (
        <input
          type="number"
          min={0}
          step={0.1}
          autoFocus
          value={editingCell.value}
          onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditingCell(null);
          }}
          className="w-24 border border-blue-400 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );
    }

    return (
      <button
        onClick={() => startEdit(profile, field)}
        disabled={isSaving || !profile.active}
        className={`text-right w-full px-2 py-1 rounded text-sm transition-colors ${
          profile.active
            ? 'hover:bg-blue-50 hover:text-blue-800 cursor-pointer'
            : 'text-gray-400 cursor-default'
        }`}
      >
        {isSaving ? <span className="text-blue-400 text-xs">...</span> : value.toFixed(decimals)}
      </button>
    );
  }

  const activeProfiles   = profiles.filter(p => p.active);
  const inactiveProfiles = profiles.filter(p => !p.active);

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Profile VL – dane techniczne</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Kliknij wartość aby edytować inline · Enter lub kliknij poza komórką aby zapisać
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-700 text-sm">{error}</div>
      )}

      {/* Ostrzeżenie o profilach do weryfikacji */}
      {profiles.some(p => NEEDS_VERIFICATION.has(p.name)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800 text-sm flex gap-2">
          <span className="text-amber-500 text-base">⚠</span>
          <span>
            Profile <strong>VL601, VL602 i VL607</strong> mają wagi wpisane szacunkowo.
            Zweryfikuj je z katalogiem Vitkovice i zaktualizuj klikając komórkę.
          </span>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-semibold">Profil</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Szerokość [mm]</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Waga [kg/m]</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Masa ścianki [kg/m²]</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-wide font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {activeProfiles.map((profile, idx) => (
              <tr key={profile.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{profile.name}</span>
                    {NEEDS_VERIFICATION.has(profile.name) && (
                      <span
                        title="Waga do weryfikacji z katalogiem Vitkovice"
                        className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium"
                      >
                        do weryfikacji
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600">{profile.width_mm}</td>
                <td className="px-4 py-2.5">
                  <EditableCell profile={profile} field="weight_kg_per_m" decimals={1} />
                </td>
                <td className="px-4 py-2.5">
                  <EditableCell profile={profile} field="wall_kg_per_m2" decimals={1} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => toggleActive(profile)}
                    className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 transition-colors font-medium"
                    title="Kliknij aby dezaktywować"
                  >
                    aktywny
                  </button>
                </td>
              </tr>
            ))}

            {/* Nieaktywne (zwinięte na dole) */}
            {inactiveProfiles.map((profile) => (
              <tr key={profile.id} className="bg-gray-100 opacity-60">
                <td className="px-4 py-2 text-gray-400 line-through text-sm">{profile.name}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.width_mm}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.weight_kg_per_m}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.wall_kg_per_m2}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleActive(profile)}
                    className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-700 transition-colors font-medium"
                    title="Kliknij aby aktywować"
                  >
                    nieaktywny
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Dane techniczne wg katalogu Vitkovice · {activeProfiles.length} profili aktywnych
      </p>
    </div>
  );
}
