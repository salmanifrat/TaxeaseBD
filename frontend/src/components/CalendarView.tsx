'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import {
  CalendarDays,
  Send,
  Download,
  Clock,
  CheckCircle2,
  X,
  Smartphone,
} from 'lucide-react';

interface Deadline {
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
  due_date: string;
  category: string;
  status: 'urgent' | 'upcoming' | 'valid';
}

// Real day-count from today, matching what the backend used to compute
// `status` - replaces the hardcoded "15 Days Left" that never changed.
function daysUntil(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_TONE: Record<Deadline['status'], { border: string; badgeBg: string; badgeText: string; icon: typeof Clock }> = {
  urgent: { border: 'border-amber-500/40', badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-700', icon: Clock },
  upcoming: { border: 'border-blue-500/40', badgeBg: 'bg-blue-500/20', badgeText: 'text-blue-700', icon: Clock },
  valid: { border: 'border-emerald-500/40', badgeBg: 'bg-emerald-500/20', badgeText: 'text-emerald-700', icon: CheckCircle2 },
};

export default function CalendarView() {
  const { t, language } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);

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
    // Built from the real next-occurrence deadlines, not a fixed date
    // that would go stale exactly like the on-screen cards used to.
    const toIcsDate = (d: string) => d.replace(/-/g, '') + 'T090000Z';
    const events = deadlines
      .map((d) => `BEGIN:VEVENT
SUMMARY:${language === 'bn' ? d.title_bn : d.title_en}
DESCRIPTION:${language === 'bn' ? d.description_bn : d.description_en}
DTSTART:${toIcsDate(d.due_date)}
DTEND:${toIcsDate(d.due_date)}
END:VEVENT`)
      .join('\n');

    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TaxEaseBD//NONSGML Compliance Calendar//EN
${events}
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
        {deadlines.length === 0 && (
          <p className="text-sm text-slate-500">
            {language === 'bn' ? 'কোনো আসন্ন সময়সীমা পাওয়া যায়নি।' : 'No upcoming deadlines found.'}
          </p>
        )}
        {deadlines.map((d, i) => {
          const tone = STATUS_TONE[d.status] ?? STATUS_TONE.valid;
          const Icon = tone.icon;
          const days = daysUntil(d.due_date);
          return (
            <div key={i} className={`glass-card p-6 rounded-2xl border relative overflow-hidden ${tone.border}`}>
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold border ${tone.badgeBg} ${tone.badgeText} ${tone.border}`}>
                  {d.category}
                </span>
                <Icon className={`w-5 h-5 ${tone.badgeText}`} />
              </div>

              <h3 className="text-lg font-bold text-black mt-4">{language === 'bn' ? d.title_bn : d.title_en}</h3>
              <p className="text-xs text-slate-700 mt-2 leading-relaxed">{language === 'bn' ? d.description_bn : d.description_en}</p>

              <div className="mt-6 pt-4 border-t border-slate-300 flex items-center justify-between text-xs">
                <span className="text-slate-600">{d.due_date}</span>
                <span className={`font-bold ${tone.badgeText}`}>
                  {days >= 0
                    ? `${days} ${t.dashboard.deadlineDaysLeft}`
                    : (language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue')}
                </span>
              </div>
            </div>
          );
        })}
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
                <p className="text-xs text-slate-500">Greenweb SMS Gateway API</p>
              </div>
            </div>

            {/* Bangla SMS Preview Box */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">{t.calendar.smsPreview}</span>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 font-bengali text-xs text-emerald-300 leading-relaxed">
                {t.calendar.smsText}
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
