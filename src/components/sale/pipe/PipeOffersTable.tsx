import { Fragment, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../../lib/supabase';
import type { Client, PipeSaleOffer, OfferStatus } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import PipeEditOfferModal from './PipeEditOfferModal';
import PipeOfferPDF from './PipeOfferPDF';
import type { PdfLang } from '../../../lib/pdfStrings';

interface Props {
  offers: PipeSaleOffer[];
  onOffersChange: (offers: PipeSaleOffer[]) => void;
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PipeOffersTable({ offers, onOffersChange, clients }: Props) {
  const [search, setSearch]             = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [toast, setToast]               = useState('');
  const [error, setError]               = useState('');
  const [editOffer, setEditOffer]       = useState<PipeSaleOffer | null>(null);
  const [pdfLoading, setPdfLoading]     = useState<string | null>(null);  // klucz: `${offer.id}-${lang}`

  function handleOfferUpdated(updated: PipeSaleOffer) {
    onOffersChange(offers.map(o => o.id === updated.id ? updated : o));
    setEditOffer(null);
    showToast('Oferta zaktualizowana ✓');
  }

  async function handleDownloadPDF(offer: PipeSaleOffer, lang: PdfLang = 'pl') {
    const key = `${offer.id}-${lang}`;
    setPdfLoading(key);
    try {
      const blob = await pdf(<PipeOfferPDF offer={offer} lang={lang} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${offer.offer_number.replace(/\//g, '-')}-${lang.toUpperCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Błąd generowania PDF: ' + (err as Error).message);
    } finally {
      setPdfLoading(null);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function changeStatus(offer: PipeSaleOffer, newStatus: OfferStatus) {
    setStatusSaving(offer.id);
    const { error: err } = await supabase
      .from('pipe_sale_offers')
      .update({ status: newStatus })
      .eq('id', offer.id);
    setStatusSaving(null);
    if (err) { setError('Błąd: ' + err.message); return; }
    onOffersChange(offers.map(o => o.id === offer.id ? { ...o, status: newStatus } : o));
    showToast('Status zaktualizowany ✓');
  }

  async function handleDelete(offer: PipeSaleOffer) {
    // Wymagana akceptacja użytkownika przed soft-delete (zgodnie z fazą 2 — pkt 6)
    if (!confirm(`Przenieść ofertę ${offer.offer_number} do kosza?\n(soft-delete — możliwa do przywrócenia w bazie przez UPDATE deleted_at = NULL)`)) return;
    const { error: err } = await supabase
      .from('pipe_sale_offers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', offer.id);
    if (err) { setError('Błąd: ' + err.message); return; }
    onOffersChange(offers.filter(o => o.id !== offer.id));
    if (expanded === offer.id) setExpanded(null);
    showToast('Oferta przeniesiona do kosza ✓');
  }

  // Marża on-the-fly: nadrzędna nad zapisanym margin_pct (jak w SaleOffersTable)
  function computeMargin(offer: PipeSaleOffer): number | null {
    const its = offer.items ?? [];
    const sellEUR = its.reduce((s, i) => s + (i.sell_eur_total ?? 0), 0);
    const costEUR = its.reduce((s, i) => {
      // cost_total w walucie oferty; ale w EUR raporcie potrzebujemy denominacji
      if (!i.cost_total) return s;
      if (offer.currency === 'EUR') return s + i.cost_total;
      return s + (offer.exchange_rate ? i.cost_total / offer.exchange_rate : 0);
    }, 0);
    if (sellEUR <= 0) return null;
    return ((sellEUR - costEUR) / sellEUR) * 100;
  }

  function fmtCurrency(val: number | undefined, currency: string): string {
    if (val == null) return '—';
    return currency === 'EUR' ? `${formatEUR(val)} EUR` : `${formatPLN(val)} PLN`;
  }

  // Filtrowanie po numerze i kliencie
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

      {/* Modal edycji */}
      {editOffer && (
        <PipeEditOfferModal
          offer={editOffer}
          clients={clients}
          onSaved={handleOfferUpdated}
          onClose={() => setEditOffer(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek + wyszukiwarka */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Oferty sprzedaży rur (SR)</h2>
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
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          {offers.length === 0
            ? 'Brak zapisanych ofert. Wystaw pierwszą z kalkulatora.'
            : 'Brak ofert pasujących do wyszukiwania.'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8"></th>
                <th className="text-left  px-3 py-2 font-medium text-gray-600">Numer</th>
                <th className="text-left  px-3 py-2 font-medium text-gray-600">Klient</th>
                <th className="text-left  px-3 py-2 font-medium text-gray-600">Data</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Masa</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Wartość</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Marża</th>
                <th className="text-left  px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(offer => {
                const isOpen = expanded === offer.id;
                const margin = computeMargin(offer);
                const totalMassT = (offer.items ?? []).reduce((s, i) => s + (i.mass_t ?? 0), 0);
                return (
                  <Fragment key={offer.id}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer ${isOpen ? 'bg-blue-50/40' : ''}`}
                      onClick={() => setExpanded(isOpen ? null : offer.id)}
                    >
                      <td className="px-2 text-gray-400 text-center">{isOpen ? '▼' : '▶'}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-blue-900">{offer.offer_number}</td>
                      <td className="px-3 py-2 text-gray-700">{offer.client?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{formatDate(offer.created_at)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totalMassT, 3)} t</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtCurrency(offer.total_sell_eur ?? undefined, 'EUR')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {margin === null ? '—' : `${formatNumber(margin, 1)}%`}
                      </td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <select
                          value={offer.status}
                          onChange={e => changeStatus(offer, e.target.value as OfferStatus)}
                          disabled={statusSaving === offer.id}
                          className={`text-xs px-2 py-1 rounded font-medium border-0 cursor-pointer ${STATUS_COLORS[offer.status]} disabled:opacity-50`}
                        >
                          {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s =>
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleDownloadPDF(offer, 'pl')}
                          disabled={pdfLoading === `${offer.id}-pl`}
                          className="text-xs text-emerald-700 hover:text-emerald-900 font-medium mr-2 disabled:opacity-40"
                          title="Pobierz PDF (polski)"
                        >
                          {pdfLoading === `${offer.id}-pl` ? '...' : 'PDF PL'}
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(offer, 'en')}
                          disabled={pdfLoading === `${offer.id}-en`}
                          className="text-xs text-emerald-700 hover:text-emerald-900 font-medium mr-2 disabled:opacity-40"
                          title="Pobierz PDF (angielski)"
                        >
                          {pdfLoading === `${offer.id}-en` ? '...' : 'PDF EN'}
                        </button>
                        <button
                          onClick={() => setEditOffer(offer)}
                          className="text-xs text-blue-700 hover:text-blue-900 font-medium mr-2"
                          title="Edytuj ofertę"
                        >
                          Edytuj
                        </button>
                        <button
                          onClick={() => handleDelete(offer)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                          title="Przenieś do kosza (soft-delete)"
                        >
                          Usuń
                        </button>
                      </td>
                    </tr>

                    {/* Wiersz rozwinięty z pozycjami */}
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                          <ExpandedOfferDetails offer={offer} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Wiersz rozwinięty z pozycjami i warunkami dostawy ───────────────────────

function ExpandedOfferDetails({ offer }: { offer: PipeSaleOffer }) {
  const its = offer.items ?? [];
  const currency = offer.currency || 'EUR';
  const fmtSell = (v: number | null | undefined) => v == null ? '—' : currency === 'EUR' ? `${formatEUR(v)} EUR` : `${formatPLN(v)} PLN`;

  return (
    <div className="space-y-4">
      {/* Metadane oferty */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Meta label="Ważność" value={`${offer.valid_days} dni`} />
        <Meta label="Termin płatności" value={`${offer.payment_days} dni`} />
        <Meta label="Przygotował" value={offer.prepared_by || '—'} />
        <Meta label="Kurs" value={offer.exchange_rate ? `${offer.exchange_rate.toFixed(4)} (${currency})` : currency} />
        <Meta label="Warunki" value={offer.delivery_terms || '—'} />
        <Meta label="Termin" value={
          offer.delivery_timeline === 'huta'
            ? `Kampania ${offer.campaign_weeks || '?'} → dostawa ${offer.campaign_delivery_weeks || '?'}`
            : offer.warehouse_delivery_time || '—'
        } />
        <Meta label="Trasa" value={offer.delivery_from && offer.delivery_to ? `${offer.delivery_from} → ${offer.delivery_to}` : '—'} />
        <Meta label="Transport" value={offer.delivery_cost_total ? `${offer.delivery_trucks} szt. × ${fmtSell(offer.delivery_cost_per_truck)}` : '—'} />
      </div>

      {/* Tabela pozycji */}
      {its.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5">Typ / Stan</th>
                <th className="text-left px-2 py-1.5">Norma / Gatunek</th>
                <th className="text-left px-2 py-1.5">Powierzchnia</th>
                <th className="text-right px-2 py-1.5">Ø × t [mm]</th>
                <th className="text-right px-2 py-1.5">Ilość × dł.</th>
                <th className="text-right px-2 py-1.5">kg/m</th>
                <th className="text-right px-2 py-1.5">Masa [t]</th>
                <th className="text-right px-2 py-1.5">Cena {currency}/t</th>
                <th className="text-right px-2 py-1.5">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {its.map(i => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{i.product_type}</div>
                    <div className="text-gray-500">{i.condition}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono">{i.norm || '—'}</div>
                    <div className="text-gray-500">{i.steel_grade}</div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 max-w-[180px] truncate" title={i.surface}>{i.surface}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(i.diameter_mm, 1)} × {formatNumber(i.wall_thickness_mm, 1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{i.quantity_szt} × {formatNumber(i.length_m, 2)} m</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(i.kg_per_m, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(i.mass_t, 3)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(i.sell_price_per_ton, 2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmtSell(i.sell_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-blue-50 border-t border-blue-200">
              <tr>
                <td colSpan={6} className="px-2 py-2 text-right font-medium text-gray-700">Razem:</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  {formatNumber(its.reduce((s, i) => s + (i.mass_t ?? 0), 0), 3)} t
                </td>
                <td></td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-900">
                  {fmtSell(its.reduce((s, i) => s + (i.sell_total ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Notatki */}
      {offer.notes && (
        <div className="text-xs text-gray-600">
          <strong className="text-gray-800">Notatki: </strong>
          <span className="italic">{offer.notes}</span>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </div>
  );
}
