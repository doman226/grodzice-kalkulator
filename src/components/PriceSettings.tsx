import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RentalPrices, PriceHistory } from '../types';
import { formatPLN } from '../lib/calculations';

interface Props {
  prices: RentalPrices;
  onPricesChange: (prices: RentalPrices) => void;
}

interface FormState {
  base_price_pln: string;
  base_weeks: string;
  price_per_week_1: string;
  threshold_weeks: string;
  price_per_week_2: string;
  note: string;
  loss_price_pln: string;
  sorting_price_pln: string;
  grinding_price_pln: string;
  welding_price_pln: string;
  cutting_price_pln: string;
  repair_price_pln: string;
}

function toForm(p: RentalPrices): FormState {
  return {
    base_price_pln: String(p.base_price_pln),
    base_weeks: String(p.base_weeks),
    price_per_week_1: String(p.price_per_week_1),
    threshold_weeks: String(p.threshold_weeks),
    price_per_week_2: String(p.price_per_week_2),
    note: p.note ?? '',
    loss_price_pln: String(p.loss_price_pln ?? 3950),
    sorting_price_pln: String(p.sorting_price_pln ?? 99),
    grinding_price_pln: String(p.grinding_price_pln ?? 250),
    welding_price_pln: String(p.welding_price_pln ?? 250),
    cutting_price_pln: String(p.cutting_price_pln ?? 59),
    repair_price_pln: String(p.repair_price_pln ?? 250),
  };
}

export default function PriceSettings({ prices, onPricesChange }: Props) {
  const [form, setForm] = useState<FormState>(toForm(prices));
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(20);

    if (!error && data) setHistory(data as PriceHistory[]);
    setLoadingHistory(false);
  }

  async function deleteHistoryEntry(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from('price_history').delete().eq('id', id);
    if (error) { showToast('Błąd usuwania wpisu', 'error'); }
    else { setHistory(prev => prev.filter(h => h.id !== id)); }
    setDeletingId(null);
  }

  async function clearAllHistory() {
    if (!window.confirm('Usunąć całą historię zmian cen?')) return;
    const { error } = await supabase.from('price_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { showToast('Błąd czyszczenia historii', 'error'); }
    else { setHistory([]); showToast('Historia została wyczyszczona'); }
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function validate(): string | null {
    const bp = parseFloat(form.base_price_pln);
    const bw = parseInt(form.base_weeks);
    const pw1 = parseFloat(form.price_per_week_1);
    const tw = parseInt(form.threshold_weeks);
    const pw2 = parseFloat(form.price_per_week_2);
    if (isNaN(bp) || bp <= 0) return 'Cena bazowa musi być liczbą dodatnią.';
    if (isNaN(bw) || bw < 1) return 'Liczba tygodni bazowych musi być ≥ 1.';
    if (isNaN(pw1) || pw1 < 0) return 'Cena za tydz. (faza 1) nie może być ujemna.';
    if (isNaN(tw) || tw <= bw) return `Próg obniżki musi być większy niż ${bw} tygodni.`;
    if (isNaN(pw2) || pw2 < 0) return 'Cena za tydz. (faza 2) nie może być ujemna.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) return showToast(err, 'error');

    setSaving(true);
    const payload = {
      base_price_pln: parseFloat(form.base_price_pln),
      base_weeks: parseInt(form.base_weeks),
      price_per_week_1: parseFloat(form.price_per_week_1),
      threshold_weeks: parseInt(form.threshold_weeks),
      price_per_week_2: parseFloat(form.price_per_week_2),
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
      loss_price_pln: parseFloat(form.loss_price_pln) || 3950,
      sorting_price_pln: parseFloat(form.sorting_price_pln) || 99,
      grinding_price_pln: parseFloat(form.grinding_price_pln) || 250,
      welding_price_pln: parseFloat(form.welding_price_pln) || 250,
      cutting_price_pln: parseFloat(form.cutting_price_pln) || 59,
      repair_price_pln: parseFloat(form.repair_price_pln) || 250,
    };

    const { data, error } = await supabase
      .from('rental_prices')
      .update(payload)
      .eq('id', prices.id)
      .select()
      .single();

    setSaving(false);
    if (error) {
      showToast('Błąd zapisu: ' + error.message, 'error');
    } else {
      onPricesChange(data as RentalPrices);
      showToast('Cennik zaktualizowany pomyślnie.');
      loadHistory();
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
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Formularz edycji */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Ustawienia cennika</h2>
        <p className="text-xs text-gray-400 mb-6">
          Ostatnia aktualizacja: {formatDate(prices.updated_at)}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {field('base_price_pln', 'Cena bazowa [PLN/t]', `Wynajem za pierwsze ${form.base_weeks} tygodni`, 'number', '0.01')}
          {field('base_weeks', 'Tygodnie w cenie bazowej', 'Liczba tygodni objęta ceną bazową')}
          {field('price_per_week_1', `Cena / tydzień (tygodnie ${parseInt(form.base_weeks) + 1 || '?'}–${form.threshold_weeks || '?'}) [PLN/t]`, 'Stawka za każdy tydzień po zakończeniu okresu bazowego, do progu obniżki', 'number', '0.01')}
          {field('price_per_week_2', `Cena / tydzień od tygodnia ${parseInt(form.threshold_weeks) + 1 || '?'} [PLN/t]`, 'Obniżona stawka po przekroczeniu progu (długi wynajem)', 'number', '0.01')}
          {field('note', 'Notatka (opcjonalna)', 'Opis zmiany cennika, np. "aktualizacja Q1 2025"', 'text')}
        </div>

        {/* Podgląd struktury cennika */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">Podgląd struktury cennika</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• Tygodnie 1–{form.base_weeks || '?'}: <strong>{formatPLN(parseFloat(form.base_price_pln) || 0)} PLN/t</strong> (cena bazowa)</p>
            <p>• Tygodnie {parseInt(form.base_weeks) + 1 || '?'}–{form.threshold_weeks || '?'}: <strong>+{formatPLN(parseFloat(form.price_per_week_1) || 0)} PLN/t</strong> za tydzień</p>
            <p>• Od tygodnia {parseInt(form.threshold_weeks) + 1 || '?'}: <strong>+{formatPLN(parseFloat(form.price_per_week_2) || 0)} PLN/t</strong> za tydzień (stawka obniżona)</p>
          </div>
        </div>

        {/* Cennik szkód i napraw */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Cennik szkód i napraw</h3>
          <p className="text-xs text-gray-400 mb-4">Stawki drukowane na ofercie w sekcji "Cennik". Zapisywane jako snapshot przy każdej nowej ofercie.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {field('loss_price_pln', 'Zagubienie / strata [PLN/t]', 'Całkowita strata lub zagubienie grodzic', 'number', '0.01')}
            {field('sorting_price_pln', 'Sortowanie i czyszczenie [PLN/t]', 'Koszt sortowania i czyszczenia grodzic', 'number', '0.01')}
            {field('grinding_price_pln', 'Szlifowanie spawów [PLN/mb]', 'Usunięcie pozostałości przyspawanych kształtowników', 'number', '0.01')}
            {field('welding_price_pln', 'Spawanie otworów pod kotwy [PLN/szt]', 'Zamykanie otworów pod kotwy', 'number', '0.01')}
            {field('cutting_price_pln', 'Głowica tnąca [PLN/cięcie]', 'Koszt jednego cięcia głowicą tnącą', 'number', '0.01')}
            {field('repair_price_pln', 'Naprawa zamków [PLN/mb]', 'Prostowanie i naprawa zamków grodzic', 'number', '0.01')}
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

      {/* Historia zmian */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Historia zmian cen</h2>
          {history.length > 0 && (
            <button onClick={clearAllHistory} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
              Wyczyść historię
            </button>
          )}
        </div>

        {loadingHistory ? (
          <div className="text-center py-6 text-gray-400 text-sm">Ładowanie historii...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">Brak historii zmian.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 font-medium text-gray-600 rounded-tl-lg">Data zmiany</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Cena bazowa</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Cena/tydz.</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Notatka</th>
                  <th className="px-4 py-2 font-medium text-gray-600 rounded-tr-lg"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{formatDate(h.changed_at)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatPLN(h.base_price_pln)} PLN/t</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatPLN(h.price_per_week_1)} PLN/t</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{h.note ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => deleteHistoryEntry(h.id)}
                        disabled={deletingId === h.id}
                        className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors text-xs"
                        title="Usuń wpis"
                      >
                        {deletingId === h.id ? '...' : '✕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
