// Pure tax-calculation logic, extracted out of CalculatorView.tsx so it can
// be unit tested directly instead of only through the rendered component.
// This is the offline-fallback strategy set - one function per entity type,
// mirroring the backend's TaxStrategy classes in backend/main.py
// (IndividualTaxStrategy, SoleProprietorshipTaxStrategy, ...). Used by
// CalculatorView only when the server is briefly unreachable; the backend
// result is always the authoritative one.

export type EntityTypeKey = 'individual' | 'soleProp' | 'partnership' | 'llc';
export type BusinessCatKey = 'trading' | 'manufacturing' | 'service' | 'fcommerce';
export type ZoneKey = 'dscc' | 'dncc' | 'chittagong' | 'otherZone';
export type TaxCatKey = 'catGeneral' | 'catWomenSenior' | 'catDisabled' | 'catFreedomFighter';

export const TAX_FREE_THRESHOLDS: Record<TaxCatKey, number> = {
  catGeneral: 375000, catWomenSenior: 425000, catDisabled: 500000, catFreedomFighter: 525000,
};

export const TRADE_LICENSE_RATES: Record<BusinessCatKey, Record<ZoneKey, number>> = {
  trading: { dscc: 8000, dncc: 7500, chittagong: 6500, otherZone: 4000 },
  manufacturing: { dscc: 15000, dncc: 14000, chittagong: 12000, otherZone: 8000 },
  service: { dscc: 6000, dncc: 5500, chittagong: 5000, otherZone: 3500 },
  fcommerce: { dscc: 3500, dncc: 3500, chittagong: 3000, otherZone: 2000 },
};

export function computeIndividualSlabTax(taxable: number): { tax: number; minTaxApplied: boolean } {
  const slabs: Array<[number, number]> = [[300000, 0.10], [400000, 0.15], [500000, 0.20], [2500000, 0.25], [Infinity, 0.30]];
  let remaining = taxable;
  let tax = 0;
  for (const [width, rate] of slabs) {
    const amt = Math.min(remaining, width);
    tax += amt * rate;
    remaining -= amt;
    if (remaining <= 0) break;
  }
  const minTaxApplied = taxable > 0 && tax < 5000;
  return { tax: minTaxApplied ? 5000 : tax, minTaxApplied };
}

export function computeVatOrTurnoverTax(turnover: number): { amount: number; required: boolean } {
  const required = turnover > 8000000;
  return { amount: required ? turnover * 0.15 : turnover * 0.03, required };
}

export interface StrategyInputs {
  annualTurnover: number;
  taxCategoryState: TaxCatKey;
  businessCat: BusinessCatKey;
  zone: ZoneKey;
  signboardTax: number;
}

export interface CalcResult {
  income_tax_or_corporate_tax: number;
  // The backend legitimately returns null for these on an Individual (no
  // VAT/trade license applies) - they must stay nullable here too. The
  // crash this project had ("tax calculator keeps crashing") was this
  // interface lying about that (declaring `number`/`boolean`) while a
  // render call did `tradeLicenseFee.toLocaleString(...)` with no null
  // check, which throws the instant someone picks Individual.
  vat_or_turnover_tax: number | null;
  vat_required: boolean | null;
  trade_license_fee: number | null;
  signboard_tax: number;
  minimum_tax_applied: boolean;
  total_estimated_liability: number;
}

export const TAX_STRATEGIES: Record<EntityTypeKey, (inputs: StrategyInputs) => CalcResult> = {
  individual: ({ annualTurnover, taxCategoryState, signboardTax }) => {
    const threshold = TAX_FREE_THRESHOLDS[taxCategoryState];
    const { tax, minTaxApplied } = computeIndividualSlabTax(Math.max(0, annualTurnover - threshold));
    return {
      income_tax_or_corporate_tax: tax,
      vat_or_turnover_tax: null,
      vat_required: null,
      trade_license_fee: null,
      signboard_tax: signboardTax,
      minimum_tax_applied: minTaxApplied,
      total_estimated_liability: tax + signboardTax,
    };
  },

  soleProp: ({ annualTurnover, taxCategoryState, businessCat, zone, signboardTax }) => {
    const threshold = TAX_FREE_THRESHOLDS[taxCategoryState];
    const { tax, minTaxApplied } = computeIndividualSlabTax(Math.max(0, annualTurnover - threshold));
    const { amount: vat, required: vatRequired } = computeVatOrTurnoverTax(annualTurnover);
    const tradeFee = TRADE_LICENSE_RATES[businessCat][zone];
    return {
      income_tax_or_corporate_tax: tax,
      vat_or_turnover_tax: vat,
      vat_required: vatRequired,
      trade_license_fee: tradeFee,
      signboard_tax: signboardTax,
      minimum_tax_applied: minTaxApplied,
      total_estimated_liability: tax + vat + tradeFee + signboardTax,
    };
  },

  partnership: ({ annualTurnover, businessCat, zone, signboardTax }) => {
    const tax = annualTurnover * 0.25;
    const { amount: vat, required: vatRequired } = computeVatOrTurnoverTax(annualTurnover);
    const tradeFee = TRADE_LICENSE_RATES[businessCat][zone];
    return {
      income_tax_or_corporate_tax: tax,
      vat_or_turnover_tax: vat,
      vat_required: vatRequired,
      trade_license_fee: tradeFee,
      signboard_tax: signboardTax,
      minimum_tax_applied: false,
      total_estimated_liability: tax + vat + tradeFee + signboardTax,
    };
  },

  llc: ({ annualTurnover, businessCat, zone, signboardTax }) => {
    const tax = annualTurnover * 0.275;
    const { amount: vat, required: vatRequired } = computeVatOrTurnoverTax(annualTurnover);
    const tradeFee = TRADE_LICENSE_RATES[businessCat][zone];
    return {
      income_tax_or_corporate_tax: tax,
      vat_or_turnover_tax: vat,
      vat_required: vatRequired,
      trade_license_fee: tradeFee,
      signboard_tax: signboardTax,
      minimum_tax_applied: false,
      total_estimated_liability: tax + vat + tradeFee + signboardTax,
    };
  },
};
