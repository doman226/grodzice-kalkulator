export interface Profile {
  id: string;
  name: string;
  type: string;
  width_mm: number;
  weight_kg_per_m: number;
  wall_kg_per_m2: number;
  active: boolean;
}

export interface RentalPrices {
  id: string;
  base_price_pln: number;
  base_weeks: number;
  price_per_week_1: number;
  threshold_weeks: number;
  price_per_week_2: number;
  note?: string;
  updated_at: string;
  // Cennik szkód i napraw
  loss_price_pln: number;
  sorting_price_pln: number;
  grinding_price_pln: number;
  welding_price_pln: number;
  cutting_price_pln: number;
  repair_price_pln: number;
}

// ─── Płyty drogowe (wynajem) ──────────────────────────────────────────────────

export type ItemType = 'sheet_pile' | 'road_plate';

export interface RoadPlateProfile {
  id: string;
  name: string;
  thickness_mm: number;
  sheet_length_m: number;
  sheet_width_m: number;
  weight_kg_per_m2: number;
  steel_grade: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoadPlateRentalPrices {
  id: string;
  base_price_pln: number;
  base_weeks: number;
  price_per_week_1_pln: number;
  threshold_weeks: number;
  price_per_week_2_pln: number;
  loss_price_pln: number;
  service_hour_pln: number;
  sorting_price_pln: number;
  m12_welding_pln: number;
  cutting_head_pln: number;
  lifting_hole_pln: number;
  note?: string;
  updated_at: string;
}

export interface RoadPlatePriceHistory {
  id: string;
  base_price_pln?: number;
  base_weeks?: number;
  price_per_week_1_pln?: number;
  threshold_weeks?: number;
  price_per_week_2_pln?: number;
  loss_price_pln?: number;
  service_hour_pln?: number;
  sorting_price_pln?: number;
  m12_welding_pln?: number;
  cutting_head_pln?: number;
  lifting_hole_pln?: number;
  note?: string;
  changed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface PriceHistory {
  id: string;
  base_price_pln: number;
  base_weeks: number;
  price_per_week_1: number;
  threshold_weeks: number;
  price_per_week_2: number;
  note?: string;
  changed_at: string;
}

// ─── Sprzedaż ────────────────────────────────────────────────────────────────

export interface SaleOffer {
  id: string;
  offer_number: string;
  year: number;
  sequence: number;
  client_id?: string;
  client?: Client;
  task_name?: string;
  status: OfferStatus;
  notes?: string;
  valid_days: number;
  payment_days: number;
  delivery_info?: string;
  prepared_by?: string;
  currency: string;
  exchange_rate?: number;
  total_cost_eur?: number;
  total_sell_eur?: number;
  total_sell_pln?: number;
  margin_pct?: number;
  delivery_trucks?: number;
  delivery_cost_per_truck?: number;
  delivery_cost_total?: number;
  delivery_paid_by?: 'dap_included' | 'dap_extra' | 'fca' | 'cif';
  delivery_from?: string;
  delivery_to?: string;
  // Warunki oferty
  delivery_timeline?: 'huta' | 'magazyn';
  campaign_weeks?: string;
  campaign_delivery_weeks?: string;
  warehouse_delivery_time?: string;
  delivery_terms?: 'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF';
  fca_location?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  items?: SaleOfferItem[];
  lock_items?: SaleOfferLockItem[];
}

export interface SaleOfferItem {
  id: string;
  offer_id: string;
  warehouse_id?: string;
  warehouse_name?: string;
  profile_name: string;
  steel_grade: string;
  quantity: number;
  length_m: number;
  is_paired: boolean;
  total_length_m: number;
  mass_t: number;
  wall_area_m2: number;
  cost_eur_t?: number;
  sell_eur_t?: number;
  cost_eur_total?: number;
  sell_eur_total?: number;
  sell_pln_total?: number;
  margin_pct?: number;
  sort_order: number;
}

// ─── Zamki (sprzedaż) ────────────────────────────────────────────────────────

export interface SaleLock {
  id: string;
  name: string;
  price_eur_mb: number;   // cena EUR za 1 mb
  weight_kg_m: number;    // masa kg/mb
  sort_order: number;
  active: boolean;
  updated_at: string;
}

export interface SaleOfferLockItem {
  id: string;
  offer_id: string;
  lock_name: string;
  steel_grade?: string | null;   // gatunek stali (informacyjnie)
  quantity_szt?: number | null;  // liczba sztuk
  length_m?: number | null;      // długość jednej sztuki [m]
  quantity_mb: number;           // szt × długość [mb]
  price_eur_mb: number;          // cena EUR/mb (snapshot)
  total_eur: number;             // quantity_mb × price_eur_mb
  total_pln: number;             // total_eur × exchange_rate
  sell_price_eur_mb?: number | null;
  sell_eur_total?: number | null;
  sell_pln_total?: number | null;
  mass_t: number;                // quantity_mb × weight_kg_m / 1000
  sort_order: number;
  weight_kg_m?: number | null;
}

// ─── (sale lookup tables) ────────────────────────────────────────────────────

export interface SaleWarehouse {
  id: string;
  name: string;
  active: boolean;
}

export interface SaleSteeelGrade {
  id: string;
  name: string;
  sort_order: number;
}

export interface SaleProfile {
  id: string;
  name: string;
  series: string;
  width_mm: number;
  weight_kg_per_m: number;
  wall_kg_per_m2: number;
  active: boolean;
}

export interface SalePrice {
  id: string;
  warehouse_id: string;
  profile_name: string;
  steel_grade: string;
  price_eur_t: number | null;
  available: boolean;
  updated_at: string;
}

export interface SalePriceChangeLog {
  id: string;
  changed_at: string;
  series: string | null;
  warehouse_id: string | null;
  delta_eur: number;
  note: string | null;
  affected_rows: number | null;
}

// ─── Sprzedaż rur stalowych (faza 2) ─────────────────────────────────────────

export interface PipeSaleOffer {
  id: string;
  offer_number: string;                                   // SR/YYYY/NNN
  year: number;
  sequence: number;
  client_id?: string;
  client?: Client;
  task_name?: string;
  status: OfferStatus;
  notes?: string;
  valid_days: number;
  payment_days: number;
  prepared_by?: string;
  currency: 'EUR' | 'PLN';
  exchange_rate?: number;
  // Sumy snapshot
  total_cost_eur?: number;
  total_sell_eur?: number;
  total_sell_pln?: number;
  margin_pct?: number;
  // Dostawa: koszty
  delivery_trucks?: number;
  delivery_cost_per_truck?: number;
  delivery_cost_total?: number;
  delivery_paid_by?: 'dap_included' | 'dap_extra' | 'fca' | 'cif';
  delivery_from?: string;
  delivery_to?: string;
  // Warunki oferty
  delivery_timeline?: 'huta' | 'magazyn';
  campaign_weeks?: string;
  campaign_delivery_weeks?: string;
  warehouse_delivery_time?: string;
  delivery_terms?: 'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF';
  fca_location?: string;
  // Audit / soft-delete
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  items?: PipeSaleOfferItem[];
  lock_items?: PipeSaleOfferLockItem[];
}

export interface PipeSaleOfferItem {
  id: string;
  offer_id: string;
  // Specyfikacja (string snapshots — słowniki w pipeConstants.ts)
  product_type: string;
  condition: string;
  norm?: string | null;
  norm_description?: string | null;
  steel_grade: string;
  surface: string;
  // Wymiary i ilość
  diameter_mm: number;
  wall_thickness_mm: number;
  quantity_szt: number;
  length_m: number;
  // Obliczenia (snapshot z momentu zapisu)
  kg_per_m: number;
  total_length_m: number;
  mass_t: number;
  // Ceny i sumy (w walucie oferty)
  cost_price_per_ton?: number | null;
  sell_price_per_ton: number;
  cost_total?: number | null;
  sell_total: number;
  // Denominacja (zawsze)
  sell_eur_total: number;
  sell_pln_total: number;
  margin_pct?: number | null;
  // Sortowanie
  sort_order: number;
  created_at: string;
}

// ─── Zamki w ofertach rur (sprzedaż) ─────────────────────────────────────────
// Lustro SaleOfferLockItem. Katalog źródłowy: sale_locks (współdzielony z grodzicami).
export interface PipeSaleOfferLockItem {
  id: string;
  offer_id: string;
  lock_name: string;
  steel_grade?: string | null;   // gatunek stali (informacyjnie)
  quantity_szt?: number | null;  // liczba sztuk
  length_m?: number | null;      // długość jednej sztuki [m]
  quantity_mb: number;           // szt × długość [mb]
  price_eur_mb: number;          // cena EUR/mb (snapshot)
  total_eur: number;             // quantity_mb × price_eur_mb
  total_pln: number;             // total_eur × exchange_rate
  sell_price_eur_mb?: number | null;
  sell_eur_total?: number | null;
  sell_pln_total?: number | null;
  mass_t: number;                // quantity_mb × weight_kg_m / 1000
  sort_order: number;
}

// ─── Sprzedaż płyt drogowych (faza 3) ────────────────────────────────────────
// Struktura analogiczna do PipeSale*, ale z FK profile_id do road_plate_profiles
// (katalog wspólny z modułem wynajmu). Atrybuty profilu (wymiary, kg/m²)
// duplikowane jako snapshoty — chroni historię ofert przy zmianach katalogu.

/** Lista 6 gatunków stali dla płyt drogowych (sprzedaż + wynajem).
 *  Wartości MUSZĄ odpowiadać CHECK constraint w road_plate_sale_offer_items
 *  i road_plate_sale_prices (patrz migracja 2026-05-16-road-plate-sale.sql).
 *  `as const` daje typu literal-union (RoadPlateSaleSteelGrade). */
export const ROAD_PLATE_SALE_STEEL_GRADES = [
  'min. S270GP',
  'S270GP',
  'min. S355GP',
  'S355GP',
  'min. S235',
  'S235',
] as const;
export type RoadPlateSaleSteelGrade = typeof ROAD_PLATE_SALE_STEEL_GRADES[number];

export interface RoadPlateSaleOffer {
  id: string;
  offer_number: string;                                   // SPP/YYYY/NNN
  year: number;
  sequence: number;
  client_id?: string;
  client?: Client;
  task_name?: string;
  status: OfferStatus;
  notes?: string;
  valid_days: number;
  payment_days: number;
  prepared_by?: string;
  currency: 'EUR' | 'PLN';
  exchange_rate?: number;
  // Sumy snapshot
  total_cost_eur?: number;
  total_sell_eur?: number;
  total_sell_pln?: number;
  margin_pct?: number;
  // Dostawa: koszty
  delivery_trucks?: number;
  delivery_cost_per_truck?: number;
  delivery_cost_total?: number;
  delivery_paid_by?: 'dap_included' | 'dap_extra' | 'fca' | 'cif';
  delivery_from?: string;
  delivery_to?: string;
  // Warunki oferty
  delivery_timeline?: 'huta' | 'magazyn';
  campaign_weeks?: string;
  campaign_delivery_weeks?: string;
  warehouse_delivery_time?: string;
  delivery_terms?: 'DAP' | 'DAP_EXTRA' | 'FCA' | 'CIF';
  fca_location?: string;
  // Audit / soft-delete
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  items?: RoadPlateSaleOfferItem[];
}

export interface RoadPlateSaleOfferItem {
  id: string;
  offer_id: string;
  // FK do katalogu — może być NULL gdy profil został usunięty
  // (ON DELETE SET NULL na poziomie DB).
  profile_id?: string | null;
  // Snapshot atrybutów profilu z momentu wystawienia oferty
  profile_name: string;
  steel_grade: RoadPlateSaleSteelGrade;
  thickness_mm: number;
  sheet_length_m: number;
  sheet_width_m: number;
  weight_kg_per_m2: number;
  // Ilość i agregaty
  quantity_szt: number;
  total_area_m2: number;
  mass_t: number;
  // Ceny i sumy (w walucie oferty)
  cost_price_per_ton?: number | null;
  sell_price_per_ton: number;
  cost_total?: number | null;
  sell_total: number;
  // Denominacja (zawsze obliczone)
  sell_eur_total: number;
  sell_pln_total: number;
  margin_pct?: number | null;
  // Sortowanie i audit
  sort_order: number;
  created_at: string;
}

export interface RoadPlateSalePrice {
  id: string;
  profile_id: string;
  steel_grade: RoadPlateSaleSteelGrade;
  price_eur_t: number | null;        // NULL = brak ceny w cenniku
  available: boolean;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface CalculatorInput {
  profileId: string;
  quantity: number;
  lengthM: number;
  rentalWeeks: number;
}

export interface OfferItem {
  id: string;
  offer_id: string;
  profile_name: string;
  profile_type: string;
  steel_grade?: string;
  quantity: number;
  length_m: number;
  total_length_m: number;
  mass_t: number;
  wall_area_m2: number;
  sort_order: number;
  // Płyty drogowe (wypełnione tylko gdy item_type='road_plate')
  item_type?: ItemType;
  thickness_mm?: number;
  sheet_length_m?: number;
  sheet_width_m?: number;
  weight_kg_per_m2?: number;
}

export interface CalculatorResult {
  totalLengthM: number;
  massT: number;
  wallAreaM2: number;
  rentalCostPLN: number;
  costPerM2: number;
  costPerTon: number;
}

export interface Client {
  id: string;
  name: string;
  country: string;
  nip?: string;
  vat_number?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  email?: string;
  phone?: string;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type OfferStatus = 'szkic' | 'wysłana' | 'przyjęta' | 'odrzucona';

export interface Offer {
  id: string;
  offer_number: string;
  year: number;
  sequence: number;
  client_id?: string;
  client?: Client;
  task_name?: string;
  profile_name: string;
  profile_type: string;
  quantity: number;
  length_m: number;
  rental_weeks: number;
  display_unit?: 'weeks' | 'months';
  total_length_m: number;
  mass_t: number;
  wall_area_m2: number;
  rental_cost_pln: number;
  cost_per_m2: number;
  cost_per_ton: number;
  status: OfferStatus;
  notes?: string;
  valid_days: number;
  payment_days: number;
  weekly_cost_pln?: number;
  steel_grade?: string;
  delivery_info?: string;
  base_price_pln?: number;
  price_per_week_1?: number;
  price_per_week_2?: number;
  threshold_weeks?: number;
  // Cennik szkód (snapshot z chwili wystawienia)
  loss_price_pln?: number;
  sorting_price_pln?: number;
  grinding_price_pln?: number;
  welding_price_pln?: number;
  cutting_price_pln?: number;
  repair_price_pln?: number;
  transport_trucks?: number;
  transport_cost_per_truck?: number;
  transport_cost_total?: number;
  transport_paid_by?: 'dap_included' | 'dap_extra' | 'fca';
  transport_from?: string;
  transport_to?: string;
  prepared_by?: string;
  currency?: 'EUR' | 'PLN';
  exchange_rate?: number;
  rental_cost_eur?: number;
  created_at: string;
  updated_at: string;
  // Dyskryminator typu artykułu (sheet_pile = grodzice, road_plate = płyty drogowe)
  item_type?: ItemType;
  // Snapshot cennika napraw dla płyt drogowych (canonical w PLN, jak dla grodzic)
  rp_loss_price_pln?: number;
  rp_service_hour_pln?: number;
  rp_sorting_price_pln?: number;
  rp_m12_welding_pln?: number;
  rp_cutting_head_pln?: number;
  rp_lifting_hole_pln?: number;
  items?: OfferItem[];
}
