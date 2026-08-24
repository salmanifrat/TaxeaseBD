'use client';

import React, { useState, useId, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import {
  Calculator,
  Download,
  CheckCircle2,
  AlertCircle,
  Building2,
  MapPin,
  DollarSign,
  Layers,
  PieChart as PieChartIcon,
  WifiOff,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

type EntityTypeKey = 'individual' | 'soleProp' | 'partnership' | 'llc';
type BusinessCatKey = 'trading' | 'manufacturing' | 'service' | 'fcommerce';
type ZoneKey = 'dscc' | 'dncc' | 'chittagong' | 'otherZone';
type TaxCatKey = 'catGeneral' | 'catWomenSenior' | 'catDisabled' | 'catFreedomFighter';

// Maps the UI's option keys to the backend's enum values (single source of
// truth for the actual tax math now lives in backend/main.py).
const ENTITY_TYPE_TO_API: Record<EntityTypeKey, string> = {
  individual: 'individual',
  soleProp: 'sole_proprietorship',
  partnership: 'partnership',
  llc: 'private_limited_company',
};
const ZONE_TO_API: Record<ZoneKey, string> = {
  dscc: 'dhaka_south',
  dncc: 'dhaka_north',
  chittagong: 'chittagong',
  otherZone: 'other',
};
const TAX_CAT_TO_API: Record<TaxCatKey, string> = {
  catGeneral: 'general',
  catWomenSenior: 'woman_or_senior_65plus',
  catDisabled: 'disabled_or_third_gender',
  catFreedomFighter: 'gazetted_freedom_fighter',
};

interface CalcResult {
  income_tax_or_corporate_tax: number;
  vat_or_turnover_tax: number;
  vat_required: boolean;
  trade_license_fee: number;
  signboard_tax: number;
  minimum_tax_applied: boolean;
  total_estimated_liability: number;
}

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
  const [entityType, setEntityType] = useState<EntityTypeKey>('soleProp');
  const [businessCat, setBusinessCat] = useState<BusinessCatKey>('trading');
  const [zone, setZone] = useState<ZoneKey>('dscc');
  const [taxCategoryState, setTaxCategoryState] = useState<TaxCatKey>('catGeneral');
  const [annualTurnover, setAnnualTurnover] = useState<number>(4500000); // Default ৳45 Lakh BDT
  const [signboardSize, setSignboardSize] = useState<number>(30); // 30 sq ft default

  const signboardRatePerSqFt = zone === 'dscc' || zone === 'dncc' ? 100 : 70;

  // Local fallback math - kept only so the calculator still works if the
  // backend is briefly unreachable. It is never used silently: the UI
  // flags it with an "offline estimate" banner (see isOffline below) so
  // nobody mistakes it for the authoritative, single-source-of-truth result.
  const computeLocalFallback = (): CalcResult => {
    const taxFreeThresholds: Record<TaxCatKey, number> = {
      catGeneral: 375000, catWomenSenior: 425000, catDisabled: 500000, catFreedomFighter: 525000,
    };
    const threshold = taxFreeThresholds[taxCategoryState];
    const taxable = Math.max(0, annualTurnover - threshold);

    let incomeOrCorporateTax = 0;
    let minTaxApplied = false;

    if (entityType === 'individual' || entityType === 'soleProp') {
      let remaining = taxable;
      let tax = 0;
      const slabs: Array<[number, number]> = [[300000, 0.10], [400000, 0.15], [500000, 0.20], [2500000, 0.25], [Infinity, 0.30]];
      for (const [width, rate] of slabs) {
        const amt = Math.min(remaining, width);
        tax += amt * rate;
        remaining -= amt;
        if (remaining <= 0) break;
      }
      if (taxable > 0 && tax < 5000) { tax = 5000; minTaxApplied = true; }
      incomeOrCorporateTax = tax;
    } else if (entityType === 'partnership') {
      incomeOrCorporateTax = annualTurnover * 0.25;
    } else {
      incomeOrCorporateTax = annualTurnover * 0.275;
    }

    const isIndividual = entityType === 'individual';
    const tradeLicenseRates: Record<BusinessCatKey, Record<ZoneKey, number>> = {
      trading: { dscc: 8000, dncc: 7500, chittagong: 6500, otherZone: 4000 },
      manufacturing: { dscc: 15000, dncc: 14000, chittagong: 12000, otherZone: 8000 },
      service: { dscc: 6000, dncc: 5500, chittagong: 5000, otherZone: 3500 },
      fcommerce: { dscc: 3500, dncc: 3500, chittagong: 3000, otherZone: 2000 },
    };
    const tradeLicenseFee = isIndividual ? 0 : tradeLicenseRates[businessCat][zone];
    const signboardTax = isIndividual ? 0 : signboardSize * signboardRatePerSqFt;
    const isVatRequired = isIndividual ? false : annualTurnover > 8000000;
    const vatOrTurnoverTax = isIndividual ? 0 : (isVatRequired ? annualTurnover * 0.15 : annualTurnover * 0.03);

    return {
      income_tax_or_corporate_tax: incomeOrCorporateTax,
      vat_or_turnover_tax: vatOrTurnoverTax,
      vat_required: isVatRequired,
      trade_license_fee: tradeLicenseFee,
      signboard_tax: signboardTax,
      minimum_tax_applied: minTaxApplied,
      total_estimated_liability: incomeOrCorporateTax + vatOrTurnoverTax + tradeLicenseFee + signboardTax,
    };
  };

  const [result, setResult] = useState<CalcResult>(computeLocalFallback);
  const [isOffline, setIsOffline] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const res = await apiFetch('/api/calculate-tax', {
          method: 'POST',
          body: JSON.stringify({
            entity_type: ENTITY_TYPE_TO_API[entityType],
            annual_income_or_turnover: annualTurnover,
            taxpayer_category: TAX_CAT_TO_API[taxCategoryState],
            business_category: businessCat,
            zone: ZONE_TO_API[zone],
            signboard_size_sqft: signboardSize,
          }),
        });
        if (!res.ok) throw new Error('calculation service returned an error');
        const data: CalcResult = await res.json();
        setResult(data);
        setIsOffline(false);
      } catch {
        setResult(computeLocalFallback());
        setIsOffline(true);
      } finally {
        setIsCalculating(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, businessCat, zone, taxCategoryState, annualTurnover, signboardSize]);

  const incomeOrCorporateTax = result.income_tax_or_corporate_tax;
  const vatOrTurnoverTax = result.vat_or_turnover_tax;
  const tradeLicenseFee = result.trade_license_fee;
  const signboardTax = result.signboard_tax;
  const minTaxApplied = result.minimum_tax_applied;
  const isVatRequired = result.vat_required;
  const totalLiability = result.total_estimated_liability;

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
          <h1 className="text-2xl font-extrabold text-black">{t.calculator.title}</h1>
          <p className="text-sm text-slate-700 mt-1 max-w-2xl">{t.calculator.subtitle}</p>
        </div>

        <button
          onClick={handleExportPdf}
          className="px-5 py-2.5 rounded-xl gradient-accent text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>{t.calculator.exportPdfBtn}</span>
        </button>
      </div>

      {isOffline && (
        <div className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs font-medium">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            {language === 'bn'
              ? 'ব্যাকএন্ড সার্ভারে সংযোগ করা যায়নি — এই ফলাফল অফলাইন এস্টিমেট, চূড়ান্ত নয়।'
              : "Couldn't reach the calculation service — showing an offline estimate computed in your browser, not the server result."}
          </span>
        </div>
      )}

      {/* Main Grid: Input Form & Results Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Input Parameters */}
        <div className="lg:col-span-7 glass-card p-6 rounded-2xl border border-slate-700/60 space-y-5">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2 border-b border-slate-700/60 pb-3">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>{language === 'bn' ? 'ব্যবসায়িক তথ্য ও ক্যাটাগরি' : 'Business Parameters'}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Entity Type Dropdown */}
            <div className="space-y-1.5">
              <label htmlFor={entityTypeId} className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
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
              <label htmlFor={businessCatId} className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
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
              <label htmlFor={cityCorpId} className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
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
              <label htmlFor={taxCategory} className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
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
              <label htmlFor={turnoverId} className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
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
              <label htmlFor={signboardId} className="text-xs font-semibold text-slate-600">
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
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2 border-b border-slate-700/60 pb-3">
              <Calculator className="w-5 h-5 text-emerald-400" />
              <span>{t.calculator.resultHeading}</span>
            </h2>

            {/* Itemized Table */}
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-600">
                <span>{t.calculator.incomeTax}</span>
                <span className="font-bold text-emerald-400 font-mono">
                  ৳ {Math.round(incomeOrCorporateTax || 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>{t.calculator.vatOrTurnoverTax}</span>
                <span className="font-bold text-blue-400 font-mono">
                  ৳ {Math.round(vatOrTurnoverTax || 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>{t.calculator.tradeLicenseFee}</span>
                <span className="font-bold text-amber-400 font-mono">
                  ৳ {(tradeLicenseFee || 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>{t.calculator.signboardTax}</span>
                <span className="font-bold text-purple-400 font-mono">
                  ৳ {(signboardTax || 0).toLocaleString('en-IN')}
                </span>
              </div>

              {minTaxApplied && (
                <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>{t.calculator.minimumTaxBadge}</span>
                </div>
              )}

              <div className="border-t border-slate-700 pt-3 mt-3 flex justify-between items-center">
                <span className="font-extrabold text-slate-900">{t.calculator.totalLiability}</span>
                <span className="text-xl font-extrabold text-emerald-400 font-mono">
                  ৳ {Math.round(totalLiability || 0).toLocaleString('en-IN')}
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
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
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
