import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Offer, RoadPlateProfile, RoadPlateRentalPrices, Client, OfferItem } from '../types';
import { calculateRentalCost, calculateRoadPlateMetrics, formatPLN, formatEUR, formatNumber } from '../lib/calculations';
import { convertCurrencyValue } from '../lib/currency';
import ClientSearchInput from './ClientSearchInput';
import { SALES_REPS } from '../lib/constants';

interface NBPRate { rate: number; date: string; }

const STEEL_GRADES = ['min. S270GP', 'S270GP', 'min. S355GP', 'S355GP'];

interface CalcItem {
  uid: string;
  profileId: string;
  steelGrade: string;
  quantity: number | '';
}

interface Props {
  offer: Offer;
  profiles: RoadPlateProfile[];
  prices: RoadPlateRentalPrices;
  clients: Client[];
  onSaved: (offer: Offer) => void;
  onClose: () => void;
  mode?: 'edit' | 'copy';
}

const TRUCK_CAPACITY_T = 24.5;
const WAREHOUSE_PRESET = 'Cieśle 42, 56400, PL';
const WAREHOUSE_PRESET_CZ = 'Pohraniční 3272/130, 703 00 Ostrava, CZ';

function itemsFromOffer(offer: Offer, profiles: RoadPlateProfile[]): CalcItem[] {
  if (offer.items && offer.items.length > 0) {
    return offer.items
      .slice()
      .sort((a: OfferItem, b: OfferItem) => a.sort_order - b.sort_order)
      .map((item: OfferItem) => {
        // Match po nazwie profilu — bo to jest snapshotowane w pozycji
        const profile = profiles.find(p => p.name === item.profile_name);
        return {
          uid: crypto.randomUUID(),
          profileId: profile?.id ?? profiles[0]?.id ?? '',
          steelGrade: item.steel_grade ?? STEEL_GRADES[0],
          quantity: item.quantity,
        };
      });
  }
  // Fallback dla ofert bez pozycji (nie powinno się zdarzyć dla road_plate)
  return [{
    uid: crypto.randomUUID(),
    profileId: profiles[0]?.id ?? '',
    steelGrade: offer.steel_grade ?? STEEL_GRADES[0],
    quantity: offer.quantity,
  }];
}

export default function EditRoadPlateOfferModal({ offer, profiles, prices, clients, onSaved, onClose, mode = 'edit' }: Props) {
  const isCopy = mode === 'copy';
  const [items, setItems] = useState<CalcItem[]>(() => itemsFromOffer(offer, profiles));
  const [rentalWeeks, setRentalWeeks] = useState(offer.rental_weeks);
  const [displayUnit, setDisplayUnit] = useState<'weeks' | 'months'>(offer.display_unit ?? 'weeks');
  const weeksToMonths = (w: number) => w / 4;
  const monthsToWeeks = (m: number) => Math.max(1, m * 4);
  const [clientId, setClientId] = useState(offer.client_id ?? '');
  const [taskName, setTaskName] = useState(offer.task_name ?? '');
  const [notes, setNotes] = useState(offer.notes ?? '');
  const [deliveryInfo, setDeliveryInfo] = useState(offer.delivery_info ?? '');
  const [validDays, setValidDays] = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);
  const [transportCostPerTruck, setTransportCostPerTruck] = useState<number | ''>(
    offer.transport_cost_per_truck != null
      ? (offer.currency === 'EUR' && offer.exchange_rate
          ? Math.round(offer.transport_cost_per_truck / offer.exchange_rate * 100) / 100
          : offer.transport_cost_per_truck)
      : '',
  );
  const [customTrucks, setCustomTrucks] = useState<number | ''>(
    offer.transport_trucks ?? '',
  );
  const [transportPaidBy, setTransportPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca'>(() => {
    const v = offer.transport_paid_by as string | undefined;
    if (v === 'intra') return 'dap_included';
    if (v === 'klient') return 'dap_extra';
    return (v as 'dap_included' | 'dap_extra' | 'fca') ?? 'dap_included';
  });
  const [transportFrom, setTransportFrom] = useState(offer.transport_from ?? WAREHOUSE_PRESET);
  const [transportTo, setTransportTo] = useState(offer.transport_to ?? '');
  const [preparedBy, setPreparedBy] = useState(offer.prepared_by ?? SALES_REPS[0].name);

  // Waluta i kurs
  const [currency, setCurrency]     = useState<'EUR' | 'PLN'>(offer.currency as 'EUR' | 'PLN' ?? 'PLN');
  const [manualRate, setManualRate] = useState(offer.exchange_rate ?? 4.25);
  const [nbpRate, setNbpRate]       = useState<NBPRate | null>(null);
  const [nbpLoading, setNbpLoading] = useState(false);
  const exchangeRate = nbpRate?.rate ?? manualRate;

  useEffect(() => {
    setNbpLoading(true);
    fetch('https://api.nbp.pl/api/exchangerates/rates/A/EUR/last/1/?format=json')
      .then(r => r.json())
      .then(d => { setNbpRate({ rate: d.rates[0].mid, date: d.rates[0].effectiveDate }); setManualRate(d.rates[0].mid); })
      .catch(() => {})
      .finally(() => setNbpLoading(false));
  }, []);

  // Helper: jeśli oferta jest w EUR a snapshot w PLN — przelicz do EUR przy inicjalizacji
  // (snapshoty w bazie zawsze w PLN canonical, ale UI potrzebuje wartości w walucie oferty)
  const offerExRate = offer.exchange_rate ?? manualRate;
  const fromPlnToOfferCurrency = (pln: number | undefined, fallback: number): number => {
    if (pln == null) return fallback;
    return offer.currency === 'EUR' ? Math.round(pln / offerExRate * 100) / 100 : pln;
  };

  // Indywidualne ceny — snapshot z oferty (przeliczony do waluty oferty)
  const [customBasePricePln, setCustomBasePricePln] = useState<number>(
    fromPlnToOfferCurrency(offer.base_price_pln, prices.base_price_pln),
  );
  const [customPricePerWeek1, setCustomPricePerWeek1] = useState<number>(
    fromPlnToOfferCurrency(offer.price_per_week_1, prices.price_per_week_1_pln),
  );

  // Damage prices — snapshot rp_*_pln z oferty (przeliczony do waluty oferty)
  const [lossPrice,         setLossPrice]         = useState<number>(fromPlnToOfferCurrency(offer.rp_loss_price_pln,    prices.loss_price_pln));
  const [serviceHourPrice,  setServiceHourPrice]  = useState<number>(fromPlnToOfferCurrency(offer.rp_service_hour_pln,  prices.service_hour_pln));
  const [sortingPrice,      setSortingPrice]      = useState<number>(fromPlnToOfferCurrency(offer.rp_sorting_price_pln, prices.sorting_price_pln));
  const [m12WeldingPrice,   setM12WeldingPrice]   = useState<number>(fromPlnToOfferCurrency(offer.rp_m12_welding_pln,   prices.m12_welding_pln));
  const [cuttingHeadPrice,  setCuttingHeadPrice]  = useState<number>(fromPlnToOfferCurrency(offer.rp_cutting_head_pln,  prices.cutting_head_pln));
  const [liftingHolePrice,  setLiftingHolePrice]  = useState<number>(fromPlnToOfferCurrency(offer.rp_lifting_hole_pln,  prices.lifting_hole_pln));

  // Przelicz wszystkie ceny przy zmianie waluty
  function handleCurrencyChange(newCur: 'EUR' | 'PLN') {
    if (newCur === currency) return;
    // Helper z src/lib/currency.ts — single source of truth.
    // Wynajem używa precision='cents' (symetryczne 2dp w obie strony).
    const conv = (v: number) => convertCurrencyValue(v, currency, newCur, exchangeRate, 'cents');
    setCustomBasePricePln(prev => conv(prev));
    setCustomPricePerWeek1(prev => conv(prev));
    setLossPrice(prev => conv(prev));
    setServiceHourPrice(prev => conv(prev));
    setSortingPrice(prev => conv(prev));
    setM12WeldingPrice(prev => conv(prev));
    setCuttingHeadPrice(prev => conv(prev));
    setLiftingHolePrice(prev => conv(prev));
    // Transport "w walucie oferty" (patrz docs/CURRENCY-CONVERSION-PATTERN.md).
    if (typeof transportCostPerTruck === 'number' && transportCostPerTruck > 0) {
      setTransportCostPerTruck(conv(transportCostPerTruck));
    }
    setCurrency(newCur);
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addItem() {
    setItems(prev => [...prev, { uid: crypto.randomUUID(), profileId: profiles[0]?.id ?? '', steelGrade: STEEL_GRADES[0], quantity: '' }]);
  }
  function removeItem(uid: string) {
    setItems(prev => prev.filter(i => i.uid !== uid));
  }
  function updateItem(uid: string, patch: Partial<CalcItem>) {
    setItems(prev => prev.map(i => i.uid === uid ? { ...i, ...patch } : i));
  }

  // Wyliczenia per pozycja — używa calculateRoadPlateMetrics
  const itemResults = useMemo(() =>
    items.map(item => {
      const profile = profiles.find(p => p.id === item.profileId) ?? null;
      const qty = Number(item.quantity) || 0;
      if (!profile || qty <= 0) {
        return { profile, totalLengthM: 0, areaM2: 0, massT: 0, valid: false };
      }
      const m = calculateRoadPlateMetrics(qty, profile.sheet_length_m, profile.sheet_width_m, profile.weight_kg_per_m2);
      return { profile, ...m, valid: m.massT > 0 };
    }),
    [items, profiles],
  );

  const totals = useMemo(() => {
    let totalLengthM = 0, totalMassT = 0, totalAreaM2 = 0;
    for (const r of itemResults) {
      if (!r.valid) continue;
      totalLengthM += r.totalLengthM;
      totalMassT += r.massT;
      totalAreaM2 += r.areaM2;
    }
    return { totalLengthM, totalMassT, totalAreaM2 };
  }, [itemResults]);

  const rentalCost = useMemo(() =>
    totals.totalMassT > 0 ? calculateRentalCost(totals.totalMassT, customBasePricePln) : 0,
    [totals.totalMassT, customBasePricePln],
  );
  const rentalCostPLN = currency === 'PLN' ? rentalCost : rentalCost * exchangeRate;
  const rentalCostEUR = currency === 'EUR' ? rentalCost : rentalCost / exchangeRate;

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
    if (validItems.length !== items.length) return setError('Uzupełnij ilość we wszystkich pozycjach — pozycje bez wartości nie mogą zostać zapisane.');
    setSaving(true);
    setError('');

    const mainProfileName = validItems.length === 1 ? itemResults.find(r => r.valid)!.profile!.name : 'Wiele profili';

    // Helper: konwertuj wartość w walucie oferty na PLN canonical
    const toPLN = (v: number) => currency === 'EUR' ? v * exchangeRate : v;

    const transportCostPlnPerTruck = transportCalc.costPerTruck > 0
      ? (currency === 'EUR' ? transportCalc.costPerTruck * exchangeRate : transportCalc.costPerTruck)
      : null;
    const transportCostPlnTotal = transportCalc.costPerTruck > 0
      ? (currency === 'EUR' ? transportCalc.totalCost * exchangeRate : transportCalc.totalCost)
      : null;

    const totalCostForRatios = rentalCost + (
      transportCalc.costPerTruck > 0 && transportPaidBy === 'dap_included' ? transportCalc.totalCost : 0
    );

    const offerPayload = {
      client_id: clientId,
      task_name: taskName.trim() || null,
      profile_name: mainProfileName,
      profile_type: 'PLATE',
      quantity: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
      length_m: validItems.length === 1 ? itemResults.find(r => r.valid)!.profile!.sheet_length_m : null,
      rental_weeks: rentalWeeks,
      display_unit: displayUnit,
      total_length_m: totals.totalLengthM,
      mass_t: totals.totalMassT,
      wall_area_m2: totals.totalAreaM2,
      rental_cost_pln: rentalCostPLN,
      rental_cost_eur: rentalCostEUR,
      currency,
      exchange_rate: currency === 'EUR' ? exchangeRate : null,
      cost_per_m2: totals.totalAreaM2 > 0 ? totalCostForRatios / totals.totalAreaM2 : 0,
      cost_per_ton: totals.totalMassT > 0 ? totalCostForRatios / totals.totalMassT : 0,
      transport_trucks: transportCalc.trucks,
      transport_cost_per_truck: transportCostPlnPerTruck,
      transport_cost_total: transportCostPlnTotal,
      transport_paid_by: transportPaidBy,
      transport_from: transportFrom || null,
      transport_to: transportTo || null,
      steel_grade: validItems.length === 1 ? items.find((_, i) => itemResults[i]?.valid)?.steelGrade ?? null : null,
      delivery_info: deliveryInfo.trim() || null,
      base_price_pln: toPLN(customBasePricePln),
      weekly_cost_pln: totals.totalMassT * toPLN(customPricePerWeek1),
      price_per_week_1: toPLN(customPricePerWeek1),
      rp_loss_price_pln:    toPLN(lossPrice),
      rp_service_hour_pln:  toPLN(serviceHourPrice),
      rp_sorting_price_pln: toPLN(sortingPrice),
      rp_m12_welding_pln:   toPLN(m12WeldingPrice),
      rp_cutting_head_pln:  toPLN(cuttingHeadPrice),
      rp_lifting_hole_pln:  toPLN(liftingHolePrice),
      notes: notes.trim() || null,
      valid_days: validDays,
      payment_days: paymentDays,
      prepared_by: preparedBy,
    };

    const newItems = items.flatMap((item, idx) => {
      const r = itemResults[idx];
      if (!r.profile || !r.valid) return [];
      return [{
        item_type: 'road_plate',
        profile_name: r.profile.name,
        profile_type: 'PLATE',
        steel_grade: item.steelGrade,
        quantity: Number(item.quantity) || 0,
        length_m: r.profile.sheet_length_m,
        total_length_m: r.totalLengthM,
        mass_t: r.massT,
        wall_area_m2: r.areaM2,
        thickness_mm: r.profile.thickness_mm,
        sheet_length_m: r.profile.sheet_length_m,
        sheet_width_m: r.profile.sheet_width_m,
        weight_kg_per_m2: r.profile.weight_kg_per_m2,
        sort_order: idx,
      }];
    });

    if (isCopy) {
      const { data, error: err } = await supabase.from('offers').insert({
        ...offerPayload,
        offer_number: '',
        item_type: 'road_plate',
        status: 'szkic',
      }).select('*, client:clients(*)').single();

      if (err) { setSaving(false); return setError('Błąd zapisu kopii: ' + err.message); }

      const savedOffer = data as Offer;

      const { data: insertedItems, error: itemsErr } = await supabase.from('offer_items').insert(
        newItems.map(ni => ({ ...ni, offer_id: savedOffer.id }))
      ).select();

      if (itemsErr) {
        await supabase.rpc('soft_delete_offer', { p_offer_id: savedOffer.id });
        setSaving(false);
        return setError('Błąd zapisu pozycji kopii – oferta anulowana. Spróbuj ponownie: ' + itemsErr.message);
      }
      setSaving(false);
      savedOffer.items = (insertedItems ?? []) as typeof savedOffer.items;
      onSaved(savedOffer);
    } else {
      const { data, error: err } = await supabase.from('offers').update({
        ...offerPayload,
        updated_at: new Date().toISOString(),
      }).eq('id', offer.id).select('*, client:clients(*)').single();

      if (err) { setSaving(false); return setError('Błąd zapisu oferty: ' + err.message); }

      const { data: rpcItems, error: rpcErr } = await supabase
        .rpc('update_offer_items_atomic_v2', {
          p_offer_id: offer.id,
          p_items: newItems,
        });

      if (rpcErr) {
        await supabase.from('offers').update({
          mass_t: offer.mass_t,
          total_length_m: offer.total_length_m,
          wall_area_m2: offer.wall_area_m2,
          rental_cost_pln: offer.rental_cost_pln,
          rental_cost_eur: offer.rental_cost_eur,
          currency: offer.currency,
          exchange_rate: offer.exchange_rate,
          cost_per_m2: offer.cost_per_m2,
          cost_per_ton: offer.cost_per_ton,
          quantity: offer.quantity,
          rp_loss_price_pln:    offer.rp_loss_price_pln    ?? null,
          rp_service_hour_pln:  offer.rp_service_hour_pln  ?? null,
          rp_sorting_price_pln: offer.rp_sorting_price_pln ?? null,
          rp_m12_welding_pln:   offer.rp_m12_welding_pln   ?? null,
          rp_cutting_head_pln:  offer.rp_cutting_head_pln  ?? null,
          rp_lifting_hole_pln:  offer.rp_lifting_hole_pln  ?? null,
          updated_at: offer.updated_at,
        }).eq('id', offer.id);
        setSaving(false);
        return setError('Błąd aktualizacji pozycji – przywrócono poprzedni stan oferty. Spróbuj ponownie: ' + rpcErr.message);
      }

      setSaving(false);
      const updatedOffer = data as Offer;
      updatedOffer.items = Array.isArray(rpcItems) ? (rpcItems as typeof updatedOffer.items) : [];
      onSaved(updatedOffer);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{isCopy ? 'Kopiuj ofertę — płyty drogowe' : 'Edytuj ofertę — płyty drogowe'}</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{isCopy ? `na podstawie ${offer.offer_number}` : offer.offer_number}</p>
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
                    <div className="col-span-5">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Profil płyty</p>}
                      <select value={item.profileId} onChange={e => updateItem(item.uid, { profileId: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sheet_width_m}×{p.sheet_length_m} m)</option>
                        ))}
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
                      <input type="number" min={1} placeholder="np. 10" value={item.quantity}
                        onChange={e => updateItem(item.uid, { quantity: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                        className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 ${!(Number(item.quantity) > 0) ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-blue-500'}`} />
                    </div>
                    <div className="col-span-1">
                      {idx === 0 && <p className="text-xs text-gray-400 mb-1">Masa</p>}
                      <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-sm text-gray-700 min-h-[34px] flex items-center">
                        {r.valid ? <span className="font-semibold text-xs">{formatNumber(r.massT, 2)} t</span> : <span className="text-gray-400">—</span>}
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
                <span>Powierzchnia: <strong className="text-gray-800">{formatNumber(totals.totalAreaM2, 2)} m²</strong></span>
                <span>Koszt: <strong className="text-blue-900">
                  {currency === 'EUR' ? `${formatEUR(rentalCost)} EUR` : `${formatPLN(rentalCost)} PLN`}
                </strong></span>
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

          {/* Waluta i kurs */}
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-gray-700">Waluta oferty</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
                {(['PLN', 'EUR'] as const).map(c => (
                  <button key={c} type="button"
                    onClick={() => handleCurrencyChange(c)}
                    className={`px-4 py-1.5 transition-colors ${currency === c ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {currency === 'EUR' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Kurs EUR/PLN:</span>
                  <input type="number" min={1} step={0.0001}
                    value={manualRate}
                    onChange={e => { setManualRate(parseFloat(e.target.value) || 4.25); setNbpRate(null); }}
                    className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => {
                    setNbpLoading(true);
                    fetch('https://api.nbp.pl/api/exchangerates/rates/A/EUR/last/1/?format=json')
                      .then(r => r.json())
                      .then(d => { setNbpRate({ rate: d.rates[0].mid, date: d.rates[0].effectiveDate }); setManualRate(d.rates[0].mid); })
                      .catch(() => {})
                      .finally(() => setNbpLoading(false));
                  }} className="px-2 py-1 text-xs bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100">
                    {nbpLoading ? '...' : '↻ NBP'}
                  </button>
                  {nbpRate && <span className="text-xs text-gray-400">NBP: {nbpRate.rate.toFixed(4)} ({nbpRate.date})</span>}
                </div>
              )}
            </div>
          </div>

          {/* Ceny */}
          <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Ceny wynajmu dla tej oferty</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cena wynajmu [{currency}/t]</label>
                <input type="number" min={0} step={1}
                  value={customBasePricePln}
                  onChange={e => setCustomBasePricePln(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Każdy kolejny tydzień [{currency}/t]</label>
                <input type="number" min={0} step={1}
                  value={customPricePerWeek1}
                  onChange={e => setCustomPricePerWeek1(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
              </div>
            </div>
            {totals.totalMassT > 0 && (
              <div className="pt-2 border-t border-amber-200 text-sm text-gray-700">
                Koszt przy tych cenach:
                <strong className="text-blue-900 ml-1">
                  {currency === 'EUR'
                    ? `${formatEUR(rentalCost)} EUR  ≈ ${formatPLN(rentalCostPLN)} PLN`
                    : `${formatPLN(rentalCost)} PLN`}
                </strong>
              </div>
            )}
          </div>

          {/* Cennik szkód płyt drogowych */}
          <details className="border border-gray-200 rounded-lg">
            <summary className="px-4 py-3 text-sm font-semibold text-gray-700 cursor-pointer select-none list-none flex items-center justify-between hover:bg-gray-50 rounded-lg">
              <span>Cennik szkód i napraw</span>
              <span className="text-xs font-normal text-gray-400 ml-2">({currency} / jedn.) ▸ rozwiń</span>
            </summary>
            <div className="px-4 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { label: `Zagubienie / strata [${currency}/t]`,             val: lossPrice,        set: (v: number) => setLossPrice(v)        },
                { label: `Roboczogodzina serwisowa [${currency}/h]`,        val: serviceHourPrice, set: (v: number) => setServiceHourPrice(v) },
                { label: `Sortowanie i czyszczenie [${currency}/t]`,        val: sortingPrice,     set: (v: number) => setSortingPrice(v)     },
                { label: `Spawanie otworów M12 [${currency}/szt]`,          val: m12WeldingPrice,  set: (v: number) => setM12WeldingPrice(v)  },
                { label: `Głowica tnąca [${currency}/cięcie]`,              val: cuttingHeadPrice, set: (v: number) => setCuttingHeadPrice(v) },
                { label: `Nowy otwór do podnoszenia [${currency}/szt]`,     val: liftingHolePrice, set: (v: number) => setLiftingHolePrice(v) },
              ] as { label: string; val: number; set: (v: number) => void }[]).map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input type="number" min={0} step={0.01} value={val}
                    onChange={e => set(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          </details>

          {/* Klient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klient</label>
            <ClientSearchInput clients={clients} value={clientId} onChange={setClientId} />
          </div>

          {/* Nazwa zadania (opcjonalnie) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa zadania (opcjonalnie)</label>
            <input type="text" value={taskName} maxLength={35} onChange={e => setTaskName(e.target.value)} placeholder="np. Budowa S5 odcinek Korzeńsko" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
                <label className="block text-xs text-gray-500 mb-1">
                  Koszt / auto [{currency}]
                  {currency === 'EUR' && <span className="ml-1 text-blue-600">(wpisz w EUR)</span>}
                </label>
                <input type="number" min={0} step={currency === 'EUR' ? 10 : 100}
                  value={transportCostPerTruck}
                  placeholder={currency === 'EUR' ? 'np. 600' : 'np. 2500'}
                  onChange={e => setTransportCostPerTruck(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {currency === 'EUR' && typeof transportCostPerTruck === 'number' && transportCostPerTruck > 0 && (
                  <p className="text-xs text-gray-400 mt-1">≈ {formatPLN(transportCostPerTruck * exchangeRate)} PLN / auto</p>
                )}
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
                <select
                  value={transportFrom === WAREHOUSE_PRESET ? WAREHOUSE_PRESET : transportFrom === WAREHOUSE_PRESET_CZ ? WAREHOUSE_PRESET_CZ : '__custom__'}
                  onChange={e => setTransportFrom(e.target.value === '__custom__' ? '' : e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value={WAREHOUSE_PRESET}>Magazyn Intra B.V. (Cieśle, PL)</option>
                  <option value={WAREHOUSE_PRESET_CZ}>Magazyn Intra B.V. (Ostrava, CZ)</option>
                  <option value="__custom__">Inny adres…</option>
                </select>
                {transportFrom !== WAREHOUSE_PRESET && transportFrom !== WAREHOUSE_PRESET_CZ && (
                  <input type="text" value={transportFrom} placeholder="Wpisz adres magazynu"
                    onChange={e => setTransportFrom(e.target.value)}
                    className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
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
                    <input type="radio" name="editRPTransportPaidBy" value={val} checked={transportPaidBy === val}
                      onChange={() => setTransportPaidBy(val)} className="accent-blue-900" />
                    {label}
                  </label>
                ))}
                {transportCalc.costPerTruck > 0 && transportPaidBy !== 'fca' && (
                  <span className="ml-auto self-center text-sm font-semibold text-gray-700">
                    {currency === 'EUR'
                      ? `${formatEUR(transportCalc.totalCost)} EUR`
                      : `${formatPLN(transportCalc.totalCost)} PLN`}
                  </span>
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
            <input type="text" value={deliveryInfo} onChange={e => setDeliveryInfo(e.target.value)}
              placeholder="np. 5-7 dni roboczych"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            {saving ? 'Zapisywanie...' : isCopy ? 'Zapisz kopię' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
