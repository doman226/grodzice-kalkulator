import { useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { RoadPlateProfile, RoadPlateSalePrice, RoadPlateSaleSteelGrade } from '../../../types';
import { ROAD_PLATE_SALE_STEEL_GRADES } from '../../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  profiles: RoadPlateProfile[];
  prices: RoadPlateSalePrice[];
  onPricesChange: (next: RoadPlateSalePrice[]) => void;
  /** Kurs EUR/PLN do preview w komórkach. Domyślnie 4.25 (fallback gdy NBP nie załadowane) */
  exchangeRate?: number;
}

interface EditingCell {
  profileId:  string;
  steelGrade: RoadPlateSaleSteelGrade;
}

// ─── Pomocnicze ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function RoadPlateSalePriceTable({
  profiles, prices, onPricesChange, exchangeRate = 4.25,
}: Props) {
  const [editingCell, setEditingCell]   = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving]             = useState<string | null>(null);
  const [error, setError]               = useState('');
  const [toast, setToast]               = useState('');

  // ── Mapa cennikowa: profile_id × steel_grade → cały rekord ──
  const priceMap = useMemo(() => {
    const m: Record<string, Partial<Record<RoadPlateSaleSteelGrade, RoadPlateSalePrice>>> = {};
    for (const p of prices) {
      if (!m[p.profile_id]) m[p.profile_id] = {};
      m[p.profile_id][p.steel_grade as RoadPlateSaleSteelGrade] = p;
    }
    return m;
  }, [prices]);

  function cellKey(profileId: string, grade: RoadPlateSaleSteelGrade): string {
    return `${profileId}|${grade}`;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(''), 5000);
  }

  // ── Edycja komórki ──
  function startEdit(profileId: string, grade: RoadPlateSaleSteelGrade, currentPrice: number | null) {
    setEditingCell({ profileId, steelGrade: grade });
    setEditingValue(currentPrice != null ? String(currentPrice) : '');
  }

  async function commitEdit() {
    if (!editingCell) return;
    const { profileId, steelGrade } = editingCell;
    const parsed   = parseFloat(editingValue);
    const newPrice = isNaN(parsed) || editingValue.trim() === '' ? null : parsed;

    const existing = priceMap[profileId]?.[steelGrade];
    const key      = cellKey(profileId, steelGrade);

    // DB zwraca numeric jako string — porównuj przez Number() (gotcha z grodzic SalePriceMatrix)
    const existingNum = existing?.price_eur_t != null ? Number(existing.price_eur_t) : null;
    if (existingNum === newPrice) { setEditingCell(null); return; }

    if (!existing) {
      // Defensywne: seed migracji utworzył wiersze dla każdej kombinacji profil×gatunek.
      // Brak rekordu = rzadki edge case (np. profil dodany po seedzie). Komunikat zamiast cichego błędu.
      showError('Brak rekordu cennika dla tej kombinacji. Uruchom seed migracji ponownie.');
      setEditingCell(null);
      return;
    }

    setSaving(key);

    const { data, error: err } = await supabase
      .from('road_plate_sale_prices')
      .update({
        price_eur_t: newPrice,
        available:   newPrice != null && newPrice > 0,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select();

    if (err) {
      console.error('[RoadPlateSalePriceTable] UPDATE error:', err);
      showError('Błąd zapisu: ' + err.message);
    } else if (!data || data.length === 0) {
      console.error('[RoadPlateSalePriceTable] UPDATE matched 0 rows — id:', existing.id);
      showError('Wiersz nie został zapisany (0 rows). Sprawdź konsolę.');
    } else {
      const saved = data[0] as RoadPlateSalePrice;
      onPricesChange(prices.map(p => p.id === saved.id ? saved : p));
      showToast(newPrice == null ? 'Cena usunięta ✓' : 'Zapisano ✓');
    }

    setSaving(null);
    setEditingCell(null);
  }

  // ── Bulk apply: ustaw tę samą cenę dla wszystkich kombinacji ──
  const [bulkValue, setBulkValue] = useState<number | ''>('');
  const [bulkSaving, setBulkSaving] = useState(false);

  async function applyBulk() {
    if (bulkValue === '' || bulkValue <= 0) return;
    if (!confirm(`Ustawić cenę ${bulkValue} EUR/t (≈ ${Math.round(Number(bulkValue) * exchangeRate)} PLN/t) dla WSZYSTKICH ${prices.length} komórek cennika?`)) return;

    setBulkSaving(true);
    setError('');

    const newPrice = Number(bulkValue);
    const updatedRows = prices.map(p => ({
      id:           p.id,
      profile_id:   p.profile_id,
      steel_grade:  p.steel_grade,
      price_eur_t:  newPrice,
      available:    true,
      updated_at:   new Date().toISOString(),
    }));

    // upsert per id — PG waliduje NOT NULL przed konfliktem,
    // dlatego payload zawiera komplet wymaganych kolumn (gotcha z CLAUDE.md)
    const { data, error: err } = await supabase
      .from('road_plate_sale_prices')
      .upsert(updatedRows, { onConflict: 'id' })
      .select();

    if (err) {
      console.error('[RoadPlateSalePriceTable] bulk UPSERT error:', err);
      showError('Błąd zapisu zbiorczego: ' + err.message);
    } else if (!data || data.length !== updatedRows.length) {
      showError(`Zaktualizowano ${data?.length ?? 0} z ${updatedRows.length} wierszy. Sprawdź konsolę.`);
    } else {
      onPricesChange(data as RoadPlateSalePrice[]);
      showToast(`Ustawiono ${data.length} cen na ${newPrice} EUR/t ✓`);
      setBulkValue('');
    }

    setBulkSaving(false);
  }

  // ── Ostatnia modyfikacja (do wyświetlenia w stopce tabeli) ──
  const lastUpdate = useMemo(() => {
    if (prices.length === 0) return null;
    const dates = prices
      .filter(p => p.price_eur_t != null)
      .map(p => p.updated_at)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [prices]);

  // ── Liczniki ──
  const filledCount = prices.filter(p => p.price_eur_t != null && p.price_eur_t > 0).length;
  const totalCount  = prices.length;

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nagłówek */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Cennik sprzedaży płyt drogowych</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Ceny w EUR/t netto · kliknij komórkę aby edytować · Enter zapisuje · Escape anuluje
          </p>
        </div>
        <div className="text-xs text-gray-500">
          Wypełnione: <strong className="text-blue-700">{filledCount} / {totalCount}</strong> komórek
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Bulk apply */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm font-semibold text-amber-900 flex-shrink-0">
          ⚡ Ustaw jedną cenę dla wszystkich:
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} step={1}
            value={bulkValue === '' ? '' : bulkValue}
            onChange={e => setBulkValue(e.target.value === '' ? '' : Number(e.target.value) || '')}
            placeholder="np. 894"
            className="w-28 border border-amber-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <span className="text-xs text-gray-600">EUR/t</span>
          {bulkValue !== '' && bulkValue > 0 && (
            <span className="text-xs text-gray-500">
              ≈ <strong className="text-gray-800">{Math.round(Number(bulkValue) * exchangeRate)}</strong> PLN/t (kurs {exchangeRate.toFixed(4)})
            </span>
          )}
        </div>
        <button
          onClick={applyBulk}
          disabled={bulkSaving || bulkValue === '' || bulkValue <= 0}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {bulkSaving ? 'Zapisywanie...' : 'Zastosuj do wszystkich'}
        </button>
      </div>

      {/* Tabela macierzy */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Profil płyty</th>
              {ROAD_PLATE_SALE_STEEL_GRADES.map(g => (
                <th key={g} className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={ROAD_PLATE_SALE_STEEL_GRADES.length + 1} className="px-4 py-12 text-center text-sm text-gray-400">
                  Brak aktywnych profili płyt. Dodaj profil w zakładce <strong>Wynajem → Płyty drogowe → Profile płyt</strong>.
                </td>
              </tr>
            ) : (
              profiles.map((profile, idx) => (
                <tr key={profile.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {/* Profil */}
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-semibold text-gray-800 text-sm">{profile.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {profile.thickness_mm} mm · {profile.weight_kg_per_m2} kg/m² · {profile.sheet_width_m}×{profile.sheet_length_m} m
                    </div>
                  </td>

                  {/* Komórki cen — 4 gatunki */}
                  {ROAD_PLATE_SALE_STEEL_GRADES.map(grade => {
                    const cell        = priceMap[profile.id]?.[grade];
                    const isEditing   = editingCell?.profileId === profile.id && editingCell?.steelGrade === grade;
                    const isSaving    = saving === cellKey(profile.id, grade);
                    const priceVal    = cell?.price_eur_t;
                    const unavailable = !cell || priceVal == null || priceVal <= 0;
                    // DB zwraca numeric jako string w niektórych sytuacjach — Number() na pewno daje liczbę
                    const numPrice    = priceVal != null ? Number(priceVal) : null;

                    return (
                      <td key={grade} className="px-2 py-1.5 text-right align-top">
                        {isEditing ? (
                          <input
                            type="number" min={0} step={1}
                            autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  commitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            placeholder="EUR/t"
                            className="w-24 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(profile.id, grade, numPrice)}
                            disabled={isSaving}
                            className={`w-full text-right px-3 py-1.5 rounded transition-colors text-sm font-medium ${
                              unavailable
                                ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                                : 'text-gray-800 hover:bg-blue-50 hover:text-blue-800'
                            }`}
                          >
                            {isSaving ? (
                              <span className="text-blue-400 text-xs">...</span>
                            ) : unavailable ? (
                              <span className="text-xs">—</span>
                            ) : (
                              <>
                                {numPrice} <span className="text-gray-400 font-normal text-xs">EUR/t</span>
                                <div className="text-xs text-gray-400 font-normal mt-0.5">
                                  ≈ {Math.round((numPrice ?? 0) * exchangeRate)} PLN/t
                                </div>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legenda i info */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-gray-200 bg-white inline-block" />
          Cena aktywna — kliknij aby edytować
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-300 text-sm font-medium">—</span>
          Brak ceny — kliknij aby dodać
        </span>
        <span className="text-gray-400 ml-auto">
          Kurs preview: {exchangeRate.toFixed(4)} PLN/EUR · czyszczenie wartości = brak ceny
        </span>
      </div>

      {/* Ostatnia modyfikacja */}
      {lastUpdate && (
        <div className="text-xs text-gray-400 text-right">
          Ostatnia modyfikacja: {formatDate(lastUpdate)}
        </div>
      )}

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        💡 Ceny w EUR/t (kanonicznie — niezależnie od kursu NBP). Profile dodajesz w zakładce <strong>Wynajem → Płyty drogowe → Profile płyt</strong> (katalog wspólny z modułem wynajmu).
      </p>
    </div>
  );
}
