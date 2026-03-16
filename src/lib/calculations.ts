import type { RentalPrices, CalculatorResult } from '../types';

export function calculateRentalCost(
  massT: number,
  weeks: number,
  prices: RentalPrices
): number {
  if (weeks <= 0 || massT <= 0) return 0;

  if (weeks <= prices.base_weeks) {
    return massT * prices.base_price_pln;
  }

  const extraWeeks1 = Math.min(weeks, prices.threshold_weeks) - prices.base_weeks;
  const extraWeeks2 = weeks > prices.threshold_weeks
    ? weeks - prices.threshold_weeks
    : 0;

  return massT * (
    prices.base_price_pln +
    extraWeeks1 * prices.price_per_week_1 +
    extraWeeks2 * prices.price_per_week_2
  );
}

export function calculate(
  quantity: number,
  lengthM: number,
  weightKgPerM: number,
  widthMm: number,
  rentalWeeks: number,
  prices: RentalPrices
): CalculatorResult {
  const totalLengthM = quantity * lengthM;
  const massT = (totalLengthM * weightKgPerM) / 1000;
  const wallAreaM2 = totalLengthM * (widthMm / 1000);
  const rentalCostPLN = calculateRentalCost(massT, rentalWeeks, prices);
  const costPerM2 = wallAreaM2 > 0 ? rentalCostPLN / wallAreaM2 : 0;
  const costPerTon = massT > 0 ? rentalCostPLN / massT : 0;

  return { totalLengthM, massT, wallAreaM2, rentalCostPLN, costPerM2, costPerTon };
}

export const COMPARISON_WEEKS = [4, 8, 12, 16, 20, 26];

export function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 3): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
