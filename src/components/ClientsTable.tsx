import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client } from '../types';

interface Props {
  clients: Client[];
  onClientsChange: (clients: Client[]) => void;
}

const EMPTY_FORM = {
  name: '', country: 'PL', nip: '', vat_number: '',
  address: '', city: '', postal_code: '', email: '', phone: '', notes: '',
};

export default function ClientsTable({ clients, onClientsChange }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [nipLookupLoading, setNipLookupLoading] = useState(false);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function openAdd() {
    setEditClient(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(c: Client) {
    setEditClient(c);
    setForm({
      name: c.name, country: c.country, nip: c.nip ?? '',
      vat_number: c.vat_number ?? '', address: c.address ?? '',
      city: c.city ?? '', postal_code: c.postal_code ?? '',
      email: c.email ?? '', phone: c.phone ?? '', notes: c.notes ?? '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return showToast('Nazwa firmy jest wymagana.', 'error');
    if (form.country === 'PL' && !form.nip.trim()) return showToast('NIP jest wymagany dla klientów z PL.', 'error');
    if (form.country !== 'PL' && !form.vat_number.trim()) return showToast('Numer VAT jest wymagany dla klientów zagranicznych.', 'error');

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      country: form.country,
      nip: form.country === 'PL' ? form.nip.trim() : null,
      vat_number: form.country !== 'PL' ? form.vat_number.trim() : null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editClient) {
      const res = await supabase.from('clients').update(payload).eq('id', editClient.id).select().single();
      error = res.error;
      if (!error && res.data) {
        onClientsChange(clients.map(c => c.id === editClient.id ? res.data as Client : c));
      }
    } else {
      const res = await supabase.from('clients').insert(payload).select().single();
      error = res.error;
      if (!error && res.data) {
        onClientsChange([...clients, res.data as Client]);
      }
    }

    setSaving(false);
    if (error) {
      showToast('Błąd zapisu: ' + error.message, 'error');
    } else {
      showToast(editClient ? 'Klient zaktualizowany.' : 'Klient dodany.');
      setShowModal(false);
    }
  }

  async function lookupNip() {
    const nip = form.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(nip)) return showToast('Wpisz poprawny NIP (10 cyfr).', 'error');
    setNipLookupLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/nip-lookup?nip=${nip}`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error ?? 'Nie znaleziono firmy.', 'error'); }
      else {
        setForm(prev => ({
          ...prev,
          name: data.name ?? prev.name,
          address: data.address ?? prev.address,
          postal_code: data.postal_code ?? prev.postal_code,
          city: data.city ?? prev.city,
        }));
        showToast('Dane pobrane z GUS.');
      }
    } catch {
      showToast('Błąd połączenia z GUS.', 'error');
    }
    setNipLookupLoading(false);
  }

  async function handleDelete(c: Client) {
    if (!confirm(`Usunąć klienta "${c.name}"?`)) return;
    const { error } = await supabase.from('clients').update({ active: false }).eq('id', c.id);
    if (error) return showToast('Błąd usuwania: ' + error.message, 'error');
    onClientsChange(clients.filter(x => x.id !== c.id));
    showToast('Klient usunięty.');
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.nip ?? '').includes(search) ||
    (c.vat_number ?? '').includes(search) ||
    (c.city ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const f = (key: keyof typeof form, label: string, required = false, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Nagłówek */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-800">Baza klientów</h2>
          <p className="text-xs text-gray-400">{clients.length} klientów w bazie</p>
        </div>
        <input
          type="text"
          placeholder="Szukaj po nazwie, NIP, mieście..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-900 text-white text-sm rounded-lg hover:bg-blue-800 font-medium whitespace-nowrap"
        >
          + Dodaj klienta
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {search ? 'Brak wyników wyszukiwania.' : 'Brak klientów. Dodaj pierwszego klienta.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-200">
                  <th className="px-4 py-3 font-medium text-gray-600">Nazwa firmy</th>
                  <th className="px-4 py-3 font-medium text-gray-600">NIP / VAT</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Kraj</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Miasto</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Kontakt</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {c.country === 'PL' ? c.nip : c.vat_number}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.country === 'PL' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                        {c.country}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.email && <div>{c.email}</div>}
                      {c.phone && <div>{c.phone}</div>}
                      {!c.email && !c.phone && '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => openEdit(c)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">
                        Edytuj
                      </button>
                      <button onClick={() => handleDelete(c)} className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">
                {editClient ? 'Edytuj klienta' : 'Dodaj nowego klienta'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Kraj */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kraj <span className="text-red-500">*</span></label>
                <select
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="PL">🇵🇱 Polska (PL)</option>
                  <option value="NL">🇳🇱 Holandia (NL)</option>
                  <option value="DE">🇩🇪 Niemcy (DE)</option>
                  <option value="BE">🇧🇪 Belgia (BE)</option>
                  <option value="FR">🇫🇷 Francja (FR)</option>
                  <option value="GB">🇬🇧 Wielka Brytania (GB)</option>
                  <option value="CZ">🇨🇿 Czechy (CZ)</option>
                  <option value="SK">🇸🇰 Słowacja (SK)</option>
                  <option value="UA">🇺🇦 Ukraina (UA)</option>
                  <option value="OTHER">Inne</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {f('name', 'Nazwa firmy', true)}
                {form.country === 'PL' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NIP <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.nip}
                        onChange={e => setForm({ ...form, nip: e.target.value })}
                        placeholder="np. 5223222993"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={lookupNip}
                        disabled={nipLookupLoading}
                        title="Pobierz dane z GUS"
                        className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap"
                      >
                        {nipLookupLoading ? '...' : '🔍 GUS'}
                      </button>
                    </div>
                  </div>
                ) : f('vat_number', 'Numer VAT', true)}
                {f('address', 'Adres (ulica, nr)')}
                {f('postal_code', 'Kod pocztowy')}
                {f('city', 'Miasto')}
                {f('email', 'E-mail', false, 'email')}
                {f('phone', 'Telefon', false, 'tel')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                Anuluj
              </button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
                {saving ? 'Zapisywanie...' : editClient ? 'Zapisz zmiany' : 'Dodaj klienta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
