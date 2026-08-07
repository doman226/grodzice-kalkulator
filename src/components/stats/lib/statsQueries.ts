/**
 * statsQueries.ts — jedyne miejsce modułu statystyk rozmawiające z Supabase.
 *
 * Odczyt: widok `v_offer_stats` (7 modułów w jednej tabeli faktów).
 * Zapis:  wyłącznie zmiana statusu oferty + tabela pomocnicza `offer_followups`.
 *         To ten SAM `UPDATE`, który wykonują dziś listy ofert (OffersTable:88,
 *         SaleOffersTable:101, PipeOffersTable:100, RoadPlateSaleOffersTable:105,
 *         BeamOffersTable:81, BeamSaleOffersTable:105) — jedno źródło prawdy,
 *         zero zmian w kodzie modułów wynajmu i sprzedaży.
 */

import { supabase } from '../../../lib/supabase';
import type { OfferStatus } from '../../../types';
import type { OfferFact, StatsModule } from './statsTypes';

/** Moduł → tabela, w której żyje status oferty. OF i OP dzielą tabelę `offers`. */
const MODULE_TABLE: Record<StatsModule, string> = {
  OF:  'offers',
  OP:  'offers',
  OH:  'beam_rental_offers',
  SP:  'sale_offers',
  SR:  'pipe_sale_offers',
  SPP: 'road_plate_sale_offers',
  SH:  'beam_sale_offers',
};

/** Komunikat, gdy migracja modułu jeszcze nie została wykonana. */
export const MIGRATION_MISSING =
  'Migracja modułu statystyk nie została wykonana. ' +
  'Uruchom docs/migrations/2026-08-04-stats-module.sql w Supabase.';

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === 'PGRST205' || error.code === '42P01' ||
         msg.includes('does not exist') || msg.includes('could not find the table');
}

/**
 * TWARDY limit serwera, nie klienta.
 *
 * Rola `authenticator` ma `pgrst.db_max_rows=5000` (weryfikacja:
 * `SELECT rolconfig FROM pg_roles WHERE rolname='authenticator'`). Wpisanie
 * `.limit(50000)` niczego nie zmienia — PostgREST i tak utnie na 5000, i zrobi
 * to PO CICHU: HTTP 200 z niepełnym zbiorem. Dokładnie ta pułapka wystąpiła już
 * w tym projekcie przy `sale_prices`.
 *
 * Dlatego prosimy o dokładnie tyle, ile serwer może dać, i sprawdzamy, czy
 * odpowiedź nie dobiła do limitu — patrz `FactsResult.truncated`.
 */
export const FETCH_LIMIT = 5000;

export interface FactsResult {
  facts: OfferFact[];
  /** true = odpowiedź dobiła do limitu serwera, dane są NIEPEŁNE. */
  truncated: boolean;
}

/** Pobiera fakty ofertowe z widoku dla zadanego okresu. */
export async function fetchOfferFacts(from: string, to: string): Promise<FactsResult> {
  const { data, error } = await supabase
    .from('v_offer_stats')
    .select('*')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) {
    if (isMissingRelation(error)) throw new Error(MIGRATION_MISSING);
    throw error;
  }
  const facts = (data ?? []) as OfferFact[];
  return { facts, truncated: facts.length >= FETCH_LIMIT };
}

export interface StatusChangeResult {
  /** Ostrzeżenie, gdy status zapisano, ale wpis pomocniczy nie przeszedł. */
  followupWarning?: string;
}

/**
 * Zmienia status oferty w jej macierzystej tabeli i odnotowuje decyzję.
 *
 * DWA OSOBNE ZAPISY, ŚWIADOMIE RÓŻNIE TRAKTOWANE. Supabase nie daje tu
 * transakcji, więc drugi krok może paść po udanym pierwszym:
 *  • `UPDATE` statusu — operacja właściwa. Błąd rzuca wyjątkiem.
 *  • wpis do `offer_followups` — informacja pomocnicza (kto i kiedy domknął).
 *    Błąd NIE rzuca wyjątkiem, tylko wraca jako `followupWarning`.
 *
 * Gdyby oba traktować jednakowo, awaria drugiego kroku dawałaby komunikat
 * „nie udało się zmienić statusu", podczas gdy status JEST już zmieniony —
 * handlowiec kliknąłby ponownie, sądząc że nic się nie stało.
 */
export async function setOfferStatus(
  moduleCode: StatsModule,
  offerId: string,
  status: OfferStatus,
  decidedBy: string | null,
): Promise<StatusChangeResult> {
  const now = new Date().toISOString();

  // `updated_at` ustawiane jawnie — tak samo robi OffersTable:88 i
  // BeamOffersTable:81. Tabele sprzedażowe mają trigger `touch`, który i tak
  // nadpisze tę wartość; jawny zapis daje spójne zachowanie we wszystkich
  // sześciu modułach.
  const { error } = await supabase
    .from(MODULE_TABLE[moduleCode])
    .update({ status, updated_at: now })
    .eq('id', offerId);
  if (error) throw error;

  const { error: followupError } = await supabase
    .from('offer_followups')
    .upsert(
      {
        module_code: moduleCode,
        offer_id: offerId,
        decided_at: now,
        decided_by: decidedBy,
        snoozed_until: null,
        updated_at: now,
      },
      { onConflict: 'module_code,offer_id' },
    );

  if (followupError) {
    console.warn('offer_followups: zapis nie powiódł się', followupError);
    return {
      followupWarning:
        'Status został zmieniony, ale nie zapisano informacji o tym, kto i kiedy ' +
        'podjął decyzję. Nie trzeba klikać ponownie.',
    };
  }
  return {};
}

/** „Wciąż w grze" — chowa ofertę z listy Do domknięcia na `days` dni. */
export async function snoozeOffer(
  moduleCode: StatsModule,
  offerId: string,
  days = 30,
): Promise<void> {
  const until = new Date();
  until.setDate(until.getDate() + days);

  const { error } = await supabase
    .from('offer_followups')
    .upsert(
      {
        module_code: moduleCode,
        offer_id: offerId,
        snoozed_until: until.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'module_code,offer_id' },
    );
  if (error) throw error;
}
