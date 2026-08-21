'use client';

import React, { useState, useId } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { 
  BarChart3, 
  Sparkles, 
  Users, 
  Check, 
  X, 
  ArrowRight, 
  DollarSign, 
  Percent, 
  Rocket
} from 'lucide-react';

interface SimulatorProps {
  setActiveTab?: (tab: string) => void;
}

export default function SimulatorView({ setActiveTab }: SimulatorProps) {
  const { t, language } = useLanguage();

  const revenueId = useId();
  const marginId = useId();
  const partnersId = useId();
  const growthId = useId();

  // State
  const [revenue, setRevenue] = useState<number>(6000000); // ৳60 Lakh BDT
  const [profitMargin, setProfitMargin] = useState<number>(20); // 20%
  const [numPartners, setNumPartners] = useState<number>(2);
  const [growthTarget, setGrowthTarget] = useState<'self' | 'equity'>('equity');

  // Computed Values
  const netProfit = revenue * (profitMargin / 100);

  // Sole Prop Tax (Personal Progressive)
  const computeSolePropTax = (profit: number) => {
    const taxable = Math.max(0, profit - 375000);
    if (taxable <= 0) return 0;
    let rem = taxable;
    let tax = 0;
    const s1 = Math.min(rem, 300000); tax += s1 * 0.10; rem -= s1;
    if (rem > 0) { const s2 = Math.min(rem, 400000); tax += s2 * 0.15; rem -= s2; }
    if (rem > 0) { const s3 = Math.min(rem, 500000); tax += s3 * 0.20; rem -= s3; }
    if (rem > 0) { tax += rem * 0.25; }
    return Math.max(5000, tax);
  };

  const solePropTax = computeSolePropTax(netProfit);
  const partnershipTax = netProfit * 0.25; // 25% flat rate
  const llcTax = netProfit * 0.275; // 27.5% corporate tax

  const solePropSetupCost = 8000; // Trade license + E-TIN
  const partnershipSetupCost = 25000; // Deed registration + Stamp duty
  const llcSetupCost = 65000; // RJSC filing, Stamp, Name clearance, Name clearance

  const solePropComplianceCost = 5000;
  const partnershipComplianceCost = 15000;
  const llcComplianceCost = 45000; // CA Audit + RJSC Annual Returns

  // AI Recommendation Logic
  let recommended: 'soleProp' | 'partnership' | 'llc' = 'soleProp';
  if (growthTarget === 'equity' || revenue > 10000000 || numPartners > 2) {
    recommended = 'llc';
  } else if (numPartners > 1) {
    recommended = 'partnership';
  } else {
    recommended = 'soleProp';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 mb-2">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Interactive Structure Optimization Engine</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">{t.simulator.title}</h1>
        <p className="text-sm text-slate-300 mt-1 max-w-2xl">{t.simulator.subtitle}</p>
      </div>

      {/* Control Inputs */}
      <div className="glass-card p-6 rounded-2xl border border-slate-700/60 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Revenue Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
            <label htmlFor={revenueId} className="flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.simulator.annualRevenueInput}</span>
            </label>
          </div>
          <span className="text-base font-bold text-emerald-400 font-mono block">
            ৳ {revenue.toLocaleString('en-IN')}
          </span>
          <input
            id={revenueId}
            type="range"
            min="500000"
            max="30000000"
            step="500000"
            value={revenue}
            onChange={(e) => setRevenue(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Profit Margin */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
            <label htmlFor={marginId} className="flex items-center space-x-1">
              <Percent className="w-3.5 h-3.5 text-blue-400" />
              <span>{t.simulator.profitMarginInput}</span>
            </label>
          </div>
          <span className="text-base font-bold text-blue-400 font-mono block">
            {profitMargin}% (Net ৳{Math.round(netProfit).toLocaleString('en-IN')})
          </span>
          <input
            id={marginId}
            type="range"
            min="5"
            max="60"
            step="5"
            value={profitMargin}
            onChange={(e) => setProfitMargin(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Number of Partners */}
        <div className="space-y-2">
          <label htmlFor={partnersId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.simulator.numPartnersInput}</span>
          </label>
          <input
            id={partnersId}
            type="number"
            min="1"
            max="20"
            value={numPartners}
            onChange={(e) => setNumPartners(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-xl glass-input text-sm font-medium"
          />
        </div>

        {/* Growth Target */}
        <div className="space-y-2">
          <label htmlFor={growthId} className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
            <Rocket className="w-3.5 h-3.5 text-purple-400" />
            <span>{t.simulator.growthTargetInput}</span>
          </label>
          <select
            id={growthId}
            value={growthTarget}
            onChange={(e) => setGrowthTarget(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-medium"
          >
            <option value="self" className="bg-slate-900 text-white">{t.simulator.growthSelf}</option>
            <option value="equity" className="bg-slate-900 text-white">{t.simulator.growthEquity}</option>
          </select>
        </div>
      </div>

      {/* Comparison Cards Grid (3 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Sole Proprietorship */}
        <div className={`glass-card p-6 rounded-2xl border transition-all relative ${
          recommended === 'soleProp' 
            ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 bg-slate-900/90' 
            : 'border-slate-700/60 opacity-90'
        }`}>
          {recommended === 'soleProp' && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full gradient-emerald text-white text-xs font-bold shadow-lg flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.simulator.recommendationBadge}</span>
            </div>
          )}

          <h3 className="text-lg font-bold text-white text-center mt-2">{t.simulator.solePropTitle}</h3>
          <p className="text-xs text-slate-400 text-center mt-1">Simplest for single entrepreneurs</p>

          <div className="mt-6 space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 block">{t.simulator.taxRateLabel}</span>
              <span className="font-bold text-white block mt-0.5">{t.simulator.taxRateSole}</span>
              <span className="text-sm font-bold text-emerald-400 font-mono block mt-2">
                Est. Tax: ৳ {Math.round(solePropTax).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.registrationCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {solePropSetupCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.complianceCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {solePropComplianceCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-slate-400 block">{t.simulator.liabilityLabel}</span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 inline-block">
                {t.simulator.liabilityUnlimited}
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2 text-slate-400">
                <X className="w-4 h-4 text-red-400 shrink-0" />
                <span>{t.simulator.rjscRequired}</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-400">
                <X className="w-4 h-4 text-red-400 shrink-0" />
                <span>{t.simulator.auditRequired}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Partnership */}
        <div className={`glass-card p-6 rounded-2xl border transition-all relative ${
          recommended === 'partnership' 
            ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 bg-slate-900/90' 
            : 'border-slate-700/60 opacity-90'
        }`}>
          {recommended === 'partnership' && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full gradient-emerald text-white text-xs font-bold shadow-lg flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.simulator.recommendationBadge}</span>
            </div>
          )}

          <h3 className="text-lg font-bold text-white text-center mt-2">{t.simulator.partnershipTitle}</h3>
          <p className="text-xs text-slate-400 text-center mt-1">Best for co-founded traditional firms</p>

          <div className="mt-6 space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 block">{t.simulator.taxRateLabel}</span>
              <span className="font-bold text-white block mt-0.5">{t.simulator.taxRatePartner}</span>
              <span className="text-sm font-bold text-emerald-400 font-mono block mt-2">
                Est. Tax: ৳ {Math.round(partnershipTax).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.registrationCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {partnershipSetupCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.complianceCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {partnershipComplianceCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-slate-400 block">{t.simulator.liabilityLabel}</span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 inline-block">
                {t.simulator.liabilityShared}
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2 text-slate-400">
                <X className="w-4 h-4 text-red-400 shrink-0" />
                <span>{t.simulator.rjscRequired}</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-400">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Partnership Deed Execution</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Private Limited Company (LLC) */}
        <div className={`glass-card p-6 rounded-2xl border transition-all relative ${
          recommended === 'llc' 
            ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 bg-slate-900/90' 
            : 'border-slate-700/60 opacity-90'
        }`}>
          {recommended === 'llc' && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full gradient-emerald text-white text-xs font-bold shadow-lg flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.simulator.recommendationBadge}</span>
            </div>
          )}

          <h3 className="text-lg font-bold text-white text-center mt-2">{t.simulator.llcTitle}</h3>
          <p className="text-xs text-slate-400 text-center mt-1">Best for high growth & investor funding</p>

          <div className="mt-6 space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-slate-400 block">{t.simulator.taxRateLabel}</span>
              <span className="font-bold text-white block mt-0.5">{t.simulator.taxRateLLC}</span>
              <span className="text-sm font-bold text-emerald-400 font-mono block mt-2">
                Est. Tax: ৳ {Math.round(llcTax).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.registrationCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {llcSetupCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">{t.simulator.complianceCostLabel}</span>
              <span className="font-bold text-white font-mono">৳ {llcComplianceCost.toLocaleString('en-IN')}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-slate-400 block">{t.simulator.liabilityLabel}</span>
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 inline-block">
                {t.simulator.liabilityLimited}
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t.simulator.rjscRequired}</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t.simulator.auditRequired}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="glass-card p-6 rounded-2xl border border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-white block">
            {language === 'bn' ? 'আপনার সিদ্ধান্ত নিশ্চিত করুন' : 'Ready to Register Your Business?'}
          </span>
          <p className="text-xs text-slate-400 mt-0.5">
            {language === 'bn' 
              ? 'নির্বাচন করুন এবং সরাসরি সরকারি নিবন্ধন ফরম স্বয়ংক্রিয়ভাবে তৈরি করুন।' 
              : 'Select your preferred structure and auto-populate government registration forms instantly.'}
          </p>
        </div>

        <button
          onClick={() => setActiveTab && setActiveTab('forms')}
          className="px-5 py-2.5 rounded-xl gradient-emerald text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2 whitespace-nowrap"
        >
          <span>{t.simulator.selectStructureBtn}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
