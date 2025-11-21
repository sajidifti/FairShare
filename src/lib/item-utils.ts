export function normalizeIncomingItemPayload(raw: any) {
  // Accept various legacy and canonical field names and return normalized values
  const name = raw?.name;
  const price = raw?.price;
  const purchaseDate = raw?.purchaseDate;

  const periodDays = raw?.period_days ?? raw?.depreciationDays ?? raw?.depreciation_days;
  const periodType = raw?.period_type ?? raw?.periodType ?? raw?.depreciation_period_type ?? 'days';

  return {
    name,
    price,
    purchaseDate,
    depreciationDays: periodDays,
    periodType,
  };
}

export function inferEditFormPeriod(existingItem: any) {
  // Prefer canonical `period_type` / `period_days` then fall back to older fields
  const explicitType = existingItem?.period_type ?? existingItem?.depreciation_period_type;
  const daysValue = existingItem?.period_days ?? existingItem?.depreciation_days;
  const yearsValue = existingItem?.depreciation_years;
  const hasDays = typeof daysValue === 'number' && !isNaN(daysValue);
  const hasYears = typeof yearsValue === 'number' && !isNaN(yearsValue);

  const periodType: 'days' | 'years' = explicitType === 'years' || (!explicitType && hasYears && !hasDays)
    ? 'years'
    : 'days';

  let periodValue = 365 * 3;
  if (periodType === 'years') {
    if (hasYears) {
      periodValue = Math.max(1, Math.round(yearsValue));
    } else if (hasDays) {
      periodValue = Math.max(1, Math.round(daysValue / 365));
    }
  } else {
    if (hasDays) {
      periodValue = Math.max(1, Math.round(daysValue));
    } else if (hasYears) {
      periodValue = Math.max(1, Math.round(yearsValue * 365));
    }
  }

  return { periodType, periodValue };
}

export function convertDaysToYears(days: number) {
  return Math.max(1, Math.round(days / 365));
}

export function convertYearsToDays(years: number) {
  return Math.max(1, Math.round(years * 365));
}

export default { normalizeIncomingItemPayload, inferEditFormPeriod, convertDaysToYears, convertYearsToDays };
