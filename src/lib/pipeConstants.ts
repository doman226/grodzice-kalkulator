// Słowniki i helpery dla modułu sprzedaży rur stalowych (faza 1 — bez Supabase).
// Wartości tu zdefiniowane to single source of truth dla list rozwijanych
// w PipeSaleCalculator. Zmiana listy w jednym miejscu automatycznie aktualizuje
// typy literałowe (PipeProductType, PipeCondition, PipeNorm, PipeSurface).

export const PIPE_PRODUCT_TYPES = [
  'Rury stalowe ze szwem spiralnym',
  'Rury stalowe ze szwem wzdłużnym',
  'Rury stalowe ze szwem',
  'Rury stalowe bezszwowe',
] as const;
export type PipeProductType = typeof PIPE_PRODUCT_TYPES[number];

export const PIPE_CONDITIONS = [
  'Nowe, z atestem 3.1/EN10204',
  'Nowe, z atestem 3.2/EN10204',
  '2 gatunek, bez atestu 3.1/EN10204',
  'surplus/2 gatunek, bez atestu 3.1/EN10204',
  'surplus, bez atestu 3.1/EN10204',
] as const;
export type PipeCondition = typeof PIPE_CONDITIONS[number];

export const PIPE_NORMS = [
  'EN10219-1/2',
  'EN10217-1',
  'EN10217-2',
  'EN10217-5',
  'EN10210-1/2',
  'EN10216-1',
  'EN10216-2',
] as const;
export type PipeNorm = typeof PIPE_NORMS[number];

// Opis normy produkcyjnej (pełny tekst pokazywany w UI obok wyboru normy).
export const PIPE_NORM_DESCRIPTIONS: Record<PipeNorm, string> = {
  'EN10219-1/2': 'Rury stalowe ze szwem ze stali konstrukcyjnych',
  'EN10217-1':   'Rury stalowe ze szwem do zastosowań ciśnieniowych',
  'EN10217-2':   'Rury stalowe ze szwem do zastosowań ciśnieniowych w podwyższonej temperaturze',
  'EN10217-5':   'Rury stalowe ze szwem do zastosowań ciśnieniowych w podwyższonej temperaturze',
  'EN10210-1/2': 'Rury stalowe bez szwu lub ze szwem ze stali konstrukcyjnych',
  'EN10216-1':   'Rury stalowe bez szwu do zastosowań ciśnieniowych',
  'EN10216-2':   'Rury stalowe bez szwu do zastosowań ciśnieniowych w podwyższonej temperaturze',
};

// Gatunki stali dopuszczone w danej normie. Lista bieżącego pola steelGrade
// w kalkulatorze jest filtrowana po tej mapie po wyborze normy.
export const PIPE_NORM_GRADES: Record<PipeNorm, readonly string[]> = {
  'EN10219-1/2': ['S235JRH', 'S275JR', 'S275J0H', 'S355J2H', 'S355J0H', 'S420MH', 'S460N'],
  'EN10217-1':   ['P195TR1', 'P195TR2', 'P235TR1', 'P235TR2', 'P265TR1', 'P265TR2'],
  'EN10217-2':   ['P235GH', 'P265GH', 'P355GH', '16Mo3'],
  'EN10217-5':   ['P235GH', 'P265GH', 'P355GH', '16Mo3'],
  'EN10210-1/2': ['S235JRH', 'S275JR', 'S275J0H', 'S355J2H', 'S355J0H'],
  'EN10216-1':   ['P195TR1', 'P195TR2', 'P235TR1', 'P235TR2', 'P265TR1', 'P265TR2'],
  'EN10216-2':   ['P235GH', 'P265GH', 'P355GH', '16Mo3'],
};

export const PIPE_SURFACES = [
  'czarna, bez zabezpieczenia',
  'trójwarstwowa izolacja polietylenowa 3LPE',
  'trójwarstwowa izolacja polipropylenowa 3LPP',
  'jednowarstwowa izolacja epoksydowa FBE',
  'izolacje bitumiczne: ZO-1, ZO-2, ZO-3, ZM, WM, WW',
  'zewnętrzna izolacja na rurach 3LPE, 3LHDPE, 3LPP, EP',
  'zewnętrzne powłoki antykorozyjne SYNERGY klasa izolacji A50, B50, C50',
  'poliuretanowe izolacje wewnętrzne oraz zewnętrzne na rurach PROTEC',
  'wewnętrzne powłoki malarskie epoksydowe i poliuretanowe',
  'wewnętrzna powłoka cementowa na rurach',
  'malowanie zewnętrznych oraz wewnętrznych powierzchni rur',
  'cynkowanie ogniowe',
  'cynkowanie proszkowe',
] as const;
export type PipeSurface = typeof PIPE_SURFACES[number];

// Stan z atestem 3.1/3.2 → pokazujemy pełny opis normy produkcyjnej.
// Każdy stan zawierający "bez atestu" → opis = "nie dotyczy".
export function isCertifiedCondition(condition: PipeCondition): boolean {
  return !condition.toLowerCase().includes('bez atestu');
}

// Współczynnik wzoru na masę 1 mb rury walcowej.
// kg/m = (D − t) × t × 0,02466
// Test kontrolny: Ø168,3 × 6,3 → (168,3 − 6,3) × 6,3 × 0,02466 = 25,168 kg/m
export const PIPE_KG_M_FACTOR = 0.02466;

export function pipeKgPerM(diameterMm: number, wallThicknessMm: number): number {
  if (diameterMm <= 0 || wallThicknessMm <= 0) return 0;
  // Grubość ścianki musi być mniejsza od promienia (inaczej rura "zamyka się" matematycznie).
  if (wallThicknessMm >= diameterMm / 2) return 0;
  return (diameterMm - wallThicknessMm) * wallThicknessMm * PIPE_KG_M_FACTOR;
}
