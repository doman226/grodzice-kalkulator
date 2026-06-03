import { useState } from 'react';
import { supabase, fetchNipData } from '../../../lib/supabase';
import type { Client, PipeSaleOffer, PipeSaleOfferItem, OfferStatus } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import ClientSearchInput from '../../ClientSearchInput';
import { SALES_REPS, CountryOptions } from '../../../lib/constants';
import { PIPE_WAREHOUSE_DELIVERY_OPTIONS } from '../../../lib/pipeConstants';

// ─── Typy ────────────────────────────────────────────────────────────────────

/** Snapshot jednej pozycji rury — zbierany przez PipeSaleCalculator i przekazany do modala */
export interface PipeItemSnapshot {
  productType: string;
  condition: string;
  norm: string;                  // '' gdy stan bez atestu — zapis jako NULL
  normDescription: string;
  steelGrade: string;
  surface: string;
  diameterMm: number;
  wallThicknessMm: number;
  quantitySzt: number;
  lengthM: number;
  kgPerM: number;
  totalLengthM: number;
  massT: number;
  costPricePerTon: number;       // 0 gdy nie podano
  sellPricePerTon: number;
  costTotal: number;             // w walucie oferty
  sellTotal: number;             // w walucie oferty
  marginPct: number | null;
}

export interface PipeOfferTotals {
  totalLengthM: number;
  totalMassT: number;
  totalCost: number;             // suma costTotal (w walucie oferty)
  totalSell: number;             // suma sellTotal (w walucie oferty)
  totalMarginPct: number | null;
}

// Snapshot dostawy z PipeSaleCalculator. paidBy='fca' → klient sam, brak kosztów.
export interface PipeDeliverySnapshot {
  paidBy: 'dap_included' | 'dap_extra' | 'fca' | 'cif';
  trucks: number;
  costPerTruck: number;
  totalCostPLN: number;
  from: string;
  to: string;
}

interface Props {
  clients: Client[];
  items: PipeItemSnapshot[];
  totals: PipeOfferTotals;
  currency: 'EUR' | 'PLN';
  exchangeRate: number;
  delivery: PipeDeliverySnapshot;
  taskName?: string;
  onSaved: (offer: PipeSaleOffer) => void;
  onClose: () => void;
  onClientAdded: (c: Client) => void;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function PipeSaveOfferModal({
  clients, items, totals, currency, exchangeRate, delivery,
  onSaved, onClose, onClientAdded, taskName: initialTaskName,
}: Props) {
  // ── Podstawowe pola ──
  const [clientId, setClientId]       = useState('');
  const [taskName, setTaskName]       = useState(initialTaskName ?? '');
  const [preparedBy, setPreparedBy]   = useState(SALES_REPS[0].name);
  const [notes, setNotes]             = useState('');
  const [validDays, setValidDays]     = useState(1);   // standard: 1 dzień (PDF pokaże "24h")
  const [paymentDays, setPaymentDays] = useState(30);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // ── Termin dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>('magazyn');
  const [campaignWeeks, setCampaignWeeks]                 = useState('');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState('');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState('5–7 dni roboczych');

  // ── Warunki dostawy — initial wartość derived z paidBy z kalkulatora ──
  // (user może zmienić w modalu jak w grodzicach, np. DAP w paidBy ale terms 'DAP_EXTRA' na ofercie)
  const [deliveryTerms, setDeliveryTerms] = useState<'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF'>(
    delivery.paidBy === 'fca' ? 'FCA' : delivery.paidBy === 'cif' ? 'CIF' : delivery.paidBy === 'dap_extra' ? 'DAP_EXTRA' : 'DAP'
  );
  const [fcaLocation, setFcaLocation]     = useState('');

  // ── Nowy klient inline ──
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient]       = useState({ name: '', country: 'PL', nip: '', vat_number: '', address: '', city: '', postal_code: '', email: '', phone: '' });
  const [savingClient, setSavingClient] = useState(false);
  const [nipLoading, setNipLoading]     = useState(false);

  // ── Wyliczone ──
  // Denominacja: zawsze obliczamy EUR/PLN niezależnie od currency oferty
  const totalSellEUR = currency === 'EUR' ? totals.totalSell : totals.totalSell / exchangeRate;
  const totalSellPLN = currency === 'PLN' ? totals.totalSell : totals.totalSell * exchangeRate;
  const totalCostEUR = currency === 'EUR' ? totals.totalCost : totals.totalCost / exchangeRate;

  async function lookupNip() {
    const nip = newClient.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(nip)) { setError('Wpisz poprawny NIP (10 cyfr).'); return; }
    setNipLoading(true);
    try {
      const data = await fetchNipData(nip);
      setNewClient(prev => ({
        ...prev,
        name:        data.name        ?? prev.name,
        address:     data.address     ?? prev.address,
        postal_code: data.postal_code ?? prev.postal_code,
        city:        data.city        ?? prev.city,
      }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd połączenia z GUS.');
    }
    setNipLoading(false);
  }

  async function handleAddClient() {
    if (!newClient.name.trim()) return setError('Podaj nazwę firmy.');
    if (newClient.country === 'PL' && !newClient.nip.trim()) return setError('Podaj NIP.');
    if (newClient.country !== 'PL' && !newClient.vat_number.trim()) return setError('Podaj numer VAT.');
    setSavingClient(true);
    const { data, error: err } = await supabase.from('clients').insert({
      name:        newClient.name.trim(),
      country:     newClient.country,
      nip:         newClient.country === 'PL' ? newClient.nip.trim()         : null,
      vat_number:  newClient.country !== 'PL' ? newClient.vat_number.trim()  : null,
      address:     newClient.address.trim()     || null,
      city:        newClient.city.trim()        || null,
      postal_code: newClient.postal_code.trim() || null,
      email:       newClient.email.trim()       || null,
      phone:       newClient.phone.trim()       || null,
    }).select().single();
    setSavingClient(false);
    if (err) return setError('Błąd: ' + err.message);
    const c = data as Client;
    onClientAdded(c);
    setClientId(c.id);
    setAddingClient(false);
    setNewClient({ name: '', country: 'PL', nip: '', vat_number: '', address: '', city: '', postal_code: '', email: '', phone: '' });
    setError('');
  }

  // ─── Główna logika zapisu (saga pattern) ─────────────────────────────────

  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (items.length === 0) return setError('Dodaj przynajmniej jedną pozycję rury.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    setSaving(true);
    setError('');

    // KROK 1: INSERT oferty (trigger DB wygeneruje SR/YYYY/NNN)
    const { data: insertedOffer, error: err } = await supabase
      .from('pipe_sale_offers')
      .insert({
        offer_number:              '',
        client_id:                 clientId,
        task_name:                 taskName.trim() || null,
        status:                    'szkic' as OfferStatus,
        notes:                     notes.trim() || null,
        valid_days:                validDays,
        payment_days:              paymentDays,
        prepared_by:               preparedBy,
        currency,
        exchange_rate:             exchangeRate,
        total_cost_eur:            totalCostEUR  || null,
        total_sell_eur:            totalSellEUR  || null,
        total_sell_pln:            totalSellPLN  || null,
        margin_pct:                totals.totalMarginPct,
        delivery_trucks:           delivery.trucks       || null,
        delivery_cost_per_truck:   delivery.costPerTruck || null,
        delivery_cost_total:       delivery.totalCostPLN || null,   // canonical w PLN (jak w grodzicach)
        delivery_paid_by:          delivery.paidBy,
        delivery_from:             delivery.from.trim()  || null,
        delivery_to:               delivery.to.trim()    || null,
        delivery_timeline:         deliveryTimeline,
        campaign_weeks:            deliveryTimeline === 'huta'    ? campaignWeeks.trim()             : null,
        campaign_delivery_weeks:   deliveryTimeline === 'huta'    ? campaignDeliveryWeeks.trim() || null : null,
        warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime             : null,
        delivery_terms:            deliveryTerms,
        fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
      })
      .select('*, client:clients(*)')
      .single();

    if (err) {
      setSaving(false);
      return setError('Błąd zapisu oferty: ' + err.message);
    }

    const savedOffer = insertedOffer as PipeSaleOffer;

    // KROK 2: INSERT pozycji rur
    const { data: insertedItems, error: itemsErr } = await supabase
      .from('pipe_sale_offer_items')
      .insert(
        items.map((it, idx) => {
          const sellEurTotal = currency === 'EUR' ? it.sellTotal : it.sellTotal / exchangeRate;
          const sellPlnTotal = currency === 'PLN' ? it.sellTotal : it.sellTotal * exchangeRate;
          return {
            offer_id:           savedOffer.id,
            product_type:       it.productType,
            condition:          it.condition,
            norm:               it.norm.trim() || null,
            norm_description:   it.normDescription || null,
            steel_grade:        it.steelGrade,
            surface:            it.surface,
            diameter_mm:        it.diameterMm,
            wall_thickness_mm:  it.wallThicknessMm,
            quantity_szt:       it.quantitySzt,
            length_m:           it.lengthM,
            kg_per_m:           it.kgPerM,
            total_length_m:     it.totalLengthM,
            mass_t:             it.massT,
            cost_price_per_ton: it.costPricePerTon || null,
            sell_price_per_ton: it.sellPricePerTon,
            cost_total:         it.costTotal || null,
            sell_total:         it.sellTotal,
            sell_eur_total:     sellEurTotal,
            sell_pln_total:     sellPlnTotal,
            margin_pct:         it.marginPct,
            sort_order:         idx,
          };
        }),
      )
      .select();

    if (itemsErr) {
      // Saga rollback: usuń ofertę aby uniknąć osieroconej oferty bez pozycji
      await supabase.from('pipe_sale_offers').delete().eq('id', savedOffer.id);
      setSaving(false);
      return setError('Błąd zapisu pozycji – oferta anulowana: ' + itemsErr.message);
    }

    setSaving(false);
    savedOffer.items = (insertedItems ?? []) as PipeSaleOfferItem[];
    onSaved(savedOffer);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Zapisz ofertę sprzedaży rur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">

          {/* ── Nazwa zadania (opcjonalnie) ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
            <input type="text" value={taskName} maxLength={35} onChange={e => setTaskName(e.target.value)} placeholder="np. Budowa S5 odcinek Korzeńsko" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ── Klient ── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Klient</h3>
            {!addingClient ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <ClientSearchInput
                    clients={clients}
                    value={clientId}
                    onChange={setClientId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddingClient(true)}
                  className="px-3 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                >
                  + Nowy
                </button>
              </div>
            ) : (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newClient.country}
                    onChange={e => setNewClient({ ...newClient, country: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                  >
                    <CountryOptions />
                  </select>
                  {newClient.country === 'PL' ? (
                    <div className="flex gap-1">
                      <input
                        type="text" placeholder="NIP" value={newClient.nip}
                        onChange={e => setNewClient({ ...newClient, nip: e.target.value })}
                        className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <button onClick={lookupNip} disabled={nipLoading}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40">
                        {nipLoading ? '...' : 'GUS'}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text" placeholder="VAT" value={newClient.vat_number}
                      onChange={e => setNewClient({ ...newClient, vat_number: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
                <input
                  type="text" placeholder="Nazwa firmy" value={newClient.name}
                  onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="text" placeholder="Adres" value={newClient.address}
                  onChange={e => setNewClient({ ...newClient, address: e.target.value })}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="Kod" value={newClient.postal_code}
                    onChange={e => setNewClient({ ...newClient, postal_code: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text" placeholder="Miasto" value={newClient.city}
                    onChange={e => setNewClient({ ...newClient, city: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email" placeholder="Email" value={newClient.email}
                    onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="tel" placeholder="Telefon" value={newClient.phone}
                    onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddClient} disabled={savingClient}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-40">
                    {savingClient ? 'Zapis...' : 'Dodaj klienta'}
                  </button>
                  <button onClick={() => setAddingClient(false)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Dane oferty ── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Dane oferty</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Przygotował">
                <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {SALES_REPS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Ważność oferty [dni]">
                <input type="number" min={1} value={validDays}
                  onChange={e => setValidDays(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </Field>
              <Field label="Termin płatności [dni]">
                <input type="number" min={0} value={paymentDays}
                  onChange={e => setPaymentDays(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </Field>
            </div>
          </section>

          {/* ── Termin dostawy ── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Termin dostawy</h3>
            <div className="flex gap-2 mb-2">
              {(['magazyn', 'huta'] as const).map(t => (
                <button key={t}
                  onClick={() => setDeliveryTimeline(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${
                    deliveryTimeline === t
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'magazyn' ? 'Z magazynu' : 'Kampania huty'}
                </button>
              ))}
            </div>
            {deliveryTimeline === 'magazyn' ? (
              <Field label="Czas dostawy z magazynu">
                <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {PIPE_WAREHOUSE_DELIVERY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tygodnie kampanii (np. 50/51)">
                  <input type="text" value={campaignWeeks}
                    onChange={e => setCampaignWeeks(e.target.value)}
                    placeholder="np. 50/51"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                </Field>
                <Field label="Tygodnie dostawy">
                  <input type="text" value={campaignDeliveryWeeks}
                    onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                    placeholder="np. 52/01"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                </Field>
              </div>
            )}
          </section>

          {/* ── Warunki dostawy ── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Warunki dostawy</h3>
            <div className="flex gap-2 mb-2 flex-wrap">
              {(['DAP', 'DAP_EXTRA', 'FCA', 'CIF'] as const).map(t => (
                <button key={t}
                  onClick={() => setDeliveryTerms(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${
                    deliveryTerms === t
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'DAP'       ? 'DAP (transport w cenie)'
                   : t === 'DAP_EXTRA' ? 'DAP + transport extra'
                   : t === 'FCA'       ? 'FCA (odbiór własny)'
                                       : 'CIF (odbiór z portu)'}
                </button>
              ))}
            </div>
            {deliveryTerms === 'FCA' && (
              <Field label="Lokalizacja magazynu odbioru">
                <input type="text" value={fcaLocation}
                  onChange={e => setFcaLocation(e.target.value)}
                  placeholder="np. Magazyn dostawcy, ul. ..., miasto, PL"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </Field>
            )}
          </section>

          {/* ── Notatki ── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Notatki</h3>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="opcjonalne uwagi do oferty"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </section>

          {/* ── Podsumowanie wartości ── */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Podsumowanie do zapisu</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Pozycji:</span>{' '}
                <strong>{items.length}</strong>
              </div>
              <div>
                <span className="text-gray-600">Masa:</span>{' '}
                <strong>{formatNumber(totals.totalMassT, 3)} t</strong>
              </div>
              <div>
                <span className="text-gray-600">Suma oferty:</span>{' '}
                <strong>
                  {currency === 'EUR' ? formatEUR(totals.totalSell) : formatPLN(totals.totalSell)} {currency}
                </strong>
              </div>
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving || addingClient}
            className="px-4 py-2 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 font-medium">
            {saving ? 'Zapisywanie…' : 'Zapisz ofertę'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pomocniczy komponent pola ────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
