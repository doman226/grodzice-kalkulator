import { useState } from 'react';
import { supabase, fetchNipData } from '../../../lib/supabase';
import type {
  Client,
  RoadPlateSaleOffer,
  RoadPlateSaleOfferItem,
  RoadPlateSaleSteelGrade,
  OfferStatus,
} from '../../../types';
import { formatEUR, formatPLN, formatRound, formatNumber } from '../../../lib/calculations';
import ClientSearchInput from '../../ClientSearchInput';
import { SALES_REPS, CountryOptions } from '../../../lib/constants';

// ─── Typy snapshotu (eksportowane — używa RoadPlateSaleCalculator) ───────────

/** Snapshot jednej pozycji oferty płyt — obliczona przez kalkulator. */
export interface RoadPlateSaleItemSnapshot {
  profileId: string;
  profileName: string;
  steelGrade: RoadPlateSaleSteelGrade;
  thicknessMm: number;
  sheetLengthM: number;
  sheetWidthM: number;
  weightKgPerM2: number;
  quantitySzt: number;
  totalAreaM2: number;
  massT: number;
  costPricePerTon: number;   // w walucie oferty
  sellPricePerTon: number;   // w walucie oferty
  costTotal: number;         // w walucie oferty
  sellTotal: number;         // w walucie oferty
  sellEurTotal: number;      // zawsze EUR (denominacja)
  sellPlnTotal: number;      // zawsze PLN (denominacja)
  marginPct: number | null;
}

export interface RoadPlateSaleOfferTotals {
  totalMassT: number;
  totalAreaM2: number;
  totalCostEUR: number;
  totalSellEUR: number;
  totalSellPLN: number;
  overallMarginPct: number;
}

interface DeliveryData {
  trucks: number;
  costPerTruckCurr: number;
  totalCostCurr: number;
  totalCostEUR: number;
  paidBy: 'dap_included' | 'dap_extra' | 'fca';
  from: string;
  to: string;
}

interface Props {
  clients: Client[];
  items: RoadPlateSaleItemSnapshot[];
  totals: RoadPlateSaleOfferTotals;
  currency: 'EUR' | 'PLN';
  exchangeRate: number;
  nbpDate: string;
  delivery: DeliveryData | null;
  taskName?: string;
  onSaved: (offer: RoadPlateSaleOffer) => void;
  onClose: () => void;
  onClientAdded: (c: Client) => void;
}

// Opcje terminu dostawy z magazynu (te same co w SaveSaleOfferModal)
const WAREHOUSE_DELIVERY_OPTIONS = [
  'do 3 dni roboczych',
  '3–5 dni roboczych',
  '5–7 dni roboczych',
  '7–10 dni roboczych',
  'do 2 tygodni',
  'do ustalenia',
];

export default function RoadPlateSaveOfferModal({
  clients, items, totals, currency, exchangeRate, nbpDate, delivery,
  onSaved, onClose, onClientAdded, taskName: initialTaskName,
}: Props) {
  // ── Podstawowe pola ──
  const [taskName, setTaskName]       = useState(initialTaskName ?? '');
  const [clientId, setClientId]       = useState('');
  const [preparedBy, setPreparedBy]   = useState(SALES_REPS[0].name);
  const [notes, setNotes]             = useState('');
  const [validDays, setValidDays]     = useState(1);
  const [paymentDays, setPaymentDays] = useState(30);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // ── Termin dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>('magazyn');
  const [campaignWeeks, setCampaignWeeks]                 = useState('');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState('');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState('5–7 dni roboczych');

  // ── Warunki dostawy (Incoterms) ──
  const [deliveryTerms, setDeliveryTerms] = useState<'DAP' | 'DAP_EXTRA' | 'FCA'>(
    delivery?.paidBy === 'fca' ? 'FCA' : delivery?.paidBy === 'dap_extra' ? 'DAP_EXTRA' : 'DAP'
  );
  const [fcaLocation, setFcaLocation] = useState('');

  // ── Nowy klient inline ──
  const [addingClient, setAddingClient]   = useState(false);
  const [newClient, setNewClient]         = useState({
    name: '', country: 'PL', nip: '', vat_number: '', address: '', city: '',
    postal_code: '', email: '', phone: '',
  });
  const [savingClient, setSavingClient]   = useState(false);
  const [nipLoading, setNipLoading]       = useState(false);

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

  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (items.length === 0) return setError('Brak pozycji do zapisania.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    setSaving(true);
    setError('');

    // ── 1) Insert oferty (trigger DB nadaje offer_number SPP/YYYY/NNN) ──
    const { data, error: err } = await supabase
      .from('road_plate_sale_offers')
      .insert({
        client_id:                 clientId,
        task_name:                 taskName.trim() || null,
        status:                    'szkic' as OfferStatus,
        notes:                     notes.trim() || null,
        valid_days:                validDays,
        payment_days:              paymentDays,
        prepared_by:               preparedBy,
        currency,
        exchange_rate:             exchangeRate,
        total_cost_eur:            totals.totalCostEUR,
        total_sell_eur:            totals.totalSellEUR,
        total_sell_pln:            totals.totalSellPLN,
        margin_pct:                totals.overallMarginPct,
        delivery_trucks:           delivery?.trucks            ?? null,
        delivery_cost_per_truck:   delivery?.costPerTruckCurr  ?? null,
        delivery_cost_total:       delivery?.totalCostCurr     ?? null,
        delivery_paid_by:          delivery?.paidBy            ?? null,
        delivery_from:             delivery?.from?.trim()      || null,
        delivery_to:               delivery?.to?.trim()        || null,
        delivery_timeline:         deliveryTimeline,
        campaign_weeks:            deliveryTimeline === 'huta' ? campaignWeeks.trim()                 : null,
        campaign_delivery_weeks:   deliveryTimeline === 'huta' ? (campaignDeliveryWeeks.trim() || null) : null,
        warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime : null,
        delivery_terms:            deliveryTerms,
        fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
      })
      .select('*, client:clients(*)')
      .single();

    if (err) { setSaving(false); return setError('Błąd zapisu oferty: ' + err.message); }

    const savedOffer = data as RoadPlateSaleOffer;

    // ── 2) Insert pozycji ──
    const { data: insertedItems, error: itemsErr } = await supabase
      .from('road_plate_sale_offer_items')
      .insert(
        items.map((item, idx) => ({
          offer_id:           savedOffer.id,
          profile_id:         item.profileId,
          profile_name:       item.profileName,
          steel_grade:        item.steelGrade,
          thickness_mm:       item.thicknessMm,
          sheet_length_m:     item.sheetLengthM,
          sheet_width_m:      item.sheetWidthM,
          weight_kg_per_m2:   item.weightKgPerM2,
          quantity_szt:       item.quantitySzt,
          total_area_m2:      item.totalAreaM2,
          mass_t:             item.massT,
          cost_price_per_ton: item.costPricePerTon || null,
          sell_price_per_ton: item.sellPricePerTon,
          cost_total:         item.costTotal || null,
          sell_total:         item.sellTotal,
          sell_eur_total:     item.sellEurTotal,
          sell_pln_total:     item.sellPlnTotal,
          margin_pct:         item.marginPct,
          sort_order:         idx,
        }))
      )
      .select();

    if (itemsErr) {
      // Rollback: usuń ofertę bez pozycji (kaskada zadziała via ON DELETE CASCADE na items)
      await supabase.from('road_plate_sale_offers').delete().eq('id', savedOffer.id);
      setSaving(false);
      return setError('Błąd zapisu pozycji – oferta anulowana: ' + itemsErr.message);
    }

    setSaving(false);
    savedOffer.items = (insertedItems ?? []) as RoadPlateSaleOfferItem[];
    onSaved(savedOffer);
  }

  // ─── Wartości pomocnicze do podglądu ───────────────────────────────────────
  const deliveryCostCurrency = delivery?.paidBy === 'dap_included'
    ? (currency === 'EUR' ? delivery.totalCostEUR : delivery.totalCostCurr)
    : 0;
  const totalForClient = (currency === 'EUR' ? totals.totalSellEUR : totals.totalSellPLN) + deliveryCostCurrency;
  const year = new Date().getFullYear();

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">

        {/* Nagłówek */}
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Zapisz ofertę sprzedaży płyt</h3>
          <p className="text-xs text-gray-400 mt-0.5">SPP/{year}/XXX – numer nadany automatycznie</p>
        </div>

        <div className="p-6 space-y-5">

          {/* Podsumowanie pozycji */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-2">
              Płyty drogowe ({items.length} poz.)
            </p>
            <div className="space-y-1 mb-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.profileName} <span className="text-gray-400">({item.steelGrade})</span> – {item.quantitySzt} szt.
                  </span>
                  <span className="font-medium text-gray-800">
                    {formatNumber(item.massT, 3)} t · {formatEUR(item.sellEurTotal)} EUR
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-blue-200 text-sm space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-600">Łącznie masa:</span>
                <span className="font-semibold text-gray-800">{formatNumber(totals.totalMassT, 3)} t</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Łącznie sprzedaż:</span>
                <span className="font-semibold text-gray-800">
                  {currency === 'EUR' ? `${formatEUR(totals.totalSellEUR)} EUR` : `${formatPLN(totals.totalSellPLN)} PLN`}
                </span>
              </div>
              {delivery && delivery.paidBy === 'dap_included' && delivery.totalCostCurr > 0 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>+ transport w cenie:</span>
                  <span>{currency === 'EUR' ? `${formatEUR(delivery.totalCostEUR)} EUR` : `${formatRound(delivery.totalCostCurr)} PLN`}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-blue-100 text-base">
                <span className="font-semibold text-blue-900">Do zapłaty klient:</span>
                <span className="font-bold text-blue-900">
                  {currency === 'EUR' ? `${formatEUR(totalForClient)} EUR` : `${formatRound(totalForClient)} PLN`}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Marża ogólna:</span>
                <span className={
                  totals.overallMarginPct < 0 ? 'text-red-600 font-semibold' :
                  totals.overallMarginPct < 5 ? 'text-orange-600' :
                  totals.overallMarginPct < 10 ? 'text-yellow-700' :
                  'text-green-700 font-semibold'
                }>
                  {totals.overallMarginPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Kurs EUR/PLN:</span>
                <span>{exchangeRate.toFixed(4)} {nbpDate ? `(NBP ${nbpDate})` : '(ręczny)'}</span>
              </div>
            </div>
          </div>

          {/* ── Nazwa zadania (opcjonalnie) ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
            <input type="text" value={taskName} maxLength={35} onChange={e => setTaskName(e.target.value)} placeholder="np. Budowa S5 odcinek Korzeńsko" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ── Klient ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klient *</label>
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
                  onClick={() => setAddingClient(true)}
                  className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                >
                  + Nowy
                </button>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="Nazwa firmy *"
                    value={newClient.name}
                    onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm col-span-2"
                  />
                  <select
                    value={newClient.country}
                    onChange={e => setNewClient(p => ({ ...p, country: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    <CountryOptions />
                  </select>
                  {newClient.country === 'PL' ? (
                    <div className="flex gap-1">
                      <input
                        type="text" placeholder="NIP"
                        value={newClient.nip}
                        onChange={e => setNewClient(p => ({ ...p, nip: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <button
                        onClick={lookupNip}
                        disabled={nipLoading}
                        className="text-xs px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
                      >
                        {nipLoading ? '...' : 'GUS'}
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text" placeholder="VAT EU"
                      value={newClient.vat_number}
                      onChange={e => setNewClient(p => ({ ...p, vat_number: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                  )}
                </div>
                <input
                  type="text" placeholder="Ulica i numer"
                  value={newClient.address}
                  onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text" placeholder="Kod"
                    value={newClient.postal_code}
                    onChange={e => setNewClient(p => ({ ...p, postal_code: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="text" placeholder="Miasto"
                    value={newClient.city}
                    onChange={e => setNewClient(p => ({ ...p, city: e.target.value }))}
                    className="col-span-2 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddClient}
                    disabled={savingClient}
                    className="bg-blue-700 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-800 disabled:opacity-50"
                  >
                    {savingClient ? 'Zapisywanie...' : 'Zapisz klienta'}
                  </button>
                  <button
                    onClick={() => setAddingClient(false)}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Opiekun + Ważność + Termin płatności */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Opiekun</label>
              <select
                value={preparedBy}
                onChange={e => setPreparedBy(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SALES_REPS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ważność [dni]</label>
              <input
                type="number" min={1}
                value={validDays}
                onChange={e => setValidDays(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Płatność [dni]</label>
              <input
                type="number" min={0}
                value={paymentDays}
                onChange={e => setPaymentDays(parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="0 = przedpłata"
              />
            </div>
          </div>

          {/* Termin dostawy */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Termin dostawy</label>
            <div className="flex gap-2">
              {(['magazyn', 'huta'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDeliveryTimeline(t)}
                  className={`flex-1 px-2 py-1.5 text-sm rounded border ${deliveryTimeline === t
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                >
                  {t === 'magazyn' ? 'Z magazynu' : 'Z huty (kampania)'}
                </button>
              ))}
            </div>
            {deliveryTimeline === 'magazyn' ? (
              <select
                value={warehouseDeliveryTime}
                onChange={e => setWarehouseDeliveryTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {WAREHOUSE_DELIVERY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text" placeholder="Tyg. kampanii np. 50/51"
                  value={campaignWeeks}
                  onChange={e => setCampaignWeeks(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text" placeholder="Tyg. dostawy np. 51/52"
                  value={campaignDeliveryWeeks}
                  onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Incoterms */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Warunki dostawy (Incoterms)</label>
            <div className="flex gap-2">
              {(['DAP', 'DAP_EXTRA', 'FCA'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDeliveryTerms(t)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${deliveryTerms === t
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                >
                  {t === 'DAP' ? 'DAP – w cenie' : t === 'DAP_EXTRA' ? 'DAP – refaktura' : 'FCA – odbiór'}
                </button>
              ))}
            </div>
            {deliveryTerms === 'FCA' && (
              <input
                type="text" placeholder="Magazyn odbioru, np. Cieśle 42 56400 PL"
                value={fcaLocation}
                onChange={e => setFcaLocation(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notatki (wewn.)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Akcje */}
        <div className="p-6 border-t border-gray-100 flex justify-between gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clientId}
            className="bg-blue-900 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Zapisywanie...' : '💾 Zapisz ofertę SPP'}
          </button>
        </div>
      </div>
    </div>
  );
}
