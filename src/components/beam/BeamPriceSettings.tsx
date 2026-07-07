import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BeamRentalPrices } from '../../types';
import { formatPLN } from '../../lib/calculations';

interface Props {
  prices: BeamRentalPrices;
  onPricesChange: (prices: BeamRentalPrices) => void;
}

interface FormState {
  rent_price_per_ton_pln: string;
  base_period_months: string;
  extra_week_price_per_ton_pln: string;
  note: string;
  loss_price_pln: string;
  sorting_price_pln: string;
  welding_price_pln: string;
  cutting_price_pln: string;
  repair_price_pln: string;
  lifting_hole_price_pln: string;
}

function toForm(p: BeamRentalPrices): FormState {
  return {
    rent_price_per_ton_pln: String(p.rent_price_per_ton_pln ?? 0),
    base_period_months: String(p.base_period_months ?? 3),
    extra_week_price_per_ton_pln: String(p.extra_week_price_per_ton_pln ?? 0),
    note: p.note ?? '',
    loss_price_pln: String(p.loss_price_pln ?? 0),
    sorting_price_pln: String(p.sorting_price_pln ?? 0),
    welding_price_pln: String(p.welding_price_pln ?? 0),
    cutting_price_pln: String(p.cutting_price_pln ?? 0),
    repair_price_pln: String(p.repair_price_pln ?? 0),
    lifting_hole_price_pln: String(p.lifting_hole_price_pln ?? 0),
  };
}

export default function BeamPriceSettings({ prices, onPricesChange }: Props) {
  const [form, setForm] = useState<FormState>(toForm(prices));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function validate(): string | null {
    const rp = parseFloat(form.rent_price_per_ton_pln);
    const bm = parseInt(form.base_period_months);
    const ew = parseFloat(form.extra_week_price_per_ton_pln);
    if (isNaN(rp) || rp <= 0) return 'Cena wynajmu / t musi być liczbą dodatnią.';
    if (isNaN(bm) || bm < 1) return 'Podstawowy okres (mies.) musi być ≥ 1.';
    if (isNaN(ew) || ew < 0) return 'Stawka za dodatkowy tydzień nie może być ujemna.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) return showToast(err, 'error');

    setSaving(true);
    const payload = {
      rent_price_per_ton_pln: parseFloat(form.rent_price_per_ton_pln),
      base_period_months: parseInt(form.base_period_months),
      extra_week_price_per_ton_pln: parseFloat(form.extra_week_price_per_ton_pln),
      note: form.note.trim() || null,
      loss_price_pln: parseFloat(form.loss_price_pln) || 0,
      sorting_price_pln: parseFloat(form.sorting_price_pln) || 0,
      welding_price_pln: parseFloat(form.welding_price_pln) || 0,
      cutting_price_pln: parseFloat(form.cutting_price_pln) || 0,
      repair_price_pln: parseFloat(form.repair_price_pln) || 0,
      lifting_hole_price_pln: parseFloat(form.lifting_hole_price_pln) || 0,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('beam_rental_prices')
      .update(payload)
      .eq('id', prices.id)
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast('Błąd zapisu: ' + error.message, 'error');
    } else {
      onPricesChange(data as BeamRentalPrices);
      showToast('Cennik zaktualizowany pomyślnie.');
    }
  }

  const field = (
    key: keyof FormState,
    label: string,
    description: string,
    type: 'number' | 'text' = 'number',
    step = '1'
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        step={step}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  );

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Ustawienia cennika</h2>
        <p className="text-xs text-gray-400 mb-6">Ostatnia aktualizacja: {formatDate(prices.updated_at)}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {field('rent_price_per_ton_pln', 'Cena wynajmu [PLN/t]', 'Czynsz za podstawowy okres dzierżawy, za tonę', 'number', '0.01')}
          {field('base_period_months', 'Podstawowy okres [mies.]', 'Informacyjnie w warunkach oferty (np. 3)', 'number', '1')}
          {field('extra_week_price_per_ton_pln', 'Dodatkowy tydzień [PLN/t]', 'Informacyjnie: stawka za każdy tydzień po okresie', 'number', '0.01')}
          {field('note', 'Notatka (opcjonalna)', 'Opis zmiany cennika', 'text')}
        </div>

        {/* Podgląd struktury cennika */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">Podgląd struktury cennika</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• Podstawowy okres ({form.base_period_months || '?'} mies.): <strong>{formatPLN(parseFloat(form.rent_price_per_ton_pln) || 0)} PLN/t</strong></p>
            <p>• Każdy dodatkowy tydzień: <strong>+{formatPLN(parseFloat(form.extra_week_price_per_ton_pln) || 0)} PLN/t</strong></p>
          </div>
        </div>

        {/* Cennik szkód i napraw */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Cennik szkód i napraw</h3>
          <p className="text-xs text-gray-400 mb-4">Stawki drukowane na ofercie w sekcji "Cennik". Zapisywane jako snapshot przy każdej nowej ofercie.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {field('loss_price_pln', 'Zagubienie / strata [PLN/t]', 'Całkowita strata lub zagubienie', 'number', '0.01')}
            {field('sorting_price_pln', 'Sortowanie i czyszczenie [PLN/t]', 'Koszt sortowania i czyszczenia', 'number', '0.01')}
            {field('welding_price_pln', 'Spawanie otworów [PLN/szt]', 'Zamykanie otworów', 'number', '0.01')}
            {field('cutting_price_pln', 'Głowica tnąca [PLN/cięcie]', 'Koszt jednego cięcia głowicą tnącą', 'number', '0.01')}
            {field('repair_price_pln', 'Naprawa / prostowanie [PLN/mb]', 'Prostowanie i naprawa kształtowników', 'number', '0.01')}
            {field('lifting_hole_price_pln', 'Nowy otwór do podnoszenia [PLN/szt]', 'Wykonanie nowego otworu do podnoszenia', 'number', '0.01')}
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={() => setForm(toForm(prices))}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 mr-3"
          >
            Resetuj
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm text-white bg-blue-900 rounded-lg hover:bg-blue-800 font-medium disabled:opacity-50"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz cennik'}
          </button>
        </div>
      </div>
    </div>
  );
}
