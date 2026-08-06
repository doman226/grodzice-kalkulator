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
 * Pobiera fakty ofertowe z widoku dla zadanego okresu.
 *
 * `.limit(50000)` jest OBOWIĄZKOWY — PostgREST domyślnie zwraca maksymalnie
 * 1000 wierszy bez żadnego ostrzeżenia (HTTP 200, po cichu ucięta odpowiedź).
 * Ta sama pułapka wymusiła `.limit(10000)` w SalePriceMatrix.
 */
export async function fetchOfferFacts(from: string, to: string): Promise<OfferFact[]> {
  const { data, error } = await supabase
    .from('v_offer_stats')
    .select('*')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(50000);

  if (error) {
    if (isMissingRelation(error)) throw new Error(MIGRATION_MISSING);
    throw error;
  }
  return (data ?? []) as OfferFact[];
}

/**
 * Zmienia status oferty w jej macierzystej tabeli i odnotowuje decyzję.
 *
 * Kolejność ma znaczenie: najpierw właściwy `UPDATE` (to on jest istotny dla
 * modułów sprzedaży i wynajmu), potem wpis pomocniczy. Gdyby drugi krok padł,
 * status i tak jest już poprawnie zmieniony — `offer_followups` przechowuje
 * wyłącznie informacje dodatkowe.
 */
export async function setOfferStatus(
  moduleCode: StatsModule,
  offerId: string,
  status: OfferStatus,
  decidedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from(MODULE_TABLE[moduleCode])
    .update({ status })
    .eq('id', offerId);
  if (error) throw error;

  const now = new Date().toISOString();
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
  if (followupError) throw followupError;
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
