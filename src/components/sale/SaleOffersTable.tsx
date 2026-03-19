import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleOffer, OfferStatus } from '../../types';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';

interface Props {
  offers: SaleOffer[];
  onOffersChange: (offers: SaleOffer[]) => void;
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function SaleOffersTable({ offers, onOffersChange }: Props) {
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [toast, setToast]           = useState('');
  const [error, setError]           = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function changeStatus(offer: SaleOffer, newStatus: OfferStatus) {
    setStatusSaving(offer.id);
    const { error: err } = await supabase
      .from('sale_offers')
      .update({ status: newStatus })
      .eq('id', offer.id);
    setStatusSaving(null);
    if (err) { setError('Błąd: ' + err.message); return; }
    onOffersChange(offers.map(o => o.id === offer.id ? { ...o, status: newStatus } : o));
    showToast('Status zaktualizowany ✓');
  }

  // Filtrowanie
  const filtered = offers.filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.offer_number?.toLowerCase().includes(q) ||
      o.client?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek + wyszukiwarka */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Oferty sprzedaży</h2>
          <p className="text-xs text-gray-400 mt-0.5">{offers.length} ofert w bazie</p>
        </div>
        <div className="sm:ml-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj po numerze lub kliencie..."
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Masa [t]</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Wartość EUR</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Wartość PLN</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-semibold">Marża %</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-wide font-semibold">Status</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-wide font-semibold">Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  {search ? 'Brak wyników dla podanego wyszukiwania.' : 'Brak ofert sprzedaży. Użyj kalkulatora, aby stworzyć pierwszą.'}
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
                    {offer.offer_number || '—'}
                  </td>

                  {/* Klient */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{offer.client?.name ?? '—'}</span>
                    {offer.client?.country && offer.client.country !== 'PL' && (
                      <span className="ml-1 text-xs text-gray-400">[{offer.client.country}]</span>
                    )}
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(offer.created_at)}
                  </td>

                  {/* Masa */}
                  <td className="px-4 py-3 text-right text-gray-600">
                    {offer.items
                      ? formatNumber(offer.items.reduce((s, i) => s + (i.mass_t ?? 0), 0), 3)
                      : '—'}
                  </td>

                  {/* Wartość EUR */}
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {offer.total_sell_eur != null ? `${formatEUR(offer.total_sell_eur)} EUR` : '—'}
                  </td>

                  {/* Wartość PLN */}
                  <td className="px-4 py-3 text-right text-gray-600">
                    {offer.total_sell_pln != null ? `${formatPLN(offer.total_sell_pln)} PLN` : '—'}
                  </td>

                  {/* Marża */}
                  <td className="px-4 py-3 text-right">
                    {offer.margin_pct != null ? (
                      <span className={`font-semibold ${
                        offer.margin_pct < 0 ? 'text-red-600'
                        : offer.margin_pct < 5 ? 'text-orange-600'
                        : offer.margin_pct < 10 ? 'text-yellow-700'
                        : 'text-green-700'
                      }`}>
                        {offer.margin_pct.toFixed(1)}%
                      </span>
                    ) : '—'}
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

                {/* Rozwinięty widok pozycji */}
                {expanded === offer.id && (
                  <tr key={offer.id + '-expanded'}>
                    <td colSpan={9} className="px-6 py-4 bg-blue-50 border-t border-blue-100">
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                          Pozycje oferty {offer.offer_number}
                        </p>

                        {/* Metadane */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          {offer.prepared_by && (
                            <div><span className="text-gray-500">Opiekun:</span> <strong>{offer.prepared_by}</strong></div>
                          )}
                          <div>
                            <span className="text-gray-500">Płatność:</span>{' '}
                            <strong>{offer.payment_days === 0 ? 'Przedpłata' : `${offer.payment_days} dni`}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Kurs EUR:</span>{' '}
                            <strong>{offer.exchange_rate?.toFixed(4) ?? '—'} PLN</strong>
                          </div>
                          {offer.delivery_cost_total != null && offer.delivery_cost_total > 0 && (
                            <div>
                              <span className="text-gray-500">Dostawa:</span>{' '}
                              <strong className={offer.delivery_paid_by === 'klient' ? 'text-orange-600' : ''}>
                                {formatPLN(offer.delivery_cost_total)} PLN
                                {' '}({offer.delivery_paid_by === 'klient' ? 'klient' : 'Intra'})
                              </strong>
                            </div>
                          )}
                          {(offer.delivery_from || offer.delivery_to) && (
                            <div className="col-span-2 sm:col-span-4">
                              <span className="text-gray-500">Trasa:</span>{' '}
                              <strong>🚛 {offer.delivery_from}{offer.delivery_to ? ` → ${offer.delivery_to}` : ''}</strong>
                            </div>
                          )}
                          {offer.delivery_terms && (
                            <div>
                              <span className="text-gray-500">Incoterms:</span>{' '}
                              <strong>
                                {offer.delivery_terms}
                                {offer.delivery_terms === 'FCA' && offer.fca_location ? ` (${offer.fca_location})` : ''}
                                {offer.delivery_terms === 'DAP' && offer.delivery_to ? ` (${offer.delivery_to})` : ''}
                              </strong>
                            </div>
                          )}
                          {offer.delivery_timeline && (
                            <div className="col-span-2 sm:col-span-2">
                              <span className="text-gray-500">Termin dostawy:</span>{' '}
                              <strong>
                                {offer.delivery_timeline === 'huta'
                                  ? `huta – kampania tyg. ${offer.campaign_weeks ?? '?'}${offer.campaign_delivery_weeks ? `, dostawy od tyg. ${offer.campaign_delivery_weeks}` : ''}`
                                  : `magazyn – ${offer.warehouse_delivery_time ?? ''}`}
                              </strong>
                            </div>
                          )}
                        </div>

                        {/* Tabela pozycji */}
                        {offer.items && offer.items.length > 0 ? (
                          <div className="rounded-lg overflow-hidden border border-blue-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-blue-800 text-white">
                                  <th className="text-left px-3 py-2 font-semibold">Profil</th>
                                  <th className="text-left px-3 py-2 font-semibold">Gatunek</th>
                                  <th className="text-left px-3 py-2 font-semibold">Magazyn</th>
                                  <th className="text-right px-3 py-2 font-semibold">Szt.</th>
                                  <th className="text-right px-3 py-2 font-semibold">Dług. [m]</th>
                                  <th className="text-right px-3 py-2 font-semibold">Masa [t]</th>
                                  <th className="text-right px-3 py-2 font-semibold">Koszt EUR/t</th>
                                  <th className="text-right px-3 py-2 font-semibold">Sprz. EUR/t</th>
                                  <th className="text-right px-3 py-2 font-semibold">Wartość EUR</th>
                                  <th className="text-right px-3 py-2 font-semibold">Marża</th>
                                </tr>
                              </thead>
                              <tbody>
                                {offer.items
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((item, i) => (
                                  <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                                    <td className="px-3 py-2 font-semibold text-gray-800">
                                      {item.profile_name}
                                      {item.is_paired && <span className="text-blue-600 ml-1">×2</span>}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{item.steel_grade?.toUpperCase()}</td>
                                    <td className="px-3 py-2 text-gray-600">{item.warehouse_name ?? '—'}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{item.length_m}</td>
                                    <td className="px-3 py-2 text-right text-gray-600">{formatNumber(item.mass_t, 3)}</td>
                                    <td className="px-3 py-2 text-right text-gray-500">{item.cost_eur_t ?? '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{item.sell_eur_t ?? '—'}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">
                                      {item.sell_eur_total != null ? `${formatEUR(item.sell_eur_total)} EUR` : '—'}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-semibold ${
                                      (item.margin_pct ?? 0) < 0 ? 'text-red-600'
                                      : (item.margin_pct ?? 0) < 5 ? 'text-orange-600'
                                      : 'text-green-700'
                                    }`}>
                                      {item.margin_pct != null ? `${item.margin_pct.toFixed(1)}%` : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Brak pozycji.</p>
                        )}

                        {offer.notes && (
                          <p className="text-xs text-gray-600 italic">Notatki: {offer.notes}</p>
                        )}
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
    </div>
  );
}
