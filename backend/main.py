"""
TaxEaseBD - Tax Calculator & Compliance API
-----------------------------------------------
Single FastAPI entrypoint for the backend. This used to be split between a
dead-end RAG test script (this same filename) and the actual API living in
calculator.py - that split has been removed; this file is now the one and
only backend entrypoint.

Run directly:     python main.py
Or with reload:    uvicorn main:app --reload --port 8000
Docs:              http://127.0.0.1:8000/docs

SOURCES (verify before relying on these for a real filing - tax rules change
every Finance Act):
- Individual tax slabs: NBR / income year 2025-26, AY 2026-27
- VAT rate & threshold: nbr.gov.bd official FAQ
- Corporate/Partnership rates: placeholder, needs verification against latest Finance Act
"""

import os
import re
from enum import Enum
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import database
import models
from auth import create_access_token, decode_access_token, hash_password, verify_password

load_dotenv()

# Initialize DB tables on startup
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="TaxEaseBD Tax Calculator & Compliance API")

# CORS: restrict to the frontend origin(s) instead of allowing "*".
# Override with FRONTEND_ORIGINS="http://example.com,http://other.com" in .env
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
FRONTEND_ORIGINS = [
    o.strip() for o in os.getenv("FRONTEND_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================
# DROPDOWN OPTIONS (Enums render as dropdowns in Swagger UI)
# =====================================================

class EntityType(str, Enum):
    individual = "individual"
    sole_proprietorship = "sole_proprietorship"
    partnership = "partnership"
    private_limited_company = "private_limited_company"


class TaxpayerCategory(str, Enum):
    general = "general"
    woman_or_senior_65plus = "woman_or_senior_65plus"
    disabled_or_third_gender = "disabled_or_third_gender"
    gazetted_freedom_fighter = "gazetted_freedom_fighter"


class BusinessCategory(str, Enum):
    trading = "trading"
    manufacturing = "manufacturing"
    service = "service"
    fcommerce = "fcommerce"


class Zone(str, Enum):
    dhaka_south = "dhaka_south"
    dhaka_north = "dhaka_north"
    chittagong = "chittagong"
    other = "other"


# =====================================================
# Request / Response schemas
# =====================================================

class TaxQuery(BaseModel):
    entity_type: EntityType = Field(..., description="What type of taxpayer are you?")
    annual_income_or_turnover: float = Field(..., ge=0, description="Annual income (individual) or turnover (business), in BDT")

    taxpayer_category: TaxpayerCategory = Field(
        default=TaxpayerCategory.general,
        description="Only applies to Individual/Sole Proprietorship. Determines tax-free threshold."
    )
    business_category: BusinessCategory = Field(
        default=BusinessCategory.trading,
        description="Only applies to business entities. Used for Trade License fee lookup."
    )
    zone: Zone = Field(
        default=Zone.other,
        description="Only applies to business entities. Used for Trade License fee lookup."
    )
    signboard_size_sqft: float = Field(
        default=0, ge=0, description="Signboard size in square feet, used to compute signboard tax."
    )


class TaxResult(BaseModel):
    entity_type: str
    tax_free_threshold: Optional[float] = None
    income_tax_or_corporate_tax: float
    vat_or_turnover_tax: Optional[float] = None
    vat_required: Optional[bool] = None
    trade_license_fee: Optional[float] = None
    signboard_tax: float = 0
    minimum_tax_applied: bool = False
    total_estimated_liability: float
    notes: List[str]


# =====================================================
# Rate tables
# =====================================================

TAX_FREE_THRESHOLDS = {
    TaxpayerCategory.general: 375_000,
    TaxpayerCategory.woman_or_senior_65plus: 425_000,
    TaxpayerCategory.disabled_or_third_gender: 500_000,
    TaxpayerCategory.gazetted_freedom_fighter: 525_000,
}

MINIMUM_TAX = 5_000

INDIVIDUAL_SLABS = [
    (300_000, 0.10),
    (400_000, 0.15),
    (500_000, 0.20),
    (2_500_000, 0.25),
    (float("inf"), 0.30),
]

CORPORATE_TAX_RATE = 0.275
PARTNERSHIP_TAX_RATE = 0.25

VAT_THRESHOLD = 8_000_000
STANDARD_VAT_RATE = 0.15
TURNOVER_TAX_RATE = 0.03

TRADE_LICENSE_RATES = {
    BusinessCategory.trading: {Zone.dhaka_south: 8000, Zone.dhaka_north: 7500, Zone.chittagong: 6500, Zone.other: 4000},
    BusinessCategory.manufacturing: {Zone.dhaka_south: 15000, Zone.dhaka_north: 14000, Zone.chittagong: 12000, Zone.other: 8000},
    BusinessCategory.service: {Zone.dhaka_south: 6000, Zone.dhaka_north: 5500, Zone.chittagong: 5000, Zone.other: 3500},
    BusinessCategory.fcommerce: {Zone.dhaka_south: 3500, Zone.dhaka_north: 3500, Zone.chittagong: 3000, Zone.other: 2000},
}

SIGNBOARD_RATE_HIGH = 100  # Dhaka South/North, BDT per sq ft
SIGNBOARD_RATE_OTHER = 70


# =====================================================
# Calculation logic
# =====================================================

def calculate_individual_tax(income: float, category: TaxpayerCategory):
    threshold = TAX_FREE_THRESHOLDS[category]
    taxable = max(0, income - threshold)

    tax = 0.0
    remaining = taxable
    for width, rate in INDIVIDUAL_SLABS:
        slab_amount = min(remaining, width)
        tax += slab_amount * rate
        remaining -= slab_amount
        if remaining <= 0:
            break

    minimum_applied = False
    if taxable > 0 and tax < MINIMUM_TAX:
        tax = MINIMUM_TAX
        minimum_applied = True

    return threshold, round(tax, 2), minimum_applied


def calculate_vat_or_turnover(turnover: float):
    if turnover > VAT_THRESHOLD:
        return round(turnover * STANDARD_VAT_RATE, 2), True
    return round(turnover * TURNOVER_TAX_RATE, 2), False


def calculate_signboard_tax(zone: Zone, size_sqft: float) -> float:
    rate = SIGNBOARD_RATE_HIGH if zone in (Zone.dhaka_south, Zone.dhaka_north) else SIGNBOARD_RATE_OTHER
    return round(size_sqft * rate, 2)


# =====================================================
# Auth dependencies
# =====================================================

def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(database.get_db),
) -> Optional[models.User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(models.User).filter(models.User.id == int(user_id)).first()


def get_current_user_required(
    user: Optional[models.User] = Depends(get_current_user_optional),
) -> models.User:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in again.")
    return user


# =====================================================
# Main calculator endpoint
# =====================================================

@app.post("/api/calculate-tax", response_model=TaxResult)
def calculate_tax(
    query: TaxQuery,
    db: Session = Depends(database.get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    notes: List[str] = []
    signboard_tax = calculate_signboard_tax(query.zone, query.signboard_size_sqft)

    if query.entity_type == EntityType.individual:
        threshold, tax, min_applied = calculate_individual_tax(
            query.annual_income_or_turnover, query.taxpayer_category
        )
        notes.append("Individual income tax calculated using progressive slabs after tax-free threshold.")
        if min_applied:
            notes.append(f"Calculated tax was below minimum tax — flat BDT {MINIMUM_TAX} minimum tax applied.")
        notes.append("This is an ESTIMATE only, not a filing-ready or legally binding figure. Verify against the current NBR circular before filing.")

        result = TaxResult(
            entity_type=query.entity_type.value,
            tax_free_threshold=threshold,
            income_tax_or_corporate_tax=tax,
            signboard_tax=signboard_tax,
            minimum_tax_applied=min_applied,
            total_estimated_liability=round(tax + signboard_tax, 2),
            notes=notes,
        )

    elif query.entity_type == EntityType.sole_proprietorship:
        threshold, income_tax, min_applied = calculate_individual_tax(
            query.annual_income_or_turnover, query.taxpayer_category
        )
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes.append("Sole Proprietorship: owner taxed at individual rates; business also pays VAT/Turnover Tax + Trade License fee.")
        if min_applied:
            notes.append(f"Calculated income tax was below minimum — flat BDT {MINIMUM_TAX} minimum tax applied.")
        notes.append("VAT required" if vat_required else "Below VAT threshold — Turnover Tax (3%) applies instead.")
        notes.append("This is an ESTIMATE only, not a filing-ready or legally binding figure. Verify against the current NBR circular before filing.")

        total = income_tax + vat_amount + trade_fee + signboard_tax
        result = TaxResult(
            entity_type=query.entity_type.value,
            tax_free_threshold=threshold,
            income_tax_or_corporate_tax=income_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            signboard_tax=signboard_tax,
            minimum_tax_applied=min_applied,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )

    elif query.entity_type == EntityType.partnership:
        entity_tax = round(query.annual_income_or_turnover * PARTNERSHIP_TAX_RATE, 2)
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes.append("Partnership tax rate is a PLACEHOLDER (25%) — verify against current NBR partnership tax schedule.")
        notes.append("VAT required" if vat_required else "Below VAT threshold — Turnover Tax (3%) applies instead.")
        notes.append("This is an ESTIMATE only, not a filing-ready or legally binding figure. Verify against the current NBR circular before filing.")

        total = entity_tax + vat_amount + trade_fee + signboard_tax
        result = TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=entity_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            signboard_tax=signboard_tax,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )

    else:  # private_limited_company
        corp_tax = round(query.annual_income_or_turnover * CORPORATE_TAX_RATE, 2)
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes.append("Corporate tax rate is APPROXIMATE (27.5% for non-listed companies) — verify against latest Finance Act, as sector-specific rates may apply.")
        notes.append("VAT required" if vat_required else "Below VAT threshold — Turnover Tax (3%) applies instead.")
        notes.append("Private Limited Companies must also register with RJSC and file annual returns.")
        notes.append("This is an ESTIMATE only, not a filing-ready or legally binding figure. Verify against the current NBR circular before filing.")

        total = corp_tax + vat_amount + trade_fee + signboard_tax
        result = TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=corp_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            signboard_tax=signboard_tax,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )

    # REQ-4.5.2: persist to the logged-in user's tax profile/history, if any.
    if user:
        db.add(models.TaxCalculation(
            user_id=user.id,
            entity_type=query.entity_type.value,
            annual_income_or_turnover=query.annual_income_or_turnover,
            total_estimated_liability=result.total_estimated_liability,
            calculation_notes=notes,
        ))
        db.commit()

    return result


# =====================================================
# Chat assistant, auth & history schemas
# =====================================================

class ChatHistoryItem(BaseModel):
    role: str  # "user" | "ai"
    text: str


class ChatQuery(BaseModel):
    message: str
    language: Optional[str] = "en"
    # Recent turns of the same conversation, oldest first. Optional and
    # only used as a fallback when the current message alone doesn't score
    # a confident match - see chat_assistant() below.
    history: Optional[List[ChatHistoryItem]] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    grounded: bool
    source_url: Optional[str] = "https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"


class AuthRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    tin: Optional[str] = None
    entity_type: Optional[str] = "individual"


class AuthResponse(BaseModel):
    success: bool
    token: str
    user: dict
    message: str


# =====================================================
# Grounded AI Chat Assistant (Queries MySQL income_tax_laws table)
# =====================================================

NO_MATCH_ANSWER = (
    "I do not have a verified law section grounded in the official NBR Income Tax database for your query. "
    "As a strictly grounded AI assistant, I only answer questions that directly match official Bangladesh Income Tax laws, "
    "NBR circulars, or Constitutional tax provisions stored in the database.\n\n"
    "🔗 [Official NBR Gazette Source PDF](https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf)"
)

STOP_WORDS = {
    "what", "is", "the", "for", "are", "about", "how", "to", "in", "of", "and", "a", "an",
    "tax", "taxes", "laws", "law", "bd", "nbr", "bangladesh", "tell", "me", "which", "where",
    "can", "you", "does", "do", "explain", "details", "rule", "rules", "act", "acts",
    "কি", "কী", "কতো", "কত", "এর", "জন্য", "হলো", "বা", "ও", "এ", "কর", "আইন", "ধারায়", "ধারা", "কোন", "কোথাও", "বলো", "বলুন"
}

BN_TO_EN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# A single strong keyword/topic hit (8 or 6) already clears this, so a
# standalone question that's actually about something is "confident"
# without needing conversational context blended in.
CONFIDENT_MATCH_SCORE = 6


_WORD_RE = re.compile(r"[a-z0-9ঀ-৿]+")

# Bare numbers show up constantly in tax questions ("2 lakh", "33000 taka",
# "182 days") and must never be read as a section reference on their own -
# only fire the +25 section-number bonus when the query actually says
# "section" (or the Bengali "ধারা") near a number, e.g. "section 268".
SECTION_CUE_WORDS = {"section", "sec", "ধারা", "ধারায়", "ধারার"}


def _tokenize(text: str) -> List[str]:
    text_en = text.translate(BN_TO_EN_DIGITS)
    return [
        w.lower()
        for w in text_en.replace(',', ' ').replace('.', ' ').replace('?', ' ')
        .replace('/', ' ').replace('(', ' ').replace(')', ' ').split()
        if len(w) >= 1
    ]


def _stem(word: str) -> str:
    """Crude English suffix-stripping so word-boundary matching still finds
    "penalty" inside content written as "penalties", "file" inside
    "filing", etc. Left alone for anything non-ASCII (Bengali keeps its
    written form, since the keyword lists were authored with the forms
    that actually appear in the content)."""
    if any(ord(ch) > 127 for ch in word):
        return word
    if len(word) > 5 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("es"):
        return word[:-2]
    if len(word) > 5 and word.endswith("ing"):
        return word[:-3]
    if len(word) > 4 and word.endswith("ed"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _word_set(text: str) -> set:
    """Whole-word, stemmed token set - not a substring. Avoids false hits
    like the word "miss" matching inside "Commissioner" that plain
    `word in text` substring checks were producing (that noise was the
    main reason secondary/"related" matches used to be near-random),
    while `_stem()` keeps ordinary plural/verb-form variation working."""
    return {_stem(w) for w in _WORD_RE.findall(text.lower().translate(BN_TO_EN_DIGITS))}


def _section_number_tokens(section_no: str) -> set:
    """e.g. "Section 2(22)" -> {"2", "22"}; "Section 183" -> {"183"}."""
    return set(re.findall(r"\d+", section_no.translate(BN_TO_EN_DIGITS)))


def _score_laws(laws, clean_words: List[str]):
    """Returns a list of (score, law, has_keyword_or_topic_hit) sorted by
    score descending. The third element flags a genuine hit against the
    law's curated keywords/topic (not just incidental word overlap in the
    body text) - used to gate which secondary matches are trustworthy
    enough to show as "related"."""
    search_keywords = [w for w in clean_words if w not in STOP_WORDS]
    mentions_section = any(w in SECTION_CUE_WORDS for w in clean_words)
    matched_laws = []

    for law in laws:
        score = 0
        keyword_hit = False

        sec_number_tokens = _section_number_tokens(law.section_no)
        title_tokens = _word_set(law.act_title)
        topic_tokens = _word_set(law.chapter_topic)
        kw_tokens = _word_set(law.keywords)
        content_tokens = _word_set(law.content_en) | _word_set(law.content_bn)

        if mentions_section:
            for word in clean_words:
                if word in sec_number_tokens:
                    score += 25

        for word in search_keywords:
            if len(word) < 2:
                continue
            word = _stem(word)
            if word in kw_tokens:
                score += 8
                keyword_hit = True
            if word in topic_tokens:
                score += 6
                keyword_hit = True
            if word in title_tokens:
                score += 4
            if word in content_tokens:
                score += 2

        if score >= 1:
            matched_laws.append((score, law, keyword_hit))

    matched_laws.sort(key=lambda x: x[0], reverse=True)
    return matched_laws


def extract_annual_income(user_text: str) -> Optional[float]:
    """Extracts annual income / turnover figure from prompt (e.g. 400000, 4 lakh, 50 lac, 6.5 lakh)."""
    text_clean = user_text.translate(BN_TO_EN_DIGITS).lower()

    # Match lakh / lac
    lakh_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|লাখ)', text_clean)
    if lakh_match:
        return float(lakh_match.group(1)) * 100_000

    # Match k (e.g. 400k)
    k_match = re.search(r'(\d+(?:\.\d+)?)\s*k\b', text_clean)
    if k_match:
        return float(k_match.group(1)) * 1_000

    # Match numbers with commas or plain digits (e.g. 400,000 or 400000)
    numbers = re.findall(r'\b\d{1,3}(?:,\d{3})+\b|\b\d{5,9}\b', text_clean)
    for num_str in numbers:
        cleaned = num_str.replace(',', '')
        val = float(cleaned)
        if val >= 50_000:
            return val
    return None


def compute_tax_breakdown_response(
    income: float,
    user_name: Optional[str],
    entity_title_en: str,
    entity_title_bn: str,
    company_name: Optional[str],
    is_bengali: bool,
    top_source_url: str,
) -> str:
    """Computes exact step-by-step NBR income tax calculation breakdown."""
    TAX_FREE_THRESHOLD = 375_000.0

    gross_income = income
    taxable_income = max(0.0, gross_income - TAX_FREE_THRESHOLD)

    slabs = [
        (300_000.0, 0.10),
        (400_000.0, 0.15),
        (500_000.0, 0.20),
        (2_000_000.0, 0.25),
        (float('inf'), 0.30)
    ]

    calculated_tax = 0.0
    remaining = taxable_income

    for slab_limit, rate in slabs:
        if remaining <= 0:
            break
        taxable_in_slab = min(remaining, slab_limit)
        calculated_tax += taxable_in_slab * rate
        remaining -= taxable_in_slab

    minimum_tax = 5000.0 if taxable_income > 0 else 0.0
    final_tax = max(calculated_tax, minimum_tax)

    if is_bengali:
        greeting = f"👋 **হ্যালো {user_name}!**" if user_name else "👋 **হ্যালো!**"
        context_header = f"আপনার নিবন্ধিত **{entity_title_bn}** {'(' + company_name + ')' if company_name else ''} হিসেবে বার্ষিক **{gross_income:,.0f} টাকা** আয়ের আয়কর হিসাবের বিবরণ নিচে দেওয়া হলো:"

        calculation_box = (
            f"### 📊 আয়কর হিসাবের বিবরণ (কর বর্ষ ২০২৫–২০২৬ / আয় বছর ২০২৪–২০২৫)\n"
            f"1. **বার্ষিক মোট আয়:** {gross_income:,.0f} টাকা\n"
            f"2. **সাধারণ করমুক্ত আয় সীমা:** {TAX_FREE_THRESHOLD:,.0f} টাকা *(আয়কর আইন ২০২৩ অনুযায়ী প্রথম ৩,৭৫,০০০ টাকা সম্পূর্ণ করমুক্ত)*\n"
            f"3. **করযোগ্য আয়:** {gross_income:,.0f} - {TAX_FREE_THRESHOLD:,.0f} = **{taxable_income:,.0f} টাকা**\n"
            f"4. **স্ল্যাব অনুযায়ী ধার্যকৃত আয়কর (১০%):** **{calculated_tax:,.0f} টাকা**\n"
            f"5. **এনবিআর ন্যূনতম কর বিধান (ধারা ১৬৬):** ঢাকা/চট্টগ্রাম সিটি কর্পোরেশনের জন্য ন্যূনতম **৫,০০০ টাকা** প্রদেয়।"
        )

        summary_box = (
            f"💡 **সর্বমোট প্রদেয় আনুমানিক আয়কর:** **{final_tax:,.0f} টাকা**\n"
            f"*(দ্রষ্টব্য: বিনিয়োগ রেয়াত সুবিধা গ্রহণ করলে প্রদেয় কর আরও হ্রাস পেতে পারে)*"
        )

        advice_box = (
            f"### 📌 আপনার জন্য গুরুত্বপূর্ণ পরামর্শ\n"
            f"• **৩০শে নভেম্বরের পূর্বে রিটার্ন দাখিল:** আয়কর আইন ২০২৩ এর ২১৪ ধারা অনুযায়ী সময়মতো রিটার্ন জমা দিন।\n"
            f"• **বিনিয়োগ রেয়াত (DPS/সঞ্চয়পত্র):** অনুমোদনপ্রাপ্ত বিনিয়োগে আপনি আয়ের ১৫% পর্যন্ত রেয়াত দাবি করতে পারবেন।\n"
            f"• **প্রয়োজনীয় নথি:** ১২ ডিজিটের e-TIN, NID এবং ব্যাংক স্টেটমেন্ট প্রস্তুত রাখুন।"
        )

        footer = (
            f"---\n"
            f"📖 *আইনি ভিত্তি: NBR আয়কর আইন ২০২৩ (ধারা ১৬৬ ও প্রগ্রেসিভ স্ল্যাব)*\n"
            f"🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})"
        )

        return f"{greeting}\n\n{context_header}\n\n{calculation_box}\n\n{summary_box}\n\n{advice_box}\n\n{footer}"

    else:
        greeting = f"👋 **Hello {user_name}!**" if user_name else "👋 **Hello!**"
        context_header = f"As a registered **{entity_title_en}** {'(' + company_name + ')' if company_name else ''} in Bangladesh, here is the exact step-by-step income tax calculation for an annual income of **BDT {gross_income:,.0f}**:"

        calculation_box = (
            f"### 📊 Income Tax Calculation Breakdown (Income Year 2025–2026 / FY26)\n"
            f"1. **Annual Gross Income:** BDT {gross_income:,.0f}\n"
            f"2. **General Tax-Free Threshold:** BDT {TAX_FREE_THRESHOLD:,.0f} *(Zero tax on first BDT 3,75,000 under Income Tax Act 2023)*\n"
            f"3. **Taxable Income:** BDT {gross_income:,.0f} - BDT {TAX_FREE_THRESHOLD:,.0f} = **BDT {taxable_income:,.0f}**\n"
            f"4. **Calculated Tax (Slab 1 @ 10%):** **BDT {calculated_tax:,.0f}**\n"
            f"5. **NBR Minimum Tax Provision (Sec 166):** If taxable income > 0, statutory minimum tax of **BDT 5,000** (Dhaka/Chittagong City Corp) or BDT 3,000–4,000 (other areas) applies."
        )

        summary_box = (
            f"💡 **Final Estimated Income Tax Payable:** **BDT {final_tax:,.0f}**\n"
            f"*(Note: Eligible investment rebates in DPS or Treasury Bonds can further reduce your tax liability)*"
        )

        advice_box = (
            f"### 📌 Recommended Action Steps for You\n"
            f"1. **File Before National Tax Day:** File your return on or before **November 30** to avoid 10% statutory late penalties under NBR Section 214.\n"
            f"2. **Claim Investment Rebates:** Invest in approved DPS or Savings Certificates to lower your net tax payable.\n"
            f"3. **Required Documentation:** Keep your 12-digit e-TIN certificate, NID copy, and bank statement ready."
        )

        footer = (
            f"---\n"
            f"📖 *Source Authority: NBR Income Tax Act 2023 (Section 166 & Progressive Slabs)*\n"
            f"🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})"
        )

        return f"{greeting}\n\n{context_header}\n\n{calculation_box}\n\n{summary_box}\n\n{advice_box}\n\n{footer}"


def synthesize_personalized_response(
    user: Optional[models.User],
    user_text: str,
    top_law: models.IncomeTaxLaw,
    is_bengali: bool,
    top_source_url: str,
) -> str:
    """Synthesizes a warm, intelligent, Claude/ChatGPT-style personalized AI tax advisor response grounded in NBR Income Tax Act 2023."""
    user_name = user.name.split()[0] if (user and user.name) else None
    entity_type_raw = user.entity_type if (user and user.entity_type) else "individual"
    entity_title_en = entity_type_raw.replace("_", " ").title()
    entity_title_bn = (
        "ব্যক্তিগত করদাতা" if entity_type_raw == "individual"
        else "একক মালিকানা প্রতিষ্ঠান" if entity_type_raw == "sole_proprietorship"
        else "পার্টনারশিপ প্রতিষ্ঠান" if entity_type_raw == "partnership"
        else "প্রাইভেট লিমিটেড কোম্পানি"
    )
    company_name = user.company_name if (user and user.company_name) else None

    # Check if prompt contains numerical income/tax calculation request
    income_val = extract_annual_income(user_text)
    if income_val and income_val >= 50_000:
        return compute_tax_breakdown_response(
            income=income_val,
            user_name=user_name,
            entity_title_en=entity_title_en,
            entity_title_bn=entity_title_bn,
            company_name=company_name,
            is_bengali=is_bengali,
            top_source_url=top_source_url,
        )

    # Check for Gemini / OpenAI / Anthropic API Key in environment
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gemini_key:
        try:
            import json
            import urllib.request

            prompt = (
                f"You are TaxEaseBD's warm, intelligent, highly empathetic AI tax advisor for Bangladesh (like Claude or ChatGPT).\n"
                f"User Profile: Name='{user_name or 'Taxpayer'}', Entity='{entity_title_en}', Business Name='{company_name or 'N/A'}'.\n"
                f"User Question: '{user_text}'\n"
                f"Grounded NBR Law Provision: [{top_law.act_title} - {top_law.section_no} ({top_law.chapter_topic})]\n"
                f"Statutory Text: {top_law.content_bn if is_bengali else top_law.content_en}\n"
                f"Language: {'Bengali' if is_bengali else 'English'}.\n\n"
                f"Tone & Style Guidelines:\n"
                f"- Speak in a natural, conversational, expert, and encouraging tone (like Claude/ChatGPT).\n"
                f"- Greet the user by name if available, acknowledging their specific business entity type.\n"
                f"- Answer their prompt directly in plain, clear language. DO NOT just quote dry legal text.\n"
                f"- Provide 3 practical, actionable steps or tips tailored for Bangladesh tax compliance.\n"
                f"- At the end, state the official section [{top_law.section_no}] and NBR source link in exact format: 🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})."
            )

            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            req_data = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=6) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                llm_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                if llm_text and len(llm_text.strip()) > 30:
                    return llm_text.strip()
        except Exception as e:
            print(f"LLM API call note: {e}")

    # Fluent, Claude-style Smart Advisory Synthesizer (Default Engine)
    section_no = top_law.section_no
    topic = top_law.chapter_topic
    content = top_law.content_bn if is_bengali else top_law.content_en

    if is_bengali:
        greeting = f"👋 **হ্যালো {user_name}!**" if user_name else "👋 **হ্যালো!**"
        context_header = f"আপনার নিবন্ধিত **{entity_title_bn}** {'(' + company_name + ')' if company_name else ''} এর প্রেক্ষিতে আপনার প্রশ্নের সহজ এবং কার্যকরী উত্তর নিচে দেওয়া হলো:"

        direct_explanation = (
            f"### 💡 আপনার প্রশ্নের উত্তর ও সহজ ব্যাখ্যা\n"
            f"**{topic}** সংক্রান্ত আইনের মূল বিষয় হলো:\n"
            f"\"{content}\"\n\n"
            f"এটি কেবল একটি আইনি নিয়ম নয়—আপনার করের দায় সঠিকভাবে নিরূপণ এবং অডিট ঝুঁকি এড়াতে এটি অত্যন্ত গুরুত্বপূর্ণ।"
        )

        actionable_steps = (
            f"### 📌 আপনার করণীয় ও ব্যবহারিক পরামর্শ\n"
            f"1. **নথি প্রস্তুত রাখুন:** **{section_no}** এর সুবিধা বা বাধ্যবাধকতা অনুযায়ী প্রয়োজনীয় সকল চালানপত্র, ব্যাংক বিবরণী ও সনদ সংগ্রহ করুন।\n"
            f"2. **রিটার্নে সঠিকভাবে প্রদর্শন:** আপনার বার্ষিক রিটার্ন জমা দেওয়ার সময় এই আয়ের অংশ বা ছাড় সঠিকভাবে ফরম এনবিআর-এ উল্লেখ করুন।\n"
            f"3. **সময়সীমা মেনে চলুন:** জাতীয় কর দিবস (৩০শে নভেম্বর) এর পূর্বে রিটার্ন দাখিল নিশ্চিত করুন।"
        )

        citation_footer = (
            f"---\n"
            f"📖 *আইনি ভিত্তি: {top_law.act_title} ({section_no})*\n"
            f"🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})"
        )

        return f"{greeting}\n\n{context_header}\n\n{direct_explanation}\n\n{actionable_steps}\n\n{citation_footer}"

    else:
        greeting = f"👋 **Hello {user_name}!**" if user_name else "👋 **Hello!**"
        context_header = f"As a registered **{entity_title_en}** {'(' + company_name + ')' if company_name else ''} in Bangladesh, here is an easy-to-understand breakdown tailored to your question:"

        direct_explanation = (
            f"### 💡 Practical Explanation for Your Query\n"
            f"Under Bangladesh tax regulations regarding **{topic}**:\n"
            f"\"{content}\"\n\n"
            f"Rather than just a formal law, this provision directly affects your annual tax liability, deduction eligibility, and compliance standing with the National Board of Revenue (NBR)."
        )

        actionable_steps = (
            f"### 📌 Recommended Action Steps for You\n"
            f"1. **Keep Proper Documentation:** Maintain verified receipts, certificates, or statements relevant to **{section_no}**.\n"
            f"2. **Accurate Filing:** Ensure this is accurately disclosed when pre-filling or filing your annual NBR income tax return.\n"
            f"3. **Deadline Compliance:** File your return prior to National Tax Day (November 30) to remain fully compliant and avoid penalties."
        )

        citation_footer = (
            f"---\n"
            f"📖 *Source Authority: {top_law.act_title} ({section_no})*\n"
            f"🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})"
        )

        return f"{greeting}\n\n{context_header}\n\n{direct_explanation}\n\n{actionable_steps}\n\n{citation_footer}"


@app.post("/api/chat", response_model=ChatResponse)
def chat_assistant(
    query: ChatQuery,
    db: Session = Depends(database.get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    user_text = query.message.strip()
    laws = db.query(models.IncomeTaxLaw).all()

    matched_laws = _score_laws(laws, _tokenize(user_text))

    if (not matched_laws or matched_laws[0][0] < CONFIDENT_MATCH_SCORE) and query.history:
        recent_user_text = " ".join(
            item.text for item in query.history[-4:] if item.role == "user"
        )
        if recent_user_text.strip():
            blended_words = _tokenize(recent_user_text) + _tokenize(user_text)
            blended_matches = _score_laws(laws, blended_words)
            if blended_matches and (
                not matched_laws or blended_matches[0][0] > matched_laws[0][0]
            ):
                matched_laws = blended_matches

    if matched_laws:
        top_score, top_law, _top_kw_hit = matched_laws[0]
        top_source_url = getattr(top_law, "source_url", None) or "https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"

        is_bengali = any('\u0980' <= char <= '\u09ff' for char in user_text) or (query.language == 'bn')

        user_name = user.name.split()[0] if (user and user.name) else None
        entity_type_raw = user.entity_type if (user and user.entity_type) else "individual"
        entity_title_en = entity_type_raw.replace("_", " ").title()
        entity_title_bn = (
            "ব্যক্তিগত করদাতা" if entity_type_raw == "individual"
            else "একক মালিকানা প্রতিষ্ঠান" if entity_type_raw == "sole_proprietorship"
            else "পার্টনারশিপ প্রতিষ্ঠান" if entity_type_raw == "partnership"
            else "প্রাইভেট লিমিটেড কোম্পানি"
        )
        company_name = user.company_name if (user and user.company_name) else None

        income_val = extract_annual_income(user_text)
        if income_val and income_val >= 50_000:
            answer = compute_tax_breakdown_response(
                income=income_val,
                user_name=user_name,
                entity_title_en=entity_title_en,
                entity_title_bn=entity_title_bn,
                company_name=company_name,
                is_bengali=is_bengali,
                top_source_url=top_source_url,
            )
            sources = [
                "Income Tax Act 2023 (Section 166 - Minimum Tax & Slabs)",
                "NBR Mandatory Return Filing Circular",
                f"[Official NBR Gazette: {top_source_url}]({top_source_url})"
            ]
        else:
            answer = synthesize_personalized_response(
                user=user,
                user_text=user_text,
                top_law=top_law,
                is_bengali=is_bengali,
                top_source_url=top_source_url,
            )

            sources = [f"{top_law.act_title} ({top_law.section_no})"]
            if top_law.sro_ref:
                sources.append(top_law.sro_ref)
            else:
                sources.append("NBR Mandatory Return Filing Circular")
            sources.append(f"[Official NBR Gazette: {top_source_url}]({top_source_url})")

            for score, law, kw_hit in matched_laws[1:3]:
                if law.section_no == top_law.section_no:
                    continue
                if not kw_hit or score < 12:
                    continue
                sources.append(f"Related Section: {law.act_title} ({law.section_no})")

        grounded = True
    else:
        answer = NO_MATCH_ANSWER
        top_source_url = "https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"
        sources = [
            "Income Tax Act 2023",
            "NBR Mandatory Return Filing Circular",
            f"[Official NBR Gazette: {top_source_url}]({top_source_url})"
        ]
        grounded = False

    if user and isinstance(user, models.User):
        db.add(models.ChatHistory(
            user_id=user.id,
            user_message=query.message,
            ai_response=answer,
            sources=sources,
        ))
        db.commit()

    return ChatResponse(answer=answer, sources=sources, grounded=grounded, source_url=top_source_url)


# =====================================================
# Auth & Profile endpoints
# =====================================================

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    tin: Optional[str] = None
    entity_type: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    business_address: Optional[str] = None
    nid: Optional[str] = None
    tax_zone: Optional[str] = None


def _user_public_dict(user: models.User) -> dict:
    return {
        "email": user.email,
        "name": user.name,
        "tin": user.tin,
        "entity_type": user.entity_type,
        "phone": getattr(user, "phone", None),
        "company_name": getattr(user, "company_name", None),
        "business_address": getattr(user, "business_address", None),
        "nid": getattr(user, "nid", None),
        "tax_zone": getattr(user, "tax_zone", None),
        "created_at": str(user.created_at) if hasattr(user, "created_at") and user.created_at else None,
    }


@app.put("/api/auth/profile")
def update_user_profile(
    profile: UpdateProfileRequest,
    user: models.User = Depends(get_current_user_required),
    db: Session = Depends(database.get_db),
):
    if profile.name is not None:
        user.name = profile.name
    if profile.tin is not None:
        user.tin = profile.tin
    if profile.entity_type is not None:
        user.entity_type = profile.entity_type
    if profile.phone is not None:
        user.phone = profile.phone
    if profile.company_name is not None:
        user.company_name = profile.company_name
    if profile.business_address is not None:
        user.business_address = profile.business_address
    if profile.nid is not None:
        user.nid = profile.nid
    if profile.tax_zone is not None:
        user.tax_zone = profile.tax_zone

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": _user_public_dict(user),
    }


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup_user(auth: AuthRequest, db: Session = Depends(database.get_db)):
    if not auth.email or not auth.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if len(auth.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    email = auth.email.strip().lower()
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in instead.")

    username = email.split("@")[0].capitalize()
    new_user = models.User(
        email=email,
        name=auth.name or username,
        password_hash=hash_password(auth.password),
        tin=auth.tin,
        entity_type=auth.entity_type or "individual",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(new_user.id)
    return AuthResponse(
        success=True,
        token=token,
        user=_user_public_dict(new_user),
        message="Account created successfully",
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login_user(auth: AuthRequest, db: Session = Depends(database.get_db)):
    if not auth.email or not auth.password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    email = auth.email.strip().lower()
    db_user = db.query(models.User).filter(models.User.email == email).first()

    if not db_user or not verify_password(auth.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(db_user.id)
    return AuthResponse(
        success=True,
        token=token,
        user=_user_public_dict(db_user),
        message="Successfully logged in to TaxEaseBD",
    )


# =====================================================
# Tax profile / history endpoints (REQ-4.5.2, REQ-4.5.3)
# =====================================================

@app.get("/api/history")
def get_history(
    user: models.User = Depends(get_current_user_required),
    db: Session = Depends(database.get_db),
):
    calculations = (
        db.query(models.TaxCalculation)
        .filter(models.TaxCalculation.user_id == user.id)
        .order_by(models.TaxCalculation.calculated_at.desc())
        .limit(50)
        .all()
    )
    chats = (
        db.query(models.ChatHistory)
        .filter(models.ChatHistory.user_id == user.id)
        .order_by(models.ChatHistory.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "calculations": [
            {
                "id": c.id,
                "entity_type": c.entity_type,
                "annual_income_or_turnover": c.annual_income_or_turnover,
                "total_estimated_liability": c.total_estimated_liability,
                "notes": c.calculation_notes,
                "calculated_at": c.calculated_at,
            }
            for c in calculations
        ],
        "chats": [
            {
                "id": c.id,
                "user_message": c.user_message,
                "ai_response": c.ai_response,
                "sources": c.sources,
                "created_at": c.created_at,
            }
            for c in chats
        ],
    }


# =====================================================
# Feature Endpoints: Mushak, Calendar, Dashboard, Forms, Laws
# =====================================================

class MushakTxCreate(BaseModel):
    transaction_date: str
    invoice_no: str
    customer_name: str
    item_description: str
    amount: float
    vat_rate: float = 15.0
    input_credit: float = 0.0


@app.get("/api/mushak/transactions")
def get_mushak_transactions(
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(database.get_db),
):
    query = db.query(models.MushakTransaction)
    if user:
        query = query.filter(models.MushakTransaction.user_id == user.id)
    txs = query.order_by(models.MushakTransaction.id.desc()).all()
    if not txs:
        return [
            {
                "id": 1,
                "date": "2026-07-02",
                "invoiceNo": "INV-2026-001",
                "customerName": "Daraz Bangladesh BIN: 002910293",
                "item": "IT Consultancy Services",
                "amount": 250000.0,
                "vatRate": 15.0,
                "vatAmount": 37500.0,
                "inputCredit": 12000.0,
            },
            {
                "id": 2,
                "date": "2026-07-10",
                "invoiceNo": "INV-2026-002",
                "customerName": "Apex Footwear Ltd BIN: 001920394",
                "item": "Software License Supply",
                "amount": 480000.0,
                "vatRate": 15.0,
                "vatAmount": 72000.0,
                "inputCredit": 24000.0,
            },
            {
                "id": 3,
                "date": "2026-07-18",
                "invoiceNo": "INV-2026-003",
                "customerName": "Beximco Pharma BIN: 004928102",
                "item": "Cloud Hosting Integration",
                "amount": 150000.0,
                "vatRate": 15.0,
                "vatAmount": 22500.0,
                "inputCredit": 7500.0,
            },
        ]
    return [
        {
            "id": t.id,
            "date": t.transaction_date,
            "invoiceNo": t.invoice_no,
            "customerName": t.customer_name,
            "item": t.item_description,
            "amount": t.amount,
            "vatRate": t.vat_rate,
            "vatAmount": t.vat_amount,
            "inputCredit": t.input_credit,
        }
        for t in txs
    ]


@app.post("/api/mushak/transactions")
def create_mushak_transaction(
    tx: MushakTxCreate,
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(database.get_db),
):
    vat_amt = round(tx.amount * (tx.vat_rate / 100.0), 2)
    db_tx = models.MushakTransaction(
        user_id=user.id if user else None,
        transaction_date=tx.transaction_date,
        invoice_no=tx.invoice_no,
        customer_name=tx.customer_name,
        item_description=tx.item_description,
        amount=tx.amount,
        vat_rate=tx.vat_rate,
        vat_amount=vat_amt,
        input_credit=tx.input_credit,
    )
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return {
        "id": db_tx.id,
        "date": db_tx.transaction_date,
        "invoiceNo": db_tx.invoice_no,
        "customerName": db_tx.customer_name,
        "item": db_tx.item_description,
        "amount": db_tx.amount,
        "vatRate": db_tx.vat_rate,
        "vatAmount": db_tx.vat_amount,
        "inputCredit": db_tx.input_credit,
    }


@app.get("/api/calendar/deadlines")
def get_compliance_deadlines(db: Session = Depends(database.get_db)):
    deadlines = db.query(models.ComplianceDeadline).all()
    if not deadlines:
        return [
            {
                "id": 1,
                "title_en": "Mushak 9.1 Monthly VAT Return",
                "title_bn": "মুসক ৯.১ মাসিক ভ্যাট রিটার্ন দাখিল",
                "description_en": "File monthly VAT return for the preceding month at NBR eVAT portal (vat.gov.bd) to avoid ৳10,000 penalty.",
                "description_bn": "১০,০০০ টাকা জরিমানা এড়াতে NBR eVAT পোর্টালে (vat.gov.bd) পূর্ববর্তী মাসের ভ্যাট রিটার্ন দাখিল করুন।",
                "due_date": "2026-08-15",
                "category": "VAT",
                "status": "urgent",
            },
            {
                "id": 2,
                "title_en": "Trade License Annual Renewal",
                "title_bn": "ট্রেড লাইসেন্স বার্ষিক নবায়ন",
                "description_en": "Annual trade license renewal with local City Corporation or Municipality without surcharge.",
                "description_bn": "সারচার্জ ছাড়া স্থানীয় সিটি কর্পোরেশনে বার্ষিক ট্রেড লাইসেন্স নবায়ন।",
                "due_date": "2027-06-30",
                "category": "Trade License",
                "status": "valid",
            },
            {
                "id": 3,
                "title_en": "Individual Income Tax Day Filing",
                "title_bn": "ব্যক্তিগত আয়কর রিটার্ন দাখিল (ট্যাক্স ডে)",
                "description_en": "National Tax Day deadline for filing individual income tax returns under Income Tax Act 2023 Section 167.",
                "description_bn": "আয়কর আইন ২০২৩ এর ১৬৭ ধারা অনুযায়ী ব্যক্তিগত আয়কর রিটার্ন দাখিলের জাতীয় ট্যাক্স ডে সময়সীমা।",
                "due_date": "2026-11-30",
                "category": "Income Tax",
                "status": "upcoming",
            },
        ]
    return deadlines


@app.get("/api/dashboard/summary")
def get_dashboard_summary(
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(database.get_db),
):
    recent_calc = None
    if user:
        recent_calc = (
            db.query(models.TaxCalculation)
            .filter(models.TaxCalculation.user_id == user.id)
            .order_by(models.TaxCalculation.calculated_at.desc())
            .first()
        )
    return {
        "compliance_score": 92,
        "audit_risk_percentage": 8.5,
        "registered_entity_type": user.entity_type if user and user.entity_type else "Private Limited Company",
        "rjsc_reg_no": "C-189204",
        "last_calculation": {
            "entity_type": recent_calc.entity_type if recent_calc else "private_limited_company",
            "liability": recent_calc.total_estimated_liability if recent_calc else 165000.0,
        } if recent_calc else None
    }


@app.get("/api/forms/prefill")
def get_form_prefill(
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(database.get_db),
):
    name = user.name if user else "Tanvir Ahmed"
    tin = user.tin if user and user.tin else "7489-1029-3841"
    email = user.email if user else "tanvir@techsolutions.bd"
    entity = user.entity_type if user and user.entity_type else "private_limited_company"
    return {
        "taxpayer_name": name,
        "e_tin": tin,
        "email": email,
        "entity_type": entity,
        "assessment_year": "2026-2027",
        "income_year": "2025-2026",
        "circle_zone": "Tax Circle 115, Zone 06, Dhaka",
        "business_name": "TechSolutions Bangladesh Ltd",
        "trade_license_no": "TRAD/DSCC/019283/2024",
        "bin_no": "004928102-0101",
    }


@app.get("/api/laws/search")
def search_laws(q: str = "", db: Session = Depends(database.get_db)):
    if not q.strip():
        return db.query(models.IncomeTaxLaw).limit(20).all()
    term = f"%{q.strip()}%"
    return (
        db.query(models.IncomeTaxLaw)
        .filter(
            (models.IncomeTaxLaw.section_no.like(term))
            | (models.IncomeTaxLaw.act_title.like(term))
            | (models.IncomeTaxLaw.chapter_topic.like(term))
            | (models.IncomeTaxLaw.content_en.like(term))
            | (models.IncomeTaxLaw.content_bn.like(term))
            | (models.IncomeTaxLaw.keywords.like(term))
        )
        .all()
    )


@app.get("/")
def root():

    return {"status": "TaxEaseBD Tax Calculator & Compliance API is running", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
