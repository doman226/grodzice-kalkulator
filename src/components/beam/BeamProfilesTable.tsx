import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BeamProfile, BeamSeries } from '../../types';

interface Props {
  profiles: BeamProfile[];
  onProfilesChange: (profiles: BeamProfile[]) => void;
}

interface EditingCell {
  id: string;
  field: keyof BeamProfile;
  value: string;
}

interface NewProfileForm {
  name: string;
  series: BeamSeries;
  weight_kg_per_m: string;
  height_mm: string;
  width_mm: string;
}

const EMPTY_FORM: NewProfileForm = {
  name: '',
  series: 'HEB',
  weight_kg_per_m: '',
  height_mm: '',
  width_mm: '',
};

const SERIES_OPTIONS: BeamSeries[] = ['HEB', 'HEA', 'IPE'];

function seriesBadge(series: string): string {
  return series === 'HEB' ? 'bg-blue-100 text-blue-700'
    : series === 'HEA' ? 'bg-green-100 text-green-700'
    : 'bg-orange-100 text-orange-700';
}

export default function BeamProfilesTable({ profiles, onProfilesChange }: Props) {
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newForm, setNewForm] = useState<NewProfileForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<BeamProfile | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function startEdit(id: string, field: keyof BeamProfile, currentValue: unknown) {
    setEditing({ id, field, value: currentValue == null ? '' : String(currentValue) });
  }

  async function commitEdit() {
    if (!editing) return;
    const profile = profiles.find((p) => p.id === editing.id);
    if (!profile) return;

    const numericFields: (keyof BeamProfile)[] = ['weight_kg_per_m', 'height_mm', 'width_mm'];
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
      .from('beam_profiles')
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

    const { error } = await supabase.from('beam_profiles').delete().eq('id', id);
    if (error) {
      onProfilesChange(original);
      showToast('Błąd podczas usuwania: ' + error.message, 'error');
    } else {
      showToast('Profil usunięty.');
    }
  }

  function openEdit(profile: BeamProfile) {
    setEditingProfile(profile);
    setNewForm({
      name: profile.name,
      series: profile.series,
      weight_kg_per_m: String(profile.weight_kg_per_m),
      height_mm: profile.height_mm != null ? String(profile.height_mm) : '',
      width_mm: profile.width_mm != null ? String(profile.width_mm) : '',
    });
    setShowModal(true);
  }

  function parseFormNumbers(): { wt: number; h: number | null; w: number | null } | null {
    const wt = parseFloat(newForm.weight_kg_per_m);
    if (isNaN(wt) || wt <= 0) { showToast('Podaj wagę [kg/m] (liczba dodatnia).', 'error'); return null; }
    const h = newForm.height_mm.trim() === '' ? null : parseFloat(newForm.height_mm);
    const w = newForm.width_mm.trim() === '' ? null : parseFloat(newForm.width_mm);
    if (h != null && (isNaN(h) || h <= 0)) { showToast('Nieprawidłowa wysokość [mm].', 'error'); return null; }
    if (w != null && (isNaN(w) || w <= 0)) { showToast('Nieprawidłowa szerokość [mm].', 'error'); return null; }
    return { wt, h, w };
  }

  async function handleAdd() {
    if (!newForm.name.trim()) return showToast('Podaj nazwę profilu.', 'error');
    const nums = parseFormNumbers();
    if (!nums) return;

    setSaving(true);
    const { data, error } = await supabase
      .from('beam_profiles')
      .insert({
        name: newForm.name.trim(),
        series: newForm.series,
        weight_kg_per_m: nums.wt,
        height_mm: nums.h,
        width_mm: nums.w,
        active: true,
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast('Błąd podczas dodawania: ' + error.message, 'error');
    } else {
      onProfilesChange([...profiles, data as BeamProfile].sort((a, b) => a.name.localeCompare(b.name)));
      setShowModal(false);
      setNewForm(EMPTY_FORM);
      showToast('Profil dodany.');
    }
  }

  async function handleEditSave() {
    if (!editingProfile) return;
    if (!newForm.name.trim()) return showToast('Podaj nazwę profilu.', 'error');
    const nums = parseFormNumbers();
    if (!nums) return;

    const updated: BeamProfile = {
      ...editingProfile,
      name: newForm.name.trim(),
      series: newForm.series,
      weight_kg_per_m: nums.wt,
      height_mm: nums.h,
      width_mm: nums.w,
    };

    const snapshot = profiles.slice();
    onProfilesChange(
      profiles.map(p => p.id === editingProfile.id ? updated : p)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setShowModal(false);
    setEditingProfile(null);
    setNewForm(EMPTY_FORM);

    setSaving(true);
    const { error } = await supabase
      .from('beam_profiles')
      .update({
        name: updated.name,
        series: updated.series,
        weight_kg_per_m: updated.weight_kg_per_m,
        height_mm: updated.height_mm,
        width_mm: updated.width_mm,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingProfile.id);
    setSaving(false);

    if (error) {
      onProfilesChange(snapshot);
      showToast('Błąd podczas zapisywania: ' + error.message, 'error');
    } else {
      showToast('Profil zaktualizowany.');
    }
  }

  const editableNumericField = (profile: BeamProfile, field: keyof BeamProfile) => {
    const isEditing = editing?.id === profile.id && editing?.field === field;
    const value = profile[field] as number | null | undefined;

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
          <span className="text-sm text-gray-700">{value ?? '—'}</span>
        )}
      </td>
    );
  };

  return (
    <div className="space-y-4">
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
            <h2 className="text-lg font-semibold text-gray-800">Profile dwuteowników</h2>
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
                <th className="px-4 py-3 font-medium text-gray-600">Seria</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Waga [kg/m]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Wysokość [mm]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Szer. półki [mm]</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center rounded-tr-lg">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{profile.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${seriesBadge(profile.series)}`}>
                      {profile.series}
                    </span>
                  </td>
                  {editableNumericField(profile, 'weight_kg_per_m')}
                  {editableNumericField(profile, 'height_mm')}
                  {editableNumericField(profile, 'width_mm')}
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
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(profile)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Edytuj
                        </button>
                        <button
                          onClick={() => setDeleteId(profile.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50"
                        >
                          Usuń
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal dodawania / edycji profilu */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-5">
              {editingProfile ? `Edytuj profil: ${editingProfile.name}` : 'Nowy profil dwuteownika'}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa</label>
                  <input
                    type="text"
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="np. HEB300"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seria</label>
                  <select
                    value={newForm.series}
                    onChange={(e) => setNewForm({ ...newForm, series: e.target.value as BeamSeries })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {SERIES_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waga [kg/m]</label>
                <input
                  type="number"
                  step="0.01"
                  value={newForm.weight_kg_per_m}
                  onChange={(e) => setNewForm({ ...newForm, weight_kg_per_m: e.target.value })}
                  placeholder="np. 120"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wysokość [mm] <span className="text-gray-400">(opc.)</span></label>
                  <input
                    type="number"
                    step="1"
                    value={newForm.height_mm}
                    onChange={(e) => setNewForm({ ...newForm, height_mm: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Szer. półki [mm] <span className="text-gray-400">(opc.)</span></label>
                  <input
                    type="number"
                    step="1"
                    value={newForm.width_mm}
                    onChange={(e) => setNewForm({ ...newForm, width_mm: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setEditingProfile(null); setNewForm(EMPTY_FORM); }}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Anuluj
              </button>
              <button
                onClick={editingProfile ? handleEditSave : handleAdd}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? 'Zapisywanie...' : editingProfile ? 'Zapisz zmiany' : 'Dodaj profil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
