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
  weekly_cost_pln?: number;
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
  transport_paid_by?: 'intra' | 'klient';
  transport_from?: string;
  transport_to?: string;
  prepared_by?: string;
  created_at: string;
  updated_at: string;
  items?: OfferItem[];
}
