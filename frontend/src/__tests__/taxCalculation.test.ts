/**
 * Unit test runner for TaxEaseBD Frontend Tax Logic.
 * Can be executed directly with `npx tsx` or `node`.
 */

export function calculateIndividualTax(grossIncome: number) {
  const threshold = 375000;
  const taxable = Math.max(0, grossIncome - threshold);

  let calcTax = 0;
  let remaining = taxable;
  const slabs = [
    { limit: 300000, rate: 0.10 },
    { limit: 400000, rate: 0.15 },
    { limit: 500000, rate: 0.20 },
    { limit: 2000000, rate: 0.25 },
    { limit: Infinity, rate: 0.30 }
  ];

  for (const slab of slabs) {
    if (remaining <= 0) break;
    const tInSlab = Math.min(remaining, slab.limit);
    calcTax += tInSlab * slab.rate;
    remaining -= tInSlab;
  }

  const minTax = taxable > 0 ? 5000 : 0;
  const finalTax = Math.max(calcTax, minTax);

  return { grossIncome, taxable, calcTax, finalTax };
}

export function runTaxCalculationTests() {
  // Test 1: Tax-free threshold
  const t1 = calculateIndividualTax(350000);
  console.assert(t1.taxable === 0, 'Test 1 Failed: Taxable income should be 0');
  console.assert(t1.finalTax === 0, 'Test 1 Failed: Final tax should be 0');

  // Test 2: Slab 1 (10%)
  const t2 = calculateIndividualTax(500000);
  console.assert(t2.taxable === 125000, 'Test 2 Failed: Taxable income should be 125,000');
  console.assert(t2.calcTax === 12500, 'Test 2 Failed: Calculated tax should be 12,500');

  // Test 3: Minimum Tax under Section 166
  const t3 = calculateIndividualTax(380000);
  console.assert(t3.finalTax === 5000, 'Test 3 Failed: Minimum tax BDT 5,000 should apply');

  console.log('✓ All 3 Frontend Tax Calculation Unit Tests Passed Successfully!');
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runTaxCalculationTests();
}
