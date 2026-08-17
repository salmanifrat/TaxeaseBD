'use client';

import React, { useState, useId } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { 
  Calculator, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  MapPin, 
  DollarSign, 
  Layers,
  PieChart as PieChartIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function CalculatorView() {
  const { t, language } = useLanguage();

  // Unique Form Control IDs
  const entityTypeId = useId();
  const businessCatId = useId();
  const cityCorpId = useId();
  const taxCategory = useId();
  const turnoverId = useId();
  const signboardId = useId();

  // State inputs
  const [entityType, setEntityType] = useState<'individual' | 'soleProp' | 'partnership' | 'llc'>('soleProp');
  const [businessCat, setBusinessCat] = useState<'trading' | 'manufacturing' | 'service' | 'fcommerce'>('trading');
  const [zone, setZone] = useState<'dscc' | 'dncc' | 'chittagong' | 'otherZone'>('dscc');
  const [taxCategoryState, setTaxCategoryState] = useState<'catGeneral' | 'catWomenSenior' | 'catDisabled' | 'catFreedomFighter'>('catGeneral');
  const [annualTurnover, setAnnualTurnover] = useState<number>(4500000); // Default ৳45 Lakh BDT
  const [signboardSize, setSignboardSize] = useState<number>(30); // 30 sq ft default

  // Rates & Lookup Tables (Verified NBR & City Corp Standards)
  const tradeLicenseRates: Record<string, Record<string, number>> = {
    trading: { dscc: 8000, dncc: 7500, chittagong: 6500, otherZone: 4000 },
    manufacturing: { dscc: 15000, dncc: 14000, chittagong: 12000, otherZone: 8000 },
    service: { dscc: 6000, dncc: 5500, chittagong: 5000, otherZone: 3500 },
    fcommerce: { dscc: 3500, dncc: 3500, chittagong: 3000, otherZone: 2000 },
  };

  const signboardRatePerSqFt = zone === 'dscc' || zone === 'dncc' ? 100 : 70;

  // Calculation Logic
  const taxFreeThresholds: Record<string, number> = {
    catGeneral: 375000,
    catWomenSenior: 425000,
    catDisabled: 500000,
    catFreedomFighter: 525000,
  };

  const computeIndividualTax = (income: number, categoryKey: string) => {
    const threshold = taxFreeThresholds[categoryKey] || 375000;
    const taxable = Math.max(0, income - threshold);

    if (taxable <= 0) return { tax: 0, minTaxApplied: false };

    let remaining = taxable;
    let tax = 0;

    // Slab 1: 3,00,000 @ 10%
    const s1 = Math.min(remaining, 300000);
    tax += s1 * 0.10;
    remaining -= s1;

    // Slab 2: 4,00,000 @ 15%
    if (remaining > 0) {
      const s2 = Math.min(remaining, 400000);
      tax += s2 * 0.15;
      remaining -= s2;
    }

    // Slab 3: 5,00,000 @ 20%
    if (remaining > 0) {
      const s3 = Math.min(remaining, 500000);
      tax += s3 * 0.20;
      remaining -= s3;
    }

    // Slab 4: 25,00,000 @ 25%
    if (remaining > 0) {
      const s4 = Math.min(remaining, 2500000);
      tax += s4 * 0.25;
      remaining -= s4;
    }

    // Slab 5: Above @ 30%
    if (remaining > 0) {
      tax += remaining * 0.30;
    }

    let minTaxApplied = false;
    if (tax < 5000) {
      tax = 5000; // Flat minimum tax
      minTaxApplied = true;
    }

    return { tax, minTaxApplied };
  };

  // Calculations
  const tradeLicenseFee = tradeLicenseRates[businessCat]?.[zone] || 5000;
  const signboardTax = signboardSize * signboardRatePerSqFt;

  let incomeOrCorporateTax = 0;
  let minTaxApplied = false;

  if (entityType === 'individual' || entityType === 'soleProp') {
    const res = computeIndividualTax(annualTurnover, taxCategoryState);
    incomeOrCorporateTax = res.tax;
    minTaxApplied = res.minTaxApplied;
  } else if (entityType === 'partnership') {
    incomeOrCorporateTax = annualTurnover * 0.25; // 25% partnership entity rate
  } else if (entityType === 'llc') {
    incomeOrCorporateTax = annualTurnover * 0.275; // 27.5% corporate tax
  }

  // VAT Threshold: ৳80 Lakh (8 Million BDT)
  const isVatRequired = annualTurnover > 8000000;
  const vatOrTurnoverTax = isVatRequired
    ? annualTurnover * 0.15 // 15% standard VAT
    : annualTurnover * 0.03; // 3% turnover tax

  const totalLiability = incomeOrCorporateTax + tradeLicenseFee + signboardTax + vatOrTurnoverTax;

  // Chart Data
  const chartData = [
    { name: t.calculator.incomeTax, value: Math.round(incomeOrCorporateTax), color: '#10b981' },
    { name: t.calculator.vatOrTurnoverTax, value: Math.round(vatOrTurnoverTax), color: '#3b82f6' },
    { name: t.calculator.tradeLicenseFee, value: Math.round(tradeLicenseFee), color: '#f59e0b' },
    { name: t.calculator.signboardTax, value: Math.round(signboardTax), color: '#8b5cf6' },
  ];

  // PDF Export simulation using browser print / format downloader
  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 mb-2">
            <Calculator className="w-3.5 h-3.5" />
            <span>Finance Act 2024-2026 Engine</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">{t.calculator.title}</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">{t.calculator.subtitle}</p>
        </div>

        <button
          onClick={handleExportPdf}
          className="px-5 py-2.5 rounded-xl gradient-emerald text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>{t.calculator.exportPdfBtn}</span>
        </button>
      </div>

      {/* Main Grid: Input Form & Results Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Input Parameters */}
        <div className="lg:col-span-7 glass-card p-6 rounded-2xl border border-slate-700/60 space-y-5">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-700/60 pb-3">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>{language === 'bn' ? 'ব্যবসায়িক তথ্য ও ক্যাটাগরি' : 'Business Parameters'}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Entity Type Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor={entityTypeId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.calculator.entityType}</span>
              </label>
              <select
                id={entityTypeId}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="individual" className="bg-slate-900 text-white">{t.calculator.individual}</option>
                <option value="soleProp" className="bg-slate-900 text-white">{t.calculator.soleProp}</option>
                <option value="partnership" className="bg-slate-900 text-white">{t.calculator.partnership}</option>
                <option value="llc" className="bg-slate-900 text-white">{t.calculator.llc}</option>
              </select>
            </div>

            {/* Business Category */}
            <div className="space-y-1.5">
              <label htmlFor={businessCatId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>{t.calculator.businessCategory}</span>
              </label>
              <select
                id={businessCatId}
                value={businessCat}
                onChange={(e) => setBusinessCat(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="trading" className="bg-slate-900 text-white">{t.calculator.trading}</option>
                <option value="manufacturing" className="bg-slate-900 text-white">{t.calculator.manufacturing}</option>
                <option value="service" className="bg-slate-900 text-white">{t.calculator.service}</option>
                <option value="fcommerce" className="bg-slate-900 text-white">{t.calculator.fcommerce}</option>
              </select>
            </div>

            {/* City Corp Zone */}
            <div className="space-y-1.5">
              <label htmlFor={cityCorpId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.calculator.cityCorpZone}</span>
              </label>
              <select
                id={cityCorpId}
                value={zone}
                onChange={(e) => setZone(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="dscc" className="bg-slate-900 text-white">{t.calculator.dscc}</option>
                <option value="dncc" className="bg-slate-900 text-white">{t.calculator.dncc}</option>
                <option value="chittagong" className="bg-slate-900 text-white">{t.calculator.chittagong}</option>
                <option value="otherZone" className="bg-slate-900 text-white">{t.calculator.otherZone}</option>
              </select>
            </div>

            {/* Taxpayer Category (Individual/SoleProp) */}
            <div className="space-y-1.5">
              <label htmlFor={taxCategory} className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{t.calculator.taxpayerCategory}</span>
              </label>
              <select
                id={taxCategory}
                value={taxCategoryState}
                disabled={entityType === 'partnership' || entityType === 'llc'}
                onChange={(e) => setTaxCategoryState(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-medium disabled:opacity-50"
              >
                <option value="catGeneral" className="bg-slate-900 text-white">{t.calculator.catGeneral}</option>
                <option value="catWomenSenior" className="bg-slate-900 text-white">{t.calculator.catWomenSenior}</option>
                <option value="catDisabled" className="bg-slate-900 text-white">{t.calculator.catDisabled}</option>
                <option value="catFreedomFighter" className="bg-slate-900 text-white">{t.calculator.catFreedomFighter}</option>
              </select>
            </div>
          </div>

          {/* Revenue Slider & Input */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label htmlFor={turnoverId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.calculator.annualTurnover}</span>
              </label>
              <span className="text-base font-bold text-emerald-400 font-mono">
                ৳ {annualTurnover.toLocaleString('en-IN')} BDT
              </span>
            </div>
            <input
              id={turnoverId}
              type="range"
              min="300000"
              max="20000000"
              step="100000"
              value={annualTurnover}
              onChange={(e) => setAnnualTurnover(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>৳ 3 Lakh</span>
              <span>৳ 80 Lakh (VAT Threshold)</span>
              <span>৳ 2 Crore</span>
            </div>
          </div>

          {/* Signboard Size Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor={signboardId} className="text-xs font-semibold text-slate-300">
                {t.calculator.signboardSize}
              </label>
              <span className="text-sm font-bold text-purple-400 font-mono">
                {signboardSize} Sq. Ft. (৳{signboardRatePerSqFt}/sq.ft)
              </span>
            </div>
            <input
              id={signboardId}
              type="number"
              value={signboardSize}
              onChange={(e) => setSignboardSize(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-xl glass-input text-sm font-medium"
            />
          </div>
        </div>

        {/* Right Column (5 cols): Results Breakdown */}
        <div className="lg:col-span-5 space-y-6">
          {/* Main Calculation Card */}
          <div className="glass-card p-6 rounded-2xl border border-emerald-500/40 relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-900/90">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-700/60 pb-3">
              <Calculator className="w-5 h-5 text-emerald-400" />
              <span>{t.calculator.resultHeading}</span>
            </h2>

            {/* Itemized Table */}
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-300">
                <span>{t.calculator.incomeTax}</span>
                <span className="font-bold text-emerald-400 font-mono">
                  ৳ {Math.round(incomeOrCorporateTax).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>{t.calculator.vatOrTurnoverTax}</span>
                <span className="font-bold text-blue-400 font-mono">
                  ৳ {Math.round(vatOrTurnoverTax).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>{t.calculator.tradeLicenseFee}</span>
                <span className="font-bold text-amber-400 font-mono">
                  ৳ {tradeLicenseFee.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>{t.calculator.signboardTax}</span>
                <span className="font-bold text-purple-400 font-mono">
                  ৳ {signboardTax.toLocaleString('en-IN')}
                </span>
              </div>

              {minTaxApplied && (
                <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>{t.calculator.minimumTaxBadge}</span>
                </div>
              )}

              <div className="border-t border-slate-700 pt-3 mt-3 flex justify-between items-center">
                <span className="font-extrabold text-white">{t.calculator.totalLiability}</span>
                <span className="text-xl font-extrabold text-emerald-400 font-mono">
                  ৳ {Math.round(totalLiability).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* VAT Rule Alert Box */}
            <div className={`mt-5 p-3.5 rounded-xl border text-xs leading-relaxed ${
              isVatRequired 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              <div className="font-bold flex items-center space-x-1.5 mb-1">
                <AlertCircle className="w-4 h-4" />
                <span>{t.calculator.vatThresholdNotice}</span>
              </div>
              <p>{isVatRequired ? t.calculator.vatNoticeOver : t.calculator.vatNoticeUnder}</p>
            </div>
          </div>

          {/* Pie Chart Component */}
          <div className="glass-card p-5 rounded-2xl border border-slate-700/60">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
              <PieChartIcon className="w-4 h-4 text-emerald-400" />
              <span>{t.calculator.breakdownChartTitle}</span>
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [`৳ ${Number(value).toLocaleString('en-IN')}`, 'Amount']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#cbd5e1' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
