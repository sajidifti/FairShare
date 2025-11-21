import { describe, it, expect } from 'vitest';
import { normalizeIncomingItemPayload, inferEditFormPeriod, convertDaysToYears, convertYearsToDays } from './item-utils';

describe('item-utils', () => {
  it('normalizes legacy payload', () => {
    const raw = { name: 'Fridge', price: 1200, purchaseDate: '2023-01-01', depreciationDays: 365 }; 
    const r = normalizeIncomingItemPayload(raw as any);
    expect(r.name).toBe('Fridge');
    expect(r.depreciationDays).toBe(365);
    expect(r.periodType).toBe('days');
  });

  it('normalizes canonical payload', () => {
    const raw = { name: 'Oven', price: 300, purchaseDate: '2023-01-01', period_days: 730, period_type: 'days' };
    const r = normalizeIncomingItemPayload(raw as any);
    expect(r.depreciationDays).toBe(730);
    expect(r.periodType).toBe('days');
  });

  it('infers edit form period (years)', () => {
    const item = { depreciation_years: 3 };
    const { periodType, periodValue } = inferEditFormPeriod(item as any);
    expect(periodType).toBe('years');
    expect(periodValue).toBe(3);
  });

  it('converts days to years and back', () => {
    expect(convertDaysToYears(365)).toBe(1);
    expect(convertDaysToYears(730)).toBe(2);
    expect(convertYearsToDays(2)).toBe(730);
  });
});
