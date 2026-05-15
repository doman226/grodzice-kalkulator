import { useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Client, PipeSaleOffer, PipeSaleOfferItem, OfferStatus } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import { convertCurrencyValue } from '../../../lib/currency';
import ClientSearchInput from '../../ClientSearchInput';
import { SALES_REPS } from '../../../lib/constants';
import {
  PIPE_PRODUCT_TYPES,
  PIPE_CONDITIONS,
  PIPE_NORMS,
  PIPE_NORM_GRADES,
  PIPE_NORM_DESCRIPTIONS,
  PIPE_SURFACES,
  isCertifiedCondition,
  pipeKgPerM,
  NO_CERT_STEEL_GRADE,
  PIPE_WAREHOUSES,
  PIPE_WAREHOUSE_CUSTOM,
} from '../../../lib/pipeConstants';
import type {
  PipeProductType,
  PipeCondition,
  PipeNorm,
  PipeSurface,
} from '../../../lib/pipeConstants';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface EditablePipeItem {
  uid: string;
  productType: PipeProductType;
  condition: PipeCondition;
  norm: PipeNorm;
  steelGrade: string;
  surface: PipeSurface;
  diameterMm: number;
  wallThicknessMm: number;
  quantitySzt: number;
  lengthM: number;
  costPricePerTon: number;   // w walucie oferty (snapshot)
  sellPricePerTon: number;
}

interface Props {
  offer: PipeSaleOffer;
  clients: Client[];
  onSaved: (offer: PipeSaleOffer) => void;
  onClose: () => void;
}

// ─── Stałe i pomocnicze ─────────────────────────────────────────────────────

const WAREHOUSE_DELIVERY_OPTIONS = [
  'do 3 dni roboczych',
  '3–5 dni roboczych',
  '5–7 dni roboczych',
  '7–10 dni roboczych',
  'do 2 tygodni',
  'do ustalenia',
];

const TRUCK_CAPACITY_T = 24.5;

const STATUS_LABELS: Record<OfferStatus, string> = {
  szkic:     'Szkic',
  wysłana:   'Wysłana',
  przyjęta:  'Przyjęta',
  odrzucona: 'Odrzucona',
};

// Mapowanie z pozycji w bazie na edytowalny rekord lokalny.
// Norma w bazie może być NULL (gdy stan bez atestu) — pre-fill na pierwszą valid normę
// żeby <select> miał valid value; faktyczny zapis ponownie wyzeruje normę jeśli stan = "bez atestu".
function itemsFromOffer(offer: PipeSaleOffer): EditablePipeItem[] {
  if (!offer.items || offer.items.length === 0) {
    return [{
      uid: crypto.randomUUID(),
      productType: PIPE_PRODUCT_TYPES[0],
      condition: PIPE_CONDITIONS[0],
      norm: 'EN10219-1/2',
      steelGrade: PIPE_NORM_GRADES['EN10219-1/2'][0],
      surface: PIPE_SURFACES[0],
      diameterMm: 168.3,
      wallThicknessMm: 6.3,
      quantitySzt: 10,
      lengthM: 12,
      costPricePerTon: 0,
      sellPricePerTon: 0,
    }];
  }
  return offer.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => ({
      uid: crypto.randomUUID(),
      productType: (PIPE_PRODUCT_TYPES.includes(item.product_type as PipeProductType)
        ? item.product_type
        : PIPE_PRODUCT_TYPES[0]) as PipeProductType,
      condition: (PIPE_CONDITIONS.includes(item.condition as PipeCondition)
        ? item.condition
        : PIPE_CONDITIONS[0]) as PipeCondition,
      // norma w bazie może być NULL — fallback na EN10219-1/2 dla UI, faktyczny zapis poprawnie wyzeruje
      norm: (item.norm && PIPE_NORMS.includes(item.norm as PipeNorm)
        ? item.norm
        : 'EN10219-1/2') as PipeNorm,
      steelGrade: item.steel_grade,
      surface: (PIPE_SURFACES.includes(item.surface as PipeSurface)
        ? item.surface
        : PIPE_SURFACES[0]) as PipeSurface,
      diameterMm: item.diameter_mm,
      wallThicknessMm: item.wall_thickness_mm,
      quantitySzt: item.quantity_szt,
      lengthM: item.length_m,
      costPricePerTon: item.cost_price_per_ton ?? 0,
      sellPricePerTon: item.sell_price_per_ton ?? 0,
    }));
}

// Margin coloring — 1:1 z PipeSaleCalculator
function marginColor(pct: number): string {
  if (pct < 0)   return 'text-red-600 bg-red-50 border-red-200';
  if (pct < 5)   return 'text-orange-600 bg-orange-50 border-orange-200';
  if (pct < 10)  return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-green-700 bg-green-50 border-green-200';
}

// ─── Komponent ───────────────────────────────────────────────────────────────

export default function PipeEditOfferModal({ offer, clients, onSaved, onClose }: Props) {
  // ── Stan: lazy initial dla pre-fillu ──
  const [editItems, setEditItems]     = useState<EditablePipeItem[]>(() => itemsFromOffer(offer));
  const [clientId, setClientId]       = useState(offer.client_id ?? '');
  const [status, setStatus]           = useState<OfferStatus>(offer.status);
  const [preparedBy, setPreparedBy]   = useState(offer.prepared_by ?? SALES_REPS[0].name);
  const [notes, setNotes]             = useState(offer.notes ?? '');
  const [validDays, setValidDays]     = useState(offer.valid_days);
  const [paymentDays, setPaymentDays] = useState(offer.payment_days ?? 30);

  // ── Waluta ──
  const [currency, setCurrency]         = useState<'EUR' | 'PLN'>((offer.currency ?? 'EUR') as 'EUR' | 'PLN');
  const [exchangeRate, setExchangeRate] = useState(offer.exchange_rate ?? 4.25);

  // ── Dostawa: reverse-calc kosztu/auto z totalu jeśli zapisana wartość brakuje ──
  const [deliveryTrucks, setDeliveryTrucks]             = useState<number | ''>(offer.delivery_trucks ?? '');
  const [deliveryCostPerTruck, setDeliveryCostPerTruck] = useState<number | ''>(() => {
    if (offer.delivery_cost_per_truck != null) return offer.delivery_cost_per_truck;
    if (offer.delivery_cost_total && offer.delivery_trucks && offer.delivery_trucks > 0) {
      const rate = offer.exchange_rate ?? 4.25;
      // delivery_cost_total to PLN canonical — przelicz na walutę oferty per truck
      const totalInCurrency = offer.currency === 'EUR'
        ? offer.delivery_cost_total / rate
        : offer.delivery_cost_total;
      return totalInCurrency / offer.delivery_trucks;
    }
    return '';
  });
  const [deliveryPaidBy, setDeliveryPaidBy] = useState<'dap_included' | 'dap_extra' | 'fca'>(
    (offer.delivery_paid_by as 'dap_included' | 'dap_extra' | 'fca') ?? 'dap_included'
  );
  // Magazyn wysyłki — wartość spoza listy (np. stara oferta "Magazyn dostawcy")
  // automatycznie trafia do trybu własnego (pole tekstowe).
  const [deliveryFrom, setDeliveryFrom] = useState<string>(offer.delivery_from ?? PIPE_WAREHOUSES[0]);
  const [deliveryTo, setDeliveryTo]     = useState(offer.delivery_to ?? '');

  // ── Warunki dostawy ──
  const [deliveryTimeline, setDeliveryTimeline]           = useState<'huta' | 'magazyn'>(
    (offer.delivery_timeline as 'huta' | 'magazyn') ?? 'magazyn'
  );
  const [campaignWeeks, setCampaignWeeks]                 = useState(offer.campaign_weeks ?? '');
  const [campaignDeliveryWeeks, setCampaignDeliveryWeeks] = useState(offer.campaign_delivery_weeks ?? '');
  const [warehouseDeliveryTime, setWarehouseDeliveryTime] = useState(offer.warehouse_delivery_time ?? '5–7 dni roboczych');
  const [deliveryTerms, setDeliveryTerms]                 = useState<'DAP' | 'DAP_EXTRA' | 'FCA'>(
    (offer.delivery_terms as 'DAP' | 'DAP_EXTRA' | 'FCA') ?? 'DAP'
  );
  const [fcaLocation, setFcaLocation] = useState(offer.fca_location ?? '');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Tryb własnego magazynu — gdy deliveryFrom nie jest żadnym ze stałych magazynów
  const isCustomWarehouse = !(PIPE_WAREHOUSES as readonly string[]).includes(deliveryFrom);

  // ── Zarządzanie pozycjami ──
  function addItem() {
    const norm: PipeNorm = 'EN10219-1/2';
    setEditItems(prev => [...prev, {
      uid: crypto.randomUUID(),
      productType: PIPE_PRODUCT_TYPES[0],
      condition: PIPE_CONDITIONS[0],
      norm,
      steelGrade: PIPE_NORM_GRADES[norm][0],
      surface: PIPE_SURFACES[0],
      diameterMm: 168.3,
      wallThicknessMm: 6.3,
      quantitySzt: 10,
      lengthM: 12,
      costPricePerTon: 0,
      sellPricePerTon: 0,
    }]);
  }

  function removeItem(uid: string) {
    setEditItems(prev => prev.filter(i => i.uid !== uid));
  }

  function updateItem(uid: string, patch: Partial<EditablePipeItem>) {
    setEditItems(prev => prev.map(item => {
      if (item.uid !== uid) return item;
      const updated = { ...item, ...patch };
      // Reset gatunku jeśli po zmianie normy obecny gatunek nie pasuje
      if ('norm' in patch) {
        const allowed = PIPE_NORM_GRADES[updated.norm];
        if (!allowed.includes(updated.steelGrade)) {
          updated.steelGrade = allowed[0];
        }
      }
      // Zmiana stanu materiału:
      //   bez atestu → norma "nie dotyczy" (select zablokowany), gatunek → min. S235JRH
      //   powrót do z atestem → gatunek prawidłowy (reset jeśli był min. S235JRH)
      if ('condition' in patch) {
        if (!isCertifiedCondition(updated.condition)) {
          updated.steelGrade = NO_CERT_STEEL_GRADE;
        } else if (!PIPE_NORM_GRADES[updated.norm].includes(updated.steelGrade)) {
          updated.steelGrade = PIPE_NORM_GRADES[updated.norm][0];
        }
      }
      return updated;
    }));
  }

  // ── Konwersja cen przy zmianie waluty ──
  // Używa wspólnego helpera convertCurrencyValue (src/lib/currency.ts).
  // Sprzedaż używa precision='whole' (PLN do całych, EUR do 2dp).
  function handleCurrencyChange(newCurrency: 'EUR' | 'PLN') {
    if (newCurrency === currency) return;
    const conv = (v: number) => convertCurrencyValue(v, currency, newCurrency, exchangeRate, 'whole');
    setEditItems(prev => prev.map(item => ({
      ...item,
      costPricePerTon: conv(item.costPricePerTon),
      sellPricePerTon: conv(item.sellPricePerTon),
    })));
    // Transport "w walucie oferty" (patrz docs/CURRENCY-CONVERSION-PATTERN.md).
    setDeliveryCostPerTruck(prev =>
      typeof prev !== 'number' ? prev : conv(prev),
    );
    setCurrency(newCurrency);
  }

  // ── Obliczenia per pozycja ──
  const itemResults = useMemo(() =>
    editItems.map(it => {
      const kgPerM = pipeKgPerM(it.diameterMm, it.wallThicknessMm);
      if (kgPerM <= 0 || it.quantitySzt <= 0 || it.lengthM <= 0) {
        return null;
      }
      const totalLengthM = it.quantitySzt * it.lengthM;
      const massT        = Math.round(totalLengthM * kgPerM / 1000 * 1000) / 1000;
      const costTotal    = massT * (it.costPricePerTon || 0);
      const sellTotal    = massT * (it.sellPricePerTon || 0);
      const marginPct    = sellTotal > 0 ? ((sellTotal - costTotal) / sellTotal) * 100 : null;
      return { kgPerM, totalLengthM, massT, costTotal, sellTotal, marginPct };
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

  // ── Dostawa: auto-szacunek + totale (1:1 z PipeSaleCalculator) ──
  const deliveryCalc = useMemo(() => {
    if (totals.totalMassT <= 0) return null;
    const combinedMassT   = totals.totalMassT;
    const autoTrucks      = Math.ceil(combinedMassT / TRUCK_CAPACITY_T);
    const trucks          = typeof deliveryTrucks === 'number' && deliveryTrucks > 0
      ? deliveryTrucks : autoTrucks;
    const costPerTruck    = typeof deliveryCostPerTruck === 'number' ? deliveryCostPerTruck : 0;
    const totalInCurrency = trucks * costPerTruck;
    const totalCostPLN    = currency === 'PLN' ? totalInCurrency : totalInCurrency * exchangeRate;
    return { combinedMassT, autoTrucks, trucks, costPerTruck, totalInCurrency, totalCostPLN };
  }, [totals.totalMassT, deliveryTrucks, deliveryCostPerTruck, currency, exchangeRate]);

  // Denominacja — zawsze EUR/PLN niezależnie od currency oferty
  const totalSellEUR = currency === 'EUR' ? totals.totalSell : totals.totalSell / exchangeRate;
  const totalSellPLN = currency === 'PLN' ? totals.totalSell : totals.totalSell * exchangeRate;
  const totalCostEUR = currency === 'EUR' ? totals.totalCost : totals.totalCost / exchangeRate;

  // ─── Zapis (strategia A: UPDATE → DELETE all items → INSERT new items) ─────

  async function handleSave() {
    if (!clientId) return setError('Wybierz klienta.');
    if (editItems.length === 0) return setError('Dodaj przynajmniej jedną pozycję rury.');
    if (deliveryTimeline === 'huta' && !campaignWeeks.trim())
      return setError('Wpisz numer tygodnia kampanii produkcyjnej.');
    if (deliveryTerms === 'FCA' && !fcaLocation.trim())
      return setError('Podaj lokalizację magazynu odbioru (FCA).');

    // Sprawdź czy wszystkie pozycje mają sellPrice > 0 i poprawną geometrię
    const invalidItem = editItems.findIndex(it => {
      const kgPerM = pipeKgPerM(it.diameterMm, it.wallThicknessMm);
      return kgPerM <= 0 || it.quantitySzt <= 0 || it.lengthM <= 0 || (it.sellPricePerTon || 0) <= 0;
    });
    if (invalidItem >= 0) {
      return setError(`Pozycja #${invalidItem + 1}: cena sprzedaży > 0 i poprawne wymiary są wymagane.`);
    }

    setSaving(true);
    setError('');

    const hasTransport = deliveryPaidBy !== 'fca' && deliveryCalc !== null && deliveryCalc.costPerTruck > 0;

    // KROK 1: UPDATE oferty
    const { data: updatedOffer, error: updateErr } = await supabase
      .from('pipe_sale_offers')
      .update({
        client_id:                 clientId,
        status,
        notes:                     notes.trim() || null,
        valid_days:                validDays,
        payment_days:              paymentDays,
        prepared_by:               preparedBy,
        currency,
        exchange_rate:             exchangeRate,
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
        campaign_weeks:            deliveryTimeline === 'huta'    ? campaignWeeks.trim()             : null,
        campaign_delivery_weeks:   deliveryTimeline === 'huta'    ? campaignDeliveryWeeks.trim() || null : null,
        warehouse_delivery_time:   deliveryTimeline === 'magazyn' ? warehouseDeliveryTime            : null,
        delivery_terms:            deliveryTerms,
        fca_location:              deliveryTerms === 'FCA' ? fcaLocation.trim() : null,
      })
      .eq('id', offer.id)
      .select('*, client:clients(*)')
      .single();

    if (updateErr) {
      setSaving(false);
      return setError('Błąd aktualizacji oferty: ' + updateErr.message);
    }

    // KROK 2: DELETE wszystkich starych pozycji oferty
    const { error: deleteErr } = await supabase
      .from('pipe_sale_offer_items')
      .delete()
      .eq('offer_id', offer.id);

    if (deleteErr) {
      setSaving(false);
      return setError('Błąd usuwania starych pozycji: ' + deleteErr.message);
    }

    // KROK 3: INSERT nowych pozycji
    const newItemsPayload = editItems.flatMap((it, idx) => {
      const r = itemResults[idx];
      if (!r) return [];
      const certified = isCertifiedCondition(it.condition);
      const sellEurTotal = currency === 'EUR' ? r.sellTotal : r.sellTotal / exchangeRate;
      const sellPlnTotal = currency === 'PLN' ? r.sellTotal : r.sellTotal * exchangeRate;
      return [{
        offer_id:           offer.id,
        product_type:       it.productType,
        condition:          it.condition,
        norm:               certified ? it.norm : null,                              // NULL gdy bez atestu
        norm_description:   certified ? PIPE_NORM_DESCRIPTIONS[it.norm] : 'nie dotyczy',
        steel_grade:        it.steelGrade,
        surface:            it.surface,
        diameter_mm:        it.diameterMm,
        wall_thickness_mm:  it.wallThicknessMm,
        quantity_szt:       it.quantitySzt,
        length_m:           it.lengthM,
        kg_per_m:           r.kgPerM,
        total_length_m:     r.totalLengthM,
        mass_t:             r.massT,
        cost_price_per_ton: it.costPricePerTon || null,
        sell_price_per_ton: it.sellPricePerTon,
        cost_total:         r.costTotal || null,
        sell_total:         r.sellTotal,
        sell_eur_total:     sellEurTotal,
        sell_pln_total:     sellPlnTotal,
        margin_pct:         r.marginPct,
        sort_order:         idx,
      }];
    });

    const { data: insertedItems, error: insertErr } = await supabase
      .from('pipe_sale_offer_items')
      .insert(newItemsPayload)
      .select();

    if (insertErr) {
      setSaving(false);
      return setError('Błąd zapisu nowych pozycji: ' + insertErr.message + ' (UWAGA: stare pozycje zostały usunięte — otwórz edycję ponownie aby naprawić)');
    }

    setSaving(false);
    const saved = updatedOffer as PipeSaleOffer;
    saved.items = (insertedItems ?? []) as PipeSaleOfferItem[];
    onSaved(saved);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  function fmtMoney(val: number): string {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Math.round(val * 100) / 100) + ' ' + currency;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 max-h-[92vh] flex flex-col">

        {/* Nagłówek */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Edytuj ofertę sprzedaży rur</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{offer.offer_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">

          {/* ── Klient + Status + Waluta + Kurs ── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Klient</label>
              <ClientSearchInput clients={clients} value={clientId} onChange={setClientId} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Status">
                <select value={status} onChange={e => setStatus(e.target.value as OfferStatus)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {(Object.keys(STATUS_LABELS) as OfferStatus[]).map(s =>
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  )}
                </select>
              </Field>
              <Field label="Waluta">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
                  {(['EUR', 'PLN'] as const).map(cur => (
                    <button key={cur} onClick={() => handleCurrencyChange(cur)}
                      className={`flex-1 px-2 py-1.5 transition-colors ${
                        currency === cur ? 'bg-blue-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}>{cur}</button>
                  ))}
                </div>
              </Field>
              <Field label="Kurs EUR/PLN">
                <input type="number" min={0} step={0.0001} value={exchangeRate}
                  onChange={e => setExchangeRate(parseFloat(e.target.value) || 4.25)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
              </Field>
            </div>
          </section>

          {/* ── Dane oferty ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Dane oferty</h4>
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

          {/* ── Pozycje rur ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Pozycje oferty</h4>
              <button onClick={addItem}
                className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                + Dodaj pozycję
              </button>
            </div>

            <div className="space-y-3">
              {editItems.map((item, idx) => {
                const r = itemResults[idx];
                const allowedGrades = PIPE_NORM_GRADES[item.norm];
                const certified = isCertifiedCondition(item.condition);
                const normDescription = certified ? PIPE_NORM_DESCRIPTIONS[item.norm] : 'nie dotyczy';

                return (
                  <div key={item.uid} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">Pozycja #{idx + 1}</span>
                      {editItems.length > 1 && (
                        <button onClick={() => removeItem(item.uid)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium">Usuń</button>
                      )}
                    </div>

                    {/* Pola katalogowe */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                      <Field label="Typ produktu">
                        <select value={item.productType}
                          onChange={e => updateItem(item.uid, { productType: e.target.value as PipeProductType })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Stan materiału">
                        <select value={item.condition}
                          onChange={e => updateItem(item.uid, { condition: e.target.value as PipeCondition })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                      <Field label="Powierzchnia">
                        <select value={item.surface}
                          onChange={e => updateItem(item.uid, { surface: e.target.value as PipeSurface })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                          {PIPE_SURFACES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Field>
                      <Field label="Norma">
                        {certified ? (
                          <select value={item.norm}
                            onChange={e => updateItem(item.uid, { norm: e.target.value as PipeNorm })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                            {PIPE_NORMS.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : (
                          <div className="w-full px-2 py-1.5 rounded text-sm border bg-gray-100 border-gray-300 text-gray-400 italic">
                            nie dotyczy
                          </div>
                        )}
                      </Field>
                      <Field label="Gatunek stali">
                        {certified ? (
                          <select value={item.steelGrade}
                            onChange={e => updateItem(item.uid, { steelGrade: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                            {allowedGrades.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        ) : (
                          <div className="w-full px-2 py-1.5 rounded text-sm border bg-gray-100 border-gray-300 text-gray-500">
                            {NO_CERT_STEEL_GRADE}
                          </div>
                        )}
                      </Field>
                      <Field label="Opis normy produkcyjnej">
                        <div className={`px-2 py-1.5 rounded text-sm border ${
                          certified
                            ? 'bg-white border-gray-300 text-gray-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700 italic'
                        }`}>{normDescription}</div>
                      </Field>
                    </div>

                    {/* Pola liczbowe */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
                      <Field label="Ø zewn. [mm]">
                        <input type="number" step="0.1" min={0} value={item.diameterMm}
                          onChange={e => updateItem(item.uid, { diameterMm: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label="Grubość [mm]">
                        <input type="number" step="0.1" min={0} value={item.wallThicknessMm}
                          onChange={e => updateItem(item.uid, { wallThicknessMm: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label="Ilość [szt]">
                        <input type="number" step={1} min={0} value={item.quantitySzt}
                          onChange={e => updateItem(item.uid, { quantitySzt: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label="Długość [m]">
                        <input type="number" step="0.01" min={0} value={item.lengthM}
                          onChange={e => updateItem(item.uid, { lengthM: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label={`Cena zakupu [${currency}/t]`}>
                        <input type="number" step="0.01" min={0} value={item.costPricePerTon || ''}
                          placeholder={`${currency}/t`}
                          onChange={e => updateItem(item.uid, { costPricePerTon: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                      <Field label={`Cena sprz. [${currency}/t]`}>
                        <input type="number" step="0.01" min={0} value={item.sellPricePerTon || ''}
                          placeholder={`${currency}/t`}
                          onChange={e => updateItem(item.uid, { sellPricePerTon: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </Field>
                    </div>

                    {/* Wyniki obliczeń */}
                    {r && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-200 text-xs">
                        <div><span className="text-gray-500">kg/m:</span> <strong>{formatNumber(r.kgPerM, 3)}</strong></div>
                        <div><span className="text-gray-500">Masa:</span> <strong>{formatNumber(r.massT, 3)} t</strong></div>
                        <div><span className="text-gray-500">Wartość:</span> <strong className="text-blue-900">{fmtMoney(r.sellTotal)}</strong></div>
                        <div>
                          <span className="text-gray-500">Marża:</span>{' '}
                          {r.marginPct === null
                            ? <span className="text-gray-400">—</span>
                            : <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-semibold ${marginColor(r.marginPct)}`}>
                                {formatNumber(r.marginPct, 1)}%
                              </span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Podsumowanie */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <div><span className="text-gray-600">Pozycji:</span> <strong>{editItems.length}</strong></div>
              <div><span className="text-gray-600">Masa:</span> <strong>{formatNumber(totals.totalMassT, 3)} t</strong></div>
              <div><span className="text-gray-600">Koszt łączny:</span> <strong>{fmtMoney(totals.totalCost)}</strong></div>
              <div><span className="text-gray-600">Suma oferty:</span> <strong className="text-blue-900">{fmtMoney(totals.totalSell)}</strong></div>
            </div>
          </section>

          {/* ── Koszty dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Koszty dostawy</h4>
            <p className="text-xs text-gray-400 mb-2">
              Ładowność auta: <strong>24,5 t</strong>
              {deliveryCalc && <> · Szacowane auta: <strong>{deliveryCalc.autoTrucks}</strong></>}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              {([
                { val: 'dap_included', label: 'DAP – dostawa w cenie' },
                { val: 'dap_extra',    label: 'DAP – refaktura na klienta' },
                { val: 'fca',          label: 'FCA – odbiór własny' },
              ] as const).map(({ val, label }) => (
                <label key={val} className={`flex-1 flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer text-sm ${
                  deliveryPaidBy === val ? 'border-blue-700 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="pipeEditPaidBy" value={val}
                    checked={deliveryPaidBy === val}
                    onChange={() => setDeliveryPaidBy(val)}
                    className="accent-blue-900" />
                  <span className="text-xs font-semibold">{label}</span>
                </label>
              ))}
            </div>
            {deliveryPaidBy !== 'fca' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                <Field label="Liczba aut">
                  <input type="number" min={1} step={1}
                    value={deliveryTrucks === '' ? (deliveryCalc?.autoTrucks ?? 1) : deliveryTrucks}
                    onChange={e => setDeliveryTrucks(parseInt(e.target.value, 10) || '')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label={`Koszt / auto [${currency}]`}>
                  <input type="number" min={0} value={deliveryCostPerTruck}
                    placeholder={currency === 'EUR' ? 'np. 600' : 'np. 2500'}
                    onChange={e => setDeliveryCostPerTruck(parseFloat(e.target.value) || '')}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label="Magazyn wysyłki">
                  <select
                    value={isCustomWarehouse ? PIPE_WAREHOUSE_CUSTOM : deliveryFrom}
                    onChange={e => setDeliveryFrom(e.target.value === PIPE_WAREHOUSE_CUSTOM ? '' : e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                    {PIPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                    <option value={PIPE_WAREHOUSE_CUSTOM}>— wpisz własny adres —</option>
                  </select>
                  {isCustomWarehouse && (
                    <input type="text" value={deliveryFrom}
                      placeholder="np. Magazyn klienta, ul. ..., miasto"
                      onChange={e => setDeliveryFrom(e.target.value)}
                      className="w-full mt-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  )}
                </Field>
                <Field label="Dokąd">
                  <input type="text" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
              </div>
            )}
            {deliveryPaidBy === 'fca' && (
              <Field label="Magazyn odbioru (FCA)">
                <select
                  value={isCustomWarehouse ? PIPE_WAREHOUSE_CUSTOM : deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value === PIPE_WAREHOUSE_CUSTOM ? '' : e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                  {PIPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                  <option value={PIPE_WAREHOUSE_CUSTOM}>— wpisz własny adres —</option>
                </select>
                {isCustomWarehouse && (
                  <input type="text" value={deliveryFrom}
                    placeholder="np. Magazyn klienta, ul. ..., miasto"
                    onChange={e => setDeliveryFrom(e.target.value)}
                    className="w-full mt-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                )}
              </Field>
            )}
            {deliveryCalc && deliveryCalc.costPerTruck > 0 && deliveryPaidBy !== 'fca' && (
              <p className="text-xs text-gray-600 mt-2">
                Razem transport: <strong>
                  {deliveryCalc.trucks} {deliveryCalc.trucks === 1 ? 'auto' : deliveryCalc.trucks <= 4 ? 'auta' : 'aut'} ×{' '}
                  {currency === 'EUR' ? `${formatEUR(deliveryCalc.costPerTruck)} EUR` : `${formatPLN(deliveryCalc.costPerTruck)} PLN`}{' = '}
                  {currency === 'EUR' ? `${formatEUR(deliveryCalc.totalInCurrency)} EUR` : `${formatPLN(deliveryCalc.totalInCurrency)} PLN`}
                </strong>
              </p>
            )}
          </section>

          {/* ── Termin dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Termin dostawy</h4>
            <div className="flex gap-2 mb-2">
              {(['magazyn', 'huta'] as const).map(t => (
                <button key={t} onClick={() => setDeliveryTimeline(t)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    deliveryTimeline === t ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300'
                  }`}>
                  {t === 'magazyn' ? 'Z magazynu' : 'Kampania huty'}
                </button>
              ))}
            </div>
            {deliveryTimeline === 'magazyn' ? (
              <Field label="Czas dostawy z magazynu">
                <select value={warehouseDeliveryTime} onChange={e => setWarehouseDeliveryTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                  {WAREHOUSE_DELIVERY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tygodnie kampanii">
                  <input type="text" value={campaignWeeks} onChange={e => setCampaignWeeks(e.target.value)}
                    placeholder="np. 50/51"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
                <Field label="Tygodnie dostawy">
                  <input type="text" value={campaignDeliveryWeeks} onChange={e => setCampaignDeliveryWeeks(e.target.value)}
                    placeholder="np. 52/01"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </Field>
              </div>
            )}
          </section>

          {/* ── Warunki dostawy ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Warunki dostawy (incoterm)</h4>
            <div className="flex gap-2 mb-2 flex-wrap">
              {(['DAP', 'DAP_EXTRA', 'FCA'] as const).map(t => (
                <button key={t} onClick={() => setDeliveryTerms(t)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    deliveryTerms === t ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-gray-700 border-gray-300'
                  }`}>
                  {t === 'DAP' ? 'DAP (transport w cenie)'
                    : t === 'DAP_EXTRA' ? 'DAP + transport extra'
                    : 'FCA (odbiór własny)'}
                </button>
              ))}
            </div>
            {deliveryTerms === 'FCA' && (
              <Field label="Lokalizacja magazynu odbioru">
                <input type="text" value={fcaLocation} onChange={e => setFcaLocation(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
              </Field>
            )}
          </section>

          {/* ── Notatki ── */}
          <section>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notatki</h4>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="opcjonalne uwagi do oferty"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </section>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        {/* Stopka */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 font-medium">
            {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pomocniczy ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
