import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '../../lib/supabase';
import type { SaleWarehouse, SaleSteeelGrade, SaleProfile, SalePrice, SalePriceChangeLog } from '../../types';
import SaleLocksTable from './SaleLocksTable';

type PriceTab = 'grodzice' | 'zamki';

interface EditingCell {
  warehouseId: string;
  profileName: string;
  gradeId: string;
}

interface BulkConfirm {
  count: number;
  minAfter: number;
  maxAfter: number;
  affectedIds: string[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SalePriceMatrix() {
  const [priceTab, setPriceTab]         = useState<PriceTab>('grodzice');
  const [warehouses, setWarehouses]     = useState<SaleWarehouse[]>([]);
  const [grades, setGrades]             = useState<SaleSteeelGrade[]>([]);
  const [profiles, setProfiles]         = useState<SaleProfile[]>([]);
  const [prices, setPrices]             = useState<SalePrice[]>([]);
  const [changeLog, setChangeLog]       = useState<SalePriceChangeLog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedWh, setSelectedWh]     = useState<string>(
    () => sessionStorage.getItem('cennik_wh') ?? ''
  );
  const [editingCell, setEditingCell]   = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving]             = useState<string | null>(null);
  const [toast, setToast]               = useState('');

  // ─── filtr serii ────────────────────────────────────────────────────────────
  const availableSeries = useMemo(() =>
    [...new Set(profiles.map(p => p.series))].sort(),
    [profiles]
  );
  const [activeSeries, setActiveSeries] = useState<string>(''); // '' = wszystkie

  // ─── bulk change ────────────────────────────────────────────────────────────
  const [showBulk, setShowBulk]           = useState(false);
  const [bulkDelta, setBulkDelta]         = useState<number | ''>('');
  const [bulkSeriesFilter, setBulkSeriesFilter] = useState('');
  const [bulkWhFilter, setBulkWhFilter]   = useState('');
  const [bulkNote, setBulkNote]           = useState('');
  const [bulkConfirm, setBulkConfirm]     = useState<BulkConfirm | null>(null);
  const [bulkSaving, setBulkSaving]       = useState(false);
  const [showHistory, setShowHistory]     = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    const [whRes, grRes, prRes, spRes, logRes] = await Promise.all([
      supabase.from('sale_warehouses').select('*').eq('active', true).order('id'),
      supabase.from('sale_steel_grades').select('*').order('sort_order'),
      supabase.from('sale_profiles').select('*').eq('active', true).order('name'),
      supabase.from('sale_prices').select('*').limit(10000),
      supabase.from('sale_price_change_log').select('*').order('changed_at', { ascending: false }).limit(30),
    ]);
    if (whRes.error || grRes.error || prRes.error || spRes.error) {
      setError('Błąd ładowania danych cennika.');
    } else {
      setWarehouses(whRes.data as SaleWarehouse[]);
      setGrades(grRes.data as SaleSteeelGrade[]);
      setProfiles(prRes.data as SaleProfile[]);
      setPrices(spRes.data as SalePrice[]);
      if (whRes.data.length > 0) {
        const saved   = sessionStorage.getItem('cennik_wh');
        const validWh = saved && (whRes.data as SaleWarehouse[]).some(w => w.id === saved)
          ? saved
          : (whRes.data as SaleWarehouse[])[0].id;
        setSelectedWh(validWh);
      }
    }
    if (!logRes.error && logRes.data) {
      setChangeLog(logRes.data as SalePriceChangeLog[]);
    }
    setLoading(false);
  }

  // ─── mapa cen ────────────────────────────────────────────────────────────────
  // Klucz wewnętrzny: p.steel_grade = FK → sale_steel_grades.id (np. 's270gp')
  // IDENTYCZNY z g.id używanym w PriceRow (.rowPrices[g.id]) i commitEdit (gradeId = g.id)
  const priceMap = useCallback(() => {
    const map: Record<string, Record<string, Record<string, SalePrice>>> = {};
    for (const p of prices) {
      if (!map[p.warehouse_id]) map[p.warehouse_id] = {};
      if (!map[p.warehouse_id][p.profile_name]) map[p.warehouse_id][p.profile_name] = {};
      // p.steel_grade === g.id (oba są kluczem FK, np. 's270gp')
      map[p.warehouse_id][p.profile_name][p.steel_grade] = p;
    }
    return map;
  }, [prices]);

  function cellKey(whId: string, prof: string, grade: string) {
    return `${whId}|${prof}|${grade}`;
  }

  // ─── edycja komórki ──────────────────────────────────────────────────────────
  function startEdit(whId: string, profileName: string, gradeId: string, currentPrice: number | null) {
    setEditingCell({ warehouseId: whId, profileName, gradeId });
    setEditingValue(currentPrice != null ? String(currentPrice) : '');
  }

  async function commitEdit() {
    if (!editingCell) return;
    const { warehouseId, profileName, gradeId } = editingCell;
    const parsed   = parseFloat(editingValue);
    const newPrice = isNaN(parsed) || editingValue.trim() === '' ? null : parsed;

    const map      = priceMap();
    const existing = map[warehouseId]?.[profileName]?.[gradeId];
    const key      = cellKey(warehouseId, profileName, gradeId);

    // DB zwraca numeric jako string — porównuj przez Number() żeby uniknąć "920" !== 920
    const existingNum = existing?.price_eur_t != null ? Number(existing.price_eur_t) : null;
    if (existingNum === newPrice && newPrice !== null) { setEditingCell(null); return; }
    if (!existing && newPrice === null) { setEditingCell(null); return; }

    setSaving(key);

    if (existing) {
      // UPDATE istniejącego wiersza — .select() jest KONIECZNE żeby wykryć ciche błędy:
      // bez .select() Supabase zwraca 204 No Content zarówno dla 1 jak i 0 zaktualizowanych wierszy
      const { data, error: err } = await supabase
        .from('sale_prices')
        .update({ price_eur_t: newPrice, available: newPrice != null, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select();
      if (err) {
        console.error('[SalePriceMatrix] UPDATE error:', err);
        showToast('Błąd zapisu: ' + err.message);
      } else if (!data || data.length === 0) {
        console.error('[SalePriceMatrix] UPDATE matched 0 rows — id:', existing.id, 'wh:', warehouseId, 'profile:', profileName, 'grade:', gradeId);
        showToast('Błąd: wiersz nie został zapisany (0 rows). Sprawdź konsolę.');
      } else {
        setPrices(prev => prev.map(p =>
          p.id === existing.id ? data[0] as SalePrice : p
        ));
        showToast('Zapisano ✓');
      }
    } else if (newPrice != null) {
      const { data, error: err } = await supabase
        .from('sale_prices')
        .upsert(
          { warehouse_id: warehouseId, profile_name: profileName, steel_grade: gradeId, price_eur_t: newPrice, available: true, updated_at: new Date().toISOString() },
          { onConflict: 'warehouse_id,profile_name,steel_grade' }
        )
        .select()
        .single();
      if (err) {
        console.error('[SalePriceMatrix] UPSERT error:', err);
        showToast('Błąd zapisu: ' + err.message);
      } else {
        const saved = data as SalePrice;
        setPrices(prev => {
          const exists = prev.find(p => p.id === saved.id);
          if (exists) return prev.map(p => p.id === saved.id ? saved : p);
          return [...prev, saved];
        });
        showToast('Zapisano ✓');
      }
    }

    setSaving(null);
    setEditingCell(null);
  }

  // ─── bulk change ─────────────────────────────────────────────────────────────
  function profileNamesForSeries(series: string): string[] | null {
    if (!series) return null;
    return profiles.filter(p => p.series === series).map(p => p.name);
  }

  function calcAffected(): BulkConfirm | null {
    if (bulkDelta === '' || bulkDelta === 0) return null;
    const delta      = Number(bulkDelta);
    const seriesNames = profileNamesForSeries(bulkSeriesFilter);

    const affected = prices.filter(p =>
      p.price_eur_t !== null &&
      (bulkWhFilter  ? p.warehouse_id  === bulkWhFilter  : true) &&
      (seriesNames   ? seriesNames.includes(p.profile_name) : true)
    );

    if (affected.length === 0) return null;

    const newVals    = affected.map(p => Math.max(0, (p.price_eur_t ?? 0) + delta));
    return {
      count:      affected.length,
      minAfter:   Math.min(...newVals),
      maxAfter:   Math.max(...newVals),
      affectedIds: affected.map(p => p.id),
    };
  }

  function previewBulk() {
    const confirm = calcAffected();
    if (!confirm) {
      showToast('Brak cen do zmiany (sprawdź filtry lub delta = 0).');
      return;
    }
    setBulkConfirm(confirm);
  }

  async function applyBulk() {
    if (!bulkConfirm || bulkDelta === '') return;
    setBulkSaving(true);

    const delta = Number(bulkDelta);

    // Przygotuj wiersze do upsert
    const updatedRows = prices
      .filter(p => bulkConfirm.affectedIds.includes(p.id))
      .map(p => ({
        id:          p.id,
        price_eur_t: Math.max(0, (p.price_eur_t ?? 0) + delta),
        available:   true,
        updated_at:  new Date().toISOString(),
      }));

    const { error: uErr } = await supabase
      .from('sale_prices')
      .upsert(updatedRows, { onConflict: 'id' });

    if (uErr) {
      showToast('Błąd aktualizacji: ' + uErr.message);
      setBulkSaving(false);
      return;
    }

    // Aktualizuj stan lokalny
    const idToNewPrice: Record<string, number> = {};
    updatedRows.forEach(r => { idToNewPrice[r.id] = r.price_eur_t; });
    setPrices(prev => prev.map(p =>
      idToNewPrice[p.id] !== undefined ? { ...p, price_eur_t: idToNewPrice[p.id] } : p
    ));

    // Zapisz do historii
    const logEntry = {
      series:        bulkSeriesFilter || null,
      warehouse_id:  bulkWhFilter     || null,
      delta_eur:     delta,
      note:          bulkNote.trim()  || null,
      affected_rows: updatedRows.length,
    };
    const { data: logData } = await supabase
      .from('sale_price_change_log')
      .insert(logEntry)
      .select()
      .single();
    if (logData) setChangeLog(prev => [logData as SalePriceChangeLog, ...prev]);

    showToast(`Zaktualizowano ${updatedRows.length} cen ✓`);
    setBulkConfirm(null);
    setBulkDelta('');
    setBulkNote('');
    setBulkSaving(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // ─── profile do wyświetlenia (z filtrem serii) ───────────────────────────────
  const displayProfiles = useMemo(() =>
    activeSeries ? profiles.filter(p => p.series === activeSeries) : profiles,
    [profiles, activeSeries]
  );

  // Grupy serii do separatorów w widoku "Wszystkie"
  const seriesGroups = useMemo(() => {
    if (activeSeries) return null; // nie używamy separatorów gdy jedna seria
    const groups: { series: string; profiles: SaleProfile[] }[] = [];
    for (const s of availableSeries) {
      const sp = profiles.filter(p => p.series === s);
      if (sp.length > 0) groups.push({ series: s, profiles: sp });
    }
    return groups;
  }, [profiles, availableSeries, activeSeries]);

  const map               = priceMap();
  const selectedWarehouse = warehouses.find(w => w.id === selectedWh);

  // ─── nazwy dla historii ──────────────────────────────────────────────────────
  function whName(id: string | null) {
    if (!id) return 'Wszystkie magazyny';
    return warehouses.find(w => w.id === id)?.name ?? id;
  }

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Zakładki Grodzice / Zamki */}
      <div className="flex gap-1 border-b-2 border-gray-200">
        {(['grodzice', 'zamki'] as PriceTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setPriceTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-0.5 transition-colors capitalize ${
              priceTab === tab
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab === 'grodzice' ? '🏗 Grodzice' : '🔗 Zamki'}
          </button>
        ))}
      </div>

      {priceTab === 'zamki' && <SaleLocksTable />}

      {priceTab === 'grodzice' && <>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 text-sm">{error}</div>
        )}

        {!loading && !error && <>

          {/* Nagłówek */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Macierz cen sprzedaży</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Ceny w EUR/t netto · kliknij komórkę aby edytować · Enter lub kliknij poza komórką aby zapisać
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowBulk(v => !v); setBulkConfirm(null); }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                  showBulk
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-blue-700 border-blue-300 hover:border-blue-600'
                }`}
              >
                ⚡ Zmień ceny globalnie
              </button>
              <button onClick={loadAll} className="text-xs text-blue-700 hover:underline">
                ↺ Odśwież
              </button>
            </div>
          </div>

          {/* ─── Bulk change panel ──────────────────────────────────────────── */}
          {showBulk && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-900">Zmiana cen – operacja zbiorcza</p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Seria</label>
                  <select
                    value={bulkSeriesFilter}
                    onChange={e => setBulkSeriesFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">Wszystkie serie</option>
                    {availableSeries.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Magazyn</label>
                  <select
                    value={bulkWhFilter}
                    onChange={e => setBulkWhFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">Wszystkie magazyny</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Delta EUR/t</label>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      step={1}
                      placeholder="np. +10"
                      value={bulkDelta}
                      onChange={e => { setBulkDelta(e.target.value === '' ? '' : Number(e.target.value)); setBulkConfirm(null); }}
                      className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-right"
                    />
                    <div className="flex gap-0.5 flex-wrap">
                      {[-20, -10, -5, 5, 10, 20].map(d => (
                        <button
                          key={d}
                          onClick={() => { setBulkDelta(d); setBulkConfirm(null); }}
                          className={`text-xs px-1.5 py-1 rounded border transition-colors ${
                            bulkDelta === d
                              ? 'bg-amber-600 text-white border-amber-600'
                              : d < 0
                                ? 'bg-red-50 text-red-700 border-red-200 hover:border-red-400'
                                : 'bg-green-50 text-green-700 border-green-200 hover:border-green-400'
                          }`}
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notatka (opcjonalna)</label>
                  <input
                    type="text"
                    placeholder="np. korekta wiosenna"
                    value={bulkNote}
                    onChange={e => setBulkNote(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Podgląd / Potwierdzenie */}
              {!bulkConfirm ? (
                <button
                  onClick={previewBulk}
                  disabled={bulkDelta === '' || bulkDelta === 0}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40 font-medium"
                >
                  Podgląd zmian
                </button>
              ) : (
                <div className="bg-white border border-amber-300 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-900">
                    Zostanie zmienionych: <span className="text-blue-800">{bulkConfirm.count} cen</span> o{' '}
                    <span className={Number(bulkDelta) > 0 ? 'text-green-700' : 'text-red-700'}>
                      {Number(bulkDelta) > 0 ? '+' : ''}{bulkDelta} EUR/t
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Zakres po zmianie: {bulkConfirm.minAfter} – {bulkConfirm.maxAfter} EUR/t
                    {' · '}Ceny NULL/puste zostaną pominięte
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={applyBulk}
                      disabled={bulkSaving}
                      className="bg-blue-900 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 font-medium"
                    >
                      {bulkSaving ? 'Zapisywanie...' : 'Zastosuj'}
                    </button>
                    <button
                      onClick={() => setBulkConfirm(null)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Filtr serii ──────────────────────────────────────────────────── */}
          {availableSeries.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setActiveSeries('')}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeSeries === ''
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                Wszystkie
              </button>
              {availableSeries.map(s => (
                <button
                  key={s}
                  onClick={() => setActiveSeries(s)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    activeSeries === s
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* ─── Wybór magazynu ───────────────────────────────────────────────── */}
          <div className="flex gap-1 border-b border-gray-200">
            {warehouses.map(wh => (
              <button
                key={wh.id}
                onClick={() => { setSelectedWh(wh.id); sessionStorage.setItem('cennik_wh', wh.id); }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  selectedWh === wh.id
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {wh.name}
              </button>
            ))}
          </div>

          {/* ─── Tabela macierzy ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide w-32">Profil</th>
                  {grades.map(g => (
                    <th key={g.id} className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                      {g.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Widok jednej serii */}
                {activeSeries && displayProfiles.map((profile, idx) => {
                  const rowPrices = map[selectedWh]?.[profile.name] ?? {};
                  return (
                    <tr key={profile.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <PriceRow
                        profile={profile}
                        rowPrices={rowPrices}
                        grades={grades}
                        selectedWh={selectedWh}
                        editingCell={editingCell}
                        editingValue={editingValue}
                        saving={saving}
                        cellKey={cellKey}
                        startEdit={startEdit}
                        setEditingValue={setEditingValue}
                        commitEdit={commitEdit}
                        setEditingCell={setEditingCell}
                      />
                    </tr>
                  );
                })}

                {/* Widok wszystkich serii z separatorami */}
                {!activeSeries && seriesGroups && seriesGroups.map(group => (
                  <Fragment key={group.series}>
                    <tr className="bg-blue-50">
                      <td colSpan={grades.length + 1} className="px-4 py-1.5 text-xs font-bold text-blue-800 uppercase tracking-wider">
                        {group.series}
                      </td>
                    </tr>
                    {group.profiles.map((profile, idx) => {
                      const rowPrices = map[selectedWh]?.[profile.name] ?? {};
                      return (
                        <tr key={profile.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <PriceRow
                            profile={profile}
                            rowPrices={rowPrices}
                            grades={grades}
                            selectedWh={selectedWh}
                            editingCell={editingCell}
                            editingValue={editingValue}
                            saving={saving}
                            cellKey={cellKey}
                            startEdit={startEdit}
                            setEditingValue={setEditingValue}
                            commitEdit={commitEdit}
                            setEditingCell={setEditingCell}
                          />
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border border-gray-200 bg-white inline-block" />
              Cena aktywna – kliknij aby edytować
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-300 text-sm font-medium">—</span>
              Brak ceny – kliknij aby dodać
            </span>
            {selectedWarehouse?.id === 'mag_olesnica' && (
              <span className="text-amber-600 font-medium">
                ⚠ Oleśnica: dostępne tylko VL603 i VL604 w gatunkach S270GP i S355GP
              </span>
            )}
          </div>

          {/* ─── Historia zmian cennika ───────────────────────────────────────── */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
              Historia zmian cennika
              {changeLog.length > 0 && (
                <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{changeLog.length}</span>
              )}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-1">
                {changeLog.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Brak zapisanych zmian. Historia pojawi się po użyciu funkcji „Zmień ceny globalnie".</p>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Data</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Seria</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Magazyn</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Zmiana</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Wierszy</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Notatka</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeLog.map((entry, idx) => (
                          <tr key={entry.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatDate(entry.changed_at)}</td>
                            <td className="px-4 py-2 text-gray-700 font-medium">{entry.series ?? 'Wszystkie'}</td>
                            <td className="px-4 py-2 text-gray-700">{whName(entry.warehouse_id)}</td>
                            <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                              <span className={entry.delta_eur > 0 ? 'text-green-700' : 'text-red-600'}>
                                {entry.delta_eur > 0 ? '+' : ''}{entry.delta_eur} EUR/t
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{entry.affected_rows ?? '—'}</td>
                            <td className="px-4 py-2 text-gray-500 italic">{entry.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 text-right">
            Źródło: Pricelist Sheetpiles N · dane wg katalogu Intra BV 2025
          </div>

        </>}
      </>}
    </div>
  );
}

// ─── Sub-komponent wiersza (reused w obu widokach) ────────────────────────────
interface PriceRowProps {
  profile:        SaleProfile;
  rowPrices:      Record<string, SalePrice>;
  grades:         SaleSteeelGrade[];
  selectedWh:     string;
  editingCell:    EditingCell | null;
  editingValue:   string;
  saving:         string | null;
  cellKey:        (w: string, p: string, g: string) => string;
  startEdit:      (w: string, p: string, g: string, price: number | null) => void;
  setEditingValue: (v: string) => void;
  commitEdit:     () => void;
  setEditingCell: (c: EditingCell | null) => void;
}

function PriceRow({
  profile, rowPrices, grades, selectedWh,
  editingCell, editingValue, saving,
  cellKey, startEdit, setEditingValue, commitEdit, setEditingCell,
}: PriceRowProps) {
  return (
    <>
      <td className="px-4 py-2.5 font-semibold text-gray-800 text-xs whitespace-nowrap">
        {profile.name}
        <span className="ml-1 text-gray-400 font-normal">{profile.weight_kg_per_m} kg/m</span>
      </td>
      {grades.map(g => {
        const cell       = rowPrices[g.id];
        const isEditing  = editingCell?.warehouseId === selectedWh
          && editingCell?.profileName === profile.name
          && editingCell?.gradeId    === g.id;
        const isSaving   = saving === cellKey(selectedWh, profile.name, g.id);
        const price      = cell?.price_eur_t;
        const unavailable = !cell || price == null;

        return (
          <td key={g.id} className="px-2 py-1.5 text-right">
            {isEditing ? (
              <input
                type="number"
                min={0}
                step={1}
                autoFocus
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter')  commitEdit();
                  if (e.key === 'Escape') setEditingCell(null);
                }}
                className="w-20 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
              />
            ) : (
              <button
                onClick={() => startEdit(selectedWh, profile.name, g.id, price ?? null)}
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
                  <>{price} <span className="text-gray-400 font-normal text-xs">EUR/t</span></>
                )}
              </button>
            )}
          </td>
        );
      })}
    </>
  );
}
