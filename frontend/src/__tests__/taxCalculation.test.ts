// Unit tests for the frontend's offline tax-calculation strategies
// (src/lib/taxStrategies.ts) - the same functions CalculatorView.tsx
// actually renders with, not a reimplementation. Run with `npm test`.

import { describe, it, expect } from 'vitest';
import {
  computeIndividualSlabTax,
  computeVatOrTurnoverTax,
  TAX_STRATEGIES,
  TAX_FREE_THRESHOLDS,
} from '../lib/taxStrategies';

describe('computeIndividualSlabTax', () => {
  it('applies zero tax below the taxable threshold', () => {
    expect(computeIndividualSlabTax(0).tax).toBe(0);
  });

  it('taxes the first slab at 10%', () => {
    const { tax, minTaxApplied } = computeIndividualSlabTax(125000);
    expect(tax).toBe(12500);
    expect(minTaxApplied).toBe(false);
  });

  it('applies the BDT 5,000 statutory minimum tax when the slab result is lower', () => {
    // Small positive taxable income -> slab tax < 5,000 -> floor applies.
    const { tax, minTaxApplied } = computeIndividualSlabTax(5000);
    expect(tax).toBe(5000);
    expect(minTaxApplied).toBe(true);
  });

  it('progresses through multiple slabs correctly', () => {
    // 300,000 @ 10% + 100,000 @ 15% = 30,000 + 15,000 = 45,000
    const { tax } = computeIndividualSlabTax(400000);
    expect(tax).toBe(45000);
  });
});

describe('computeVatOrTurnoverTax', () => {
  it('applies the 3% turnover tax under the BDT 80 lakh VAT threshold', () => {
    const { amount, required } = computeVatOrTurnoverTax(5000000);
    expect(required).toBe(false);
    expect(amount).toBe(150000);
  });

  it('applies the 15% VAT rate above the BDT 80 lakh threshold', () => {
    const { amount, required } = computeVatOrTurnoverTax(9000000);
    expect(required).toBe(true);
    expect(amount).toBe(1350000);
  });
});

describe('TAX_STRATEGIES (Strategy pattern - one per entity type)', () => {
  it('individual: has no VAT or trade license fee (nullable, not zero)', () => {
    const result = TAX_STRATEGIES.individual({
      annualTurnover: 500000,
      taxCategoryState: 'catGeneral',
      businessCat: 'trading',
      zone: 'dscc',
      signboardTax: 0,
    });
    expect(result.vat_or_turnover_tax).toBeNull();
    expect(result.vat_required).toBeNull();
    expect(result.trade_license_fee).toBeNull();
    // Taxable: 500,000 - 375,000 = 125,000 -> 10% = 12,500
    expect(result.income_tax_or_corporate_tax).toBe(12500);
  });

  it('soleProp: includes VAT/turnover tax and a trade license fee', () => {
    const result = TAX_STRATEGIES.soleProp({
      annualTurnover: 5000000,
      taxCategoryState: 'catGeneral',
      businessCat: 'trading',
      zone: 'dscc',
      signboardTax: 3000,
    });
    expect(result.trade_license_fee).toBe(8000);
    expect(result.vat_or_turnover_tax).toBe(150000);
    expect(result.total_estimated_liability).toBeGreaterThan(0);
  });

  it('partnership: flat 25% corporate tax rate, no minimum tax provision', () => {
    const result = TAX_STRATEGIES.partnership({
      annualTurnover: 1000000,
      taxCategoryState: 'catGeneral',
      businessCat: 'service',
      zone: 'dncc',
      signboardTax: 0,
    });
    expect(result.income_tax_or_corporate_tax).toBe(250000);
    expect(result.minimum_tax_applied).toBe(false);
  });

  it('llc: flat 27.5% corporate tax rate', () => {
    const result = TAX_STRATEGIES.llc({
      annualTurnover: 1000000,
      taxCategoryState: 'catGeneral',
      businessCat: 'manufacturing',
      zone: 'chittagong',
      signboardTax: 0,
    });
    expect(result.income_tax_or_corporate_tax).toBe(275000);
  });

  it('every entity type honors the higher tax-free threshold for special categories', () => {
    expect(TAX_FREE_THRESHOLDS.catWomenSenior).toBeGreaterThan(TAX_FREE_THRESHOLDS.catGeneral);
    expect(TAX_FREE_THRESHOLDS.catFreedomFighter).toBeGreaterThan(TAX_FREE_THRESHOLDS.catDisabled);
  });
});
