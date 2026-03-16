import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Offer, OfferStatus } from '../types';
import { formatPLN } from '../lib/calculations';

interface Props {
  offers: Offer[];
  onOffersChange: (offers: Offer[]) => void;
}

const STATUS_LABELS: Record<OfferStatus, string> = {
  szkic: 'Szkic',
  wysłana: 'Wysłana',
  przyjęta: 'Przyjęta',
  odrzucona: 'Odrzucona',
};

const STATUS_COLORS: Record<OfferStatus, string> = {
  szkic: 'bg-gray-100 text-gray-600',
  wysłana: 'bg-blue-100 text-blue-700',
  przyjęta: 'bg-green-100 text-green-700',
  odrzucona: 'bg-red-100 text-red-600',
};

export default function OffersTable({ offers, onOffersChange }: Props) {
  const [selected, setSelected] = useState<Offer | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OfferStatus | 'wszystkie'>('wszystkie');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function changeStatus(offer: Offer, status: OfferStatus) {
    const { error } = await supabase.from('offers').update({ status, updated_at: new Date().toISOString() }).eq('id', offer.id);
    if (error) return showToast('Błąd: ' + error.message, 'error');
    const updated = { ...offer, status };
    onOffersChange(offers.map(o => o.id === offer.id ? updated : o));
    if (selected?.id === offer.id) setSelected(updated);
    showToast('Status zaktualizowany.');
  }

  async function handleDelete(offer: Offer) {
    if (!confirm(`Usunąć ofertę ${offer.offer_number}?`)) return;
    const { error } = await supabase.from('offers').delete().eq('id', offer.id);
    if (error) return showToast('Błąd usuwania: ' + error.message, 'error');
    onOffersChange(offers.filter(o => o.id !== offer.id));
    if (selected?.id === offer.id) setSelected(null);
    showToast('Oferta usunięta.');
  }

  const filtered = offers.filter(o => {
    const matchSearch =
      o.offer_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.client?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      o.profile_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'wszystkie' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short' }).format(new Date(iso));
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Nagłówek + filtry */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-800">Oferty</h2>
          <p className="text-xs text-gray-400">{offers.length} ofert łącznie</p>
        </div>
        <input
          type="text"
          placeholder="Szukaj po numerze, kliencie, profilu..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as OfferStatus | 'wszystkie')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="wszystkie">Wszystkie statusy</option>
          {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-5">
        {/* Lista ofert */}
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${selected ? 'hidden lg:block lg:w-1/2' : 'w-full'}`}>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {search || filterStatus !== 'wszystkie' ? 'Brak wyników.' : 'Brak ofert. Utwórz pierwszą ofertę z kalkulatora.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left border-b border-gray-200">
                    <th className="px-4 py-3 font-medium text-gray-600">Nr oferty</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Klient</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Profil</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Kwota</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr
                      key={o.id}
                      className={`border-t border-gray-100 cursor-pointer transition-colors ${selected?.id === o.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelected(o)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-900">{o.offer_number}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">{o.client?.name ?? <span className="text-gray-400 italic">Brak klienta</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{o.profile_name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatPLN(o.rental_cost_pln)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(o.created_at)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleDelete(o)} className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50">
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

        {/* Podgląd oferty */}
        {selected && (
          <div className="w-full lg:w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <p className="font-mono text-sm font-bold text-blue-900">{selected.offer_number}</p>
                <p className="text-xs text-gray-400 mt-0.5">Utworzona {formatDate(selected.created_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Klient */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Klient</h4>
                {selected.client ? (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <p className="font-semibold text-gray-800">{selected.client.name}</p>
                    <p className="text-gray-500">
                      {selected.client.country === 'PL' ? `NIP: ${selected.client.nip}` : `VAT: ${selected.client.vat_number}`}
                      {' · '}{selected.client.country}
                    </p>
                    {selected.client.address && <p className="text-gray-500">{selected.client.address}, {selected.client.postal_code} {selected.client.city}</p>}
                    {selected.client.email && <p className="text-gray-500">{selected.client.email}</p>}
                    {selected.client.phone && <p className="text-gray-500">{selected.client.phone}</p>}
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-sm">Brak przypisanego klienta</p>
                )}
              </section>

              {/* Parametry */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Parametry wynajmu</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Profil', `${selected.profile_name} (${selected.profile_type})`],
                    ['Ilość', `${selected.quantity} szt.`],
                    ['Długość', `${selected.length_m} m / szt.`],
                    ['Okres', `${selected.rental_weeks} tygodnie`],
                    ['Łączna długość', `${selected.total_length_m} m`],
                    ['Masa', `${selected.mass_t} t`],
                    ['Powierzchnia', `${selected.wall_area_m2} m²`],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-gray-50 rounded p-2">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="font-medium text-gray-800">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Wycena */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Wycena</h4>
                <div className="bg-blue-900 rounded-lg p-4 text-white">
                  <p className="text-blue-200 text-xs mb-1">Koszt wynajmu</p>
                  <p className="text-3xl font-bold">{formatPLN(selected.rental_cost_pln)} <span className="text-lg font-normal">PLN</span></p>
                  <div className="mt-2 pt-2 border-t border-blue-800 grid grid-cols-2 gap-2 text-xs text-blue-200">
                    <span>{formatPLN(selected.cost_per_m2)} PLN/m²</span>
                    <span>{formatPLN(selected.cost_per_ton)} PLN/t</span>
                  </div>
                </div>
              </section>

              {/* Transport */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transport</h4>
                {selected.transport_cost_per_truck ? (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Liczba aut:</span>
                      <strong>{selected.transport_trucks}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Koszt / auto:</span>
                      <strong>{formatPLN(selected.transport_cost_per_truck)} PLN</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Koszt łączny:</span>
                      <strong>{formatPLN(selected.transport_cost_total ?? 0)} PLN</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Płaci:</span>
                      <span className={`font-medium ${selected.transport_paid_by === 'klient' ? 'text-orange-600' : 'text-gray-700'}`}>
                        {selected.transport_paid_by === 'klient' ? 'Klient' : 'Intra B.V.'}
                      </span>
                    </div>
                    {selected.transport_from && (
                      <div className="pt-1 border-t border-gray-200 text-gray-500 text-xs">
                        🚛 {selected.transport_from} → {selected.transport_to || '—'}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Brak kosztów transportu</p>
                )}
              </section>

              {/* Ważność */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ważność oferty</h4>
                <p className="text-sm text-gray-700">{selected.valid_days} dni od daty wystawienia</p>
              </section>

              {/* Notatki */}
              {selected.notes && (
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notatki</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selected.notes}</p>
                </section>
              )}

              {/* Status */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status oferty</h4>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => changeStatus(selected, s)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selected.status === s
                          ? STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-current'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
