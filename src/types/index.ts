export interface Profile {
  id: string;
  name: string;
  type: 'VL' | 'GU';
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
  delivery_paid_by?: 'dap_included' | 'dap_extra' | 'fca';
  delivery_from?: string;
  delivery_to?: string;
  // Warunki oferty
  delivery_timeline?: 'huta' | 'magazyn';
  campaign_weeks?: string;
  campaign_delivery_weeks?: string;
  warehouse_delivery_time?: string;
  delivery_terms?: 'DAP' | 'FCA';
  fca_location?: string;
  created_at: string;
  updated_at: string;
  items?: SaleOfferItem[];
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
  created_at: string;
  updated_at: string;
  items?: OfferItem[];
}
