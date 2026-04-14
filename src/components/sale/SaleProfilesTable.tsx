import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleProfile } from '../../types';

interface Props {
  profiles: SaleProfile[];
  onProfilesChange: (profiles: SaleProfile[]) => void;
}

type EditableField = 'weight_kg_per_m' | 'wall_kg_per_m2' | 'width_mm';

interface EditingCell {
  id: string;
  field: EditableField;
  value: string;
}

interface NewProfileForm {
  name: string;
  series: string;
  width_mm: string;
  weight_kg_per_m: string;
  wall_kg_per_m2: string;
}

const SERIES_LABELS: Record<string, string> = {
  VL:  'Grodzice VL – gorącowalcowane (Vitkovice)',
  ESZ: 'Grodzice ESZ – gorącowalcowane (Z-profile)',
  MKL: 'Grodzice MKL – zimnowalcowane (Intra B.V.)',
  MKD: 'Kształtowniki wykopowe MKD – zimnowalcowane (Intra B.V.)',
};

function seriesLabel(series: string) {
  return SERIES_LABELS[series] ?? `Grodzice ${series}`;
}

export default function SaleProfilesTable({ profiles, onProfilesChange }: Props) {
  // ─── serie dynamiczne z danych ─────────────────────────────────────────────
  const availableSeries = useMemo(() =>
    [...new Set(profiles.map(p => p.series))].sort(),
    [profiles]
  );
  const [activeSeries, setActiveSeries] = useState<string>(() =>
    availableSeries.includes('VL') ? 'VL' : (availableSeries[0] ?? 'VL')
  );

  // ─── stan edycji ───────────────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [saving, setSaving]           = useState<string | null>(null);
  const [toast, setToast]             = useState('');
  const [error, setError]             = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm]         = useState<NewProfileForm>({
    name: '', series: activeSeries, width_mm: '', weight_kg_per_m: '', wall_kg_per_m2: '',
  });
  const [addSaving, setAddSaving]     = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  // ─── profile bieżącej serii ────────────────────────────────────────────────
  const seriesProfiles   = profiles.filter(p => p.series === activeSeries);
  const activeProfiles   = seriesProfiles.filter(p => p.active);
  const inactiveProfiles = seriesProfiles.filter(p => !p.active);

  // ─── edycja inline ─────────────────────────────────────────────────────────
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
    onProfilesChange(profiles.map(p =>
      p.id === profile.id ? { ...p, active: !profile.active } : p
    ));
  }

  // ─── dodawanie profilu ─────────────────────────────────────────────────────
  function openAddForm() {
    setNewForm({ name: '', series: activeSeries, width_mm: '', weight_kg_per_m: '', wall_kg_per_m2: '' });
    setShowAddForm(true);
    setError('');
  }

  async function addProfile() {
    const name   = newForm.name.trim();
    const series = newForm.series.trim().toUpperCase();
    const width  = parseFloat(newForm.width_mm);
    const weight = parseFloat(newForm.weight_kg_per_m);
    const wall   = parseFloat(newForm.wall_kg_per_m2);

    if (!name)                    { setError('Podaj nazwę profilu.'); return; }
    if (!series)                  { setError('Podaj serię (np. VL, ESZ, ZZ).'); return; }
    if (isNaN(width) || width <= 0)  { setError('Podaj poprawną szerokość [mm].'); return; }
    if (isNaN(weight) || weight <= 0){ setError('Podaj poprawną wagę [kg/m].'); return; }
    if (isNaN(wall)  || wall <= 0)   { setError('Podaj poprawną masę ścianki [kg/m²].'); return; }
    if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setError('Profil o tej nazwie już istnieje.');
      return;
    }

    setError('');
    setAddSaving(true);

    const { data, error: err } = await supabase
      .from('sale_profiles')
      .insert({ name, series, width_mm: width, weight_kg_per_m: weight, wall_kg_per_m2: wall, active: true })
      .select()
      .single();

    if (err || !data) {
      setError('Błąd dodawania: ' + (err?.message ?? 'nieznany'));
    } else {
      onProfilesChange([...profiles, data as SaleProfile]);
      setShowAddForm(false);
      showToast('Profil dodany ✓');
      // jeśli dodano nową serię – przełącz na nią
      setActiveSeries(series);
    }

    setAddSaving(false);
  }

  async function deleteProfile(profile: SaleProfile) {
    if (!window.confirm(`Czy na pewno usunąć profil "${profile.name}"? Tej operacji nie można cofnąć.`)) return;
    setDeletingId(profile.id);

    const { error: err } = await supabase
      .from('sale_profiles')
      .delete()
      .eq('id', profile.id);

    if (err) {
      setError('Błąd usuwania: ' + err.message);
    } else {
      onProfilesChange(profiles.filter(p => p.id !== profile.id));
      showToast('Profil usunięty');
    }
    setDeletingId(null);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ─── komponent komórki edytowalnej ─────────────────────────────────────────
  function EditableCell({ profile, field, decimals = 1 }: {
    profile: SaleProfile; field: EditableField; decimals?: number;
  }) {
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
            if (e.key === 'Enter')  commitEdit();
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

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Profile grodzic – dane techniczne</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Kliknij wartość aby edytować inline · Enter lub kliknij poza komórką aby zapisać
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <span className="text-lg leading-none">+</span> Dodaj profil
        </button>
      </div>

      {/* Serie sub-taby */}
      <div className="flex gap-1 border-b-2 border-gray-200">
        {availableSeries.map(s => (
          <button
            key={s}
            onClick={() => { setActiveSeries(s); setShowAddForm(false); setError(''); }}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${
              activeSeries === s
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {s}
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({profiles.filter(p => p.series === s && p.active).length})
            </span>
          </button>
        ))}
      </div>

      {/* Opis bieżącej serii */}
      <p className="text-xs text-gray-500">{seriesLabel(activeSeries)}</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-700 text-sm">{error}</div>
      )}

      {/* Formularz dodawania */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-900 mb-3">Nowy profil</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nazwa</label>
              <input
                type="text"
                placeholder={activeSeries === 'VL' ? 'np. VL608' : activeSeries === 'ESZ' ? 'np. ESZ 45-700' : 'np. ZZ1'}
                value={newForm.name}
                onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Seria</label>
              <input
                type="text"
                placeholder="VL / ESZ / ZZ"
                value={newForm.series}
                onChange={e => setNewForm(f => ({ ...f, series: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Szerokość [mm]</label>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="700"
                value={newForm.width_mm}
                onChange={e => setNewForm(f => ({ ...f, width_mm: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Waga [kg/m]</label>
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder="80.0"
                value={newForm.weight_kg_per_m}
                onChange={e => setNewForm(f => ({ ...f, weight_kg_per_m: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Masa ścianki [kg/m²]</label>
              <input
                type="number"
                min={0}
                step={0.1}
                placeholder="133.3"
                value={newForm.wall_kg_per_m2}
                onChange={e => setNewForm(f => ({ ...f, wall_kg_per_m2: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={addProfile}
              disabled={addSaving}
              className="bg-blue-900 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {addSaving ? 'Zapisywanie...' : 'Zapisz profil'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setError(''); }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Anuluj
            </button>
          </div>
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
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {activeProfiles.map((profile, idx) => (
              <tr key={profile.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{profile.name}</td>
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
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => deleteProfile(profile)}
                    disabled={deletingId === profile.id}
                    className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Usuń profil"
                  >
                    {deletingId === profile.id ? '...' : '✕'}
                  </button>
                </td>
              </tr>
            ))}

            {inactiveProfiles.map(profile => (
              <tr key={profile.id} className="bg-gray-100 opacity-60">
                <td className="px-4 py-2 text-gray-400 line-through text-sm">{profile.name}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.width_mm}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.weight_kg_per_m.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-sm">{profile.wall_kg_per_m2.toFixed(1)}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleActive(profile)}
                    className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-700 transition-colors font-medium"
                    title="Kliknij aby aktywować"
                  >
                    nieaktywny
                  </button>
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => deleteProfile(profile)}
                    disabled={deletingId === profile.id}
                    className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Usuń profil"
                  >
                    {deletingId === profile.id ? '...' : '✕'}
                  </button>
                </td>
              </tr>
            ))}

            {seriesProfiles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Brak profili serii {activeSeries}. Kliknij „Dodaj profil" aby dodać pierwszy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Dane techniczne wg katalogu Intra BV 2025 · {activeProfiles.length} profili aktywnych (seria {activeSeries})
      </p>
    </div>
  );
}
