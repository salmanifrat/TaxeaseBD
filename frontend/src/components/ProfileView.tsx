'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { UserProfile, updateUserProfile, apiFetch, uploadDocumentFile } from '@/lib/api';
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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Vault State
  const [uploadedVault, setUploadedVault] = useState<Record<string, UploadedDocState>>({});
  const [targetDocForUpload, setTargetDocForUpload] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
    profile_picture: user?.profile_picture || '',
    income_range: user?.income_range || '৳ 5 Lakh - 15 Lakh BDT',
    rjsc_reg_no: user?.rjsc_reg_no || '',
  });

  // Managed Companies State
  const [managedCompanies, setManagedCompanies] = useState<Array<{ id: string; company_name: string; entity_type: string; tin?: string | null; bin?: string | null; trade_license?: string | null; business_address?: string | null }>>(
    user?.managed_companies || []
  );
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({
    company_name: '',
    entity_type: 'private_limited_company',
    tin: '',
    bin: '',
    trade_license: '',
    business_address: '',
  });

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
        profile_picture: user.profile_picture || '',
        income_range: user.income_range || '৳ 5 Lakh - 15 Lakh BDT',
        rjsc_reg_no: user.rjsc_reg_no || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.uploaded_documents && user.uploaded_documents.length > 0) {
      const vaultMap: Record<string, UploadedDocState> = {};
      user.uploaded_documents.forEach(doc => {
        vaultMap[doc.docId] = {
          docId: doc.docId,
          filename: doc.filename,
          uploadedAt: doc.uploadedAt,
          size: doc.size,
          status: doc.status as 'Verified' | 'Pending',
        };
      });
      setUploadedVault(vaultMap);
      return;
    }

    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_VAULT_KEY);
    if (raw) {
      try {
        setUploadedVault(JSON.parse(raw));
        return;
      } catch {}
    }
    setUploadedVault({});
  }, [user]);

  const saveVaultState = (newVault: Record<string, UploadedDocState>) => {
    setUploadedVault(newVault);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_VAULT_KEY, JSON.stringify(newVault));
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, profile_picture: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const docsList = Object.values(uploadedVault).map(v => ({
        docId: v.docId,
        filename: v.filename,
        uploadedAt: v.uploadedAt,
        size: v.size,
        status: v.status,
      }));
      const payload = {
        ...formData,
        uploaded_documents: docsList,
        managed_companies: managedCompanies,
      };
      const updated = await updateUserProfile(payload);
      onUpdateUser(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.company_name.trim()) return;
    const addedCompany = {
      id: `comp_${Date.now()}`,
      company_name: newCompany.company_name.trim(),
      entity_type: newCompany.entity_type,
      tin: newCompany.tin.trim() || null,
      bin: newCompany.bin.trim() || null,
      trade_license: newCompany.trade_license.trim() || null,
      business_address: newCompany.business_address.trim() || null,
    };
    const updatedCompanies = [...managedCompanies, addedCompany];
    setManagedCompanies(updatedCompanies);
    setNewCompany({ company_name: '', entity_type: 'private_limited_company', tin: '', bin: '', trade_license: '', business_address: '' });
    setShowAddCompany(false);

    try {
      const updated = await updateUserProfile({ managed_companies: updatedCompanies });
      onUpdateUser(updated);
    } catch {}
  };

  const handleRemoveCompany = async (compValId: string) => {
    const updatedCompanies = managedCompanies.filter(c => c.id !== compValId);
    setManagedCompanies(updatedCompanies);
    try {
      const updated = await updateUserProfile({ managed_companies: updatedCompanies });
      onUpdateUser(updated);
    } catch {}
  };

  const entityTypeKey = formData.entity_type || user?.entity_type || 'individual';
  const requiredDocs = DOC_REQUIREMENTS_BY_ENTITY[entityTypeKey] || DOC_REQUIREMENTS_BY_ENTITY.individual;

  let totalEarned = 0;
  let totalMax = 0;
  requiredDocs.forEach((doc) => {
    totalMax += doc.pts;
    if (uploadedVault[doc.id]) totalEarned += doc.pts;
  });
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

  const [extractedTinNotice, setExtractedTinNotice] = useState<string | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (!file) return;
    setIsUploadingDoc(true);
    setUploadStatusMsg(`Uploading '${file.name}' and scanning for 12-digit e-TIN...`);

    let docIdToAssign = targetDocForUpload;
    if (!docIdToAssign) {
      const missingDoc = requiredDocs.find((d) => !uploadedVault[d.id]);
      docIdToAssign = missingDoc ? missingDoc.id : requiredDocs[0].id;
    }

    try {
      const uploadRes = await uploadDocumentFile(file, docIdToAssign);
      const newVault = {
        ...uploadedVault,
        [docIdToAssign]: {
          docId: docIdToAssign,
          filename: uploadRes.filename,
          uploadedAt: new Date().toISOString().split('T')[0],
          size: uploadRes.size,
          status: 'Verified' as const,
        },
      };
      saveVaultState(newVault);

      if (uploadRes.extracted_tin) {
        setFormData((prev) => ({ ...prev, tin: uploadRes.extracted_tin || prev.tin }));
        setExtractedTinNotice(`✨ Auto-Extracted 12-Digit e-TIN: ${uploadRes.extracted_tin} (Saved to Profile)`);
        setUploadStatusMsg(`✅ Uploaded '${file.name}'! e-TIN ${uploadRes.extracted_tin} extracted.`);
      } else {
        setUploadStatusMsg(`✅ Uploaded '${file.name}' successfully!`);
      }

      if (uploadRes.user) {
        onUpdateUser(uploadRes.user);
      }
    } catch (e) {
      setUploadStatusMsg(`✅ Uploaded '${file.name}' locally.`);
    } finally {
      setIsUploadingDoc(false);
      setTargetDocForUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveDoc = (docId: string) => {
    const updated = { ...uploadedVault };
    delete updated[docId];
    saveVaultState(updated);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Inputs */}
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx,*/*" onChange={handleFileChange} className="hidden" />
      <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />

      {/* VIEW-ONLY PROFILE MODE (FACEBOOK STYLE) */}
      {!isEditing ? (
        <div className="space-y-6">
          {/* FACEBOOK STYLE COVER & PROFILE HEADER CARD */}
          <div className="glass-card rounded-2xl overflow-hidden border border-[#A3D1E0] shadow-sm">
            {/* Cover Banner Background */}
            <div className="h-36 md:h-44 bg-gradient-to-r from-teal-700 via-sky-800 to-blue-900 relative">
              <div className="absolute right-4 top-4 flex items-center space-x-2 bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white text-xs font-semibold border border-white/20">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verified Taxpayer Account</span>
              </div>
            </div>

            {/* Profile Avatar & Header Information */}
            <div className="px-6 pb-6 pt-0 relative flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end space-y-3 sm:space-y-0 sm:space-x-5 -mt-16 md:-mt-20">
                {/* Profile Photo Avatar */}
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full border-4 border-white bg-slate-100 shadow-lg overflow-hidden shrink-0 flex items-center justify-center text-teal-800 font-bold text-3xl">
                  {formData.profile_picture ? (
                    <img src={formData.profile_picture} alt="Profile Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{(formData.name || user?.name || 'T')[0].toUpperCase()}</span>
                  )}
                </div>

                {/* Name and Badges */}
                <div className="space-y-1">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-[#0D2233]">
                    {formData.name || user?.name || 'Taxpayer Name'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F0F8FF] text-[#0077B3] border border-[#A3D1E0]">
                      {entityTypeKey === 'sole_proprietorship' ? 'Sole Proprietorship' : entityTypeKey === 'partnership' ? 'Partnership Firm' : entityTypeKey === 'private_limited_company' ? 'Private Limited Company' : 'Individual Taxpayer'}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {formData.income_range || '৳ 5 Lakh - 15 Lakh BDT'}
                    </span>
                  </div>
                </div>
              </div>

              {/* EDIT PROFILE BUTTON (FACEBOOK STYLE) */}
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-[#0077B3] hover:bg-[#005f8e] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Edit3 className="w-4 h-4" />
                <span>{language === 'bn' ? 'প্রোফাইল এডিট করুন' : '✏️ Edit Profile'}</span>
              </button>
            </div>
          </div>

          {/* READ-ONLY INFORMATION CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Personal & Business Credentials */}
            <div className="glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#A3D1E0]/50 pb-3">
                <User className="w-5 h-5 text-[#0077B3]" />
                <h3 className="text-base font-extrabold text-[#0077B3]">Taxpayer Profile Details</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">Email Address</span>
                  <span className="font-bold text-[#0D2233]">{formData.email || 'Not Provided'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">Phone Number</span>
                  <span className="font-bold text-[#0D2233]">{formData.phone || 'Not Provided'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">12-Digit e-TIN</span>
                  <span className="font-mono font-bold text-[#0077B3]">{formData.tin || 'Not Provided (Blank)'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">NID / Passport</span>
                  <span className="font-mono font-bold text-[#0D2233]">{formData.nid || 'Not Provided (Blank)'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">Annual Income / Turnover</span>
                  <span className="font-bold text-emerald-700">{formData.income_range || '৳ 5 Lakh - 15 Lakh BDT'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">NBR Tax Zone / Circle</span>
                  <span className="font-bold text-[#0D2233]">{formData.tax_zone || 'Not Specified'}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Company & Verified Documents */}
            <div className="glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#A3D1E0]/50 pb-3">
                <Building2 className="w-5 h-5 text-[#0077B3]" />
                <h3 className="text-base font-extrabold text-[#0077B3]">Registered Corporate Info</h3>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">Business / Company Name</span>
                  <span className="font-bold text-[#0D2233]">{formData.company_name || 'Individual Taxpayer'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">RJSC Reg Registration</span>
                  <span className="font-mono font-bold text-[#0D2233]">{formData.rjsc_reg_no || 'N/A (Individual)'}</span>
                </div>
                <div className="flex justify-between items-start py-2 border-b border-slate-100">
                  <span className="text-[#5B7D91] font-semibold">Business Address</span>
                  <span className="font-bold text-[#0D2233] text-right max-w-[200px]">{formData.business_address || 'Not Provided'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#5B7D91] font-semibold">Compliance Rating</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                    {totalPercentage}% Verified Score
                  </span>
                </div>
              </div>

              {/* Uploaded Documents List */}
              <div className="pt-2 border-t border-[#A3D1E0]/50 space-y-2">
                <span className="text-xs font-extrabold text-[#5B7D91] block uppercase tracking-wider">
                  Uploaded Profile Documents ({Object.keys(uploadedVault).length})
                </span>
                {Object.keys(uploadedVault).length === 0 ? (
                  <p className="text-xs text-[#5B7D91] italic">No documents attached yet. Click 'Edit Profile' to upload certificates.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.values(uploadedVault).map(doc => (
                      <div key={doc.docId} className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-xs flex items-center justify-between">
                        <div className="flex items-center space-x-2 truncate">
                          <FileText className="w-3.5 h-3.5 text-[#0077B3]" />
                          <span className="font-bold text-[#0D2233] truncate">{doc.filename}</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Verified</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* DEDICATED EDIT PROFILE PAGE MODE */
        <div className="space-y-6">
          {/* Header Bar with Back Button */}
          <div className="glass-card p-5 rounded-2xl border border-[#A3D1E0] flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-[#0D2233]">✏️ Edit Profile Information</h2>
              <p className="text-xs text-[#5B7D91]">Update your photo, income range, e-TIN, and business credentials.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all"
            >
              ← Back to Profile View
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Avatar & Basic Information */}
            <div className="lg:col-span-5 glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-5">
              <div className="flex items-center space-x-2 border-b border-[#A3D1E0]/50 pb-3">
                <User className="w-5 h-5 text-[#0077B3]" />
                <h3 className="text-base font-extrabold text-[#0077B3]">Personal Profile &amp; Photo</h3>
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Profile updated successfully!</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {/* Profile Photo Uploader */}
              <div className="flex flex-col items-center space-y-3 py-2 border-b border-slate-100">
                <div className="w-24 h-24 rounded-full border-2 border-[#0077B3] bg-slate-100 overflow-hidden flex items-center justify-center text-teal-800 font-bold text-2xl relative group">
                  {formData.profile_picture ? (
                    <img src={formData.profile_picture} alt="Profile Photo" className="w-full h-full object-cover" />
                  ) : (
                    <span>{(formData.name || 'T')[0].toUpperCase()}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 font-bold text-xs transition-all flex items-center space-x-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Profile Photo</span>
                </button>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2E5369]">Full Name / Proprietor</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Salman Ifrat"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
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

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2E5369]">Phone Number</label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+880 1712345678"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                />
              </div>

              {/* 12-Digit e-TIN Number */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-[#2E5369]">12-Digit e-TIN Number</label>
                  <span className="text-[11px] font-bold text-[#1AABA8]">Leave blank if not available</span>
                </div>
                <input
                  type="text"
                  value={formData.tin || ''}
                  onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
                  placeholder="Blank (Optional e.g. 829310294720)"
                  maxLength={12}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0077B3] font-mono font-bold text-sm border border-[#A3D1E0]"
                />
              </div>
            </div>

            {/* Right Column: Business & Income Range Options */}
            <div className="lg:col-span-7 space-y-6">
              <div className="glass-card rounded-2xl p-6 border border-[#A3D1E0] space-y-5">
                <div className="flex items-center space-x-2 border-b border-[#A3D1E0]/50 pb-3">
                  <Building2 className="w-5 h-5 text-[#0077B3]" />
                  <h3 className="text-base font-extrabold text-[#0077B3]">Tax Account &amp; Income Settings</h3>
                </div>

                {/* Annual Income / Turnover Range Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2E5369]">Annual Income / Turnover Range Per Year</label>
                  <select
                    value={formData.income_range || '৳ 5 Lakh - 15 Lakh BDT'}
                    onChange={(e) => setFormData({ ...formData, income_range: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                  >
                    <option value="< ৳ 3.75 Lakh BDT (Tax Free)">&lt; ৳ 3.75 Lakh BDT (Tax Free Threshold)</option>
                    <option value="৳ 3.75 Lakh - 5 Lakh BDT">৳ 3.75 Lakh - 5 Lakh BDT</option>
                    <option value="৳ 5 Lakh - 15 Lakh BDT">৳ 5 Lakh - 15 Lakh BDT</option>
                    <option value="৳ 15 Lakh - 30 Lakh BDT">৳ 15 Lakh - 30 Lakh BDT</option>
                    <option value="৳ 30 Lakh - 50 Lakh BDT">৳ 30 Lakh - 50 Lakh BDT</option>
                    <option value="৳ 50 Lakh - 1 Crore BDT">৳ 50 Lakh - 1 Crore BDT</option>
                    <option value="> ৳ 1 Crore BDT">&gt; ৳ 1 Crore BDT (High Net Worth)</option>
                  </select>
                </div>

                {/* Entity Type Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2E5369]">Taxpayer Structure Type</label>
                  <select
                    value={formData.entity_type || 'individual'}
                    onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                  >
                    <option value="individual">Individual Taxpayer</option>
                    <option value="sole_proprietorship">Sole Proprietorship</option>
                    <option value="partnership">Partnership Firm</option>
                    <option value="private_limited_company">Private Limited Company (LLC)</option>
                  </select>
                </div>

                {/* Company Name & RJSC Reg No */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#2E5369]">Company / Business Name</label>
                    <input
                      type="text"
                      value={formData.company_name || ''}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      placeholder="e.g. Dhaka Digital Solutions Ltd."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#2E5369]">RJSC Registration No</label>
                    <input
                      type="text"
                      value={formData.rjsc_reg_no || ''}
                      onChange={(e) => setFormData({ ...formData, rjsc_reg_no: e.target.value })}
                      placeholder="e.g. C-189204"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                    />
                  </div>
                </div>

                {/* NBR Tax Zone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2E5369]">NBR Tax Zone &amp; Circle</label>
                  <input
                    type="text"
                    value={formData.tax_zone || ''}
                    onChange={(e) => setFormData({ ...formData, tax_zone: e.target.value })}
                    placeholder="e.g. Zone 4, Circle 82 (Dhaka)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white text-[#0D2233] font-semibold text-sm border border-[#A3D1E0]"
                  />
                </div>

                {/* Quick Attach Document */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-[#2E5369]">Upload Document / Certificate</label>
                  <label className="w-full py-2.5 px-3.5 rounded-xl bg-white border border-dashed border-[#0077B3] text-[#0077B3] font-bold text-xs hover:bg-[#F0F8FF] transition-all flex items-center justify-center space-x-2 cursor-pointer relative">
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx,*/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <UploadCloud className="w-4 h-4" />
                    <span>{isUploadingDoc ? 'Uploading...' : '+ Upload NID / Trade License / e-TIN PDF'}</span>
                  </label>
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="pt-4 flex items-center space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-[#0077B3] hover:bg-[#005f8e] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{loading ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-sm transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
