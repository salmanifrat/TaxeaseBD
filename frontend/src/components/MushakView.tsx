'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import {
  Receipt,
  Download,
  Plus,
  FileSpreadsheet,
  Upload,
  Loader2,
} from 'lucide-react';

interface Transaction {
  id: string;
  date: string;
  invoiceNo: string;
  customerName: string;
  item: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  inputCredit: number;
}

export default function MushakView() {
  const { t, language } = useLanguage();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/mushak/transactions')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTransactions(data.map((tx: any) => ({
            id: String(tx.id),
            date: tx.date,
            invoiceNo: tx.invoiceNo,
            customerName: tx.customerName,
            item: tx.item,
            amount: tx.amount,
            vatRate: tx.vatRate,
            vatAmount: tx.vatAmount,
            inputCredit: tx.inputCredit,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Computed Totals
  const totalSales = transactions.reduce((acc, curr) => acc + curr.amount, 0);
  const totalVatCollected = transactions.reduce((acc, curr) => acc + curr.vatAmount, 0);
  const totalInputCredit = transactions.reduce((acc, curr) => acc + curr.inputCredit, 0);
  const netPayableNbr = totalVatCollected - totalInputCredit;

  const handleAddSample = async () => {
    const payload = {
      transaction_date: '2026-07-28',
      invoice_no: `INV-2026-00${transactions.length + 1}`,
      customer_name: 'Chaldal Limited BIN: 008192019',
      item_description: 'E-Commerce Solution Maintenance',
      amount: 200000,
      vat_rate: 15,
      input_credit: 10000,
    };
    try {
      const res = await apiFetch('/api/mushak/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        setTransactions((prev) => [...prev, {
          id: String(saved.id),
          date: saved.date,
          invoiceNo: saved.invoiceNo,
          customerName: saved.customerName,
          item: saved.item,
          amount: saved.amount,
          vatRate: saved.vatRate,
          vatAmount: saved.vatAmount,
          inputCredit: saved.inputCredit,
        }]);
        return;
      }
    } catch {}

    const newTx: Transaction = {
      id: String(Date.now()),
      date: '2026-07-28',
      invoiceNo: `INV-2026-00${transactions.length + 1}`,
      customerName: 'Chaldal Limited BIN: 008192019',
      item: 'E-Commerce Solution Maintenance',
      amount: 200000,
      vatRate: 15,
      vatAmount: 30000,
      inputCredit: 10000,
    };
    setTransactions([...transactions, newTx]);
  };


  // Real CSV upload: parses date,invoiceNo,customerName,item,amount,vatRate,inputCredit
  // rows and appends them, computing vatAmount = amount * vatRate / 100. This
  // used to not exist at all - "Upload CSVs" was described in the SRS but had
  // no file input anywhere in the app.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');

    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
      if (rows.length < 2) throw new Error('empty');

      const header = rows[0].split(',').map((h) => h.trim().toLowerCase());
      const required = ['date', 'invoiceno', 'customername', 'item', 'amount', 'vatrate'];
      const missing = required.filter((c) => !header.includes(c));
      if (missing.length) {
        setUploadError(
          language === 'bn'
            ? `CSV এ এই কলামগুলো নেই: ${missing.join(', ')}। প্রত্যাশিত: date,invoiceNo,customerName,item,amount,vatRate,inputCredit`
            : `CSV is missing columns: ${missing.join(', ')}. Expected header: date,invoiceNo,customerName,item,amount,vatRate,inputCredit`
        );
        return;
      }

      const idx = (name: string) => header.indexOf(name);
      const parsed: Transaction[] = rows.slice(1).map((row, i) => {
        const cols = row.split(',').map((c) => c.trim());
        const amount = parseFloat(cols[idx('amount')]) || 0;
        const vatRate = parseFloat(cols[idx('vatrate')]) || 0;
        const inputCreditIdx = idx('inputcredit');
        return {
          id: `csv-${Date.now()}-${i}`,
          date: cols[idx('date')] || '',
          invoiceNo: cols[idx('invoiceno')] || '',
          customerName: cols[idx('customername')] || '',
          item: cols[idx('item')] || '',
          amount,
          vatRate,
          vatAmount: Math.round(amount * (vatRate / 100)),
          inputCredit: inputCreditIdx >= 0 ? (parseFloat(cols[inputCreditIdx]) || 0) : 0,
        };
      });

      setTransactions((prev) => [...prev, ...parsed]);
    } catch {
      setUploadError(
        language === 'bn'
          ? 'CSV পড়া যায়নি। ফাইলটি সঠিক ফরম্যাটে আছে কিনা যাচাই করুন।'
          : "Couldn't read that CSV. Please check the file format."
      );
    }
  };

  // Real CSV export (opens correctly in Excel) - this used to be
  // alert("...successfully generated & downloaded.") with no file produced.
  const handleExportCsv = () => {
    const header = ['Date', 'Invoice No', 'Customer / BIN', 'Item', 'Amount (BDT)', 'VAT Rate (%)', 'VAT Amount (BDT)', 'Input Credit (BDT)'];
    const rows = transactions.map((tx) => [tx.date, tx.invoiceNo, tx.customerName, tx.item, tx.amount, tx.vatRate, tx.vatAmount, tx.inputCredit]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'TaxEaseBD_Mushak_6.3_Ledger.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
  };

  // Real PDF export of just the ledger table (not the header/buttons above it).
  //
  // This renders a plain, inline-styled offscreen copy of the table rather
  // than capturing the live styled DOM directly. html2canvas 1.4.1 can't
  // parse the oklab()/color-mix() functions Tailwind v4 generates for any
  // opacity-modifier color class (e.g. "border-slate-700/60"), and throws
  // instead of producing a canvas - which silently killed this export
  // entirely. Plain hex-styled markup sidesteps that.
  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    const snapshot = document.createElement('div');
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      snapshot.style.cssText = 'position:fixed;left:-9999px;top:0;background:#ffffff;padding:24px;width:1100px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;';
      const rowsHtml = transactions.map((tx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${tx.date}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold;font-family:monospace;">${tx.invoiceNo}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${tx.customerName}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${tx.item}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${tx.amount.toLocaleString('en-IN')}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#7e22ce;">${tx.vatAmount.toLocaleString('en-IN')}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;color:#1d4ed8;">${tx.inputCredit.toLocaleString('en-IN')}</td>
        </tr>`).join('');
      snapshot.innerHTML = `
        <h2 style="margin:0 0 4px;font-size:18px;">TaxEaseBD — Mushak 6.3 Tax Invoice Ledger</h2>
        <p style="margin:0 0 16px;font-size:12px;color:#475569;">
          Total taxable sales: BDT ${totalSales.toLocaleString('en-IN')} &nbsp;•&nbsp;
          Output VAT: BDT ${totalVatCollected.toLocaleString('en-IN')} &nbsp;•&nbsp;
          Input credit: BDT ${totalInputCredit.toLocaleString('en-IN')} &nbsp;•&nbsp;
          <strong>Net payable to NBR: BDT ${netPayableNbr.toLocaleString('en-IN')}</strong>
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px;text-align:left;">Date</th>
              <th style="padding:8px;text-align:left;">Invoice #</th>
              <th style="padding:8px;text-align:left;">Buyer / BIN</th>
              <th style="padding:8px;text-align:left;">Item</th>
              <th style="padding:8px;text-align:right;">Amount (BDT)</th>
              <th style="padding:8px;text-align:right;">VAT (BDT)</th>
              <th style="padding:8px;text-align:right;">Input Credit (BDT)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
      document.body.appendChild(snapshot);

      const canvas = await html2canvas(snapshot, { scale: 2, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 24;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight);
      pdf.save('TaxEaseBD_Mushak_6.3_Ledger.pdf');
    } finally {
      snapshot.remove();
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-semibold border border-purple-500/30 mb-2">
            <Receipt className="w-3.5 h-3.5" />
            <span>NBR VAT Act 2012 Engine</span>
          </div>
          <h1 className="text-2xl font-extrabold text-black">{t.mushak.title}</h1>
          <p className="text-sm text-slate-700 mt-1 max-w-2xl">{t.mushak.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl btn-outline-accent font-semibold text-sm transition-all flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>{language === 'bn' ? 'CSV আপলোড করুন' : 'Upload CSV'}</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-4 py-2.5 rounded-xl gradient-accent text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center space-x-2 disabled:opacity-70"
          >
            {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{t.mushak.exportPdfBtn}</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl btn-outline-accent font-semibold text-sm transition-all flex items-center space-x-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{t.mushak.exportExcelBtn}</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
          {uploadError}
        </div>
      )}

      {/* Summary Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-700/60">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            {t.mushak.totalSales}
          </span>
          <span className="text-xl font-extrabold text-slate-900 font-mono block mt-2">
            ৳ {totalSales.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Metric 2 */}
        <div className="glass-card p-5 rounded-2xl border border-purple-500/40 bg-purple-950/5">
          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block">
            {t.mushak.totalVatCollected}
          </span>
          <span className="text-xl font-extrabold text-purple-600 font-mono block mt-2">
            ৳ {totalVatCollected.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Metric 3 */}
        <div className="glass-card p-5 rounded-2xl border border-blue-500/40 bg-blue-950/5">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block">
            {t.mushak.totalInputCredit}
          </span>
          <span className="text-xl font-extrabold text-blue-600 font-mono block mt-2">
            - ৳ {totalInputCredit.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Metric 4 */}
        <div className="glass-card p-5 rounded-2xl border border-emerald-500/50 bg-emerald-950/5">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
            {t.mushak.netPayableNbr}
          </span>
          <span className="text-2xl font-extrabold text-emerald-600 font-mono block mt-2">
            ৳ {netPayableNbr.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="glass-card p-6 rounded-2xl border border-slate-700/60 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-purple-400" />
            <span>{t.mushak.mushak63Title}</span>
          </h2>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleAddSample}
              className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-700 border border-purple-500/30 text-xs font-semibold hover:bg-purple-500/30 transition-all flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.mushak.addTransactionBtn}</span>
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-600 uppercase font-mono text-[11px] border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">{t.mushak.dateCol}</th>
                <th className="py-3 px-3">{t.mushak.invoiceCol}</th>
                <th className="py-3 px-3">{t.mushak.customerCol}</th>
                <th className="py-3 px-3">{t.mushak.itemCol}</th>
                <th className="py-3 px-3 text-right">{t.mushak.amountCol}</th>
                <th className="py-3 px-3 text-right">{t.mushak.vatAmountCol}</th>
                <th className="py-3 px-3 text-right">{t.mushak.inputCreditCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-mono text-slate-500">{tx.date}</td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-900">{tx.invoiceNo}</td>
                  <td className="py-3 px-3 font-semibold text-slate-800">{tx.customerName}</td>
                  <td className="py-3 px-3 text-slate-500">{tx.item}</td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                    ৳ {tx.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-purple-600">
                    ৳ {tx.vatAmount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-blue-600">
                    ৳ {tx.inputCredit.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
