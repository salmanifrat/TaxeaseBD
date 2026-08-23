'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { UserProfile, updateUserProfile, apiFetch } from '@/lib/api';
import {
  User,
  Building2,
  FileText,
  Save,
  Edit3,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  UploadCloud,
  File,
  AlertCircle,
  Check,
  Info,
  CreditCard,
  Phone,
  MapPin
} from 'lucide-react';

interface ProfileViewProps {
  user: UserProfile | null;
  onUpdateUser: (updatedUser: UserProfile) => void;
  setActiveTab: (tab: string) => void;
}

interface RequiredDocDef {
  id: string;
  name: string;
  category: 'tin_nid' | 'license_cert' | 'bank_ledger';
  pts: number;
  description: string;
}

const DOC_REQUIREMENTS_BY_ENTITY: Record<string, RequiredDocDef[]> = {
  individual: [
    { id: 'tin_cert', name: '12-Digit e-TIN Certificate', category: 'tin_nid', pts: 30, description: 'Official NBR e-TIN registration certificate PDF' },
    { id: 'nid_passport', name: 'NID Card / Passport Copy', category: 'tin_nid', pts: 15, description: 'National ID card (Front & Back) or valid Passport' },
    { id: 'bank_salary', name: 'Bank Statement / Salary Slip', category: 'bank_ledger', pts: 15, description: 'Last 6 months bank statement or official salary cert' },
    { id: 'psr_acknowledgment', name: 'Proof of Return Submission (PSR)', category: 'license_cert', pts: 40, description: 'Ack receipt under Income Tax Act 2023 Sec 184' },
  ],
  sole_proprietorship: [
    { id: 'tin_cert', name: 'Sole Proprietor e-TIN Certificate', category: 'tin_nid', pts: 25, description: 'NBR e-TIN certificate for business owner' },
    { id: 'trade_license', name: 'City Corp Trade License Copy', category: 'license_cert', pts: 25, description: 'Valid DSCC/DNCC/Municipality Trade License' },
    { id: 'vat_bin', name: 'VAT BIN Certificate (Form Mushak-2.1)', category: 'license_cert', pts: 25, description: 'NBR VAT registration certificate (9/13 digit BIN)' },
    { id: 'nid_owner', name: 'Owner NID / Passport Copy', category: 'tin_nid', pts: 15, description: 'National ID copy of proprietor' },
    { id: 'bank_statement', name: 'Business Bank Statement / Solvency', category: 'bank_ledger', pts: 10, description: 'Current account bank statement or solvency cert' },
  ],
  partnership: [
    { id: 'tin_firm', name: 'Partnership Firm e-TIN Certificate', category: 'tin_nid', pts: 20, description: 'Firm 12-digit e-TIN certificate from NBR' },
    { id: 'partnership_deed', name: 'Registered Partnership Deed', category: 'license_cert', pts: 25, description: 'Executed and stamped partnership agreement deed' },
    { id: 'trade_license', name: 'Valid Trade License', category: 'license_cert', pts: 20, description: 'Annual Trade License from local City Corporation' },
    { id: 'vat_bin', name: 'VAT BIN Certificate (Form Mushak-2.1)', category: 'license_cert', pts: 20, description: 'Official NBR VAT BIN certificate' },
    { id: 'partners_nid', name: 'Partners NID & TIN Copies', category: 'tin_nid', pts: 10, description: 'NID and e-TIN copies of all managing partners' },
    { id: 'bank_statement', name: 'Firm Bank Solvency Statement', category: 'bank_ledger', pts: 5, description: 'Firm bank account statement or solvency letter' },
  ],
  private_limited_company: [
    { id: 'company_tin', name: 'Company e-TIN Certificate', category: 'tin_nid', pts: 20, description: 'Corporate e-TIN registration certificate' },
    { id: 'rjsc_incorp', name: 'RJSC Incorporation Certificate (Form C)', category: 'license_cert', pts: 25, description: 'Certificate of Incorporation issued by RJSC' },
    { id: 'moa_aoa', name: 'Memorandum & Articles of Association (MoA)', category: 'license_cert', pts: 20, description: 'RJSC certified MoA & AoA documents' },
    { id: 'vat_bin', name: 'VAT BIN Certificate (Form Mushak-2.1)', category: 'license_cert', pts: 15, description: 'Company 13-digit NBR VAT BIN certificate' },
    { id: 'trade_license', name: 'City Corporation Trade License', category: 'license_cert', pts: 10, description: 'Commercial Trade License copy' },
    { id: 'audit_bank', name: 'Annual CA Audit Report / Bank Statement', category: 'bank_ledger', pts: 10, description: 'Audited financial statements or bank statement' },
  ],
};

interface UploadedDocState {
  docId: string;
  filename: string;
  uploadedAt: string;
  size: string;
  status: 'Verified' | 'Pending';
}

const STORAGE_VAULT_KEY = 'taxeasebd_document_vault';

export default function ProfileView({ user, onUpdateUser }: ProfileViewProps) {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile Form State
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: user?.name || '',
    email: user?.email || '',
    tin: user?.tin || '',
    entity_type: user?.entity_type || 'individual',
    phone: user?.phone || '',
    company_name: user?.company_name || '',
    business_address: user?.business_address || '',
    nid: user?.nid || '',
    tax_zone: user?.tax_zone || '',
  });

  // Vault State
  const [uploadedVault, setUploadedVault] = useState<Record<string, UploadedDocState>>({});
  const [targetDocForUpload, setTargetDocForUpload] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        tin: user.tin || '',
        entity_type: user.entity_type || 'individual',
        phone: user.phone || '',
        company_name: user.company_name || '',
        business_address: user.business_address || '',
        nid: user.nid || '',
        tax_zone: user.tax_zone || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_VAULT_KEY);
    if (raw) {
      try {
        setUploadedVault(JSON.parse(raw));
        return;
      } catch {}
    }
    const defaultSeed: Record<string, UploadedDocState> = {
      tin_cert: { docId: 'tin_cert', filename: 'etin_certificate_2026.pdf', uploadedAt: '2026-08-01', size: '1.2 MB', status: 'Verified' },
      nid_passport: { docId: 'nid_passport', filename: 'nid_card_front_back.pdf', uploadedAt: '2026-08-02', size: '850 KB', status: 'Verified' },
      bank_salary: { docId: 'bank_salary', filename: 'bank_statement_6months.pdf', uploadedAt: '2026-08-05', size: '2.4 MB', status: 'Verified' },
    };
    setUploadedVault(defaultSeed);
    localStorage.setItem(STORAGE_VAULT_KEY, JSON.stringify(defaultSeed));
  }, []);

  const saveVaultState = (newVault: Record<string, UploadedDocState>) => {
    setUploadedVault(newVault);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_VAULT_KEY, JSON.stringify(newVault));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const updated = await updateUserProfile(formData);
      onUpdateUser(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const entityTypeKey = formData.entity_type || user?.entity_type || 'individual';
  const requiredDocs = DOC_REQUIREMENTS_BY_ENTITY[entityTypeKey] || DOC_REQUIREMENTS_BY_ENTITY.individual;

  let tinNidEarned = 0;
  let tinNidMax = 0;
  let licenseCertEarned = 0;
  let licenseCertMax = 0;
  let bankLedgerEarned = 0;
  let bankLedgerMax = 0;

  requiredDocs.forEach((doc) => {
    if (doc.category === 'tin_nid') {
      tinNidMax += doc.pts;
      if (uploadedVault[doc.id]) tinNidEarned += doc.pts;
    } else if (doc.category === 'license_cert') {
      licenseCertMax += doc.pts;
      if (uploadedVault[doc.id]) licenseCertEarned += doc.pts;
    } else if (doc.category === 'bank_ledger') {
      bankLedgerMax += doc.pts;
      if (uploadedVault[doc.id]) bankLedgerEarned += doc.pts;
    }
  });

  const totalEarned = tinNidEarned + licenseCertEarned + bankLedgerEarned;
  const totalMax = tinNidMax + licenseCertMax + bankLedgerMax;
  const totalPercentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

  const triggerFileUpload = (docId?: string) => {
    setTargetDocForUpload(docId || null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFile(files[0]);
  };

  const processFile = (file: File) => {
    let docIdToAssign = targetDocForUpload;
    if (!docIdToAssign) {
      const missingDoc = requiredDocs.find((d) => !uploadedVault[d.id]);
      docIdToAssign = missingDoc ? missingDoc.id : requiredDocs[0].id;
    }

    const newVault = {
      ...uploadedVault,
      [docIdToAssign]: {
        docId: docIdToAssign,
        filename: file.name,
        uploadedAt: new Date().toISOString().split('T')[0],
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        status: 'Verified' as const,
      },
    };
    saveVaultState(newVault);
    setTargetDocForUpload(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveDoc = (docId: string) => {
    const updated = { ...uploadedVault };
    delete updated[docId];
    saveVaultState(updated);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* TOP BANNER: How is your Compliance Score calculated? */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-[#A3D1E0] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[rgba(0,119,179,0.08)] text-[#0077B3]">
              <Info className="w-5 h-5" />
            </div>
            <h2 className="text-lg md:text-xl font-extrabold text-[#0077B3]">
              {language === 'bn' ? 'আপনার কমপ্লায়েন্স স্কোর কীভাবে হিসাব করা হয়?' : 'How is your Compliance Score calculated?'}
            </h2>
          </div>
          <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-[rgba(0,119,179,0.08)] text-[#0077B3] border border-[#A3D1E0] self-start sm:self-auto">
            {totalPercentage >= 80 ? 'Excellent - Low Audit Risk' : totalPercentage >= 50 ? 'Moderate - Medium Risk' : 'Needs Action - High Risk'}
          </span>
        </div>

        <p className="text-xs md:text-sm text-[#2E5369] leading-relaxed max-w-4xl font-medium">
          {language === 'bn'
            ? 'আপনার কমপ্লায়েন্স স্কোরটি জাতীয় রাজস্ব বোর্ড (NBR) এবং সিটি কর্পোরেশনের সত্যায়িত ডকুমেন্টের ভিত্তিতে তৈরি। প্রয়োজনীয় সার্টিফিকেট আপলোড করলে আপনার স্কোর বৃদ্ধি পাবে এবং অডিটের ঝুঁকি হ্রাস পাবে।'
            : 'Your Compliance Score is calculated based on verified NBR & City Corporation document submissions. Uploading required certificates improves your rating and lowers your estimated NBR audit risk.'}
        </p>

        {/* 3 Progress Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Card 1: e-TIN & NID */}
          <div className="bg-[#FFFFFF] rounded-xl p-4 space-y-2 border border-[#A3D1E0] shadow-sm">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-[#0D2233]">e-TIN &amp; NID Verification</span>
              <span className="text-[#0077B3]">{tinNidEarned} / {tinNidMax} Pts Max</span>
            </div>
            <div className="w-full h-2.5 bg-[#D1E8E2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0077B3] transition-all duration-500 rounded-full"
                style={{ width: `${tinNidMax > 0 ? (tinNidEarned / tinNidMax) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Card 2: Trade License & Certificates */}
          <div className="bg-[#FFFFFF] rounded-xl p-4 space-y-2 border border-[#A3D1E0] shadow-sm">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-[#0D2233]">Trade License &amp; Certificates</span>
              <span className="text-[#1AABA8]">{licenseCertEarned} / {licenseCertMax} Pts Max</span>
            </div>
            <div className="w-full h-2.5 bg-[#D1E8E2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1AABA8] transition-all duration-500 rounded-full"
                style={{ width: `${licenseCertMax > 0 ? (licenseCertEarned / licenseCertMax) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Card 3: Bank Statement & Ledgers */}
          <div className="bg-[#FFFFFF] rounded-xl p-4 space-y-2 border border-[#A3D1E0] shadow-sm">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-[#0D2233]">Bank Statement &amp; Ledgers</span>
              <span className="text-[#E05C2E]">{bankLedgerEarned} / {bankLedgerMax} Pts Max</span>
            </div>
            <div className="w-full h-2.5 bg-[#D1E8E2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E05C2E] transition-all duration-500 rounded-full"
                style={{ width: `${bankLedgerMax > 0 ? (bankLedgerEarned / bankLedgerMax) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN MAIN CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Update Taxpayer Information */}
        <div className="lg:col-span-5 glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-6 flex flex-col">
          <div className="flex items-center space-x-2 border-b border-[#A3D1E0]/50 pb-4">
            <User className="w-5 h-5 text-[#0077B3]" />
            <h3 className="text-base font-extrabold text-[#0077B3]">Update Taxpayer Information</h3>
          </div>

          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Taxpayer profile changes updated successfully!</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4 flex-1">
            {/* Full Name / Proprietor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E5369]">Full Name / Proprietor</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Salman Ifrat"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0] focus:outline-none focus:ring-2 focus:ring-[#0077B3]"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E5369]">Email Address</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="salmanifu@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F0F8FF] text-[#2E5369] font-medium text-sm border border-[#A3D1E0]"
              />
            </div>

            {/* 12-Digit e-TIN Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E5369]">12-Digit e-TIN Number</label>
              <input
                type="text"
                value={formData.tin || ''}
                onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
                placeholder="8293-1029-4720"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0077B3] font-mono font-bold text-sm border border-[#A3D1E0] focus:outline-none focus:ring-2 focus:ring-[#0077B3]"
              />
            </div>

            {/* Taxpayer Entity Type Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#2E5369]">Taxpayer Entity Type</label>
              <select
                value={formData.entity_type || 'individual'}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0] focus:outline-none focus:ring-2 focus:ring-[#0077B3]"
              >
                <option value="individual">Individual Taxpayer</option>
                <option value="sole_proprietorship">Sole Proprietorship</option>
                <option value="partnership">Partnership Firm</option>
                <option value="private_limited_company">Private Limited Company (LLC)</option>
              </select>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#0077B3] hover:bg-[#005f8e] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{loading ? 'Saving...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: Document Vault & Verification Uploads */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-5">
            <div className="flex items-center justify-between border-b border-[#A3D1E0]/50 pb-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-[#0077B3]" />
                <h3 className="text-base font-extrabold text-[#0077B3]">Document Vault &amp; Verification Uploads</h3>
              </div>
              <span className="px-3.5 py-1 rounded-full text-xs font-extrabold bg-[rgba(0,119,179,0.08)] text-[#0077B3] border border-[#A3D1E0]">
                {totalEarned} / {totalMax} Pts Earned
              </span>
            </div>

            {/* DRAG & DROP UPLOAD ZONE */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => triggerFileUpload()}
              className={`p-8 rounded-2xl bg-[rgba(0,119,179,0.04)] border-2 border-dashed cursor-pointer transition-all text-center space-y-3 ${
                dragActive ? 'border-[#0077B3] bg-[rgba(0,119,179,0.08)] scale-[1.01]' : 'border-[#A3D1E0] hover:border-[#0077B3]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#A3D1E0] flex items-center justify-center mx-auto text-[#0077B3] shadow-sm">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0D2233]">Upload New Tax, TIN, or License Document</h4>
                <p className="text-xs text-[#5B7D91] mt-1 font-medium">Drag &amp; drop file here or click to browse (PDF, PNG, JPG up to 15MB)</p>
              </div>
            </div>

            {/* DYNAMIC DOCUMENT CARDS GRID */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-extrabold text-[#5B7D91] uppercase tracking-wider block">
                Required Certificates for {entityTypeKey.replace('_', ' ')}
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {requiredDocs.map((doc) => {
                  const uploaded = uploadedVault[doc.id];
                  return (
                    <div
                      key={doc.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                        uploaded
                          ? 'bg-white text-[#0D2233] border-[#A3D1E0] shadow-sm'
                          : 'bg-[#F0F8FF]/60 text-[#2E5369] border-[#A3D1E0] border-dashed'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="text-xs font-bold text-[#0D2233] leading-tight">{doc.name}</h5>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#0077B3] border border-blue-200">
                            +{doc.pts} Pts
                          </span>
                        </div>
                        {uploaded ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <button
                            onClick={() => triggerFileUpload(doc.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#0077B3] text-white font-bold text-[10px] hover:bg-[#005f8e] shadow-sm"
                          >
                            Upload
                          </button>
                        )}
                      </div>

                      {uploaded ? (
                        <div className="pt-2 border-t border-[#A3D1E0]/50 flex items-center justify-between text-[11px] text-[#2E5369]">
                          <div className="flex items-center space-x-1.5 truncate max-w-[170px]">
                            <File className="w-3.5 h-3.5 text-[#0077B3] shrink-0" />
                            <span className="truncate font-mono">{uploaded.filename}</span>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className="text-[10px] font-bold text-emerald-700">Verified</span>
                            <button
                              onClick={() => handleRemoveDoc(doc.id)}
                              title="Remove Document"
                              className="text-[#5B7D91] hover:text-red-600 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#5B7D91] font-medium">{doc.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* BOTTOM STATUTORY COMPLIANCE TIP ALERT */}
            <div className="p-4 rounded-xl bg-[#FFF8F5] border border-[#FCD3C1] text-[#7C2D12] text-xs flex items-start space-x-3 leading-relaxed">
              <AlertCircle className="w-5 h-5 text-[#E05C2E] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#E05C2E]">Compliance Tip:</strong> Submitting your e-TIN &amp; Return documents before November 30 waives 10% statutory late filing penalties under NBR Section 214.
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
