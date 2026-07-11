import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BeamSalePrices } from '../../../types';
import { formatPLN } from '../../../lib/calculations';

interface Props {
  prices: BeamSalePrices;
  onPricesChange: (prices: BeamSalePrices) => void;
}

interface FormState {
  default_sell_price_per_ton_pln: string;
  default_cost_price_per_ton_pln: string;
  note: string;
}

function toForm(p: BeamSalePrices): FormState {
  return {
    default_sell_price_per_ton_pln: String(p.default_sell_price_per_ton_pln ?? 0),
    default_cost_price_per_ton_pln: String(p.default_cost_price_per_ton_pln ?? 0),
    note: p.note ?? '',
  };
}

export default function BeamSalePriceSettings({ prices, onPricesChange }: Props) {
  const [form, setForm] = useState<FormState>(toForm(prices));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function validate(): string | null {
    const sell = parseFloat(form.default_sell_price_per_ton_pln);
    const cost = parseFloat(form.default_cost_price_per_ton_pln);
    if (isNaN(sell) || sell <= 0) return 'Domyślna cena sprzedaży musi być liczbą dodatnią.';
    if (isNaN(cost) || cost < 0) return 'Domyślna cena kosztu nie może być ujemna.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) return showToast(err, 'error');

    setSaving(true);
    const payload = {
      default_sell_price_per_ton_pln: parseFloat(form.default_sell_price_per_ton_pln),
      default_cost_price_per_ton_pln: parseFloat(form.default_cost_price_per_ton_pln) || 0,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('beam_sale_prices')
      .update(payload)
      .eq('id', prices.id)
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast('Błąd zapisu: ' + error.message, 'error');
    } else {
      onPricesChange(data as BeamSalePrices);
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
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Cennik sprzedaży dwuteowników</h2>
        <p className="text-xs text-gray-400 mb-6">Ostatnia aktualizacja: {formatDate(prices.updated_at)}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {field('default_sell_price_per_ton_pln', 'Domyślna cena sprzedaży [PLN/t]', 'Pre-fill w kalkulatorze — każdą pozycję można nadpisać', 'number', '0.01')}
          {field('default_cost_price_per_ton_pln', 'Domyślna cena kosztu [PLN/t]', '0 = kalkulator zostawia pole kosztu puste', 'number', '0.01')}
          {field('note', 'Notatka (opcjonalna)', 'Opis zmiany cennika', 'text')}
        </div>

        {/* Podgląd */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">Podgląd</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• Nowa pozycja w kalkulatorze startuje z ceną sprzedaży: <strong>{formatPLN(parseFloat(form.default_sell_price_per_ton_pln) || 0)} PLN/t</strong></p>
            <p>• Domyślna cena kosztu: <strong>{(parseFloat(form.default_cost_price_per_ton_pln) || 0) > 0 ? `${formatPLN(parseFloat(form.default_cost_price_per_ton_pln))} PLN/t` : 'brak (pole puste)'}</strong></p>
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
