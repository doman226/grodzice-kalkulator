import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Offer, Profile, RentalPrices, Client, OfferItem } from '../types';
import { calculateRentalCost, formatPLN, formatNumber } from '../lib/calculations';

const SALES_REPS = [
  { name: 'Szymon Sobczak', phone: '579 376 107' },
  { name: 'Mateusz Cieślicki', phone: '579 141 243' },
  { name: 'Marzena Sobczak', phone: '579 241 508' },
  { name: 'Piotr Domański', phone: '729 393 743' },
];

const STEEL_GRADES = ['min. S270GP', 'S270GP', 'min. S355GP', 'S355GP'];

interface CalcItem {
  uid: string;
  profileId: string;
  steelGrade: string;
  quantity: number;
  lengthM: number;
  // oryginalne ID z bazy (dla istniejących pozycji)
  originalProfileName?: string;
}

interface Props {
  offer: Offer;
  profiles: Profile[];
  prices: RentalPrices;
  clients: Client[];
  onSaved: (offer: Offer) => void;
  onClose: () => void;
}

const TRUCK_CAPACITY_T = 24.5;

function itemsFromOffer(offer: Offer, profiles: Profile[]): CalcItem[] {
  if (offer.items && offer.items.length > 0) {
    return offer.items
      .slice()
      .sort((a: OfferItem, b: OfferItem) => a.sort_order - b.sort_order)
      .map((item: OfferItem) => {
        const profile = profiles.find(p => p.name === item.profile_name);
        return {
          uid: crypto.randomUUID(),
          profileId: profile?.id ?? profiles[0]?.id ?? '',
          steelGrade: item.steel_grade ?? STEEL_GRADES[0],
          quantity: item.quantity,
          lengthM: item.length_m,
          originalProfileName: item.profile_name,
        };
      });
  }
  // Fallback dla starych ofert
  const profile = profiles.find(p => p.name === offer.profile_name);
  return [{
    uid: crypto.randomUUID(),
    profileId: profile?.id ?? profiles[0]?.id ?? '',
    steelGrade: offer.steel_grade ?? STEEL_GRADES[0],
    quantity: offer.quantity,
    lengthM: offer.length_m ?? 12,
  }];
}

export default function EditOfferModal({ offer, profiles, prices, clients, onSaved, onClose }: Props) {
  const [items, setItems] = useState<CalcItem[]>(() => itemsFromOffer(offer, profiles));
  const [rentalWeeks, setRentalWeeks] = useState(offer.rental_weeks);
  const [displayUnit, setDisplayUnit] = useState<'weeks' | 'months'>(offer.display_unit ?? 'weeks');
  const weeksToMonths = (w: number) => w / 4;
  const monthsToWeeks = (m: number) => Math.max(1, m * 4);
  const [clientId, setClientId] = useState(offer.client_id ?? '');
  const [notes, setNotes] = useState(offer.notes ?? '');
  const [deliveryInfo, setDeliveryInfo] = useState(offer.delivery_info ?? '');
  const [validDays, setValidDays] = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);
  const [transportCostPerTruck, setTransportCostPerTruck] = useState<number | ''>(
    offer.transport_cost_per_truck ?? ''
  );
  // Zachowaj ręcznie ustawioną liczbę aut z oryginalnej oferty
  const [customTrucks, setCustomTrucks] = useState<number | ''>(
    offer.transport_trucks ?? ''
  );
  const [transportPaidBy, setTransportPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca'>(() => {
    const v = offer.transport_paid_by;
    if (v === 'intra') return 'dap_included';
    if (v === 'klient') return 'dap_extra';
    return v ?? 'dap_included';
  });
  const [transportFrom, setTransportFrom] = useState(offer.transport_from ?? 'Magazyn Intra B.V.');
  const [transportTo, setTransportTo] = useState(offer.transport_to ?? '');
  const [preparedBy, setPreparedBy] = useState(offer.prepared_by ?? SALES_REPS[0].name);
  // Indywidualne ceny (inicjalizowane z snapshotu oferty lub globalnego cennika)
  const [customBasePricePln, setCustomBasePricePln] = useState<number>(
    offer.base_price_pln ?? prices.base_price_pln
  );
  const [customPricePerWeek1, setCustomPricePerWeek1] = useState<number>(
    offer.price_per_week_1 ?? prices.price_per_week_1
  );

  const effectivePrices = useMemo(() => ({
    ...prices,
    base_price_pln: customBasePricePln,
    price_per_week_1: customPricePerWeek1,
  }), [prices, customBasePricePln, customPricePerWeek1]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // --- Zarządzanie pozycjami ---
  function addItem() {
    setItems(prev => [...prev, { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', steelGrade: STEEL_GRADES[0], quantity: 10, lengthM: 12 }]);
  }
  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }
  function updateItem(uid: string, patch: Partial<CalcItem>) {
    setItems(prev => prev.map(i => i.uid === uid ? { ...i, ...patch } : i));
  }

  // --- Wyliczenia ---
  const itemResults = useMemo(() =>
    items.map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? null;
      if (!profile || item.quantity <= 0 || item.lengthM <= 0) {
        return { profile, totalLengthM: 0, massT: 0, wallAreaM2: 0, valid: false };
      }
      const totalLengthM = item.quantity * item.lengthM;
      const massT = (totalLengthM * profile.weight_kg_per_m) / 1000;
      const wallAreaM2 = totalLengthM * (profile.width_mm / 1000);
      return { profile, totalLengthM, massT, wallAreaM2, valid: true };
    }),
    [items, profiles]
  );

  const totals = useMemo(() => {
    let totalLengthM = 0, totalMassT = 0, totalWallAreaM2 = 0;
    for (const r of itemResults) {
      if (!r.valid) continue;
      totalLengthM += r.totalLengthM;
      totalMassT += r.massT;
      totalWallAreaM2 += r.wallAreaM2;
    }
    return { totalLengthM, totalMassT, totalWallAreaM2 };
  }, [itemResults]);

  // Nowa logika: koszt = masa [t] × cena [PLN/t] — bez progów czasowych
  const rentalCost = useMemo(() =>
    totals.totalMassT > 0 ? calculateRentalCost(totals.totalMassT, customBasePricePln) : 0,
    [totals.totalMassT, customBasePricePln]
  );

  const transportCalc = useMemo(() => {
    const autoTrucks = totals.totalMassT > 0 ? Math.ceil(totals.totalMassT / TRUCK_CAPACITY_T) : 0;
    const trucks = typeof customTrucks === 'number' && customTrucks > 0 ? customTrucks : autoTrucks;
    const costPerTruck = typeof transportCostPerTruck === 'number' ? transportCostPerTruck : 0;
    return { trucks, autoTrucks, costPerTruck, totalCost: trucks * costPerTruck };
  }, [totals.totalMassT, transportCostPerTruck, customTrucks]);

  const validItems = itemResults.filter(r => r.valid);

  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (validItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję.');
    setSaving(true);
    setError('');

    const mainProfileName = validItems.length === 1 ? itemResults.find(r => r.valid)!.profile!.name : 'Wiele profili';
    const mainProfileType = validItems.length === 1 ? itemResults.find(r => r.valid)!.profile!.type : 'MIX';

    // 1. Aktualizuj główny rekord oferty
    const { data, error: err } = await supabase.from('offers').update({
      client_id: clientId,
      profile_name: mainProfileName,
      profile_type: mainProfileType,
      quantity: items.reduce((s, i) => s + i.quantity, 0),
      length_m: validItems.length === 1 ? items.find(i => itemResults[items.indexOf(i)]?.valid)?.lengthM ?? null : null,
      rental_weeks: rentalWeeks,
      display_unit: displayUnit,
      total_length_m: totals.totalLengthM,
      mass_t: totals.totalMassT,
      wall_area_m2: totals.totalWallAreaM2,
      rental_cost_pln: rentalCost,
      cost_per_m2: totals.totalWallAreaM2 > 0 ? rentalCost / totals.totalWallAreaM2 : 0,
      cost_per_ton: totals.totalMassT > 0 ? rentalCost / totals.totalMassT : 0,
      transport_trucks: transportCalc.trucks,
      transport_cost_per_truck: transportCalc.costPerTruck > 0 ? transportCalc.costPerTruck : null,
      transport_cost_total: transportCalc.costPerTruck > 0 ? transportCalc.totalCost : null,
      transport_paid_by: transportPaidBy,
      transport_from: transportFrom || null,
      transport_to: transportTo || null,
      steel_grade: validItems.length === 1 ? items.find((_, i) => itemResults[i]?.valid)?.steelGrade ?? null : null,
      delivery_info: deliveryInfo.trim() || null,
      base_price_pln: effectivePrices.base_price_pln,
      weekly_cost_pln: totals.totalMassT * effectivePrices.price_per_week_1,
      price_per_week_1: effectivePrices.price_per_week_1,
      price_per_week_2: effectivePrices.price_per_week_2,
      threshold_weeks: effectivePrices.threshold_weeks,
      loss_price_pln: effectivePrices.loss_price_pln,
      sorting_price_pln: effectivePrices.sorting_price_pln,
      grinding_price_pln: effectivePrices.grinding_price_pln,
      welding_price_pln: effectivePrices.welding_price_pln,
      cutting_price_pln: effectivePrices.cutting_price_pln,
      repair_price_pln: effectivePrices.repair_price_pln,
      notes: notes.trim() || null,
      valid_days: validDays,
      payment_days: paymentDays,
      prepared_by: preparedBy,
      updated_at: new Date().toISOString(),
    }).eq('id', offer.id).select('*, client:clients(*)').single();

    if (err) { setSaving(false); return setError('Błąd zapisu: ' + err.message); }

    // 2. Atomowe zastąpienie pozycji przez Postgres RPC (DELETE + INSERT w jednej transakcji)
    // Jeśli INSERT się nie powiedzie, DELETE jest automatycznie cofany
    const newItems = items.flatMap((item, idx) => {
      const r = itemResults[idx];
      if (!r.profile || !r.valid) return [];
      return [{
        profile_name: r.profile.name,
        profile_type: r.profile.type,
        steel_grade: item.steelGrade,
        quantity: item.quantity,
        length_m: item.lengthM,
        total_length_m: r.totalLengthM,
        mass_t: r.massT,
        wall_area_m2: r.wallAreaM2,
        sort_order: idx,
      }];
    });

    const { data: rpcItems, error: rpcErr } = await supabase
      .rpc('update_offer_items_atomic', {
        p_offer_id: offer.id,
        p_items: newItems,
      });
    if (rpcErr) {
      // Nagłówek oferty już zaktualizowany – cofnij do poprzednich wartości
      await supabase.from('offers').update({
        mass_t: offer.mass_t,
        total_length_m: offer.total_length_m,
        wall_area_m2: offer.wall_area_m2,
        rental_cost_pln: offer.rental_cost_pln,
        cost_per_m2: offer.cost_per_m2,
        cost_per_ton: offer.cost_per_ton,
        quantity: offer.quantity,
        updated_at: offer.updated_at,
      }).eq('id', offer.id);
      setSaving(false);
      return setError('Błąd aktualizacji pozycji – przywrócono poprzedni stan oferty. Spróbuj ponownie: ' + rpcErr.message);
    }
    setSaving(false);

    const updatedOffer = data as Offer;
    updatedOffer.items = Array.isArray(rpcItems) ? rpcItems : [];
    onSaved(updatedOffer);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Edytuj ofertę</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{offer.offer_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Pozycje */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Pozycje oferty</h4>
              <button onClick={addItem} className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj pozycję
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const r = itemResults[idx];
                return (
                  <div key={item.uid} className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="col-span-3">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Profil</p>}
                      <select value={item.profileId} onChange={e => updateItem(item.uid, { profileId: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Gatunek stali</p>}
                      <select value={item.steelGrade} onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {STEEL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Ilość</p>}
                      <input type="number" min={1} value={item.quantity}
                        onChange={e => updateItem(item.uid, { quantity: Math.max(1, parseInt(e.target.value) || 0) })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Dług. [m]</p>}
                      <input type="number" min={0.1} step={0.5} value={item.lengthM}
                        onChange={e => updateItem(item.uid, { lengthM: Math.max(0.1, parseFloat(e.target.value) || 0) })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Masa</p>}
                      <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-sm text-gray-700 min-h-[34px] flex items-center">
                        {r.valid ? <span className="font-semibold">{formatNumber(r.massT, 3)} t</span> : <span className="text-gray-400">—</span>}
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <button onClick={() => removeItem(item.uid)}
                          className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors text-xs">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {totals.totalMassT > 0 && (
              <div className="mt-2 flex gap-4 text-xs text-gray-500 px-1">
                <span>Masa łączna: <strong className="text-gray-800">{formatNumber(totals.totalMassT, 3)} t</strong></span>
                <span>Koszt: <strong className="text-blue-900">{formatPLN(rentalCost)} PLN</strong></span>
              </div>
            )}
          </div>

          {/* Okres */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-gray-700">Podstawowy okres dzierżawy</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
                  <button type="button"
                    onClick={() => setDisplayUnit('weeks')}
                    className={`px-2 py-1 transition-colors ${displayUnit === 'weeks' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >Tyg.</button>
                  <button type="button"
                    onClick={() => setDisplayUnit('months')}
                    className={`px-2 py-1 transition-colors ${displayUnit === 'months' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >Mies.</button>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <input type="number" min={1} step={1} value={rentalWeeks}
                    onChange={e => setRentalWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-0.5">tygodnie</p>
                </div>
                <div className="pb-5 text-gray-400 text-sm">=</div>
                <div className="flex-1">
                  <input type="number" min={0.25} step={0.5}
                    value={weeksToMonths(rentalWeeks)}
                    onChange={e => setRentalWeeks(monthsToWeeks(parseFloat(e.target.value) || 0))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-0.5">miesiące</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ważność oferty [dni]</label>
              <input type="number" min={1} value={validDays}
                onChange={e => setValidDays(Math.max(1, parseInt(e.target.value) || 30))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Termin płatności</label>
              <select value={paymentDays} onChange={e => setPaymentDays(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value={0}>Przedpłata</option>
                <option value={7}>7 dni</option>
                <option value={14}>14 dni</option>
                <option value={21}>21 dni</option>
                <option value={30}>30 dni</option>
                <option value={60}>60 dni</option>
              </select>
            </div>
          </div>

          {/* Ceny */}
          <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">
              Ceny wynajmu dla tej oferty
              {(customBasePricePln !== prices.base_price_pln || customPricePerWeek1 !== prices.price_per_week_1) && (
                <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full font-semibold">zmodyfikowane</span>
              )}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cena wynajmu [PLN/t]
                </label>
                <input
                  type="number" min={0} step={1}
                  value={customBasePricePln}
                  onChange={e => setCustomBasePricePln(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Każdy kolejny tydzień [PLN/t]
                </label>
                <input
                  type="number" min={0} step={1}
                  value={customPricePerWeek1}
                  onChange={e => setCustomPricePerWeek1(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
            </div>
            {totals.totalMassT > 0 && (
              <div className="pt-2 border-t border-amber-200 text-sm text-gray-700">
                Koszt przy tych cenach:
                <strong className="text-blue-900 ml-1">{formatPLN(rentalCost)} PLN</strong>
              </div>
            )}
          </div>

          {/* Klient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klient</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— wybierz klienta —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.country === 'PL' ? c.nip : c.vat_number})</option>
              ))}
            </select>
          </div>

          {/* Transport */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Transport
              <span className="text-xs font-normal text-gray-400 ml-2">
                (auto {TRUCK_CAPACITY_T} t, masa: {formatNumber(totals.totalMassT, 3)} t, auto: {transportCalc.autoTrucks} szt.)
              </span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Koszt / auto [PLN]</label>
                <input type="number" min={0} step={100} value={transportCostPerTruck} placeholder="np. 2500"
                  onChange={e => setTransportCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Liczba aut{typeof customTrucks === 'number' && customTrucks > 0 && <span className="ml-1 text-amber-600">(ręcznie)</span>}
                </label>
                <input type="number" min={1} step={1}
                  value={customTrucks}
                  placeholder={String(transportCalc.autoTrucks)}
                  onChange={e => setCustomTrucks(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Załadunek</label>
                <input type="text" value={transportFrom} onChange={e => setTransportFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Dostawa</label>
                <input type="text" value={transportTo} onChange={e => setTransportTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600 font-medium">Opcja transportu:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { val: 'dap_included', label: 'DAP – w cenie' },
                  { val: 'dap_extra',    label: 'DAP – refaktura' },
                  { val: 'fca',          label: 'FCA – odbiór własny' },
                ] as const).map(({ val, label }) => (
                  <label key={val} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm transition-colors ${
                    transportPaidBy === val ? 'border-blue-700 bg-blue-50 font-semibold' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="editTransportPaidBy" value={val} checked={transportPaidBy === val}
                      onChange={() => setTransportPaidBy(val)} className="accent-blue-900" />
                    {label}
                  </label>
                ))}
                {transportCalc.costPerTruck > 0 && transportPaidBy !== 'fca' && (
                  <span className="ml-auto self-center text-sm font-semibold text-gray-700">{formatPLN(transportCalc.totalCost)} PLN</span>
                )}
              </div>
            </div>
          </div>

          {/* Opiekun handlowy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opiekun handlowy</label>
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
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Anuluj</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50">
            {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
