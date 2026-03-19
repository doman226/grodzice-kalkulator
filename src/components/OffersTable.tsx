import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../lib/supabase';
import type { Offer, OfferStatus, Profile, RentalPrices, Client } from '../types';
import { formatPLN, formatNumber } from '../lib/calculations';
import OfferPDF from './OfferPDF';
import EditOfferModal from './EditOfferModal';

interface Props {
  offers: Offer[];
  onOffersChange: (offers: Offer[]) => void;
  profiles: Profile[];
  prices: RentalPrices;
  clients: Client[];
}

const STATUS_LABELS: Record<OfferStatus, string> = {
  szkic:     'Szkic',
  wysłana:   'Wysłana',
  przyjęta:  'Przyjęta',
  odrzucona: 'Odrzucona',
};

const STATUS_COLORS: Record<OfferStatus, string> = {
  szkic:     'bg-gray-100 text-gray-600',
  wysłana:   'bg-blue-100 text-blue-700',
  przyjęta:  'bg-green-100 text-green-700',
  odrzucona: 'bg-red-100 text-red-600',
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

export default function OffersTable({ offers, onOffersChange, profiles, prices, clients }: Props) {
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState<OfferStatus | 'wszystkie'>('wszystkie');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading]     = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [toast, setToast]               = useState('');
  const [error, setError]               = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleDownloadPDF(offer: Offer) {
    setPdfLoading(offer.id);
    try {
      const blob = await pdf(<OfferPDF offer={offer} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${offer.offer_number.replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Błąd generowania PDF: ' + (err as Error).message);
    } finally {
      setPdfLoading(null);
    }
  }

  async function changeStatus(offer: Offer, newStatus: OfferStatus) {
    setStatusSaving(offer.id);
    const { error: err } = await supabase
      .from('offers')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', offer.id);
    setStatusSaving(null);
    if (err) { setError('Błąd: ' + err.message); return; }
    onOffersChange(offers.map(o => o.id === offer.id ? { ...o, status: newStatus } : o));
    showToast('Status zaktualizowany ✓');
  }

  async function handleDelete(offer: Offer) {
    if (!confirm(`Przenieść ofertę ${offer.offer_number} do kosza?`)) return;
    const { error: err } = await supabase.rpc('soft_delete_offer', { p_offer_id: offer.id });
    if (err) { setError('Błąd: ' + err.message); return; }
    onOffersChange(offers.filter(o => o.id !== offer.id));
    if (expanded === offer.id) setExpanded(null);
    showToast('Oferta przeniesiona do kosza ✓');
  }

  const filtered = offers.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !search.trim() ||
      o.offer_number.toLowerCase().includes(q) ||
      (o.client?.name ?? '').toLowerCase().includes(q) ||
      o.profile_name.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'wszystkie' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek + filtry */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Oferty wynajmu</h2>
          <p className="text-xs text-gray-400 mt-0.5">{offers.length} ofert w bazie</p>
        </div>
        <div className="sm:ml-auto flex gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj po numerze, kliencie, profilu..."
            className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-700 text-sm">{error}</div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-semibold">Numer</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-semibold">Klient</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-semibold">Data</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-semibold">Profil</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Masa [t]</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Okres</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Kwota [PLN]</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-wide font-semibold">Status</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-wide font-semibold">Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  {search || filterStatus !== 'wszystkie'
                    ? 'Brak wyników dla podanych filtrów.'
                    : 'Brak ofert. Utwórz pierwszą ofertę z kalkulatora.'}
                </td>
              </tr>
            ) : filtered.map((offer, idx) => (
              <>
                <tr
                  key={offer.id}
                  className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                >
                  {/* Numer */}
                  <td className="px-4 py-3 font-mono font-semibold text-blue-900">
                    {offer.offer_number}
                  </td>

                  {/* Klient */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{offer.client?.name ?? <span className="text-gray-400 italic">—</span>}</span>
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(offer.created_at)}
                  </td>

                  {/* Profil */}
                  <td className="px-4 py-3 text-gray-700">
                    {offer.items && offer.items.length > 1
                      ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{offer.items.length} profili</span>
                      : offer.profile_name}
                  </td>

                  {/* Masa */}
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatNumber(offer.mass_t, 3)}
                  </td>

                  {/* Okres */}
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {offer.rental_weeks} tyg.
                  </td>

                  {/* Kwota */}
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {formatPLN(offer.rental_cost_pln)} PLN
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {statusSaving === offer.id ? (
                      <span className="text-xs text-blue-400">...</span>
                    ) : (
                      <select
                        value={offer.status}
                        onChange={e => changeStatus(offer, e.target.value as OfferStatus)}
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_COLORS[offer.status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Szczegóły */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setExpanded(expanded === offer.id ? null : offer.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {expanded === offer.id ? '▲ ukryj' : '▼ pozycje'}
                    </button>
                  </td>
                </tr>

                {/* Rozwinięty widok */}
                {expanded === offer.id && (
                  <tr key={offer.id + '-expanded'}>
                    <td colSpan={9} className="px-6 py-4 bg-blue-50 border-t border-blue-100">
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                          Szczegóły oferty {offer.offer_number}
                        </p>

                        {/* Metadane */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          {offer.prepared_by && (
                            <div><span className="text-gray-500">Opiekun:</span> <strong>{offer.prepared_by}</strong></div>
                          )}
                          <div>
                            <span className="text-gray-500">Płatność:</span>{' '}
                            <strong>{offer.payment_days === 0 ? 'Przedpłata' : `${offer.payment_days ?? 30} dni`}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Ważność:</span>{' '}
                            <strong>{offer.valid_days} dni</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Pow. ścianki:</span>{' '}
                            <strong>{formatNumber(offer.wall_area_m2, 1)} m²</strong>
                          </div>
                          {offer.transport_cost_per_truck && (
                            <div>
                              <span className="text-gray-500">Transport:</span>{' '}
                              <strong className={
                                (offer.transport_paid_by as string) === 'dap_extra' || (offer.transport_paid_by as string) === 'klient'
                                  ? 'text-orange-600' : ''
                              }>
                                {formatPLN(offer.transport_cost_total ?? 0)} PLN
                                {' '}
                                <span className="font-normal">(
                                  {(offer.transport_paid_by as string) === 'dap_included' || (offer.transport_paid_by as string) === 'intra' ? 'DAP – w cenie'
                                   : (offer.transport_paid_by as string) === 'dap_extra' || (offer.transport_paid_by as string) === 'klient' ? 'DAP – refaktura'
                                   : 'FCA – odbiór własny'}
                                )</span>
                              </strong>
                            </div>
                          )}
                          {(offer.transport_from || offer.transport_to) && (
                            <div className="col-span-2">
                              <span className="text-gray-500">Trasa:</span>{' '}
                              <strong>🚛 {offer.transport_from}{offer.transport_to ? ` → ${offer.transport_to}` : ''}</strong>
                            </div>
                          )}
                        </div>

                        {/* Tabela pozycji */}
                        {offer.items && offer.items.length > 0 && (
                          <div className="rounded-lg overflow-hidden border border-blue-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-blue-800 text-white">
                                  <th className="text-left px-3 py-2 font-semibold">Profil</th>
                                  <th className="text-left px-3 py-2 font-semibold">Gatunek stali</th>
                                  <th className="text-right px-3 py-2 font-semibold">Szt.</th>
                                  <th className="text-right px-3 py-2 font-semibold">Dług. [m]</th>
                                  <th className="text-right px-3 py-2 font-semibold">Masa [t]</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...offer.items]
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((item, i) => (
                                  <tr key={item.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                                    <td className="px-3 py-2 font-semibold text-gray-800">{item.profile_name}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.steel_grade?.toUpperCase() ?? '—'}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.length_m} m</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{formatNumber(item.mass_t, 3)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Wycena */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          <div className="bg-blue-900 rounded-lg px-3 py-2 text-white">
                            <p className="text-blue-300 mb-0.5">Koszt wynajmu</p>
                            <p className="font-bold text-base">{formatPLN(offer.rental_cost_pln)} PLN</p>
                          </div>
                          <div className="bg-white border border-blue-200 rounded-lg px-3 py-2">
                            <p className="text-gray-400 mb-0.5">Koszt / m²</p>
                            <p className="font-semibold text-gray-800">{formatPLN(offer.cost_per_m2)} PLN</p>
                          </div>
                          <div className="bg-white border border-blue-200 rounded-lg px-3 py-2">
                            <p className="text-gray-400 mb-0.5">Koszt / t</p>
                            <p className="font-semibold text-gray-800">{formatPLN(offer.cost_per_ton)} PLN</p>
                          </div>
                        </div>

                        {offer.notes && (
                          <p className="text-xs text-gray-600 italic">Notatki: {offer.notes}</p>
                        )}

                        {/* Przyciski akcji */}
                        <div className="flex justify-end gap-2 pt-2 border-t border-blue-200">
                          <button
                            onClick={() => handleDelete(offer)}
                            className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 text-xs font-medium px-3 py-2 rounded-lg border border-red-200 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                            </svg>
                            Usuń
                          </button>
                          <button
                            onClick={() => setEditingOffer(offer)}
                            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                            </svg>
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(offer)}
                            disabled={pdfLoading === offer.id}
                            className="inline-flex items-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:bg-blue-300 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            {pdfLoading === offer.id ? (
                              <>
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                                Generowanie…
                              </>
                            ) : (
                              <>
                                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                                </svg>
                                Pobierz PDF
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length} z {offers.length} ofert · kliknij „pozycje" aby zobaczyć szczegóły
      </p>

      {editingOffer && (
        <EditOfferModal
          offer={editingOffer}
          profiles={profiles}
          prices={prices}
          clients={clients}
          onSaved={(updated) => {
            onOffersChange(offers.map(o => o.id === updated.id ? updated : o));
            setEditingOffer(null);
            showToast('Oferta zaktualizowana ✓');
          }}
          onClose={() => setEditingOffer(null)}
        />
      )}
    </div>
  );
}
