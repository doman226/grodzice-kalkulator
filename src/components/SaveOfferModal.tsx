import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client, Offer, RentalPrices } from '../types';
import { formatPLN, formatNumber } from '../lib/calculations';

interface TransportData {
  trucks: number;
  costPerTruck: number;
  totalCost: number;
  paidBy: 'intra' | 'klient';
  from: string;
  to: string;
}

export interface OfferItemInput {
  profileId: string;
  profileName: string;
  profileType: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
  totalLengthM: number;
  massT: number;
  wallAreaM2: number;
}

interface Totals {
  massT: number;
  wallAreaM2: number;
  totalLengthM: number;
  rentalCostPLN: number;
  costPerM2: number;
  costPerTon: number;
}

interface Props {
  clients: Client[];
  offerItems: OfferItemInput[];
  rentalWeeks: number;
  displayUnit: 'weeks' | 'months';
  totals: Totals;
  transport: TransportData;
  prices: RentalPrices;
  onSaved: (offer: Offer) => void;
  onClose: () => void;
  onClientAdded: (client: Client) => void;
}

const SALES_REPS = [
  { name: 'Szymon Sobczak', phone: '579 376 107' },
  { name: 'Mateusz Cieślicki', phone: '579 141 243' },
  { name: 'Marzena Sobczak', phone: '579 241 508' },
  { name: 'Piotr Domański', phone: '729 393 743' },
];

export default function SaveOfferModal({
  clients, offerItems, rentalWeeks, displayUnit, totals, transport, prices, onSaved, onClose, onClientAdded,
}: Props) {
  const [clientId, setClientId] = useState('');
  const [preparedBy, setPreparedBy] = useState(SALES_REPS[0].name);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(1);
  const [deliveryInfo, setDeliveryInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Nowy klient inline
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', country: 'PL', nip: '', vat_number: '' });
  const [savingClient, setSavingClient] = useState(false);
  const [nipLookupLoading, setNipLookupLoading] = useState(false);

  async function lookupNip() {
    const nip = newClient.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(nip)) { setError('Wpisz poprawny NIP (10 cyfr).'); return; }
    setNipLookupLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/nip-lookup?nip=${nip}`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? 'Nie znaleziono firmy.'); }
      else { setNewClient(prev => ({ ...prev, name: data.name ?? prev.name })); setError(''); }
    } catch { setError('Błąd połączenia z GUS.'); }
    setNipLookupLoading(false);
  }

  const totalWithTransport = transport.costPerTruck > 0
    ? totals.rentalCostPLN + (transport.paidBy === 'intra' ? transport.totalCost : 0)
    : totals.rentalCostPLN;

  // Nazwa profilu do wyświetlenia w liście ofert (1 pozycja → nazwa profilu, wiele → "Wiele profili")
  const mainProfileName = offerItems.length === 1 ? offerItems[0].profileName : 'Wiele profili';
  const mainProfileType = offerItems.length === 1 ? offerItems[0].profileType : 'MIX';

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

    // 1. Zapisz główny rekord oferty
    const { data, error: err } = await supabase.from('offers').insert({
      offer_number: '',
      client_id: clientId,
      // Główny profil (dla kompatybilności z listą)
      profile_name: mainProfileName,
      profile_type: mainProfileType,
      quantity: offerItems.reduce((s, i) => s + i.quantity, 0),
      length_m: offerItems.length === 1 ? offerItems[0].lengthM : null,
      rental_weeks: rentalWeeks,
      total_length_m: totals.totalLengthM,
      mass_t: totals.massT,
      wall_area_m2: totals.wallAreaM2,
      rental_cost_pln: totals.rentalCostPLN,
      cost_per_m2: totals.costPerM2,
      cost_per_ton: totals.costPerTon,
      transport_trucks: transport.trucks,
      transport_cost_per_truck: transport.costPerTruck > 0 ? transport.costPerTruck : null,
      transport_cost_total: transport.costPerTruck > 0 ? transport.totalCost : null,
      transport_paid_by: transport.paidBy,
      transport_from: transport.from || null,
      transport_to: transport.to || null,
      steel_grade: offerItems.length === 1 ? offerItems[0].steelGrade : null,
      delivery_info: deliveryInfo.trim() || null,
      base_price_pln: prices.base_price_pln,
      weekly_cost_pln: totals.massT * prices.price_per_week_1,
      price_per_week_1: prices.price_per_week_1,
      price_per_week_2: prices.price_per_week_2,
      threshold_weeks: prices.threshold_weeks,
      loss_price_pln: prices.loss_price_pln,
      sorting_price_pln: prices.sorting_price_pln,
      grinding_price_pln: prices.grinding_price_pln,
      welding_price_pln: prices.welding_price_pln,
      cutting_price_pln: prices.cutting_price_pln,
      repair_price_pln: prices.repair_price_pln,
      notes: notes.trim() || null,
      valid_days: validDays,
      prepared_by: preparedBy,
      display_unit: displayUnit,
      status: 'szkic',
    }).select('*, client:clients(*)').single();

    if (err) { setSaving(false); return setError('Błąd zapisu: ' + err.message); }

    const savedOffer = data as Offer;

    // 2. Zapisz pozycje oferty (offer_items)
    const { error: itemsErr } = await supabase.from('offer_items').insert(
      offerItems.map((item, idx) => ({
        offer_id: savedOffer.id,
        profile_name: item.profileName,
        profile_type: item.profileType,
        steel_grade: item.steelGrade,
        quantity: item.quantity,
        length_m: item.lengthM,
        total_length_m: item.totalLengthM,
        mass_t: item.massT,
        wall_area_m2: item.wallAreaM2,
        sort_order: idx,
      }))
    );

    if (itemsErr) {
      // Rollback: usuń ofertę (po stronie DB – admin RLS) żeby nie zostały puste rekordy
      await supabase.rpc('soft_delete_offer', { p_offer_id: savedOffer.id });
      setSaving(false);
      return setError('Błąd zapisu pozycji – oferta anulowana. Spróbuj ponownie: ' + itemsErr.message);
    }
    setSaving(false);

    // Dołącz items do obiektu (żeby PDF od razu działał)
    savedOffer.items = offerItems.map((item, idx) => ({
      id: '',
      offer_id: savedOffer.id,
      profile_name: item.profileName,
      profile_type: item.profileType,
      quantity: item.quantity,
      length_m: item.lengthM,
      total_length_m: item.totalLengthM,
      mass_t: item.massT,
      wall_area_m2: item.wallAreaM2,
      sort_order: idx,
    }));

    onSaved(savedOffer);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Zapisz jako ofertę</h3>
          <p className="text-xs text-gray-400 mt-0.5">Numer zostanie nadany automatycznie (OF/{new Date().getFullYear()}/XXX)</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Podsumowanie pozycji */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-2">Pozycje oferty ({offerItems.length})</p>
            <div className="space-y-1 mb-3">
              {offerItems.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.profileName} – {item.quantity} szt. × {item.lengthM} m</span>
                  <span className="font-medium text-gray-800">{formatNumber(item.massT, 3)} t</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-blue-200 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Masa łączna:</span> <strong>{formatNumber(totals.massT, 3)} t</strong></div>
              <div><span className="text-gray-500">Okres:</span> <strong>{rentalWeeks} tygodni</strong></div>
            </div>
            <div className="pt-2 border-t border-blue-200 mt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Wynajem:</span>
                <strong>{formatPLN(totals.rentalCostPLN)} PLN</strong>
              </div>
              {transport.costPerTruck > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Transport ({transport.trucks} aut{transport.trucks > 1 ? 'a' : ''})
                    {transport.paidBy === 'klient' && <span className="text-orange-600 ml-1">[klient]</span>}:
                  </span>
                  <strong className={transport.paidBy === 'klient' ? 'text-orange-600' : ''}>
                    {formatPLN(transport.totalCost)} PLN
                  </strong>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-blue-200 text-sm">
                <span className="text-gray-600 font-medium">Łączna kwota oferty:</span>
                <strong className="text-blue-900 text-base">{formatPLN(totalWithTransport)} PLN</strong>
              </div>
            </div>
            {transport.to && (
              <p className="text-xs text-gray-500 mt-2">🚛 {transport.from} → {transport.to}</p>
            )}
          </div>

          {/* Wybór klienta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klient <span className="text-red-500">*</span></label>
            {!addingClient ? (
              <div className="flex gap-2">
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— wybierz klienta —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.country === 'PL' ? c.nip : c.vat_number})</option>
                  ))}
                </select>
                <button onClick={() => setAddingClient(true)} className="px-3 py-2 text-sm text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 whitespace-nowrap">+ Nowy</button>
              </div>
            ) : (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                <p className="text-xs font-medium text-blue-700">Szybkie dodanie klienta</p>
                <select value={newClient.country} onChange={e => setNewClient({ ...newClient, country: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="PL">🇵🇱 Polska</option>
                  <option value="NL">🇳🇱 Holandia</option>
                  <option value="DE">🇩🇪 Niemcy</option>
                  <option value="BE">🇧🇪 Belgia</option>
                  <option value="FR">🇫🇷 Francja</option>
                  <option value="GB">🇬🇧 Wielka Brytania</option>
                  <option value="OTHER">Inne</option>
                </select>
                <input placeholder="Nazwa firmy *" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                {newClient.country === 'PL' ? (
                  <div className="flex gap-2">
                    <input placeholder="NIP *" value={newClient.nip} onChange={e => setNewClient({ ...newClient, nip: e.target.value })} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    <button type="button" onClick={lookupNip} disabled={nipLookupLoading} className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                      {nipLookupLoading ? '...' : '🔍 GUS'}
                    </button>
                  </div>
                ) : (
                  <input placeholder="Numer VAT *" value={newClient.vat_number} onChange={e => setNewClient({ ...newClient, vat_number: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
                <div className="flex gap-2">
                  <button onClick={handleAddClient} disabled={savingClient} className="flex-1 py-1.5 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
                    {savingClient ? 'Dodawanie...' : 'Dodaj i wybierz'}
                  </button>
                  <button onClick={() => setAddingClient(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Anuluj</button>
                </div>
              </div>
            )}
          </div>

          {/* Opiekun handlowy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opiekun handlowy <span className="text-red-500">*</span></label>
            <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SALES_REPS.map(r => (
                <option key={r.name} value={r.name}>{r.name} – tel. {r.phone}</option>
              ))}
            </select>
          </div>

          {/* Termin dostawy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Termin dostawy</label>
            <input
              type="text"
              value={deliveryInfo}
              onChange={e => setDeliveryInfo(e.target.value)}
              placeholder="np. 5-7 dni roboczych"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Pojawi się na PDF w sekcji „Termin dostawy"</p>
          </div>

          {/* Ważność */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ważność oferty [dni]</label>
            <input type="number" min={1} value={validDays} onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 30))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notatki do oferty</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcjonalne uwagi..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Anuluj</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
            {saving ? 'Zapisywanie...' : 'Zapisz ofertę'}
          </button>
        </div>
      </div>
    </div>
  );
}
