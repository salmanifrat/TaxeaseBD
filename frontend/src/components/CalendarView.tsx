'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch, loadSession } from '@/lib/api';
import { 
  CalendarDays, 
  Send, 
  Download, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  X, 
  Smartphone,
  ShieldCheck
} from 'lucide-react';

interface Deadline {
  id: number;
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
  due_date: string;
  category: string;
  status: string;
}

export default function CalendarView() {
  const { t, language } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);

  const sessionUser = typeof window !== 'undefined' ? loadSession()?.user : null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // VAT 15th monthly due date
  let vatTarget = new Date(year, month, 15);
  if (day > 15) {
    vatTarget = new Date(year, month + 1, 15);
  }
  const vatDiff = Math.max(0, Math.ceil((vatTarget.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const vatMonthName = vatTarget.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', { month: 'long' });
  const vatDateFormatted = `${vatMonthName} 15, ${vatTarget.getFullYear()}`;

  // Income Tax Day (Nov 30)
  let taxDayTarget = new Date(year, 10, 30);
  if (month > 10 || (month === 10 && day > 30)) {
    taxDayTarget = new Date(year + 1, 10, 30);
  }
  const taxDiff = Math.max(0, Math.ceil((taxDayTarget.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  // Trade License
  let tradeTargetYear = year;
  if (month > 5 || (month === 5 && day > 30)) {
    tradeTargetYear = year + 1;
  }
  const hasTradeDoc = sessionUser?.uploaded_documents?.some((d: any) => d.docId === 'license_cert' || d.filename?.toLowerCase().includes('license'));

  useEffect(() => {
    apiFetch('/api/calendar/deadlines')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDeadlines(data);
        }
      })
      .catch(() => {});
  }, []);


  const handleDownloadIcs = () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TaxEaseBD//NONSGML Compliance Calendar//EN
BEGIN:VEVENT
SUMMARY:NBR Mushak 9.1 Monthly VAT Return Deadline
DESCRIPTION:File monthly VAT return at NBR eVAT portal to avoid penalty.
DTSTART:20260815T090000Z
DTEND:20260815T170000Z
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'TaxEaseBD_Compliance_Deadlines.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 mb-2">
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Automated Regulatory Tracker</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black">{t.calendar.title}</h1>
          <p className="text-sm text-slate-700 mt-1 max-w-2xl">{t.calendar.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl gradient-accent text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>{t.calendar.sendAlertBtn}</span>
          </button>

          <button
            onClick={handleDownloadIcs}
            className="px-4 py-2.5 rounded-xl btn-outline-accent font-semibold text-sm transition-all flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>{t.calendar.syncCalendarBtn}</span>
          </button>
        </div>
      </div>

      {/* Main Deadline Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: VAT Deadline */}
        <div className="glass-card p-6 rounded-2xl border border-amber-500/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-700 font-mono text-xs font-bold border border-amber-500/30">
              {t.calendar.vatDeadlineDate}
            </span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>

          <h3 className="text-lg font-bold text-black mt-4">{t.calendar.vatDeadlineTitle}</h3>
          <p className="text-xs text-slate-700 mt-2 leading-relaxed">{t.calendar.vatDeadlineDesc}</p>

          <div className="mt-6 pt-4 border-t border-slate-300 flex items-center justify-between text-xs">
            <span className="text-slate-600">Next Due: {vatDateFormatted}</span>
            <span className="font-bold text-amber-700">{vatDiff === 0 ? 'Due Today!' : `${vatDiff} Days Left`}</span>
          </div>
        </div>

        {/* Card 2: Trade License Deadline */}
        <div className="glass-card p-6 rounded-2xl border border-emerald-500/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-700 font-mono text-xs font-bold border border-emerald-500/30">
              {t.calendar.tradeDeadlineDate}
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>

          <h3 className="text-lg font-bold text-black mt-4">{t.calendar.tradeDeadlineTitle}</h3>
          <p className="text-xs text-slate-700 mt-2 leading-relaxed">{t.calendar.tradeDeadlineDesc}</p>

          <div className="mt-6 pt-4 border-t border-slate-300 flex items-center justify-between text-xs">
            <span className="text-slate-600">Status: {hasTradeDoc ? 'Valid (Uploaded)' : 'June 30 Renewal'}</span>
            <span className="font-bold text-emerald-700">June 30, {tradeTargetYear}</span>
          </div>
        </div>

        {/* Card 3: Income Tax Return */}
        <div className="glass-card p-6 rounded-2xl border border-blue-500/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-700 font-mono text-xs font-bold border border-blue-500/30">
              {t.calendar.taxDeadlineDate}
            </span>
            <Clock className="w-5 h-5 text-blue-600" />
          </div>

          <h3 className="text-lg font-bold text-black mt-4">{t.calendar.taxDeadlineTitle}</h3>
          <p className="text-xs text-slate-700 mt-2 leading-relaxed">{t.calendar.taxDeadlineDesc}</p>

          <div className="mt-6 pt-4 border-t border-slate-300 flex items-center justify-between text-xs">
            <span className="text-slate-600">Tax Day: Nov 30</span>
            <span className="font-bold text-blue-700">{taxDiff} Days Left</span>
          </div>
        </div>
      </div>


      {/* Simulated Alert Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-card max-w-lg w-full p-6 rounded-2xl border border-emerald-500/40 space-y-5 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-900"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 border-b border-slate-700/60 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{t.calendar.modalTitle}</h3>
                <p className="text-xs text-slate-500">Greenweb SMS & WhatsApp Gateway API</p>
              </div>
            </div>

            {/* Bangla SMS Preview Box */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">{t.calendar.smsPreview}</span>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 font-bengali text-xs text-emerald-300 leading-relaxed">
                {t.calendar.smsText}
              </div>
            </div>

            {/* WhatsApp Message Preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">{t.calendar.whatsappPreview}</span>
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 font-bengali text-xs text-slate-200 leading-relaxed flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-emerald-400 block mb-1">TaxEaseBD Verified Bot:</span>
                  <span>{t.calendar.smsText}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full py-2.5 rounded-xl gradient-emerald text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
