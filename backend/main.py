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

import calendar
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import List, Optional

from dotenv import load_dotenv

# Must run before importing database/llm/models: those modules read env
# vars (DATABASE_URL, GROQ_API_KEY) at import time via os.getenv(), so
# .env has to already be loaded into the process environment first. This
# used to run after those imports, which silently made llm.GROQ_API_KEY
# permanently None even with a real key in .env - Python caches a module
# after its first import, so a later load_dotenv() call never re-read it.
load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import database
import google_oauth
import llm
import mailer
import models
from auth import (
    OTP_MAX_ATTEMPTS,
    OTP_TTL_MINUTES,
    create_access_token,
    decode_access_token,
    generate_otp,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)

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

ESTIMATE_DISCLAIMER = (
    "This is an ESTIMATE only, not a filing-ready or legally binding figure. "
    "Verify against the current NBR circular before filing."
)


def _vat_note(vat_required: bool) -> str:
    return "VAT required" if vat_required else "Below VAT threshold — Turnover Tax (3%) applies instead."


class TaxStrategy:
    """One algorithm per entity type, all producing the same TaxResult
    shape. calculate_tax() below just looks one up by entity_type and
    calls it - no per-request branching in the endpoint itself, and no
    entity type's math is tangled up with any other's."""

    def compute(self, query: "TaxQuery", signboard_tax: float) -> TaxResult:
        raise NotImplementedError


class IndividualTaxStrategy(TaxStrategy):
    def compute(self, query, signboard_tax):
        threshold, tax, min_applied = calculate_individual_tax(
            query.annual_income_or_turnover, query.taxpayer_category
        )
        notes = ["Individual income tax calculated using progressive slabs after tax-free threshold."]
        if min_applied:
            notes.append(f"Calculated tax was below minimum tax — flat BDT {MINIMUM_TAX} minimum tax applied.")
        notes.append(ESTIMATE_DISCLAIMER)

        return TaxResult(
            entity_type=query.entity_type.value,
            tax_free_threshold=threshold,
            income_tax_or_corporate_tax=tax,
            signboard_tax=signboard_tax,
            minimum_tax_applied=min_applied,
            total_estimated_liability=round(tax + signboard_tax, 2),
            notes=notes,
        )


class SoleProprietorshipTaxStrategy(TaxStrategy):
    def compute(self, query, signboard_tax):
        threshold, income_tax, min_applied = calculate_individual_tax(
            query.annual_income_or_turnover, query.taxpayer_category
        )
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes = ["Sole Proprietorship: owner taxed at individual rates; business also pays VAT/Turnover Tax + Trade License fee."]
        if min_applied:
            notes.append(f"Calculated income tax was below minimum — flat BDT {MINIMUM_TAX} minimum tax applied.")
        notes.append(_vat_note(vat_required))
        notes.append(ESTIMATE_DISCLAIMER)

        total = income_tax + vat_amount + trade_fee + signboard_tax
        return TaxResult(
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


class PartnershipTaxStrategy(TaxStrategy):
    def compute(self, query, signboard_tax):
        entity_tax = round(query.annual_income_or_turnover * PARTNERSHIP_TAX_RATE, 2)
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes = [
            "Partnership tax rate is a PLACEHOLDER (25%) — verify against current NBR partnership tax schedule.",
            _vat_note(vat_required),
            ESTIMATE_DISCLAIMER,
        ]

        total = entity_tax + vat_amount + trade_fee + signboard_tax
        return TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=entity_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            signboard_tax=signboard_tax,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )


class PrivateLimitedTaxStrategy(TaxStrategy):
    def compute(self, query, signboard_tax):
        corp_tax = round(query.annual_income_or_turnover * CORPORATE_TAX_RATE, 2)
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes = [
            "Corporate tax rate is APPROXIMATE (27.5% for non-listed companies) — verify against latest Finance Act, as sector-specific rates may apply.",
            _vat_note(vat_required),
            "Private Limited Companies must also register with RJSC and file annual returns.",
            ESTIMATE_DISCLAIMER,
        ]

        total = corp_tax + vat_amount + trade_fee + signboard_tax
        return TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=corp_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            signboard_tax=signboard_tax,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )


TAX_STRATEGIES = {
    EntityType.individual: IndividualTaxStrategy(),
    EntityType.sole_proprietorship: SoleProprietorshipTaxStrategy(),
    EntityType.partnership: PartnershipTaxStrategy(),
    EntityType.private_limited_company: PrivateLimitedTaxStrategy(),
}


@app.post("/api/calculate-tax", response_model=TaxResult)
def calculate_tax(
    query: TaxQuery,
    db: Session = Depends(database.get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    signboard_tax = calculate_signboard_tax(query.zone, query.signboard_size_sqft)
    result = TAX_STRATEGIES[query.entity_type].compute(query, signboard_tax)

    # REQ-4.5.2: persist to the logged-in user's tax profile/history, if any.
    if user:
        db.add(models.TaxCalculation(
            user_id=user.id,
            entity_type=query.entity_type.value,
            annual_income_or_turnover=query.annual_income_or_turnover,
            total_estimated_liability=result.total_estimated_liability,
            calculation_notes=result.notes,
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
    "on", "at", "by", "be", "am", "was", "were", "will", "if", "it", "this", "that", "so",
    "i", "my", "your", "im",
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


def _stem_variants(word: str) -> set:
    """Crude English suffix-stripping so word-boundary matching still finds
    "penalty" inside content written as "penalties", "file" inside
    "filing", etc. Returns a SET of candidate stems, not one string: naive
    "-ing"/"-ed" stripping alone turns "filing" into "fil", which then
    never matches the query word "file" (the silent-e English spelling
    pattern - file -> filing, not file -> fileing). Including both the
    bare-stripped form and the form with "e" added back covers that.
    Left alone for anything non-ASCII (Bengali keeps its written form,
    since the keyword lists were authored with the forms that actually
    appear in the content)."""
    if any(ord(ch) > 127 for ch in word):
        return {word}
    variants = {word}
    if len(word) > 5 and word.endswith("ies"):
        variants.add(word[:-3] + "y")
    if len(word) > 4 and word.endswith("es"):
        variants.add(word[:-2])
    if len(word) > 5 and word.endswith("ing"):
        base = word[:-3]
        variants.add(base)
        variants.add(base + "e")
    if len(word) > 4 and word.endswith("ed"):
        base = word[:-2]
        variants.add(base)
        variants.add(base + "e")
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        variants.add(word[:-1])
    return variants


def _word_set(text: str) -> set:
    """Whole-word, stemmed token set - not a substring. Avoids false hits
    like the word "miss" matching inside "Commissioner" that plain
    `word in text` substring checks were producing (that noise was the
    main reason secondary/"related" matches used to be near-random),
    while `_stem_variants()` keeps ordinary plural/verb-form variation working."""
    tokens = set()
    for w in _WORD_RE.findall(text.lower().translate(BN_TO_EN_DIGITS)):
        tokens |= _stem_variants(w)
    return tokens


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
            variants = _stem_variants(word)
            if variants & kw_tokens:
                score += 8
                keyword_hit = True
            if variants & topic_tokens:
                score += 6
                keyword_hit = True
            if variants & title_tokens:
                score += 4
            if variants & content_tokens:
                score += 2

        if score >= 1:
            matched_laws.append((score, law, keyword_hit))

    matched_laws.sort(key=lambda x: x[0], reverse=True)
    return matched_laws


# Guards the tax-calculation shortcut below so it only fires on an actual
# calculation request. Without this, ANY question mentioning a monetary
# figure over ৳50,000 - e.g. "I want to invest 2 lakh, is there a tax
# rebate for that?" - got hijacked into "let me calculate your income tax"
# instead of answering what was actually asked (Section 82, the rebate).
CALC_INTENT_RE = re.compile(
    r'(how\s+much|what\s+(?:will|is|would)|calculate|compute|কত|হিসাব).{0,25}(tax|liability|owe|pay|কর|ট্যাক্স)',
    re.IGNORECASE,
)


def _wants_tax_calculation(user_text: str) -> bool:
    return bool(CALC_INTENT_RE.search(user_text))


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
            f"4. **প্রগ্রেসিভ স্ল্যাব অনুযায়ী ধার্যকৃত আয়কর:** **{calculated_tax:,.0f} টাকা** *(Finance Act অনুযায়ী ধাপে ধাপে ১০%–৩০% হারে গণনাকৃত, একক হার নয়)*\n"
            f"5. **এনবিআর ন্যূনতম কর বিধান (ধারা ১৬৩):** করযোগ্য আয় থাকলে ন্যূনতম **৫,০০০ টাকা** প্রদেয় (এলাকাভেদে ৩,০০০–৫,০০০ টাকা)।"
        )

        summary_box = (
            f"💡 **সর্বমোট প্রদেয় আনুমানিক আয়কর:** **{final_tax:,.0f} টাকা**\n"
            f"*(দ্রষ্টব্য: বিনিয়োগ রেয়াত সুবিধা গ্রহণ করলে প্রদেয় কর আরও হ্রাস পেতে পারে)*"
        )

        advice_box = (
            f"### 📌 আপনার জন্য গুরুত্বপূর্ণ পরামর্শ\n"
            f"• **৩০শে নভেম্বরের পূর্বে রিটার্ন দাখিল:** আয়কর আইন ২০২৩ এর ১৮৩ ধারা অনুযায়ী \"ট্যাক্স ডে\" ৩০শে নভেম্বর; সময়মতো জমা না দিলে ২৬৫ ধারা অনুযায়ী জরিমানা প্রযোজ্য।\n"
            f"• **বিনিয়োগ রেয়াত (DPS/সঞ্চয়পত্র):** ৮২ ধারা অনুযায়ী অনুমোদনপ্রাপ্ত বিনিয়োগে রেয়াত দাবি করতে পারবেন (হার ও সীমা যাচাই করুন)।\n"
            f"• **প্রয়োজনীয় নথি:** ১২ ডিজিটের e-TIN, NID এবং ব্যাংক স্টেটমেন্ট প্রস্তুত রাখুন।"
        )

        footer = (
            f"---\n"
            f"📖 *আইনি ভিত্তি: আয়কর আইন ২০২৩ (ধারা ১৬৩ - ন্যূনতম কর; স্ল্যাব হার Finance Act অনুযায়ী, নির্দিষ্ট কোনো একক ধারায় বর্ণিত নয়)*\n"
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
            f"4. **Calculated Tax (progressive slabs):** **BDT {calculated_tax:,.0f}** *(computed step-by-step at 10%–30% per Finance Act slab, not a single flat rate)*\n"
            f"5. **NBR Minimum Tax Provision (Sec 163):** If taxable income > 0, a statutory minimum tax of **BDT 5,000** (or BDT 3,000–4,000 depending on area) applies regardless of the slab result."
        )

        summary_box = (
            f"💡 **Final Estimated Income Tax Payable:** **BDT {final_tax:,.0f}**\n"
            f"*(Note: Eligible investment rebates in DPS or Treasury Bonds can further reduce your tax liability)*"
        )

        advice_box = (
            f"### 📌 Recommended Action Steps for You\n"
            f"1. **File Before National Tax Day:** Section 183 sets **November 30** as Tax Day; filing late risks a penalty under Section 265.\n"
            f"2. **Claim Investment Rebates:** Section 82 allows a tax credit for approved investments (DPS, savings certificates, treasury bonds) - verify current rates and caps.\n"
            f"3. **Required Documentation:** Keep your 12-digit e-TIN certificate, NID copy, and bank statement ready."
        )

        footer = (
            f"---\n"
            f"📖 *Source Authority: Income Tax Act 2023 (Section 163 - Minimum Tax; slab rates per the Finance Act, not a single specific section)*\n"
            f"🔗 Official NBR Gazette Source PDF: [Official NBR Gazette Source PDF]({top_source_url})"
        )

        return f"{greeting}\n\n{context_header}\n\n{calculation_box}\n\n{summary_box}\n\n{advice_box}\n\n{footer}"


def synthesize_personalized_response(
    user: Optional[models.User],
    user_text: str,
    top_law: models.IncomeTaxLaw,
    is_bengali: bool,
    top_source_url: str,
    related_laws: Optional[list] = None,
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

    # Only take the calculation shortcut for an actual calculation request
    # (see CALC_INTENT_RE) - not just any question that happens to mention
    # a number, e.g. an investment-rebate question mentioning "2 lakh".
    income_val = extract_annual_income(user_text)
    if income_val and income_val >= 50_000 and _wants_tax_calculation(user_text):
        return compute_tax_breakdown_response(
            income=income_val,
            user_name=user_name,
            entity_title_en=entity_title_en,
            entity_title_bn=entity_title_bn,
            company_name=company_name,
            is_bengali=is_bengali,
            top_source_url=top_source_url,
        )

    # Real generation, grounded strictly in the retrieved law text (see
    # llm.py). Falls through to the deterministic template below if Groq
    # isn't configured or the call fails for any reason - the assistant
    # must keep working either way, just less naturally phrased.
    if llm.is_configured():
        try:
            def _excerpt(law):
                return {
                    "section_no": law.section_no,
                    "act_title": law.act_title,
                    "content": law.content_bn if is_bengali else law.content_en,
                }
            # Include qualifying related sections too (the same ones the
            # template's "Related Section" citations point at), not just
            # the single top match - a question like "what's the deadline
            # and what's the penalty" genuinely needs both to answer fully,
            # and without this Groq only ever saw the top law and had to
            # honestly say it didn't have the rest.
            excerpts = [_excerpt(top_law)] + [_excerpt(law) for law in (related_laws or [])]
            return llm.generate_grounded_answer(
                question=user_text,
                law_excerpts=excerpts,
                is_bengali=is_bengali,
                user_name=user_name,
                entity_title=entity_title_bn if is_bengali else entity_title_en,
                company_name=company_name,
            )
        except Exception as e:
            print(f"Groq call failed, falling back to templated answer: {e}")

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
        if income_val and income_val >= 50_000 and _wants_tax_calculation(user_text):
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
                "Income Tax Act 2023 (Section 163 - Minimum Tax Provisions)",
                "NBR Mandatory Return Filing Circular",
                f"[Official NBR Gazette: {top_source_url}]({top_source_url})"
            ]
        else:
            related_laws = [
                law for score, law, kw_hit in matched_laws[1:3]
                if law.section_no != top_law.section_no and kw_hit and score >= 12
            ]

            answer = synthesize_personalized_response(
                user=user,
                user_text=user_text,
                top_law=top_law,
                is_bengali=is_bengali,
                top_source_url=top_source_url,
                related_laws=related_laws,
            )

            sources = [f"{top_law.act_title} ({top_law.section_no})"]
            if top_law.sro_ref:
                sources.append(top_law.sro_ref)
            else:
                sources.append("NBR Mandatory Return Filing Circular")
            sources.append(f"[Official NBR Gazette: {top_source_url}]({top_source_url})")

            for law in related_laws:
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
# Email-verified signup (Gmail OTP) & "Continue with Google"
# =====================================================

class RequestSignupCode(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class VerifySignupCode(BaseModel):
    email: str
    code: str = Field(..., min_length=4, max_length=8)


class GoogleAuthRequest(BaseModel):
    # The ID token ("credential") Google Identity Services hands back to
    # the frontend after the user picks a Google account - see
    # google_oauth.py for how it's verified.
    credential: str


class RequestCodeResponse(BaseModel):
    success: bool
    message: str
    # Only ever populated when Gmail isn't configured on this server (see
    # mailer.is_configured) - a local-dev convenience so signup still
    # works end-to-end without setting up a real Gmail account. Never
    # set once GMAIL_ADDRESS/GMAIL_APP_PASSWORD are in .env.
    dev_code: Optional[str] = None


@app.post("/api/auth/signup/request-code", response_model=RequestCodeResponse)
def request_signup_code(payload: RequestSignupCode, db: Session = Depends(database.get_db)):
    """Step 1 of signup: validate, then email a 6-digit code instead of
    creating the account immediately. The account is only created once
    that code comes back in /verify-code - see EmailVerification's
    docstring in models.py."""
    if not payload.email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    email = payload.email.strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in instead.")

    # Drop any earlier pending code for this email so only the newest one
    # is ever valid (also lets "Resend code" just call this again).
    db.query(models.EmailVerification).filter(models.EmailVerification.email == email).delete()

    code = generate_otp()
    db.add(models.EmailVerification(
        email=email,
        code_hash=hash_otp(code),
        name=(payload.name or "").strip() or None,
        password_hash=hash_password(payload.password),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    ))
    db.commit()

    if mailer.is_configured():
        try:
            mailer.send_verification_email(email, code, name=payload.name)
        except Exception as e:
            # Row is already saved, so the user can still retry "Resend
            # code" once the server-side email problem is fixed - fail
            # the request rather than silently pretending it was sent.
            raise HTTPException(status_code=502, detail=f"Could not send verification email: {e}")
        return RequestCodeResponse(success=True, message=f"We emailed a 6-digit code to {email}.")

    # No Gmail credentials configured on this server - print instead of
    # emailing so local development doesn't require setting one up.
    print(f"📧 [DEV] Verification code for {email}: {code} (expires in {OTP_TTL_MINUTES} min)")
    return RequestCodeResponse(
        success=True,
        message="Email isn't configured on this server, so your code was printed to the backend console instead.",
        dev_code=code,
    )


@app.post("/api/auth/signup/verify-code", response_model=AuthResponse)
def verify_signup_code(payload: VerifySignupCode, db: Session = Depends(database.get_db)):
    """Step 2 of signup: confirm the code, then actually create the
    account and log the user in - the same shape /api/auth/signup returns."""
    email = payload.email.strip().lower()
    code = payload.code.strip()

    pending = (
        db.query(models.EmailVerification)
        .filter(models.EmailVerification.email == email)
        .order_by(models.EmailVerification.id.desc())
        .first()
    )
    if not pending:
        raise HTTPException(status_code=400, detail="No verification code was requested for this email. Please start signup again.")

    expires_at = pending.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")

    if pending.attempts >= OTP_MAX_ATTEMPTS:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")

    if not verify_otp(code, pending.code_hash):
        pending.attempts += 1
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - pending.attempts
        raise HTTPException(status_code=400, detail=f"Incorrect code. {remaining} attempt(s) left.")

    # Re-check for a race (two verify calls, or the email got registered
    # via another path while this code was outstanding) rather than
    # letting the DB's unique constraint surface as a raw 500.
    if db.query(models.User).filter(models.User.email == email).first():
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in instead.")

    username = email.split("@")[0].capitalize()
    new_user = models.User(
        email=email,
        name=pending.name or username,
        password_hash=pending.password_hash,
        entity_type="individual",
    )
    db.add(new_user)
    db.delete(pending)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(new_user.id)
    return AuthResponse(
        success=True,
        token=token,
        user=_user_public_dict(new_user),
        message="Email verified — account created successfully",
    )


@app.post("/api/auth/google", response_model=AuthResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(database.get_db)):
    """'Continue with Google' for both signup and login - Google has
    already verified the user's email, so there is no separate OTP step
    here. Logs into an existing account by email if one exists (and
    links google_id to it), otherwise creates a new one."""
    try:
        info = google_oauth.verify_id_token(payload.credential)
    except google_oauth.GoogleTokenError as e:
        raise HTTPException(status_code=401, detail=str(e))

    email = info["email"].strip().lower()
    google_id = info["sub"]
    name = info.get("name") or email.split("@")[0].capitalize()

    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        if not user.google_id:
            user.google_id = google_id
            db.commit()
            db.refresh(user)
    else:
        user = models.User(
            email=email,
            name=name,
            # Nobody knows this password - the account can only be
            # logged into via Google. Still hashed like any other, so
            # verify_password() has nothing special to know about.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            entity_type="individual",
            google_id=google_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(
        success=True,
        token=token,
        user=_user_public_dict(user),
        message="Successfully signed in with Google",
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
    # No demo rows here on purpose: a user with no transactions yet gets an
    # honest empty list, not fake invoices from "Daraz"/"Apex Footwear"/
    # "Beximco Pharma" that could be mistaken for real ledger data. The
    # frontend renders a proper empty state instead (see MushakView.tsx).
    query = db.query(models.MushakTransaction)
    if user:
        query = query.filter(models.MushakTransaction.user_id == user.id)
    txs = query.order_by(models.MushakTransaction.id.desc()).all()
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


def _safe_date(year: int, month: int, day: int) -> date:
    """Clamps day to the last real day of the month (e.g. no Feb 30)."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _next_occurrence(anchor_date_str: str, recurrence: str) -> date:
    """The actual fix for a calendar that goes stale: `anchor_date_str` is
    never shown as-is. For "monthly" only its day-of-month is used; for
    "annual" only its month+day - the real occurrence is always the next
    one on or after today. A "one_time" anchor is returned unchanged."""
    today = date.today()
    try:
        anchor = datetime.strptime(anchor_date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return today

    if recurrence == "monthly":
        candidate = _safe_date(today.year, today.month, anchor.day)
        if candidate < today:
            month, year = (today.month % 12) + 1, today.year + (today.month // 12)
            candidate = _safe_date(year, month, anchor.day)
        return candidate

    if recurrence == "annual":
        candidate = _safe_date(today.year, anchor.month, anchor.day)
        if candidate < today:
            candidate = _safe_date(today.year + 1, anchor.month, anchor.day)
        return candidate

    return anchor


def _urgency(due: date) -> str:
    days_left = (due - date.today()).days
    if days_left <= 7:
        return "urgent"
    if days_left <= 30:
        return "upcoming"
    return "valid"


def _dynamic_deadlines(db: Session) -> List[dict]:
    computed = [
        {
            "title_en": d.title_en,
            "title_bn": d.title_bn,
            "description_en": d.description_en,
            "description_bn": d.description_bn,
            "category": d.category,
            "due_date": (due := _next_occurrence(d.due_date, d.recurrence or "one_time")).isoformat(),
            "status": _urgency(due),
        }
        for d in db.query(models.ComplianceDeadline).all()
    ]
    computed.sort(key=lambda x: x["due_date"])
    return computed


@app.get("/api/calendar/deadlines")
def get_compliance_deadlines(db: Session = Depends(database.get_db)):
    return _dynamic_deadlines(db)


@app.get("/api/dashboard/summary")
def get_dashboard_summary(
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(database.get_db),
):
    """Everything here is computed from real rows, not fabricated - there's
    no NBR audit-selection data this app has access to, so there's no
    honest "audit risk %" to compute; that field (and the fake RJSC
    number, and the flat "92/100" score) is gone rather than replaced
    with a different invented number."""
    upcoming_deadlines = _dynamic_deadlines(db)[:3]

    if not user:
        return {
            "logged_in": False,
            "profile_completeness_percent": 0,
            "registered_entity_type": None,
            "saved_calculations_count": 0,
            "last_calculation": None,
            "upcoming_deadlines": upcoming_deadlines,
        }

    profile_fields = [user.name, user.tin, user.nid, user.phone, user.business_address, user.tax_zone, user.entity_type]
    completeness = round(100 * sum(1 for f in profile_fields if f) / len(profile_fields))

    saved_calculations_count = (
        db.query(models.TaxCalculation).filter(models.TaxCalculation.user_id == user.id).count()
    )
    recent_calc = (
        db.query(models.TaxCalculation)
        .filter(models.TaxCalculation.user_id == user.id)
        .order_by(models.TaxCalculation.calculated_at.desc())
        .first()
    )

    return {
        "logged_in": True,
        "profile_completeness_percent": completeness,
        "registered_entity_type": user.entity_type,
        "saved_calculations_count": saved_calculations_count,
        "last_calculation": {
            "entity_type": recent_calc.entity_type,
            "liability": recent_calc.total_estimated_liability,
        } if recent_calc else None,
        "upcoming_deadlines": upcoming_deadlines,
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
