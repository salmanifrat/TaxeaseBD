'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { apiFetch } from '@/lib/api';
import {
  Bot, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  User, 
  BookOpen,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Globe,
  Loader2,
  ExternalLink
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  sources?: string[];
}

export default function AssistantView() {
  const { t, language } = useLanguage();
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'bn-BD' | 'en-US'>(language === 'bn' ? 'bn-BD' : 'en-US');
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setVoiceLang(language === 'bn' ? 'bn-BD' : 'en-US');
  }, [language]);

  const initialMessages: ChatMessage[] = [
    {
      id: '1',
      sender: 'user',
      text: language === 'bn' 
        ? "আয়কর আইন ২০২৩ এর ১৮৪ ধারা অনুযায়ী পিএসআর (PSR) কি বাধ্যতামূলক?"
        : "Is PSR (Proof of Submission of Return) mandatory under Section 184 of Income Tax Act 2023?",
    },
    {
      id: '2',
      sender: 'ai',
      text: language === 'bn'
        ? "প্রিয় উদ্যোক্তা ও করদাতা!\n\nআপনার প্রশ্নের জন্য জাতীয় রাজস্ব বোর্ডের (NBR) নির্দেশিকা নিচে দেওয়া হলো:\n\n💡 **সহজ কথায় এর অর্থ ও আপনার জন্য গুরুত্ব:**\nআয়কর আইন ২০২৩ এর ১৮৪ ধারা অনুযায়ী ব্যাংক ঋণ, ট্রেড লাইসেন্স নবায়ন বা জমি রেজিস্ট্রেশনের মতো সরকারি ও বাণিজ্যিক সেবা গ্রহণের সময় রিটার্ন দাখিলের প্রমাণপত্র (PSR) দাখিল করা বাধ্যতামূলক।\n\n📌 **আপনার সহজ ৩টি পদক্ষেপ:**\n• ৪০টির বেশি সেবা গ্রহণের সময় ই-ফাইলিং পোর্টালে প্রাপ্ত PSR রশিদ সাথে রাখুন।\n• ট্রেড লাইসেন্স ও ব্যাংক একাউন্ট করার সময় PSR জমা দিন।\n• জরিমানা ও আইনি সমস্যা এড়াতে ৩০শে নভেম্বরের আগে রিটার্ন জমা দিন।\n\n📜 **অফিসিয়াল আইনি ধারা [Section 184]:**\n\"Section 184 requires individuals & entities to present Proof of Submission of Return (PSR) for mandatory services.\"\n\n🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)"
        : "Hello Taxpayer!\n\nHere is a practical advisory on your question under NBR Income Tax Regulations:\n\n💡 **Plain English Explanation & What This Means For You:**\nUnder Section 184 of the Income Tax Act 2023, presenting Proof of Submission of Return (PSR) is legally mandatory to access 40+ essential public and commercial services in Bangladesh.\n\n📌 **Practical Recommended Steps:**\n• Carry your official NBR e-filing acknowledgment receipt whenever applying for bank loans, trade licenses, or property registrations.\n• Provide your PSR copy to your bank to avoid higher withholding tax (TDS) rates.\n• Complete your return filing before November 30 to stay fully compliant.\n\n📜 **Official Statutory Provision [Section 184]:**\n\"Section 184 mandates proof of income tax return submission for key financial services.\"\n\n🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)",
      sources: [
        'Income Tax Act 2023 (Section 184)',
        'NBR Mandatory Return Filing Circular',
        '[Official NBR Gazette: https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)'
      ]
    }
  ];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);

  const computeClientTaxResponse = (queryText: string): ChatMessage | null => {
    const digitsMap: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
    const clean = queryText.replace(/[০-৯]/g, (d) => digitsMap[d] || d).toLowerCase();

    let incomeVal: number | null = null;
    const lakhMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|লাখ)/);
    if (lakhMatch) {
      incomeVal = parseFloat(lakhMatch[1]) * 100000;
    } else {
      const kMatch = clean.match(/(\d+(?:\.\d+)?)\s*k\b/);
      if (kMatch) {
        incomeVal = parseFloat(kMatch[1]) * 1000;
      } else {
        const numbers = clean.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{5,9}\b/g);
        if (numbers) {
          for (const numStr of numbers) {
            const val = parseFloat(numStr.replace(/,/g, ''));
            if (val >= 50000) {
              incomeVal = val;
              break;
            }
          }
        }
      }
    }

    if (!incomeVal || incomeVal < 50000) return null;

    const gross = incomeVal;
    const threshold = 375000;
    const taxable = Math.max(0, gross - threshold);

    let calcTax = 0;
    let remaining = taxable;
    const slabs = [
      { limit: 300000, rate: 0.10 },
      { limit: 400000, rate: 0.15 },
      { limit: 500000, rate: 0.20 },
      { limit: 2000000, rate: 0.25 },
      { limit: Infinity, rate: 0.30 }
    ];

    for (const slab of slabs) {
      if (remaining <= 0) break;
      const tInSlab = Math.min(remaining, slab.limit);
      calcTax += tInSlab * slab.rate;
      remaining -= tInSlab;
    }

    const minTax = taxable > 0 ? 5000 : 0;
    const finalTax = Math.max(calcTax, minTax);

    const textEn = `👋 **Hello!**\n\nAs a registered **Individual Taxpayer** in Bangladesh, here is the exact step-by-step income tax calculation for an annual income of **BDT ${gross.toLocaleString()}**:\n\n### 📊 Income Tax Calculation Breakdown (Income Year 2025–2026 / FY26)\n1. **Annual Gross Income:** BDT ${gross.toLocaleString()}\n2. **General Tax-Free Threshold:** BDT 375,000 *(Zero tax on first BDT 3,75,000 under Income Tax Act 2023)*\n3. **Taxable Income:** BDT ${gross.toLocaleString()} - BDT 375,000 = **BDT ${taxable.toLocaleString()}**\n4. **Calculated Tax (Slab 1 @ 10%):** **BDT ${calcTax.toLocaleString()}**\n5. **NBR Minimum Tax Provision (Sec 166):** If taxable income > 0, statutory minimum tax of **BDT 5,000** (Dhaka/Chittagong City Corp) or BDT 3,000–4,000 (other areas) applies.\n\n💡 **Final Estimated Income Tax Payable:** **BDT ${finalTax.toLocaleString()}**\n*(Note: Eligible investment rebates in DPS or Treasury Bonds can further reduce your tax liability)*\n\n### 📌 Recommended Action Steps for You\n1. **File Before National Tax Day:** File your return on or before **November 30** to avoid 10% statutory late penalties under NBR Section 214.\n2. **Claim Investment Rebates:** Invest in approved DPS or Savings Certificates to lower your net tax payable.\n3. **Required Documentation:** Keep your 12-digit e-TIN certificate, NID copy, and bank statement ready.\n\n---\n📖 *Source Authority: NBR Income Tax Act 2023 (Section 166 & Progressive Slabs)*\n🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)`;

    const textBn = `👋 **হ্যালো!**\n\nআপনার বার্ষিক **${gross.toLocaleString()} টাকা** আয়ের আয়কর হিসাবের বিবরণ নিচে দেওয়া হলো:\n\n### 📊 আয়কর হিসাবের বিবরণ (কর বর্ষ ২০২৫–২০২৬ / আয় বছর ২০২৪–২০২৫)\n১. **বার্ষিক মোট আয়:** ${gross.toLocaleString()} টাকা\n২. **সাধারণ করমুক্ত আয় সীমা:** ৩,৭৫,০০০ টাকা *(আয়কর আইন ২০২৩ অনুযায়ী প্রথম ৩,৭৫,০০০ টাকা সম্পূর্ণ করমুক্ত)*\n৩. **করযোগ্য আয়:** ${gross.toLocaleString()} - ৩,৭৫,০০০ = **${taxable.toLocaleString()} টাকা**\n৪. **স্ল্যাব অনুযায়ী ধার্যকৃত আয়কর (১০%):** **${calcTax.toLocaleString()} টাকা**\n৫. **এনবিআর ন্যূনতম কর বিধান (ধারা ১৬৬):** ঢাকা/চট্টগ্রাম সিটি কর্পোরেশনের জন্য ন্যূনতম **৫,০০০ টাকা** প্রদেয়।\n\n💡 **সর্বমোট প্রদেয় আনুমানিক আয়কর:** **${finalTax.toLocaleString()} টাকা**\n\n### 📌 আপনার জন্য গুরুত্বপূর্ণ পরামর্শ\n• **৩০শে নভেম্বরের পূর্বে রিটার্ন দাখিল:** সময়মতো রিটার্ন জমা দিন যাতে ১০% জরিমানা এড়ানো যায়।\n• **বিনিয়োগ রেয়াত (DPS/সঞ্চয়পত্র):** অনুমোদনপ্রাপ্ত বিনিয়োগে আপনি আয়ের ১৫% পর্যন্ত রেয়াত দাবি করতে পারবেন।\n• **প্রয়োজনীয় নথি:** ১২ ডিজিটের e-TIN, NID এবং ব্যাংক স্টেটমেন্ট প্রস্তুত রাখুন।\n\n---\n📖 *আইনি ভিত্তি: NBR আয়কর আইন ২০২৩ (ধারা ১৬৬ ও প্রগ্রেসিভ স্ল্যাব)*\n🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)`;

    return {
      id: String(Date.now() + 1),
      sender: 'ai',
      text: language === 'bn' ? textBn : textEn,
      sources: [
        'Income Tax Act 2023 (Section 166 - Minimum Tax & Individual Slabs)',
        'NBR Mandatory Return Filing Circular',
        '[Official NBR Gazette: https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)'
      ]
    };
  };

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: query,
    };

    const history = messages.slice(-6).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'ai',
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    // Check for numerical tax calculation request
    const computedLocalMsg = computeClientTaxResponse(query);
    if (computedLocalMsg) {
      setMessages((prev) => [...prev, computedLocalMsg]);
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: query, language, history }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'ai',
          text: data.answer,
          sources: data.sources,
        };
        setMessages((prev) => [...prev, aiMsg]);
        return;
      }

      throw new Error('non-ok response');
    } catch {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: language === 'bn'
          ? 'দুঃখিত, এই মুহূর্তে TaxEaseBD সার্ভারের সাথে সংযোগ করা যাচ্ছে না। ব্যাকএন্ড चालू আছে কিনা দেখুন।'
          : "Sorry, I couldn't reach the TaxEaseBD server just now. Please check that the backend is running and try again.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Voice Recognition (Speech-To-Text)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(language === 'bn' 
        ? 'আপনার ব্রাউজারে ভয়েস স্পিচ রিকগনিশন সাপোর্ট করে না। অনুগ্রহ করে Chrome বা Edge ব্যবহার করুন।' 
        : 'Web Speech Recognition is not supported by your browser. Please try Chrome or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(transcript);
          handleSend(transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  // Text-To-Speech (Read Aloud)
  const speakMessage = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\[.*?\]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    const isBengaliText = anyBilingualChar(cleanText);
    utterance.lang = isBengaliText ? 'bn-BD' : 'en-US';
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const anyBilingualChar = (str: string) => {
    return /[\u0980-\u09FF]/.test(str);
  };

  const parseBold = (str: string, keyPrefix: string): React.ReactNode[] => {
    if (!str.includes('**')) return [str];
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={`bold-${keyPrefix}-${idx}`} className="font-extrabold text-[#0D2233]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const renderInline = (text: string, lineIdx: number) => {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)|(https?:\/\/[^\s\)]+)/g;
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIdx) {
        const precedingText = text.substring(lastIdx, matchIndex);
        nodes.push(...parseBold(precedingText, `${lineIdx}-pre-${matchIndex}`));
      }

      const mdLinkText = match[1];
      const mdUrl = match[2];
      const rawUrl = match[3];

      const url = mdUrl || rawUrl;
      const linkLabel = mdLinkText || (rawUrl.includes('nbr.gov.bd') ? 'Official NBR Gazette Source PDF' : rawUrl);

      nodes.push(
        <a
          key={`mdlink-${lineIdx}-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 font-bold text-blue-700 hover:text-blue-900 underline bg-blue-50 px-2 py-0.5 rounded border border-blue-300 my-0.5"
        >
          <span>{linkLabel}</span>
          <ExternalLink className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-0.5" />
        </a>
      );

      lastIdx = matchIndex + match[0].length;
    }

    if (lastIdx < text.length) {
      const remainingText = text.substring(lastIdx);
      nodes.push(...parseBold(remainingText, `${lineIdx}-post-${lastIdx}`));
    }

    return nodes.length > 0 ? nodes : parseBold(text, `${lineIdx}-full`);
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={lineIdx} className="font-extrabold text-sm md:text-base text-[#0077B3] mt-3 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }

      if (line.startsWith('---')) {
        return <hr key={lineIdx} className="my-3 border-slate-200" />;
      }

      return (
        <div key={lineIdx} className={line.trim() === '' ? 'h-2' : 'min-h-[1.2rem] text-slate-800'}>
          {renderInline(line, lineIdx)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 md:p-8 rounded-2xl border border-slate-700/60">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Income Tax Act 2023 Grounded AI Engine (50 Statutory Sections)</span>
        </div>
        <h1 className="text-2xl font-extrabold text-black">{t.assistant.title}</h1>
        <p className="text-sm text-slate-700 mt-1 max-w-2xl">{t.assistant.subtitle}</p>
      </div>

      {/* Suggested Prompt Chips */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">{t.assistant.promptSuggestions}</span>
        <div className="flex flex-wrap gap-2">
          {[
            "Section 184 mandatory PSR proof of return",
            "Section 7 tax residency 182 days rule",
            "Section 37 rent and house property income",
            "Section 102 TDS on bank interest savings",
            "Section 268 penalty for concealment of income",
            "Section 310 alternative dispute resolution ADR"
          ].map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p)}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700 hover:border-amber-500/50 hover:text-amber-300 text-xs transition-all text-left"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Thread Window */}
      <div className="glass-card p-6 rounded-2xl border border-slate-700/60 flex flex-col min-h-[480px]">
        {/* Chat History */}
        <div className="flex-1 space-y-4 overflow-y-auto mb-4 pr-2 max-h-[500px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-2xl p-4 rounded-2xl text-xs md:text-sm leading-relaxed relative group ${
                msg.sender === 'user'
                  ? 'gradient-emerald text-white font-medium rounded-tr-none shadow-md'
                  : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none font-bengali shadow-sm font-medium'
              }`}>
                {msg.sender === 'ai' ? (
                  <div className="space-y-1">{renderFormattedText(msg.text)}</div>
                ) : (
                  <p>{msg.text}</p>
                )}

                {/* Retrieved Sources Badge */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-300 space-y-1">
                    <span className="text-[11px] font-bold text-amber-800 flex items-center space-x-1">
                      <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                      <span>{t.assistant.sourcesTitle}</span>
                    </span>
                    <ul className="space-y-1 font-mono text-[10px] text-slate-800 font-bold">
                      {msg.sources.map((src, i) => {
                        const mdMatch = src.match(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/);
                        const urlMatch = src.match(/https?:\/\/[^\s\)]+/);
                        const label = mdMatch ? mdMatch[1] : src;
                        const targetUrl = mdMatch ? mdMatch[2] : (urlMatch ? urlMatch[0] : 'https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf');
                        const isUrlSource = Boolean(mdMatch) || src.includes('http') || src.includes('Source URL') || src.includes('Official NBR') || src.includes('nbr.gov.bd');

                        return (
                          <li key={i} className="flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                            {isUrlSource ? (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-700 hover:underline font-bold underline flex items-center gap-1"
                              >
                                <span>{label}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ) : (
                              <span>{src}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Read Aloud Button for AI Messages */}
                {msg.sender === 'ai' && (
                  <button
                    onClick={() => speakMessage(msg.id, msg.text)}
                    title="Listen to AI Response (ভয়েস শুনুন)"
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-300 hover:bg-amber-300 text-slate-800 transition-all opacity-80 hover:opacity-100"
                  >
                    {speakingMsgId === msg.id ? (
                      <VolumeX className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-slate-800" />
                    )}
                  </button>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl w-fit border border-emerald-200">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>{language === 'bn' ? 'আদালত ও আয়কর ডাটাবেস অনুসন্ধান করা হচ্ছে...' : 'Searching NBR Income Tax 2023 Database...'}</span>
            </div>
          )}
        </div>

        {/* Input Bar with Voice Microphone Button */}
        <div className="pt-3 border-t border-slate-300 flex items-center space-x-2.5">
          {/* Voice Input Mic Button */}
          <button
            onClick={toggleListening}
            title={isListening ? "Listening... Click to stop" : "Speak question in English or Bengali (ভয়েস দিন)"}
            className={`p-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center shrink-0 ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
                : 'bg-slate-200 hover:bg-amber-300 text-slate-800 border border-slate-300'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-700" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              isListening 
                ? (voiceLang === 'bn-BD' ? "কথা বলুন... (Listening in Bengali)" : "Listening in English...")
                : (language === 'bn' ? "আয়কর আইন ২০২৩ সম্পর্কিত প্রশ্ন বা ধারা লিখুন বা ভয়েস দিন..." : "Ask any question on Income Tax Act 2023 or click Mic...")
            }
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 border ${
              isListening ? 'border-red-500 bg-red-50 text-slate-900 font-bold' : 'glass-input'
            }`}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading}
            className="px-5 py-3 rounded-xl gradient-gold text-slate-950 font-bold text-sm shadow-lg hover:opacity-95 transition-all flex items-center space-x-2 shrink-0 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{t.assistant.sendBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

