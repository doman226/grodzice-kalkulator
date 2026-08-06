/**
 * statsTypes.ts — słownik pojęć modułu statystyk.
 *
 * Moduł czyta z widoku `v_offer_stats`, który scala 7 strumieni ofertowych
 * (migracja docs/migrations/2026-08-04-stats-module.sql). Widok jest jedynym
 * miejscem znającym nazwy kolumn poszczególnych modułów — tutaj operujemy już
 * na znormalizowanym `OfferFact`.
 */

import type { OfferStatus } from '../../../types';

// ─── Moduły ofertowe ──────────────────────────────────────────────────────────

export const STATS_MODULES = ['OF', 'OP', 'OH', 'SP', 'SR', 'SPP', 'SH'] as const;
export type StatsModule = typeof STATS_MODULES[number];

export const MODULE_LABELS: Record<StatsModule, string> = {
  OF:  'Wynajem grodzic',
  OP:  'Wynajem płyt',
  OH:  'Wynajem dwuteowników',
  SP:  'Sprzedaż grodzic',
  SR:  'Sprzedaż rur',
  SPP: 'Sprzedaż płyt',
  SH:  'Sprzedaż dwuteowników',
};

/** Wynajem i sprzedaż nigdy nie są sumowane w jedną kwotę — patrz spec. */
export type StatsKind = 'rental' | 'sale';

export const MODULE_KIND: Record<StatsModule, StatsKind> = {
  OF: 'rental', OP: 'rental', OH: 'rental',
  SP: 'sale', SR: 'sale', SPP: 'sale', SH: 'sale',
};

// ─── Statusy ──────────────────────────────────────────────────────────────────

/** Statusy uznawane za rozstrzygnięte — mianownik skuteczności. */
export const DECIDED_STATUSES: OfferStatus[] = ['przyjęta', 'odrzucona'];

/** Szkic nie trafił do klienta → poza metrykami handlowymi. */
export const DRAFT_STATUS: OfferStatus = 'szkic';
export const SENT_STATUS: OfferStatus = 'wysłana';

export const STATUS_COLORS: Record<OfferStatus, string> = {
  'wysłana':   '#f59e0b',
  'przyjęta':  '#16a34a',
  'odrzucona': '#dc2626',
  'szkic':     '#9ca3af',
};

// ─── Fakt ofertowy ────────────────────────────────────────────────────────────

/**
 * Jeden wiersz widoku `v_offer_stats`.
 *
 * `value_pln` / `value_eur` — kwoty zdenominowane po kursie ZAPISANYM W OFERCIE.
 * Na poziomie oferty kolumna `_pln` realnie trzyma PLN, a `_eur` — EUR
 * (zweryfikowane). Moduł niczego nie przelicza.
 */
export interface OfferFact {
  id: string;
  module_code: StatsModule;
  kind: StatsKind;
  offer_number: string;
  client_id: string | null;
  client_name: string | null;
  prepared_by: string | null;
  status: OfferStatus;
  currency: string;
  created_at: string;
  value_pln: number | null;
  value_eur: number | null;
  mass_t: number | null;
  /** Tylko sprzedaż; dla wynajmu zawsze null. */
  margin_pct: number | null;
  /** „Wciąż w grze" — oferta odłożona na liście Do domknięcia. */
  snoozed_until: string | null;
}

// ─── Filtry ───────────────────────────────────────────────────────────────────

export type PeriodPreset =
  | 'this_month' | 'this_quarter' | 'this_year' | 'last_12m' | 'all' | 'custom';

export interface StatsFilters {
  /** Granice okresu jako pełne znaczniki ISO (włącznie). */
  from: string;
  to: string;
  preset: PeriodPreset;
  kind: StatsKind | 'all';
  rep: string | 'all';
  modules: StatsModule[];
}

/** Etykieta handlowca dla ofert bez `prepared_by` (w praktyce nie występują). */
export const NO_REP = '—';
