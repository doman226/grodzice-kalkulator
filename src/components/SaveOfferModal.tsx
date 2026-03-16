import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client, Offer, CalculatorResult, Profile } from '../types';
import { formatPLN, formatNumber } from '../lib/calculations';

interface Props {
  clients: Client[];
  profile: Profile;
  quantity: number;
  lengthM: number;
  rentalWeeks: number;
  result: CalculatorResult;
  onSaved: (offer: Offer) => void;
  onClose: () => void;
  onClientAdded: (client: Client) => void;
}

export default function SaveOfferModal({
  clients, profile, quantity, lengthM, rentalWeeks, result, onSaved, onClose, onClientAdded,
}: Props) {
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Nowy klient inline
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', country: 'PL', nip: '', vat_number: '' });
  const [savingClient, setSavingClient] = useState(false);

  async function handleAddClient() {
    if (!newClient.name.trim()) return setError('Podaj nazwę firmy.');
    if (newClient.country === 'PL' && !newClient.nip.trim()) return setError('Podaj NIP.');
    if (newClient.country !== 'PL' && !newClient.vat_number.trim()) return setError('Podaj numer VAT.');
    setSavingClient(true);
    const { data, error: err } = await supabase.from('clients').insert({
      name: newClient.name.trim(),
      country: newClient.country,
      nip: newClient.country === 'PL' ? newClient.nip.trim() : null,
      vat_number: newClient.country !== 'PL' ? newClient.vat_number.trim() : null,
    }).select().single();
    setSavingClient(false);
    if (err) return setError('Błąd: ' + err.message);
    const c = data as Client;
    onClientAdded(c);
    setClientId(c.id);
    setAddingClient(false);
    setNewClient({ name: '', country: 'PL', nip: '', vat_number: '' });
    setError('');
  }

  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    setSaving(true);
    setError('');

    const { data, error: err } = await supabase.from('offers').insert({
      offer_number: '',
      client_id: clientId,
      profile_name: profile.name,
      profile_type: profile.type,
      quantity,
      length_m: lengthM,
      rental_weeks: rentalWeeks,
      total_length_m: result.totalLengthM,
      mass_t: result.massT,
      wall_area_m2: result.wallAreaM2,
      rental_cost_pln: result.rentalCostPLN,
      cost_per_m2: result.costPerM2,
      cost_per_ton: result.costPerTon,
      notes: notes.trim() || null,
      valid_days: validDays,
      status: 'szkic',
    }).select('*, client:clients(*)').single();

    setSaving(false);
    if (err) return setError('Błąd zapisu: ' + err.message);
    onSaved(data as Offer);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Zapisz jako ofertę</h3>
          <p className="text-xs text-gray-400 mt-0.5">Numer zostanie nadany automatycznie (OF/{new Date().getFullYear()}/XXX)</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Podsumowanie wyceny */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-2">Podsumowanie wyceny</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Profil:</span> <strong>{profile.name}</strong></div>
              <div><span className="text-gray-500">Ilość:</span> <strong>{quantity} szt. × {lengthM} m</strong></div>
              <div><span className="text-gray-500">Masa:</span> <strong>{formatNumber(result.massT, 3)} t</strong></div>
              <div><span className="text-gray-500">Okres:</span> <strong>{rentalWeeks} tygodni</strong></div>
              <div className="col-span-2 pt-1 border-t border-blue-200">
                <span className="text-gray-500">Koszt wynajmu:</span>{' '}
                <strong className="text-blue-900 text-base">{formatPLN(result.rentalCostPLN)} PLN</strong>
              </div>
            </div>
          </div>

          {/* Wybór klienta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Klient <span className="text-red-500">*</span>
            </label>
            {!addingClient ? (
              <div className="flex gap-2">
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— wybierz klienta —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.country === 'PL' ? c.nip : c.vat_number})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setAddingClient(true)}
                  className="px-3 py-2 text-sm text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 whitespace-nowrap"
                >
                  + Nowy
                </button>
              </div>
            ) : (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                <p className="text-xs font-medium text-blue-700">Szybkie dodanie klienta</p>
                <select
                  value={newClient.country}
                  onChange={e => setNewClient({ ...newClient, country: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="PL">🇵🇱 Polska</option>
                  <option value="NL">🇳🇱 Holandia</option>
                  <option value="DE">🇩🇪 Niemcy</option>
                  <option value="BE">🇧🇪 Belgia</option>
                  <option value="FR">🇫🇷 Francja</option>
                  <option value="GB">🇬🇧 Wielka Brytania</option>
                  <option value="OTHER">Inne</option>
                </select>
                <input
                  placeholder="Nazwa firmy *"
                  value={newClient.name}
                  onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {newClient.country === 'PL'
                  ? <input placeholder="NIP *" value={newClient.nip} onChange={e => setNewClient({ ...newClient, nip: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  : <input placeholder="Numer VAT *" value={newClient.vat_number} onChange={e => setNewClient({ ...newClient, vat_number: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                }
                <div className="flex gap-2">
                  <button onClick={handleAddClient} disabled={savingClient} className="flex-1 py-1.5 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                    {savingClient ? 'Dodawanie...' : 'Dodaj i wybierz'}
                  </button>
                  <button onClick={() => setAddingClient(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Ważność oferty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ważność oferty [dni]</label>
            <input
              type="number" min={1} value={validDays}
              onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 30))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notatki do oferty</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Opcjonalne uwagi do oferty..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
            {saving ? 'Zapisywanie...' : 'Zapisz ofertę'}
          </button>
        </div>
      </div>
    </div>
  );
}
