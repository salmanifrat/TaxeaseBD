'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import { 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  Calculator, 
  FileText, 
  Receipt, 
  Bot, 
  Calendar, 
  CheckCircle2, 
  Clock,
  Building2,
  ArrowRight
} from 'lucide-react';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

export default function DashboardView({ setActiveTab }: DashboardProps) {
  const { t, language } = useLanguage();
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/dashboard/summary')
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch(() => {});
  }, []);


  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="relative overflow-hidden rounded-2xl glass-card p-6 md:p-8 border border-emerald-500/30">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>NBR Finance Act 2024-2026 Aligned</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-black tracking-tight">
              {t.dashboard.welcome}
            </h1>
            <p className="text-sm text-slate-800">
              {t.dashboard.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab('calculator')}
              className="px-4 py-2.5 rounded-xl gradient-accent text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2"
            >
              <Calculator className="w-4 h-4" />
              <span>{t.dashboard.calcTaxAction}</span>
            </button>
            <button
              onClick={() => setActiveTab('assistant')}
              className="px-4 py-2.5 rounded-xl btn-outline-accent font-semibold text-sm transition-all flex items-center space-x-2"
            >
              <Bot className="w-4 h-4" />
              <span>{t.dashboard.askAIAction}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row: Compliance Score & Audit Risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Compliance Health Score */}
        <div className="glass-card p-6 rounded-2xl border border-slate-700/60 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t.dashboard.complianceScore}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-3">
            <span className="text-4xl font-extrabold text-emerald-400">92 / 100</span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {t.dashboard.scoreStatus}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: '92%' }} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {language === 'bn' 
              ? 'ট্রেড লাইসেন্স ও ই-টিন আপডেট রয়েছে। আগামী ভ্যাট রিটার্ন ১৫ই আগস্ট।' 
              : 'Trade License & E-TIN updated. Next VAT return due Aug 15.'}
          </p>
        </div>

        {/* Predicted Audit Risk */}
        <div className="glass-card p-6 rounded-2xl border border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t.dashboard.auditRisk}
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-3">
            <span className="text-4xl font-extrabold text-amber-400">8.5%</span>
            <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {t.dashboard.riskLow}
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: '8.5%' }} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {language === 'bn' 
              ? 'মুসক ৬.৩ লেজারের সাথে ব্যাংক স্টেটমেন্ট সামঞ্জস্যপূর্ণ।' 
              : 'Mushak 6.3 ledger matches turnover statements.'}
          </p>
        </div>

        {/* Registered Entity Type */}
        <div className="glass-card p-6 rounded-2xl border border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {language === 'bn' ? 'নিবন্ধিত কাঠামো' : 'Registered Structure'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-xl font-bold text-slate-900">Private Limited Company</span>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'bn' ? 'আরজেএসসি নিবন্ধন নং: C-189204' : 'RJSC Reg No: C-189204'}
            </p>
          </div>
          <button
            onClick={() => setActiveTab('simulator')}
            className="mt-4 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
          >
            <span>{language === 'bn' ? 'কর হার তুলনা দেখুন' : 'Compare Structure Tax Rates'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tax Summary & Quick Feature Launcher Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3): Feature Launcher Cards */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <span>{t.dashboard.quickActions}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Action Card 1: Calculator */}
            <div 
              onClick={() => setActiveTab('calculator')}
              className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-700/60 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Calculator className="w-5 h-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-emerald-400 transition-colors">
                {t.dashboard.calcTaxAction}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {language === 'bn' 
                  ? 'সিটি কর্পোরেশন ফি, সাইনবোর্ড ট্যাক্স ও প্রগ্রেসিভ ইনকাম ট্যাক্স ক্যালকুলেশন।' 
                  : 'Trade license, signboard tax, VAT & income tax breakdown.'}
              </p>
            </div>

            {/* Action Card 2: Form Pre-filler */}
            <div 
              onClick={() => setActiveTab('forms')}
              className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-700/60 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-blue-400 transition-colors">
                {t.dashboard.prefillFormAction}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {language === 'bn' 
                  ? 'আরজেএসসি ফরম কে এবং এনবিআর ভ্যাট-১ স্বয়ংক্রিয় বাংলা স্ক্রিপ্ট ফরম।' 
                  : 'Auto-fill RJSC Form K, NBR VAT-1 & Trade License forms.'}
              </p>
            </div>

            {/* Action Card 3: Mushak Ledgers */}
            <div 
              onClick={() => setActiveTab('mushak')}
              className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-700/60 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Receipt className="w-5 h-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-purple-400 transition-colors">
                {t.dashboard.mushakAction}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {language === 'bn' 
                  ? 'মুসক ৬.৩ কর চালানপত্র ও মুসক ৯.১ এনবিআর ফাইল প্রস্তুত করুন।' 
                  : 'Generate Mushak 6.3 & 9.1 NBR-compliant tax ledgers.'}
              </p>
            </div>

            {/* Action Card 4: AI Assistant */}
            <div 
              onClick={() => setActiveTab('assistant')}
              className="glass-card glass-card-hover p-5 rounded-2xl border border-slate-700/60 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900 group-hover:text-amber-400 transition-colors">
                {t.dashboard.askAIAction}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {language === 'bn' 
                  ? 'এনবিআর সার্কুলার ও আইনি তথ্যের উপর তৈরি দ্বিভাষিক এআই চ্যাট।' 
                  : 'Ask legal & tax questions grounded in verified NBR Circulars.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (1/3): Upcoming Deadlines Widget */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-700/60">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>{t.dashboard.upcomingDeadlines}</span>
              </h3>
              <button 
                onClick={() => setActiveTab('calendar')}
                className="text-xs text-emerald-400 hover:underline"
              >
                {t.dashboard.viewAllDeadlines}
              </button>
            </div>

            <div className="space-y-4">
              {/* Deadline Item 1 */}
              <div className="p-3.5 rounded-xl bg-slate-100 border border-amber-500/40 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-black block">
                    {t.calendar.vatDeadlineTitle}
                  </span>
                  <div className="flex items-center space-x-1.5 text-[11px] text-amber-700 font-semibold">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>August 15, 2026</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-800 text-xs font-bold border border-amber-500/40">
                  15 {t.dashboard.deadlineDaysLeft}
                </span>
              </div>

              {/* Deadline Item 2 */}
              <div className="p-3.5 rounded-xl bg-slate-100 border border-emerald-500/40 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-black block">
                    {t.calendar.tradeDeadlineTitle}
                  </span>
                  <div className="flex items-center space-x-1.5 text-[11px] text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>June 30, 2027</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-800 text-xs font-bold border border-emerald-500/40">
                  OK
                </span>
              </div>

              {/* Deadline Item 3 */}
              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-black block">
                    {t.calendar.taxDeadlineTitle}
                  </span>
                  <div className="flex items-center space-x-1.5 text-[11px] text-slate-700 font-semibold">
                    <Clock className="w-3 h-3 text-slate-600" />
                    <span>November 30, 2026</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300">
                  122 {t.dashboard.deadlineDaysLeft}
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
