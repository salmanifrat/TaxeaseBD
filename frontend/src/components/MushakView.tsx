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

  const [showModal, setShowModal] = useState(false);
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split('T')[0],
    invoiceNo: '',
    customerName: '',
    item: '',
    amount: '',
    vatRate: '15',
    inputCredit: '0',
  });

  const handleAddCustomTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newTx.amount) || 0;
    const rate = parseFloat(newTx.vatRate) || 15;
    const credit = parseFloat(newTx.inputCredit) || 0;
    if (amt <= 0) return;

    const payload = {
      transaction_date: newTx.date,
      invoice_no: newTx.invoiceNo.trim() || `INV-${Date.now().toString().slice(-6)}`,
      customer_name: newTx.customerName.trim() || 'General Customer',
      item_description: newTx.item.trim() || 'Taxable Goods / Services',
      amount: amt,
      vat_rate: rate,
      input_credit: credit,
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
        setShowModal(false);
        setNewTx({ date: new Date().toISOString().split('T')[0], invoiceNo: '', customerName: '', item: '', amount: '', vatRate: '15', inputCredit: '0' });
        return;
      }
    } catch {}

    const vatAmt = amt * (rate / 100);
    const localTx: Transaction = {
      id: String(Date.now()),
      date: payload.transaction_date,
      invoiceNo: payload.invoice_no,
      customerName: payload.customer_name,
      item: payload.item_description,
      amount: amt,
      vatRate: rate,
      vatAmount: vatAmt,
      inputCredit: credit,
    };
    setTransactions((prev) => [...prev, localTx]);
    setShowModal(false);
    setNewTx({ date: new Date().toISOString().split('T')[0], invoiceNo: '', customerName: '', item: '', amount: '', vatRate: '15', inputCredit: '0' });
  };


  const handleClearAll = async () => {
    if (!confirm(language === 'bn' ? 'আপনি কি নিশ্চিত যে সকল চালান মুছে ফেলতে চান?' : 'Are you sure you want to clear all recorded VAT invoices?')) return;
    try {
      const res = await apiFetch('/api/mushak/transactions', { method: 'DELETE' });
      if (res.ok) {
        setTransactions([]);
      }
    } catch {}
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
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/api/mushak/upload-csv', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const fetchRes = await apiFetch('/api/mushak/transactions');
        if (fetchRes.ok) {
          const data = await fetchRes.json();
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
          return;
        }
      }
      throw new Error('Upload failed');
    } catch {
      setUploadError(
        language === 'bn'
          ? 'CSV ফাইল আপলোড করা যায়নি। ফাইলের কলামগুলো পরীক্ষা করে পুনরায় চেষ্টা করুন।'
          : "Could not upload CSV. Please ensure the CSV contains valid columns: Date, Invoice No, Customer Name, Item Description, Sales Value, VAT Rate, Input Credit."
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
          <a
            href="/sample_vat_transactions.csv"
            download="sample_vat_transactions.csv"
            className="px-3 py-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 font-semibold text-xs transition-all flex items-center space-x-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'স্যাম্পল CSV ডেমো' : 'Download Sample CSV'}</span>
          </a>
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
          {transactions.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-semibold text-xs transition-all"
            >
              {language === 'bn' ? 'সব মুছে ফেলুন' : 'Clear All Invoices'}
            </button>
          )}
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
              onClick={() => setShowModal(true)}
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
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-xs font-medium">
                    <Receipt className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-slate-700 mb-1">No VAT Sales Transactions Recorded</p>
                    <p>Click <span className="text-purple-600 font-bold">+ Add Manual Entry</span> or <span className="text-emerald-600 font-bold">Upload CSV</span> above to add real business invoices.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full border border-slate-300 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-purple-600" />
                <span>Add VAT Transaction / Invoice (Mushak 6.3)</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddCustomTransaction} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Transaction Date</label>
                  <input
                    type="date"
                    value={newTx.date}
                    onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                    className="w-full mt-1 p-2 border rounded-xl text-xs font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Invoice No.</label>
                  <input
                    type="text"
                    value={newTx.invoiceNo}
                    onChange={(e) => setNewTx({ ...newTx, invoiceNo: e.target.value })}
                    placeholder="e.g. INV-2026-001"
                    className="w-full mt-1 p-2 border rounded-xl text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Customer / Buyer Name & BIN</label>
                <input
                  type="text"
                  value={newTx.customerName}
                  onChange={(e) => setNewTx({ ...newTx, customerName: e.target.value })}
                  placeholder="e.g. Apex Footwear Ltd (BIN: 001928374)"
                  className="w-full mt-1 p-2 border rounded-xl text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Item / Service Description</label>
                <input
                  type="text"
                  value={newTx.item}
                  onChange={(e) => setNewTx({ ...newTx, item: e.target.value })}
                  placeholder="e.g. IT Consulting & Maintenance"
                  className="w-full mt-1 p-2 border rounded-xl text-xs font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Amount (BDT)</label>
                  <input
                    type="number"
                    value={newTx.amount}
                    onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                    placeholder="250000"
                    className="w-full mt-1 p-2 border rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">VAT Rate (%)</label>
                  <select
                    value={newTx.vatRate}
                    onChange={(e) => setNewTx({ ...newTx, vatRate: e.target.value })}
                    className="w-full mt-1 p-2 border rounded-xl text-xs font-medium bg-white"
                  >
                    <option value="15">15% Standard</option>
                    <option value="10">10% Reduced</option>
                    <option value="7.5">7.5% Goods</option>
                    <option value="5">5% Services</option>
                    <option value="0">0% Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Input Credit (BDT)</label>
                  <input
                    type="number"
                    value={newTx.inputCredit}
                    onChange={(e) => setNewTx({ ...newTx, inputCredit: e.target.value })}
                    placeholder="0"
                    className="w-full mt-1 p-2 border rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
