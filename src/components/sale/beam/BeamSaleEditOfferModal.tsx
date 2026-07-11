import { useState, useMemo } from 'react';
import { supabase, fetchNipData } from '../../../lib/supabase';
import type {
  Client,
  BeamProfile,
  BeamSaleOffer,
  BeamSaleOfferItem,
  OfferStatus,
} from '../../../types';
import { BEAM_STEEL_GRADES } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import ClientSearchInput from '../../ClientSearchInput';
import { SALES_REPS, CountryOptions } from '../../../lib/constants';

// ─── Typy lokalne ────────────────────────────────────────────────────────────

interface EditableItem {
  uid: string;
  profileId: string | null;             // może być null gdy oferta historyczna z usuniętym profilem
  profileName: string;                  // snapshot (zachowuje nazwę nawet gdy profileId=null)
  series: string;
  weightKgPerM: number;
  steelGrade: string;
  quantityPcs: number | '';
  lengthM: number | '';
  costPerTon: number;                   // w walucie oferty
  sellPerTon: number;                   // w walucie oferty
}

interface Props {
  offer: BeamSaleOffer;
  clients: Client[];
  profiles: BeamProfile[];
  onSaved: (offer: BeamSaleOffer) => void;
  onClose: () => void;
  onClientAdded: (c: Client) => void;
  mode?: 'edit' | 'copy';
}

// ─── Stałe ──────────────────────────────────────────────────────────────────

const TRUCK_CAPACITY_T = 24.5;

const STATUS_LABELS: Record<OfferStatus, string> = {
  szkic:     'Szkic',
  wysłana:   'Wysłana',
  przyjęta:  'Przyjęta',
  odrzucona: 'Odrzucona',
};

const WAREHOUSE_DELIVERY_OPTIONS = [
  'do 3 dni roboczych',
  '3–5 dni roboczych',
  '5–7 dni roboczych',
  '7–10 dni roboczych',
  'do 2 tygodni',
  'do ustalenia',
];

// Pre-fill z DB pozycji oferty → edytowalny rekord lokalny.
function itemsFromOffer(offer: BeamSaleOffer): EditableItem[] {
  if (!offer.items || offer.items.length === 0) return [];
  return offer.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => ({
      uid: crypto.randomUUID(),
      profileId: item.profile_id ?? null,
      profileName: item.profile_name,
      series: item.series,
      weightKgPerM: item.weight_kg_per_m,
      steelGrade: (BEAM_STEEL_GRADES as readonly string[]).includes(item.steel_grade)
        ? item.steel_grade
        : BEAM_STEEL_GRADES[0],
      quantityPcs: item.quantity_pcs,
      lengthM: item.length_m,
      costPerTon: item.cost_per_ton ?? 0,
      sellPerTon: item.sell_per_ton ?? 0,
    }));
}

function marginColor(pct: number): string {
  if (pct < 0)   return 'text-red-600 bg-red-50 border-red-200';
  if (pct < 5)   return 'text-orange-600 bg-orange-50 border-orange-200';
  if (pct < 10)  return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-green-700 bg-green-50 border-green-200';
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function BeamSaleEditOfferModal({
  offer, clients, profiles, onSaved, onClose, onClientAdded, mode = 'edit',
}: Props) {
  const isCopy = mode === 'copy';
  // ── Stan: lazy initial dla pre-fillu ──
  const [editItems, setEditItems]     = useState<EditableItem[]>(() => itemsFromOffer(offer));
  const [clientId, setClientId]       = useState(offer.client_id ?? '');
  const [taskName, setTaskName]       = useState(offer.task_name ?? '');
  const [isUsed, setIsUsed]           = useState(offer.is_used ?? false);
  const [status, setStatus]           = useState<OfferStatus>(offer.status);
  const [preparedBy, setPreparedBy]   = useState(offer.prepared_by ?? SALES_REPS[0].name);
  const [notes, setNotes]             = useState(offer.notes ?? '');
  const [validDays, setValidDays]     = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);

  // ── Waluta ──
  const [currency, setCurrency]         = useState<'EUR' | 'PLN'>((offer.currency ?? 'PLN') as 'EUR' | 'PLN');
  const [exchangeRate, setExchangeRate] = useState(offer.exchange_rate ?? 4.25);

  // ── Dostawa (reverse-calc kosztu/auto z totalu jeśli brakuje) ──
  const [deliveryTrucks, setDeliveryTrucks]             = useState<number | ''>(offer.delivery_trucks ?? '');
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>(() => {
    if (offer.delivery_cost_per_truck != null) return offer.delivery_cost_per_truck;
    if (offer.delivery_cost_total && offer.delivery_trucks && offer.delivery_trucks > 0) {
      const rate = offer.exchange_rate ?? 4.25;
      const totalInCurrency = offer.currency === 'EUR'
        ? offer.delivery_cost_total / rate
        : offer.delivery_cost_total;
      return totalInCurrency / offer.delivery_trucks;
    }
    return '';
  });
  const [deliveryPaidBy, setDeliveryPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca' | 'cif'>(
    (offer.delivery_paid_by as 'dap_included' | 'dap_extra' | 'fca' | 'cif') ?? 'dap_included'
  );
  const [deliveryFrom, setDeliveryFrom] = useState(offer.delivery_from ?? 'Magazyn Intra B.V.');
  const [deliveryTo, setDeliveryTo]     = useState(offer.delivery_to ?? '');

  // ── Warunki dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>(
    (offer.delivery_timeline as 'huta' | 'magazyn') ?? 'magazyn'
  );
  const [campaignWeeks, setCampaignWeeks]                 = useState(offer.campaign_weeks ?? '');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState(offer.campaign_delivery_weeks ?? '');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState(offer.warehouse_delivery_time ?? '5–7 dni roboczych');
  const [deliveryTerms, setDeliveryTerms]                 = useState<'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF'>(
    (offer.delivery_terms as 'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF') ?? 'DAP'
  );
  const [fcaLocation, setFcaLocation] = useState(offer.fca_location ?? '');

  // ── Inline client create ──
  const [addingClient, setAddingClient]   = useState(false);
  const [newClient, setNewClient]         = useState({
    name: '', country: 'PL', nip: '', vat_number: '', address: '', city: '',
    postal_code: '', email: '', phone: '',
  });
  const [savingClient, setSavingClient]   = useState(false);
  const [nipLoading, setNipLoading]       = useState(false);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // ── Zarządzanie pozycjami ──
  function addItem() {
    if (profiles.length === 0) {
      setError('Brak profili dwuteowników do dodania.');
      return;
    }
    const p = profiles[0];
    setEditItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      profileId: p.id,
      profileName: p.name,
      series: p.series,
      weightKgPerM: p.weight_kg_per_m,
      steelGrade: BEAM_STEEL_GRADES[0],
      quantityPcs: '',
      lengthM: '',
      costPerTon: 0,
      sellPerTon: 0,
    }]);
  }

  function removeItem(uid: string) {
    setEditItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<EditableItem>) {
    setEditItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Auto-aktualizuj snapshoty atrybutów po zmianie profilu
      if ('profileId' in patch && patch.profileId) {
        const p = profiles.find(pp => pp.id === patch.profileId);
        if (p) {
          updated.profileName  = p.name;
          updated.series       = p.series;
          updated.weightKgPerM = p.weight_kg_per_m;
        }
      }
      return updated;
    }));
  }

  // ── Konwersja cen przy zmianie waluty ──
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');
    setEditItems(prev => prev.map(item => ({
      ...item,
      costPerTon: conv(item.costPerTon),
      sellPerTon: conv(item.sellPerTon),
    })));
    setDeliveryCostPerTruck(prev => typeof prev !== 'number' ? prev : conv(prev));
    setCurrency(newCurrency);
  }

  // ── Obliczenia per pozycja ──
  const itemResults = useMemo(() =>
    editItems.map(it => {
      const qty = Number(it.quantityPcs) || 0;
      const lengthM = Number(it.lengthM) || 0;
      if (qty <= 0 || lengthM <= 0 || it.weightKgPerM <= 0) {
        return null;
      }
      const totalLengthM = qty * lengthM;
      const massT        = Math.round((totalLengthM * it.weightKgPerM) / 1000 * 1000) / 1000;
      const costTotal    = massT * (it.costPerTon || 0);
      const sellTotal    = massT * (it.sellPerTon || 0);
      const marginPct    = sellTotal > 0 ? ((sellTotal - costTotal) / sellTotal) * 100 : null;
      return { totalLengthM, massT, costTotal, sellTotal, marginPct };
    }),
    [editItems],
  );

  const totals = useMemo(() => {
    let totalLengthM = 0, totalMassT = 0, totalCost = 0, totalSell = 0;
    for (const r of itemResults) {
      if (!r) continue;
      totalLengthM += r.totalLengthM;
      totalMassT   += r.massT;
      totalCost    += r.costTotal;
      totalSell    += r.sellTotal;
    }
    const totalMarginPct = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : null;
    return { totalLengthM, totalMassT, totalCost, totalSell, totalMarginPct };
  }, [itemResults]);

  // ── Dostawa: auto-szacunek + totale ──
  const deliveryCalc = useMemo(() => {
    if (totals.totalMassT <= 0) return null;
    const autoTrucks      = Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T);
    const trucks          = typeof deliveryTrucks === 'number' && deliveryTrucks > 0 ? deliveryTrucks : autoTrucks;
    const costPerTruck    = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    const totalCostPLN    = currency === 'PLN' ? totalInCurrency : totalInCurrency * exchangeRate;
    return { autoTrucks, trucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [totals.totalMassT, deliveryTrucks, deliveryCostPerTruck, currency, exchangeRate]);

  // Denominacja — zawsze EUR/PLN niezależnie od currency oferty
  const totalSellEUR = currency === 'EUR' ? totals.totalSell : totals.totalSell / exchangeRate;
  const totalSellPLN = currency === 'PLN' ? totals.totalSell : totals.totalSell * exchangeRate;
  const totalCostEUR = currency === 'EUR' ? totals.totalCost : totals.totalCost / exchangeRate;

  // ── Inline client create ──
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

  // ─── Zapis: saga UPDATE → DELETE items → INSERT items (lub INSERT dla kopii) ─
  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (editItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    // Walidacja pozycji — pusta/zerowa ilość lub długość blokuje zapis
    const emptyIdx = editItems.findIndex(it => !(Number(it.quantityPcs) > 0) || !(Number(it.lengthM) > 0));
    if (emptyIdx >= 0) {
      return setError('Uzupełnij ilość i długość we wszystkich pozycjach — pozycje bez wartości nie mogą zostać zapisane.');
    }
    const invalidIdx = editItems.findIndex(it => (it.sellPerTon || 0) <= 0);
    if (invalidIdx >= 0) {
      return setError(`Pozycja #${invalidIdx + 1}: cena sprzedaży musi być większa od 0.`);
    }

    setSaving(true);
    setError('');

    const hasTransport = deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && deliveryCalc !== null && deliveryCalc.costPerTruck > 0;

    // Wspólny payload oferty (bez offer_number/id — różnią się tryby edit vs copy)
    const offerPayload = {
      client_id:                 clientId,
      task_name:                 taskName.trim() || null,
      is_used:                   isUsed,
      status:                    isCopy ? 'szkic' : status,   // kopia zawsze startuje jako szkic
      notes:                     notes.trim() || null,
      valid_days:                validDays,
      payment_days:              paymentDays,
      prepared_by:               preparedBy,
      currency,
      exchange_rate:             exchangeRate,
      total_mass_t:              totals.totalMassT || null,
      total_cost_eur:            totalCostEUR || null,
      total_sell_eur:            totalSellEUR || null,
      total_sell_pln:            totalSellPLN || null,
      margin_pct:                totals.totalMarginPct,
      delivery_trucks:           hasTransport ? deliveryCalc!.trucks       : null,
      delivery_cost_per_truck:   hasTransport ? deliveryCalc!.costPerTruck : null,
      delivery_cost_total:       hasTransport ? deliveryCalc!.totalCostPLN : null,
      delivery_paid_by:          deliveryPaidBy,
      delivery_from:             deliveryFrom.trim() || null,
      delivery_to:               deliveryTo.trim()   || null,
      delivery_timeline:         deliveryTimeline,
      campaign_weeks:            deliveryTimeline === 'huta'    ? campaignWeeks.trim()                : null,
      campaign_delivery_weeks:   deliveryTimeline === 'huta'    ? (campaignDeliveryWeeks.trim() || null) : null,
      warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime               : null,
      delivery_terms:            deliveryTerms,
      fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
    };

    // Pozycje BEZ offer_id — wstrzykiwane przy .insert() (nowe ID dla kopii, stare dla edycji)
    const newItemsPayload = editItems.flatMap((it, idx) => {
      const r = itemResults[idx];
      if (!r) return [];
      const sellValueEur = currency === 'EUR' ? r.sellTotal : r.sellTotal / exchangeRate;
      const sellValuePln = currency === 'PLN' ? r.sellTotal : r.sellTotal * exchangeRate;
      return [{
        profile_id:      it.profileId,
        profile_name:    it.profileName,
        series:          it.series,
        weight_kg_per_m: it.weightKgPerM,
        steel_grade:     it.steelGrade,
        quantity_pcs:    Number(it.quantityPcs) || 0,
        length_m:        Number(it.lengthM) || 0,
        total_length_m:  r.totalLengthM,
        mass_t:          r.massT,
        cost_per_ton:    it.costPerTon || 0,
        sell_per_ton:    it.sellPerTon,
        cost_total:      r.costTotal || 0,
        sell_total:      r.sellTotal,
        sell_value_eur:  sellValueEur,
        sell_value_pln:  sellValuePln,
        margin_pct:      r.marginPct,
        sort_order:      idx,
      }];
    });

    if (isCopy) {
      // ── KOPIA: INSERT nowej oferty (numer nadaje trigger DB: SH/YYYY/NNN) ──
      const { data: newOffer, error: insertOfferErr } = await supabase
        .from('beam_sale_offers')
        .insert({ ...offerPayload, offer_number: '', deleted_at: null })
        .select('*, client:clients(*)')
        .single();

      if (insertOfferErr) {
        setSaving(false);
        return setError('Błąd zapisu kopii oferty: ' + insertOfferErr.message);
      }

      const saved = newOffer as BeamSaleOffer;

      const { data: insertedItems, error: insertItemsErr } = await supabase
        .from('beam_sale_offer_items')
        .insert(newItemsPayload.map(it => ({ ...it, offer_id: saved.id })))
        .select();

      if (insertItemsErr) {
        // Rollback: soft-delete świeżo utworzonej oferty (UPDATE deleted_at — jak przycisk Usuń)
        await supabase.from('beam_sale_offers').update({ deleted_at: new Date().toISOString() }).eq('id', saved.id);
        setSaving(false);
        return setError('Błąd zapisu pozycji kopii – oferta anulowana. Spróbuj ponownie: ' + insertItemsErr.message);
      }

      setSaving(false);
      saved.items = (insertedItems ?? []) as BeamSaleOfferItem[];
      onSaved(saved);
      return;
    }

    // ── EDYCJA: saga UPDATE → DELETE items → INSERT items ──
    // KROK 1: UPDATE oferty
    const { data: updatedOffer, error: updateErr } = await supabase
      .from('beam_sale_offers')
      .update(offerPayload)
      .eq('id', offer.id)
      .select('*, client:clients(*)')
      .single();

    if (updateErr) {
      setSaving(false);
      return setError('Błąd aktualizacji oferty: ' + updateErr.message);
    }

    // KROK 2: DELETE starych pozycji
    const { error: deleteErr } = await supabase
      .from('beam_sale_offer_items')
      .delete()
      .eq('offer_id', offer.id);

    if (deleteErr) {
      setSaving(false);
      return setError('Błąd usuwania starych pozycji: ' + deleteErr.message);
    }

    // KROK 3: INSERT nowych pozycji
    const { data: insertedItems, error: insertErr } = await supabase
      .from('beam_sale_offer_items')
      .insert(newItemsPayload.map(it => ({ ...it, offer_id: offer.id })))
      .select();

    if (insertErr) {
      setSaving(false);
      return setError('Błąd zapisu nowych pozycji: ' + insertErr.message
        + ' (UWAGA: stare pozycje zostały usunięte — otwórz edycję ponownie aby naprawić)');
    }

    setSaving(false);
    const saved = updatedOffer as BeamSaleOffer;
    saved.items = (insertedItems ?? []) as BeamSaleOfferItem[];
    onSaved(saved);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  function moneyLabel(v: number): string {
    return currency === 'EUR' ? `${formatEUR(v)} EUR` : `${formatPLN(v)} PLN`;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6 max-h-[92vh] overflow-y-auto">

        {/* Nagłówek */}
        <div className="p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{isCopy ? `Kopiuj ofertę (na podstawie ${offer.offer_number})` : `Edycja oferty ${offer.offer_number}`}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Dwuteowniki · {editItems.length} poz. · {formatNumber(totals.totalMassT, 3)} t
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2" title="Zamknij">×</button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Nazwa zadania (opcjonalnie) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
            <input type="text" value={taskName} maxLength={35} onChange={e => setTaskName(e.target.value)} placeholder="np. Budowa hali – Wrocław" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Dwuteowniki używane */}
          <div>
            <label className={`flex items-start gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
              isUsed ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="checkbox" checked={isUsed} onChange={e => setIsUsed(e.target.checked)}
                className="accent-amber-600 mt-0.5 w-4 h-4" />
              <span>
                <span className={`block text-sm font-semibold ${isUsed ? 'text-amber-800' : 'text-gray-800'}`}>
                  {isUsed ? '⚠️ ' : ''}Dwuteowniki używane
                </span>
                <span className={`block text-xs mt-0.5 ${isUsed ? 'text-amber-700' : 'text-gray-400'}`}>
                  {isUsed
                    ? 'Sekcja techniczna PDF: bez normy, bez certyfikatu + dopisek o śladach użytkowania.'
                    : 'Zaznacz dla oferty na dwuteowniki używane.'}
                </span>
              </span>
            </label>
          </div>

          {/* Klient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klient *</label>
            {!addingClient ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <ClientSearchInput clients={clients} value={clientId} onChange={setClientId} />
                </div>
                <button onClick={() => setAddingClient(true)} className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50">+ Nowy</button>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nazwa firmy *" value={newClient.name}
                    onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm col-span-2" />
                  <select value={newClient.country} onChange={e => setNewClient(p => ({ ...p, country: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm">
                    <CountryOptions />
                  </select>
                  {newClient.country === 'PL' ? (
                    <div className="flex gap-1">
                      <input type="text" placeholder="NIP" value={newClient.nip}
                        onChange={e => setNewClient(p => ({ ...p, nip: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm" />
                      <button onClick={lookupNip} disabled={nipLoading} className="text-xs px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50">{nipLoading ? '...' : 'GUS'}</button>
                    </div>
                  ) : (
                    <input type="text" placeholder="VAT EU" value={newClient.vat_number}
                      onChange={e => setNewClient(p => ({ ...p, vat_number: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  )}
                </div>
                <input type="text" placeholder="Ulica i numer" value={newClient.address}
                  onChange={e => setNewClient(p => ({ ...p, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Kod" value={newClient.postal_code}
                    onChange={e => setNewClient(p => ({ ...p, postal_code: e.target.value }))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  <input type="text" placeholder="Miasto" value={newClient.city}
                    onChange={e => setNewClient(p => ({ ...p, city: e.target.value }))}
                    className="col-span-2 border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddClient} disabled={savingClient} className="bg-blue-700 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-800 disabled:opacity-50">{savingClient ? 'Zapisywanie...' : 'Zapisz klienta'}</button>
                  <button onClick={() => setAddingClient(false)} className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-100">Anuluj</button>
                </div>
              </div>
            )}
          </div>

          {/* Status + Opiekun + Ważność + Płatność */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as OfferStatus)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(st => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Opiekun</label>
              <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                {SALES_REPS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ważność [dni]</label>
              <input type="number" min={1} value={validDays} onChange={e => setValidDays(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Płatność [dni]</label>
              <input type="number" min={0} value={paymentDays} onChange={e => setPaymentDays(parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right" title="0 = przedpłata" />
            </div>
          </div>

          {/* Waluta + Kurs */}
          <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Waluta oferty</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm font-semibold w-fit">
                {(['PLN', 'EUR'] as const).map(c => (
                  <button key={c} onClick={() => handleCurrencyChange(c)}
                    className={`px-4 py-1.5 transition-colors ${currency === c ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kurs EUR/PLN</label>
              <input type="number" step={0.0001} value={exchangeRate}
                onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right" />
            </div>
          </div>

          {/* Pozycje */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-800">Pozycje ({editItems.length})</h4>
              <button onClick={addItem} className="px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">+ Dodaj pozycję</button>
            </div>

            {editItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Brak pozycji. Kliknij „+ Dodaj pozycję".</p>
            ) : (
              <div className="space-y-2">
                {editItems.map((item, idx) => {
                  const r = itemResults[idx];
                  const qtyInvalid = !(Number(item.quantityPcs) > 0);
                  const lenInvalid = !(Number(item.lengthM) > 0);
                  return (
                    <div key={item.uid} className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                      {/* Profil */}
                      <div className="lg:col-span-3">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Profil</label>}
                        <select value={item.profileId ?? ''}
                          onChange={e => updateItem(item.uid, { profileId: e.target.value || null })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                          {item.profileId == null && (
                            <option value="">[brak — {item.profileName}]</option>
                          )}
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.series}) – {p.weight_kg_per_m} kg/m
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Gatunek */}
                      <div className="lg:col-span-2">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Gatunek</label>}
                        <select value={item.steelGrade}
                          onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                          {BEAM_STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>

                      {/* Ilość */}
                      <div className="lg:col-span-1">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Ilość</label>}
                        <input type="number" min={1} step={1} placeholder="np. 10" value={item.quantityPcs}
                          onChange={e => updateItem(item.uid, { quantityPcs: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${qtyInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                      </div>

                      {/* Długość */}
                      <div className="lg:col-span-1">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Dł. [m]</label>}
                        <input type="number" min={0.5} step={0.5} placeholder="np. 12" value={item.lengthM}
                          onChange={e => updateItem(item.uid, { lengthM: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${lenInvalid ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                      </div>

                      {/* Cena kosztu */}
                      <div className="lg:col-span-1">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Koszt {currency}/t</label>}
                        <input type="number" min={0} step={1} value={item.costPerTon || ''}
                          onChange={e => updateItem(item.uid, { costPerTon: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right" />
                      </div>

                      {/* Cena sprzedaży */}
                      <div className="lg:col-span-2">
                        {idx === 0 && <label className="block text-xs font-medium text-gray-500 mb-1">Sprzedaż {currency}/t</label>}
                        <input type="number" min={0} step={1} value={item.sellPerTon || ''}
                          onChange={e => updateItem(item.uid, { sellPerTon: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-sm text-right bg-blue-50 font-semibold" />
                      </div>

                      {/* Wyniki + remove */}
                      <div className="lg:col-span-2 flex items-end justify-between gap-2">
                        <div className="text-xs text-gray-600 leading-tight">
                          {r ? (
                            <>
                              <div><strong>{formatNumber(r.massT, 3)}</strong> t</div>
                              <div className="text-gray-500">{moneyLabel(r.sellTotal)}</div>
                              {r.marginPct != null && (
                                <div className={`inline-block px-1.5 py-0.5 rounded border text-xs mt-0.5 ${marginColor(r.marginPct)}`}>
                                  {r.marginPct.toFixed(1)}%
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-red-500">niewłaściwa pozycja</span>
                          )}
                        </div>
                        <button onClick={() => removeItem(item.uid)} className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1.5">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
            <p className="text-sm font-semibold text-gray-800 mb-1">Transport</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sposób</label>
                <select value={deliveryPaidBy} onChange={e => setDeliveryPaidBy(e.target.value as 'dap_included' | 'dap_extra' | 'fca' | 'cif')}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="dap_included">DAP – w cenie</option>
                  <option value="dap_extra">DAP – refaktura</option>
                  <option value="fca">FCA – odbiór</option>
                  <option value="cif">CIF – z portu</option>
                </select>
              </div>
              {deliveryPaidBy !== 'fca' && deliveryPaidBy !== 'cif' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Aut</label>
                    <input type="number" min={1} step={1}
                      placeholder={deliveryCalc ? `auto: ${deliveryCalc.autoTrucks}` : 'auto'}
                      value={deliveryTrucks === '' ? '' : deliveryTrucks}
                      onChange={e => setDeliveryTrucks(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Koszt 1 auta [{currency}]</label>
                    <input type="number" min={0} step={1}
                      value={deliveryCostPerTruck === '' ? '' : deliveryCostPerTruck}
                      onChange={e => setDeliveryCostPerTruck(e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Razem</label>
                    <div className="px-2 py-1.5 text-sm font-semibold text-gray-700 bg-white rounded-lg border border-gray-200 text-right">
                      {deliveryCalc ? moneyLabel(deliveryCalc.totalInCurrency) : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>
            {deliveryPaidBy !== 'fca' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{deliveryPaidBy === 'cif' ? 'Odbiór z (port)' : 'Skąd'}</label>
                  <input type="text" value={deliveryFrom} onChange={e => setDeliveryFrom(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                {deliveryPaidBy !== 'cif' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Dokąd</label>
                  <input type="text" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                )}
              </div>
            )}
          </div>

          {/* Termin dostawy */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
            <p className="text-sm font-semibold text-gray-800 mb-1">Termin dostawy</p>
            <div className="flex gap-2">
              {(['magazyn', 'huta'] as const).map(tl => (
                <button key={tl} onClick={() => setDeliveryTimeline(tl)}
                  className={`flex-1 px-2 py-1.5 text-sm rounded border ${deliveryTimeline === tl
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {tl === 'magazyn' ? 'Z magazynu' : 'Z huty (kampania)'}
                </button>
              ))}
            </div>
            {deliveryTimeline === 'magazyn' ? (
              <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                {WAREHOUSE_DELIVERY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="Tyg. kampanii" value={campaignWeeks}
                  onChange={e => setCampaignWeeks(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
                <input type="text" placeholder="Tyg. dostawy" value={campaignDeliveryWeeks}
                  onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>
            )}
          </div>

          {/* Incoterms */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
            <p className="text-sm font-semibold text-gray-800 mb-1">Incoterms</p>
            <div className="flex gap-2">
              {(['DAP', 'DAP_EXTRA', 'FCA', 'CIF'] as const).map(tm => (
                <button key={tm} onClick={() => setDeliveryTerms(tm)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${deliveryTerms === tm
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {tm === 'DAP' ? 'DAP – w cenie' : tm === 'DAP_EXTRA' ? 'DAP – refaktura' : tm === 'FCA' ? 'FCA – odbiór' : 'CIF – z portu'}
                </button>
              ))}
            </div>
            {deliveryTerms === 'FCA' && (
              <input type="text" placeholder="Magazyn odbioru"
                value={fcaLocation} onChange={e => setFcaLocation(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            )}
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notatki (wewn.)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Podsumowanie */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><span className="text-gray-500">Długość:</span> <strong>{formatNumber(totals.totalLengthM, 1)} m</strong></div>
              <div><span className="text-gray-500">Masa:</span> <strong>{formatNumber(totals.totalMassT, 3)} t</strong></div>
              <div><span className="text-gray-500">Sprzedaż:</span> <strong>{moneyLabel(totals.totalSell)}</strong></div>
              <div>
                <span className="text-gray-500">Marża:</span>{' '}
                <strong className={
                  totals.totalMarginPct == null ? '' :
                  totals.totalMarginPct < 0 ? 'text-red-600' :
                  totals.totalMarginPct < 5 ? 'text-orange-600' :
                  totals.totalMarginPct < 10 ? 'text-yellow-700' : 'text-green-700'
                }>{totals.totalMarginPct == null ? '—' : `${totals.totalMarginPct.toFixed(1)}%`}</strong>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Akcje */}
        <div className="p-4 border-t border-gray-100 sticky bottom-0 bg-white flex justify-between gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Anuluj</button>
          <button onClick={handleSave} disabled={saving || !clientId}
            className="bg-blue-900 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-semibold px-6 py-2 rounded-lg">
            {saving ? 'Zapisywanie...' : isCopy ? '💾 Zapisz kopię' : '💾 Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
