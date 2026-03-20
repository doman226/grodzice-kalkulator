import { useState } from 'react';
import { supabase, fetchNipData } from '../../lib/supabase';
import type { Client, SaleOffer, SaleOfferItem, OfferStatus } from '../../types';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';

// ─── Typy ────────────────────────────────────────────────────────────────────

/** Snapshot jednej pozycji – obliczona przez kalkulator */
export interface SaleItemSnapshot {
  warehouseId: string;
  warehouseName: string;
  profileName: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
  isPaired: boolean;
  totalLengthM: number;
  massT: number;
  wallAreaM2: number;
  costEurT: number;
  sellEurT: number;
  costEurTotal: number;
  sellEurTotal: number;
  marginPct: number;
}

interface Totals {
  totalMassT: number;
  totalWallAreaM2: number;
  totalCostEUR: number;
  totalSellEUR: number;
  totalSellPLN: number;
  overallMarginPct: number;
}

interface DeliveryData {
  trucks: number;
  costPerTruck: number;
  totalCostPLN: number;
  paidBy: 'dap_included' | 'dap_extra' | 'fca';
  from: string;
  to: string;
}

interface Props {
  clients: Client[];
  items: SaleItemSnapshot[];
  totals: Totals;
  currency: 'EUR' | 'PLN';
  exchangeRate: number;
  nbpDate: string;
  delivery: DeliveryData | null;
  onSaved: (offer: SaleOffer) => void;
  onClose: () => void;
  onClientAdded: (c: Client) => void;
}

const SALES_REPS = [
  { name: 'Szymon Sobczak',    phone: '579 376 107' },
  { name: 'Mateusz Cieślicki', phone: '579 141 243' },
  { name: 'Marzena Sobczak',   phone: '579 241 508' },
  { name: 'Piotr Domański',    phone: '729 393 743' },
];

const WAREHOUSE_DELIVERY_OPTIONS = [
  'do 3 dni roboczych',
  '3–5 dni roboczych',
  '5–7 dni roboczych',
  '7–10 dni roboczych',
  'do 2 tygodni',
  'do ustalenia',
];

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function SaveSaleOfferModal({
  clients, items, totals, currency, exchangeRate, nbpDate, delivery,
  onSaved, onClose, onClientAdded,
}: Props) {
  // ── Podstawowe pola ──
  const [clientId, setClientId]       = useState('');
  const [preparedBy, setPreparedBy]   = useState(SALES_REPS[0].name);
  const [notes, setNotes]             = useState('');
  const [validDays, setValidDays]     = useState(1);
  const [paymentDays, setPaymentDays] = useState(30);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // ── Termin dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>('magazyn');
  const [campaignWeeks, setCampaignWeeks]                 = useState('');        // np. "50/51"
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState('');        // np. "51/52"
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState('5–7 dni roboczych');

  // ── Warunki dostawy ──
  // domyślnie FCA gdy opcja fca, DAP w pozostałych przypadkach
  const [deliveryTerms, setDeliveryTerms] = useState<'DAP' | 'FCA'>(
    delivery?.paidBy === 'fca' ? 'FCA' : 'DAP'
  );
  const [fcaLocation, setFcaLocation] = useState('');

  // ── Nowy klient inline ──
  const [addingClient, setAddingClient]   = useState(false);
  const [newClient, setNewClient]         = useState({ name: '', country: 'PL', nip: '', vat_number: '' });
  const [savingClient, setSavingClient]   = useState(false);
  const [nipLoading, setNipLoading]       = useState(false);

  async function lookupNip() {
    const nip = newClient.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(nip)) { setError('Wpisz poprawny NIP (10 cyfr).'); return; }
    setNipLoading(true);
    try {
      const data = await fetchNipData(nip);
      setNewClient(prev => ({ ...prev, name: data.name ?? prev.name }));
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
      name:       newClient.name.trim(),
      country:    newClient.country,
      nip:        newClient.country === 'PL'  ? newClient.nip.trim()        : null,
      vat_number: newClient.country !== 'PL'  ? newClient.vat_number.trim() : null,
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
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');
    setSaving(true);
    setError('');

    const { data, error: err } = await supabase
      .from('sale_offers')
      .insert({
        offer_number:              '',
        client_id:                 clientId,
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
        delivery_trucks:           delivery?.trucks          ?? null,
        delivery_cost_per_truck:   delivery?.costPerTruck    ?? null,
        delivery_cost_total:       delivery?.totalCostPLN    ?? null,
        delivery_paid_by:          delivery?.paidBy          ?? null,
        delivery_from:             delivery?.from?.trim()    || null,
        delivery_to:               delivery?.to?.trim()      || null,
        // Warunki oferty
        delivery_timeline:         deliveryTimeline,
        campaign_weeks:            deliveryTimeline === 'huta' ? campaignWeeks.trim()         : null,
        campaign_delivery_weeks:   deliveryTimeline === 'huta' ? campaignDeliveryWeeks.trim() || null : null,
        warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime     : null,
        delivery_terms:            deliveryTerms,
        fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
      })
      .select('*, client:clients(*)')
      .single();

    if (err) { setSaving(false); return setError('Błąd zapisu oferty: ' + err.message); }

    const savedOffer = data as SaleOffer;

    const { data: insertedItems, error: itemsErr } = await supabase
      .from('sale_offer_items')
      .insert(
        items.map((item, idx) => ({
          offer_id:       savedOffer.id,
          warehouse_id:   item.warehouseId   || null,
          warehouse_name: item.warehouseName || null,
          profile_name:   item.profileName,
          steel_grade:    item.steelGrade,
          quantity:       item.quantity,
          length_m:       item.lengthM,
          is_paired:      item.isPaired,
          total_length_m: item.totalLengthM,
          mass_t:         item.massT,
          wall_area_m2:   item.wallAreaM2,
          cost_eur_t:     item.costEurT     || null,
          sell_eur_t:     item.sellEurT     || null,
          cost_eur_total: item.costEurTotal || null,
          sell_eur_total: item.sellEurTotal || null,
          sell_pln_total: (currency === 'EUR' ? item.sellEurTotal * exchangeRate : item.sellEurTotal) || null,
          margin_pct:     item.marginPct,
          sort_order:     idx,
        }))
      )
      .select();

    if (itemsErr) {
      await supabase.from('sale_offers').delete().eq('id', savedOffer.id);
      setSaving(false);
      return setError('Błąd zapisu pozycji – oferta anulowana: ' + itemsErr.message);
    }

    setSaving(false);
    savedOffer.items = (insertedItems ?? []) as SaleOfferItem[];
    onSaved(savedOffer);
  }

  const deliveryCostCurrency   = delivery?.paidBy === 'dap_included'
    ? (currency === 'EUR' ? delivery.totalCostPLN / exchangeRate : delivery.totalCostPLN)
    : 0;
  const totalForClientCurrency = (currency === 'EUR' ? totals.totalSellEUR : totals.totalSellPLN) + deliveryCostCurrency;
  const year = new Date().getFullYear();

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">

        {/* Nagłówek */}
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Zapisz ofertę sprzedaży</h3>
          <p className="text-xs text-gray-400 mt-0.5">SP/{year}/XXX – numer nadany automatycznie</p>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Podsumowanie pozycji ── */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-2">
              Pozycje ({items.length})
            </p>
            <div className="space-y-1 mb-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.profileName}
                    {item.isPaired && <span className="text-blue-600 ml-1 text-xs">×2</span>}
                    {' '}– {item.quantity} szt. × {item.lengthM} m
                    <span className="text-gray-400 ml-1">({item.steelGrade.toUpperCase()}) · {item.warehouseName}</span>
                  </span>
                  <span className="font-medium text-gray-800">{formatNumber(item.massT, 3)} t</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-blue-200 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Masa łączna:</span> <strong>{formatNumber(totals.totalMassT, 3)} t</strong></div>
              <div><span className="text-gray-500">Kurs EUR:</span> <strong>{exchangeRate.toFixed(4)} PLN{nbpDate ? ' (NBP)' : ' (ręczny)'}</strong></div>
            </div>
            <div className="pt-2 border-t border-blue-200 mt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Wartość sprzedaży (EUR):</span>
                <strong>{formatEUR(totals.totalSellEUR)} EUR</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Wartość sprzedaży (PLN):</span>
                <strong>{formatPLN(totals.totalSellPLN)} PLN</strong>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                <span className="text-gray-600 font-medium">Marża łączna:</span>
                <strong className={totals.overallMarginPct < 0 ? 'text-red-600' : totals.overallMarginPct < 5 ? 'text-orange-600' : 'text-green-700'}>
                  {totals.overallMarginPct.toFixed(1)}%
                </strong>
              </div>
              {delivery && (
                <>
                  {delivery.costPerTruck > 0 && delivery.paidBy !== 'fca' && (
                    <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                      <span className={delivery.paidBy === 'dap_extra' ? 'text-orange-600' : 'text-gray-500'}>
                        Dostawa ({delivery.trucks} aut{delivery.trucks > 1 ? 'a' : ''})
                        {delivery.paidBy === 'dap_extra' && <span className="ml-1 font-medium">[refaktura]</span>}:
                      </span>
                      <strong className={delivery.paidBy === 'dap_extra' ? 'text-orange-600' : ''}>
                        {currency === 'EUR'
                          ? `${formatEUR(delivery.totalCostPLN / exchangeRate)} EUR`
                          : `${formatPLN(delivery.totalCostPLN)} PLN`}
                      </strong>
                    </div>
                  )}
                  {delivery.paidBy === 'fca' && (
                    <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
                      <span className="text-gray-500">Dostawa:</span>
                      <strong className="text-green-700">FCA – odbiór własny</strong>
                    </div>
                  )}
                  {delivery.paidBy === 'dap_included' && delivery.costPerTruck > 0 && (
                    <div className="flex justify-between text-sm font-semibold pt-1 border-t border-blue-200 text-blue-900">
                      <span>Łącznie dla klienta:</span>
                      <span>
                        {currency === 'EUR'
                          ? `${formatEUR(totalForClientCurrency)} EUR`
                          : `${formatPLN(totalForClientCurrency)} PLN`}
                      </span>
                    </div>
                  )}
                  {(delivery.from || delivery.to) && delivery.paidBy !== 'fca' && (
                    <p className="text-xs text-gray-500 mt-1">
                      🚛 {delivery.from}{delivery.to ? ` → ${delivery.to}` : ''}
                    </p>
                  )}
                  {delivery.paidBy === 'fca' && delivery.from && (
                    <p className="text-xs text-gray-500 mt-1">
                      📦 Odbiór z: {delivery.from}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Klient ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Klient <span className="text-red-500">*</span>
            </label>
            {!addingClient ? (
              <div className="flex gap-2">
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— wybierz klienta —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.country === 'PL' ? c.nip : c.vat_number})
                    </option>
                  ))}
                </select>
                <button onClick={() => setAddingClient(true)}
                  className="px-3 py-2 text-sm text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 whitespace-nowrap">
                  + Nowy
                </button>
              </div>
            ) : (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                <p className="text-xs font-medium text-blue-700">Szybkie dodanie klienta</p>
                <select value={newClient.country} onChange={e => setNewClient({ ...newClient, country: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="PL">🇵🇱 Polska</option>
                  <option value="NL">🇳🇱 Holandia</option>
                  <option value="DE">🇩🇪 Niemcy</option>
                  <option value="BE">🇧🇪 Belgia</option>
                  <option value="FR">🇫🇷 Francja</option>
                  <option value="GB">🇬🇧 Wielka Brytania</option>
                  <option value="OTHER">Inne</option>
                </select>
                <input placeholder="Nazwa firmy *" value={newClient.name}
                  onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {newClient.country === 'PL' ? (
                  <div className="flex gap-2">
                    <input placeholder="NIP *" value={newClient.nip}
                      onChange={e => setNewClient({ ...newClient, nip: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <button type="button" onClick={lookupNip} disabled={nipLoading}
                      className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                      {nipLoading ? '...' : '🔍 GUS'}
                    </button>
                  </div>
                ) : (
                  <input placeholder="Numer VAT *" value={newClient.vat_number}
                    onChange={e => setNewClient({ ...newClient, vat_number: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
                <div className="flex gap-2">
                  <button onClick={handleAddClient} disabled={savingClient}
                    className="flex-1 py-1.5 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                    {savingClient ? 'Dodawanie...' : 'Dodaj i wybierz'}
                  </button>
                  <button onClick={() => setAddingClient(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Opiekun handlowy ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opiekun handlowy <span className="text-red-500">*</span>
            </label>
            <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SALES_REPS.map(r => (
                <option key={r.name} value={r.name}>{r.name} – tel. {r.phone}</option>
              ))}
            </select>
          </div>

          {/* ══════════════════════════════════════════════
              WARUNKI OFERTY
          ══════════════════════════════════════════════ */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Warunki oferty</p>
            </div>
            <div className="p-4 space-y-5">

              {/* ── Termin dostawy ── */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Termin dostawy</p>
                <div className="flex gap-4 mb-3">
                  {([
                    { val: 'magazyn', label: 'Z magazynu' },
                    { val: 'huta',    label: 'Z huty (produkcja)' },
                  ] as const).map(opt => (
                    <label key={opt.val} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="deliveryTimeline" value={opt.val}
                        checked={deliveryTimeline === opt.val}
                        onChange={() => setDeliveryTimeline(opt.val)}
                        className="accent-blue-900" />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>

                {deliveryTimeline === 'magazyn' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Szacowany czas dostawy</label>
                    <div className="flex gap-2">
                      <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {WAREHOUSE_DELIVERY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Na PDF: „z magazynu, {warehouseDeliveryTime}"
                    </p>
                  </div>
                )}

                {deliveryTimeline === 'huta' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Tydzień kampanii <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={campaignWeeks}
                          onChange={e => setCampaignWeeks(e.target.value)}
                          placeholder="np. 50/51"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Wstępny termin dostaw</label>
                        <input type="text" value={campaignDeliveryWeeks}
                          onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                          placeholder="np. 51/52"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                      Na PDF: „produkcja w planowanej kampanii w tyg. <strong>{campaignWeeks || '??'}</strong>
                      {campaignDeliveryWeeks && ` – dostawy wstępnie możliwe od tyg. ${campaignDeliveryWeeks}`}
                      {' '}– do potwierdzenia po zakończonej produkcji."
                    </div>
                  </div>
                )}
              </div>

              {/* ── Warunki dostawy (Incoterms) ── */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Warunki dostawy (Incoterms)</p>
                <div className="flex gap-4 mb-3">
                  {([
                    { val: 'DAP', label: 'DAP – dostawa w cenie' },
                    { val: 'FCA', label: 'FCA – odbiór własny' },
                  ] as const).map(opt => (
                    <label key={opt.val} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="deliveryTerms" value={opt.val}
                        checked={deliveryTerms === opt.val}
                        onChange={() => setDeliveryTerms(opt.val)}
                        className="accent-blue-900" />
                      <span className="font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>

                {deliveryTerms === 'DAP' && (
                  <p className="text-xs text-gray-500">
                    DAP ({delivery?.to ? delivery.to : 'adres dostawy do uzupełnienia w sekcji dostawy'})
                  </p>
                )}
                {deliveryTerms === 'FCA' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Lokalizacja magazynu odbioru <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={fcaLocation}
                      onChange={e => setFcaLocation(e.target.value)}
                      placeholder="np. Oleśnica, ul. Przemysłowa 1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Na PDF: „FCA ({fcaLocation || '...'})"
                    </p>
                  </div>
                )}
              </div>

              {/* ── Warunki handlowe (płatność) ── */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Warunki handlowe – termin płatności</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 0,  label: 'Przedpłata 100%' },
                    { val: 30, label: '30 dni od faktury' },
                    { val: 60, label: '60 dni od faktury' },
                    { val: 90, label: '90 dni od faktury' },
                  ].map(opt => (
                    <label key={opt.val}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                        paymentDays === opt.val
                          ? 'border-blue-700 bg-blue-50 text-blue-800 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}>
                      <input type="radio" name="paymentDays" value={opt.val}
                        checked={paymentDays === opt.val}
                        onChange={() => setPaymentDays(opt.val)}
                        className="accent-blue-900" />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {paymentDays > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Na PDF: „{paymentDays} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia."
                  </p>
                )}
              </div>

              {/* ── Ważność oferty ── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ważność oferty [dni]</label>
                <div className="flex gap-2">
                  {[1, 3, 7, 14].map(d => (
                    <button key={d} onClick={() => setValidDays(d)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        validDays === d
                          ? 'border-blue-700 bg-blue-700 text-white font-medium'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}>
                      {d === 1 ? '24h' : `${d} dni`}
                    </button>
                  ))}
                  <input type="number" min={1} value={validDays}
                    onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                  <p>• Oferta ważna {validDays === 1 ? '24h' : `${validDays} dni`} od daty wysłania i wymaga finalnego potwierdzenia.</p>
                  <p>• Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.</p>
                </div>
              </div>

            </div>
          </div>

          {/* ── Notatki ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notatki do oferty</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Opcjonalne uwagi wewnętrzne..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Stopka */}
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
            {saving ? 'Zapisywanie...' : 'Zapisz ofertę SP'}
          </button>
        </div>
      </div>
    </div>
  );
}
