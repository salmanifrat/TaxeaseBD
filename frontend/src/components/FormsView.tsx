'use client';

import React, { useEffect, useState, useId, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import {
  FileCheck2,
  Download,
  Eye,
  Building,
  CheckCircle2,
  Award,
  Sparkles,
  Loader2,
} from 'lucide-react';

export default function FormsView() {
  const { t, language } = useLanguage();

  const formTypeId = useId();
  const busNameBnId = useId();
  const busNameEnId = useId();
  const nidId = useId();
  const tinId = useId();
  const ownerAddrId = useId();
  const busAddrId = useId();
  const capitalId = useId();

  // Form State - start blank to allow user's own custom inputs
  const [formType, setFormType] = useState<'formK' | 'vat1' | 'tradeForm'>('formK');
  const [businessNameBn, setBusinessNameBn] = useState<string>('');
  const [businessNameEn, setBusinessNameEn] = useState<string>('');
  const [nidNumber, setNidNumber] = useState<string>('');
  const [tinNumber, setTinNumber] = useState<string>('');
  const [ownerAddress, setOwnerAddress] = useState<string>('');
  const [businessAddress, setBusinessAddress] = useState<string>('');
  const [paidUpCapital, setPaidUpCapital] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);



  // Points only at the official document preview (the light "paper" box
  // below) - NOT the left-hand input parameters column. This used to be
  // window.print(), which printed the whole page (parameters included);
  // now the PDF contains exactly what a government office would receive.
  const formPreviewRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    const node = formPreviewRef.current;
    if (!node || isExporting) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const imgData = canvas.toDataURL('image/png');
      if (imgHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      } else {
        // Long form: tile across multiple pages instead of squashing it.
        let heightLeft = imgHeight;
        let position = margin;
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - margin * 2);
        while (heightLeft > 0) {
          position = heightLeft - imgHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= (pageHeight - margin * 2);
        }
      }

      pdf.save(`TaxEaseBD_${formType}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold border border-blue-500/30 mb-2">
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Official RJSC & NBR Template Engine</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black">{t.forms.title}</h1>
          <p className="text-sm text-slate-700 mt-1 max-w-2xl">{t.forms.subtitle}</p>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={isExporting}
          className="px-5 py-2.5 rounded-xl gradient-accent text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2 whitespace-nowrap disabled:opacity-70"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span>{isExporting ? (language === 'bn' ? 'তৈরি হচ্ছে...' : 'Generating...') : t.forms.downloadPdfBtn}</span>
        </button>
      </div>

      {/* Main Layout: Form Inputs (Left) & Official Document Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Input Fields */}
        <div className="lg:col-span-5 glass-card p-6 rounded-2xl border border-slate-700/60 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-700/60 pb-3 flex items-center space-x-2">
            <Building className="w-5 h-5 text-blue-400" />
            <span>{language === 'bn' ? 'তথ্য প্রদান করুন' : 'Enter Form Parameters'}</span>
          </h2>

          {/* Select Form Type */}
          <div className="space-y-1.5">
            <label htmlFor={formTypeId} className="text-xs font-semibold text-slate-600">{t.forms.selectForm}</label>
            <select
              id={formTypeId}
              value={formType}
              onChange={(e) => setFormType(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-semibold text-emerald-400"
            >
              <option value="formK" className="bg-slate-900 text-white">{t.forms.formK}</option>
              <option value="vat1" className="bg-slate-900 text-white">{t.forms.vat1}</option>
              <option value="tradeForm" className="bg-slate-900 text-white">{t.forms.tradeForm}</option>
            </select>
          </div>

          {/* Business Name (Bn) */}
          <div className="space-y-1.5">
            <label htmlFor={busNameBnId} className="text-xs font-semibold text-slate-600">{t.forms.businessNameBn}</label>
            <input
              id={busNameBnId}
              type="text"
              value={businessNameBn}
              onChange={(e) => setBusinessNameBn(e.target.value)}
              placeholder="বাংলায় প্রতিষ্ঠানের নাম লিখুন..."
              className="w-full px-3 py-2 rounded-xl glass-input text-sm font-bengali"
            />
          </div>

          {/* Business Name (En) */}
          <div className="space-y-1.5">
            <label htmlFor={busNameEnId} className="text-xs font-semibold text-slate-600">{t.forms.businessNameEn}</label>
            <input
              id={busNameEnId}
              type="text"
              value={businessNameEn}
              onChange={(e) => setBusinessNameEn(e.target.value)}
              placeholder="Enter Company / Business Name in English..."
              className="w-full px-3 py-2 rounded-xl glass-input text-sm font-medium"
            />
          </div>

          {/* NID & TIN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={nidId} className="text-xs font-semibold text-slate-600">{t.forms.nidNumber}</label>
              <input
                id={nidId}
                type="text"
                value={nidNumber}
                onChange={(e) => setNidNumber(e.target.value)}
                placeholder="NID Number (e.g. 1994...)"
                className="w-full px-3 py-2 rounded-xl glass-input text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={tinId} className="text-xs font-semibold text-slate-600">{t.forms.tinNumber}</label>
              <input
                id={tinId}
                type="text"
                value={tinNumber}
                onChange={(e) => setTinNumber(e.target.value)}
                placeholder="12-digit E-TIN Number..."
                className="w-full px-3 py-2 rounded-xl glass-input text-xs font-mono"
              />
            </div>
          </div>

          {/* Business Address */}
          <div className="space-y-1.5">
            <label htmlFor={busAddrId} className="text-xs font-semibold text-slate-600">{t.forms.businessAddress}</label>
            <input
              id={busAddrId}
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="ব্যবসার সম্পূর্ণ ঠিকানা লিখুন..."
              className="w-full px-3 py-2 rounded-xl glass-input text-xs font-bengali"
            />
          </div>

          {/* Owner Address */}
          <div className="space-y-1.5">
            <label htmlFor={ownerAddrId} className="text-xs font-semibold text-slate-600">{t.forms.ownerAddress}</label>
            <input
              id={ownerAddrId}
              type="text"
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              placeholder="মালিকের বর্তমান ও স্থায়ী ঠিকানা..."
              className="w-full px-3 py-2 rounded-xl glass-input text-xs font-bengali"
            />
          </div>

          {/* Paid-Up Capital */}
          <div className="space-y-1.5">
            <label htmlFor={capitalId} className="text-xs font-semibold text-slate-600">{t.forms.paidUpCapital}</label>
            <input
              id={capitalId}
              type="number"
              value={paidUpCapital}
              onChange={(e) => setPaidUpCapital(e.target.value)}
              placeholder="Enter Paid-Up Capital in BDT..."
              className="w-full px-3 py-2 rounded-xl glass-input text-xs font-mono"
            />
          </div>
        </div>

        {/* Right Column (7 cols): Document Previewer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>{t.forms.previewHeader}</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold border border-emerald-500/30">
              Form Script: Bangla (বাংলা)
            </span>
          </div>

          {/* Official Government Form Paper Container */}
          <div ref={formPreviewRef} className="bg-slate-50 text-slate-900 p-8 rounded-2xl shadow-2xl border-4 border-slate-300 min-h-[600px] font-bengali relative overflow-hidden">
            {/* Government Crest Seal Placeholder */}
            <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
              <div className="w-14 h-14 mx-auto mb-2 rounded-full border-2 border-slate-900 flex items-center justify-center font-bold text-xs bg-slate-100">
                <Award className="w-8 h-8 text-emerald-800" />
              </div>
              
              {formType === 'formK' && (
                <>
                  <h3 className="text-lg font-bold tracking-tight">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</h3>
                  <h4 className="text-sm font-bold text-slate-700">যৌথমূলধন কোম্পানী ও ফার্মসমূহের পরিদপ্তর (RJSC)</h4>
                  <p className="text-xs font-semibold mt-1">ফরম 'কে' (কোম্পানি আইন, ১৯৯৪ এর তফসিল-১ দ্রষ্টব্য)</p>
                  <p className="text-[11px] text-slate-600">প্রাইভেট লিমিটেড কোম্পানি নিবন্ধনের আবেদনপত্র</p>
                </>
              )}

              {formType === 'vat1' && (
                <>
                  <h3 className="text-lg font-bold tracking-tight">জাতীয় রাজস্ব বোর্ড (NBR)</h3>
                  <h4 className="text-sm font-bold text-slate-700">মূল্য সংযোজন কর ও সম্পূরক শুল্ক আইন, ২০১২</h4>
                  <p className="text-xs font-semibold mt-1">ফরম "মুসক-২.১" / ভ্যাট-১ (নিবন্ধন আবেদন)</p>
                  <p className="text-[11px] text-slate-600">ব্যবসায় শনাক্তকরণ সংখ্যা (BIN) নিবন্ধনের ফরম</p>
                </>
              )}

              {formType === 'tradeForm' && (
                <>
                  <h3 className="text-lg font-bold tracking-tight">ঢাকা দক্ষিণ সিটি কর্পোরেশন</h3>
                  <h4 className="text-sm font-bold text-slate-700">রাজস্ব বিভাগ - ই-ট্রেড লাইসেন্স আবেদন</h4>
                  <p className="text-xs font-semibold mt-1">ফরম 'টিএল-১' (ব্যবসায়িক লাইসেন্স)</p>
                </>
              )}
            </div>

            {/* Serial & Application Info */}
            <div className="flex justify-between text-xs font-mono font-bold mb-6 border-b pb-2">
              <span>আবেদন নং: TEBD-2026-90812</span>
              <span>তারিখ: ৩১ জুলাই, ২০২৬</span>
            </div>

            {/* Main Form Fields Grid */}
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">১. প্রতিষ্ঠানের নাম (বাংলা):</span>
                <span className="col-span-2 font-bold text-slate-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                  {businessNameBn || '[বাংলা নাম প্রদান করুন]'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">২. Name (English):</span>
                <span className="col-span-2 font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {businessNameEn || '[Enter English Name]'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">৩. ই-টিন (E-TIN) নম্বর:</span>
                <span className="col-span-2 font-mono font-bold text-slate-900">{tinNumber || '— — — — — — — — — — — —'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">৪. মালিকের NID নম্বর:</span>
                <span className="col-span-2 font-mono font-bold text-slate-900">{nidNumber || '— — — — — — — — — — — —'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">৫. ব্যবসায়ী ঠিকানা:</span>
                <span className="col-span-2 font-semibold text-slate-900">{businessAddress || '[ব্যবসায়িক ঠিকানা প্রদান করুন]'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 border-b pb-2">
                <span className="font-bold text-slate-700">৬. পরিশোধিত মূলধন:</span>
                <span className="col-span-2 font-mono font-bold text-emerald-800">
                  {paidUpCapital ? `৳ ${Number(paidUpCapital).toLocaleString('en-IN')} টাকা` : '৳ _________________ টাকা'}
                </span>
              </div>

            </div>

            {/* Official Certification & Signature Block */}
            <div className="mt-12 pt-6 border-t-2 border-slate-900 flex justify-between items-end text-xs">
              <div className="space-y-1">
                <div className="w-16 h-16 rounded border border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-400">
                  সরকারি সিল
                </div>
                <span className="block text-[10px] text-slate-500">স্বয়ংক্রিয় কিউআর ভেরিফায়েড</span>
              </div>

              <div className="text-center space-y-1">
                <div className="w-36 border-b border-slate-900 font-mono text-xs font-bold py-1">
                  স্বাক্ষর ও তারিখ
                </div>
                <span className="block font-bold">আবেদনকারীর পূর্ণ নাম</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
