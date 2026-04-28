import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RoadPlateProfile } from '../types';

interface Props {
  profiles: RoadPlateProfile[];
  onProfilesChange: (profiles: RoadPlateProfile[]) => void;
}

interface EditingCell {
  id: string;
  field: keyof RoadPlateProfile;
  value: string;
}

interface NewProfileForm {
  name: string;
  thickness_mm: string;
  sheet_length_m: string;
  sheet_width_m: string;
  weight_kg_per_m2: string;
  steel_grade: string;
}

const EMPTY_FORM: NewProfileForm = {
  name: '',
  thickness_mm: '',
  sheet_length_m: '6',
  sheet_width_m: '2',
  weight_kg_per_m2: '',
  steel_grade: 'S235',
};

const STEEL_GRADES = ['S235', 'S275', 'S355'];

export default function RoadPlateProfilesTable({ profiles, onProfilesChange }: Props) {
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newForm, setNewForm] = useState<NewProfileForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function startEdit(id: string, field: keyof RoadPlateProfile, currentValue: unknown) {
    setEditing({ id, field, value: String(currentValue) });
  }

  async function commitEdit() {
    if (!editing) return;
    const profile = profiles.find((p) => p.id === editing.id);
    if (!profile) return;

    const numericFields: (keyof RoadPlateProfile)[] = ['thickness_mm', 'sheet_length_m', 'sheet_width_m', 'weight_kg_per_m2'];
    let parsedValue: string | number = editing.value;
    if (numericFields.includes(editing.field)) {
      const n = parseFloat(editing.value);
      if (isNaN(n) || n <= 0) {
        showToast('Nieprawidłowa wartość liczbowa.', 'error');
        setEditing(null);
        return;
      }
      parsedValue = n;
    }

    const updated = { ...profile, [editing.field]: parsedValue };

    const snapshot = profiles.slice();
    onProfilesChange(profiles.map((p) => (p.id === editing.id ? updated : p)));
    setEditing(null);

    const { error } = await supabase
      .from('road_plate_profiles')
      .update({ [editing.field]: parsedValue, updated_at: new Date().toISOString() })
      .eq('id', editing.id);

    if (error) {
      const editedId = editing.id;
      const original = snapshot.find(s => s.id === editedId);
      onProfilesChange(profiles.map(p => p.id === editedId && original ? original : p));
      showToast('Błąd podczas zapisywania: ' + error.message, 'error');
    } else {
      showToast('Zmiana zapisana.');
    }
  }

  async function handleDelete(id: string) {
    const original = [...profiles];
    onProfilesChange(profiles.filter((p) => p.id !== id));
    setDeleteId(null);

    const { error } = await supabase.from('road_plate_profiles').delete().eq('id', id);
    if (error) {
      onProfilesChange(original);
      showToast('Błąd podczas usuwania: ' + error.message, 'error');
    } else {
      showToast('Profil usunięty.');
    }
  }

  async function handleAdd() {
    if (!newForm.name.trim()) return showToast('Podaj nazwę profilu.', 'error');
    const t = parseFloat(newForm.thickness_mm);
    const sl = parseFloat(newForm.sheet_length_m);
    const sw = parseFloat(newForm.sheet_width_m);
    const w = parseFloat(newForm.weight_kg_per_m2);
    if (isNaN(t) || isNaN(sl) || isNaN(sw) || isNaN(w)) {
      return showToast('Uzupełnij wszystkie pola liczbowe.', 'error');
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('road_plate_profiles')
      .insert({
        name: newForm.name.trim(),
        thickness_mm: t,
        sheet_length_m: sl,
        sheet_width_m: sw,
        weight_kg_per_m2: w,
        steel_grade: newForm.steel_grade,
        active: true,
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast('Błąd podczas dodawania: ' + error.message, 'error');
    } else {
      onProfilesChange(
        [...profiles, data as RoadPlateProfile].sort((a, b) => b.thickness_mm - a.thickness_mm),
      );
      setShowModal(false);
      setNewForm(EMPTY_FORM);
      showToast('Profil dodany.');
    }
  }

  const editableNumericField = (profile: RoadPlateProfile, field: keyof RoadPlateProfile) => {
    const isEditing = editing?.id === profile.id && editing?.field === field;
    const value = profile[field] as number;

    return (
      <td
        className="px-4 py-3 text-right cursor-pointer hover:bg-blue-50"
        onClick={() => !isEditing && startEdit(profile.id, field, value)}
      >
        {isEditing ? (
          <input
            autoFocus
            type="number"
            step="any"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(null);
            }}
            className="w-24 text-right border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span className="text-sm text-gray-700">{value}</span>
        )}
      </td>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Profile płyt drogowych</h2>
            <p className="text-xs text-gray-400 mt-0.5">Kliknij wartość liczbową aby edytować · Enter lub blur = zapis</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-900 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
          >
            + Dodaj profil
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600 rounded-tl-lg">Nazwa</th>
                <th className="px-4 py-3 font-medium text-gray-600">Gat. stali</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Grubość [mm]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Długość [m]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Szerokość [m]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Masa [kg/m²]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center rounded-tr-lg">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                    Brak profili. Kliknij „+ Dodaj profil" aby utworzyć pierwszy.
                  </td>
                </tr>
              ) : profiles.map((profile) => (
                <tr key={profile.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{profile.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                      {profile.steel_grade}
                    </span>
                  </td>
                  {editableNumericField(profile, 'thickness_mm')}
                  {editableNumericField(profile, 'sheet_length_m')}
                  {editableNumericField(profile, 'sheet_width_m')}
                  {editableNumericField(profile, 'weight_kg_per_m2')}
                  <td className="px-4 py-3 text-center">
                    {deleteId === profile.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-gray-500">Usuń?</span>
                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Tak
                        </button>
                        <button
                          onClick={() => setDeleteId(null)}
                          className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          Nie
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteId(profile.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50"
                      >
                        Usuń
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal dodawania profilu */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-5">Nowy profil płyty drogowej</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa</label>
                  <input
                    type="text"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="np. Płyta drogowa 15 mm"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gat. stali</label>
                  <select
                    value={newForm.steel_grade}
                    onChange={(e) => setNewForm({ ...newForm, steel_grade: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grubość [mm]</label>
                <input
                  type="number"
                  step="0.5"
                  value={newForm.thickness_mm}
                  onChange={(e) => setNewForm({ ...newForm, thickness_mm: e.target.value })}
                  placeholder="np. 12.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Długość [m]</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newForm.sheet_length_m}
                    onChange={(e) => setNewForm({ ...newForm, sheet_length_m: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Szerokość [m]</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newForm.sheet_width_m}
                    onChange={(e) => setNewForm({ ...newForm, sheet_width_m: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Masa [kg/m²]</label>
                <input
                  type="number"
                  step="0.001"
                  value={newForm.weight_kg_per_m2}
                  onChange={(e) => setNewForm({ ...newForm, weight_kg_per_m2: e.target.value })}
                  placeholder="np. 98.125"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setNewForm(EMPTY_FORM); }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Anuluj
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Zapisywanie...' : 'Dodaj profil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
