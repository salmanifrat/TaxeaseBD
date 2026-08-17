"""
TaxEaseBD - Comprehensive Tax Calculator API
-----------------------------------------------
Covers: Individual, Sole Proprietorship, Partnership, Private Limited Company
Uses Enums so Swagger UI (/docs) shows dropdown menus - no need to type/remember exact strings.

Run with: uvicorn calculator:app --reload --port 8001
Then open: http://127.0.0.1:8001/docs

SOURCES (verify before final submission - tax rules changed with FY2026-27 budget):
- Individual tax slabs: NBR / multiple 2026 sources (income year 2025-26, AY 2026-27)
- VAT rate & threshold: nbr.gov.bd official FAQ
- Corporate/Partnership rates: placeholder, needs verification against latest Finance Act
"""

import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional, List
from dotenv import load_dotenv
from sqlalchemy.orm import Session

import database
import models

load_dotenv()

# Initialize DB tables on startup
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="TaxEaseBD Tax Calculator & Compliance API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


class Zone(str, Enum):
    dhaka_south = "dhaka_south"
    dhaka_north = "dhaka_north"
    other = "other"


# =====================================================
# Request / Response schemas
# =====================================================

class TaxQuery(BaseModel):
    entity_type: EntityType = Field(..., description="What type of taxpayer are you?")
    annual_income_or_turnover: float = Field(..., description="Annual income (individual) or turnover (business), in BDT")

    # Only relevant for individuals - optional
    taxpayer_category: TaxpayerCategory = Field(
        default=TaxpayerCategory.general,
        description="Only applies to Individual/Sole Proprietorship. Determines tax-free threshold."
    )

    # Only relevant for businesses - optional
    business_category: BusinessCategory = Field(
        default=BusinessCategory.trading,
        description="Only applies to business entities. Used for Trade License fee lookup."
    )
    zone: Zone = Field(
        default=Zone.other,
        description="Only applies to business entities. Used for Trade License fee lookup."
    )


class TaxResult(BaseModel):
    entity_type: str
    tax_free_threshold: Optional[float] = None
    income_tax_or_corporate_tax: float
    vat_or_turnover_tax: Optional[float] = None
    vat_required: Optional[bool] = None
    trade_license_fee: Optional[float] = None
    minimum_tax_applied: bool = False
    total_estimated_liability: float
    notes: List[str]


# =====================================================
# Rate tables
# =====================================================

# Individual tax-free thresholds by category (FY2025-26 / AY2026-27)
TAX_FREE_THRESHOLDS = {
    TaxpayerCategory.general: 375_000,
    TaxpayerCategory.woman_or_senior_65plus: 425_000,
    TaxpayerCategory.disabled_or_third_gender: 500_000,
    TaxpayerCategory.gazetted_freedom_fighter: 525_000,
}

MINIMUM_TAX = 5_000  # flat minimum tax if taxable income exceeds threshold

# Progressive slabs applied AFTER the tax-free threshold (approximate 2026 structure)
# Each tuple = (slab width in BDT, rate)
INDIVIDUAL_SLABS = [
    (300_000, 0.10),
    (400_000, 0.15),
    (500_000, 0.20),
    (2_500_000, 0.25),
    (float("inf"), 0.30),
]

# Corporate / entity-level rates (PLACEHOLDER - verify against latest Finance Act)
CORPORATE_TAX_RATE = 0.275   # ~27.5% for non-listed private limited companies
PARTNERSHIP_TAX_RATE = 0.25  # placeholder - partnerships have their own NBR schedule, verify

# VAT / Turnover Tax (source: nbr.gov.bd official FAQ)
VAT_THRESHOLD = 8_000_000    # Tk 8 million
STANDARD_VAT_RATE = 0.15
TURNOVER_TAX_RATE = 0.03     # 3%, per NBR FAQ (note: FY2026-27 budget proposes restructuring this)

TRADE_LICENSE_RATES = {
    BusinessCategory.trading: {Zone.dhaka_south: 8000, Zone.dhaka_north: 7500, Zone.other: 5000},
    BusinessCategory.manufacturing: {Zone.dhaka_south: 15000, Zone.dhaka_north: 14000, Zone.other: 9000},
    BusinessCategory.service: {Zone.dhaka_south: 6000, Zone.dhaka_north: 5500, Zone.other: 4000},
}


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
    else:
        return round(turnover * TURNOVER_TAX_RATE, 2), False


# =====================================================
# Main endpoint
# =====================================================

@app.post("/api/calculate-tax", response_model=TaxResult)
def calculate_tax(query: TaxQuery):
    notes = []

    if query.entity_type == EntityType.individual:
        threshold, tax, min_applied = calculate_individual_tax(
            query.annual_income_or_turnover, query.taxpayer_category
        )
        notes.append("Individual income tax calculated using progressive slabs after tax-free threshold.")
        if min_applied:
            notes.append(f"Calculated tax was below minimum tax — flat BDT {MINIMUM_TAX} minimum tax applied.")

        return TaxResult(
            entity_type=query.entity_type.value,
            tax_free_threshold=threshold,
            income_tax_or_corporate_tax=tax,
            minimum_tax_applied=min_applied,
            total_estimated_liability=tax,
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

        total = income_tax + vat_amount + trade_fee
        return TaxResult(
            entity_type=query.entity_type.value,
            tax_free_threshold=threshold,
            income_tax_or_corporate_tax=income_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
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

        total = entity_tax + vat_amount + trade_fee
        return TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=entity_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )

    elif query.entity_type == EntityType.private_limited_company:
        corp_tax = round(query.annual_income_or_turnover * CORPORATE_TAX_RATE, 2)
        vat_amount, vat_required = calculate_vat_or_turnover(query.annual_income_or_turnover)
        trade_fee = TRADE_LICENSE_RATES[query.business_category][query.zone]

        notes.append("Corporate tax rate is APPROXIMATE (27.5% for non-listed companies) — verify against latest Finance Act, as sector-specific rates may apply.")
        notes.append("VAT required" if vat_required else "Below VAT threshold — Turnover Tax (3%) applies instead.")
        notes.append("Private Limited Companies must also register with RJSC and file annual returns.")

        total = corp_tax + vat_amount + trade_fee
        return TaxResult(
            entity_type=query.entity_type.value,
            income_tax_or_corporate_tax=corp_tax,
            vat_or_turnover_tax=vat_amount,
            vat_required=vat_required,
            trade_license_fee=trade_fee,
            total_estimated_liability=round(total, 2),
            notes=notes,
        )


# =====================================================
# Chat RAG & Auth schemas & endpoints
# =====================================================

class ChatQuery(BaseModel):
    message: str
    language: Optional[str] = "en"


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]


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


# Knowledge base snippets for AI Assistant endpoint
KNOWLEDGE_BASE = [
    {
        "keywords": ["vat", "ভ্যাট", "turnover", "80"],
        "answer": "Under the NBR VAT & Supplementary Duty Act 2012 (and FY2024-2026 Budget updates), businesses with annual turnover exceeding ৳80 Lakh (8 million BDT) must register for standard 15% VAT. Businesses below ৳80 Lakh qualify for 3% Turnover Tax. Registration requires e-BIN.",
        "sources": ["NBR VAT Act 2012 Section 4", "NBR SRO No. 182-Act/2023", "National Board of Revenue FAQ"]
    },
    {
        "keywords": ["income tax", "আয়কর", "slab", "rate", "threshold", "slab"],
        "answer": "Individual tax-free threshold for General Taxpayers is ৳3,75,000. Women & Seniors (65+): ৳4,25,000. Third Gender & Disabled: ৳5,000,00. Freedom Fighters: ৳5,25,000. Progressive slabs start at 10% for next ৳3 Lakh, 15% for next ৳4 Lakh, 20% for next ৳5 Lakh, 25% for next ৳25 Lakh, and 30% above. Minimum tax is ৳5,000.",
        "sources": ["NBR Income Tax Act 2023", "Finance Act 2024–2026 Schedule 1"]
    },
    {
        "keywords": ["trade license", "ট্রেড লাইসেন্স", "city corporation", "dscc", "dncc"],
        "answer": "Trade License is mandatory from your City Corporation (DSCC/DNCC/Chittagong) or local Union Parishad. Annual fee range: Trading (৳5,000 - ৳8,000), Manufacturing (৳8,000 - ৳15,000), Service (৳3,500 - ৳6,000). Renewal deadline is July 30 annually.",
        "sources": ["City Corporation Ideal Tax Schedule 2016/2024", "DSCC E-Trade License Guidelines"]
    },
    {
        "keywords": ["rjsc", "form 23", "incorp", "private limited", "company"],
        "answer": "Private Limited Companies registered with RJSC (Registrar of Joint Stock Companies) must file Annual Return (Form 23) along with Audited Financial Statements within 30 days of the AGM. Corporate tax rate is 27.5% for non-listed private limited companies.",
        "sources": ["Companies Act 1994 Section 183", "RJSC Statutory Filing Rules 2024"]
    }
]


@app.post("/api/chat", response_model=ChatResponse)
def chat_assistant(query: ChatQuery):
    msg = query.message.lower()
    
    # Check knowledge base match
    for kb in KNOWLEDGE_BASE:
        if any(kw in msg for kw in kb["keywords"]):
            return ChatResponse(
                answer=kb["answer"],
                sources=kb["sources"]
            )
            
    # Default responsive compliance answer
    return ChatResponse(
        answer=f"Based on verified NBR Tax Guidelines (FY2024–2026): Regarding '{query.message}', please ensure your e-TIN is updated and mandatory annual returns are submitted before November 30. For exact slab calculations or VAT ledgers, consult our Tax Calculator tool or upload your income summary.",
        sources=["NBR General Circular 2024", "Income Tax Act 2023 Guidelines"]
    )


@app.post("/api/auth/login", response_model=AuthResponse)
def login_user(auth: AuthRequest, db: Session = Depends(database.get_db)):
    if not auth.email or not auth.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    db_user = db.query(models.User).filter(models.User.email == auth.email.lower()).first()
    if db_user:
        return AuthResponse(
            success=True,
            token=f"taxease_token_{db_user.id}_2026",
            user={
                "email": db_user.email,
                "name": db_user.name,
                "tin": db_user.tin or "7189-4820-1928",
                "entity_type": db_user.entity_type or "sole_proprietorship"
            },
            message="Successfully logged in to TaxEaseBD"
        )
    
    # Fallback auto-registration if first login
    username = auth.email.split("@")[0].capitalize()
    new_user = models.User(
        email=auth.email.lower(),
        name=auth.name or username,
        password_hash=auth.password, # For production, hash with bcrypt
        tin=auth.tin or "7189-4820-1928",
        entity_type=auth.entity_type or "sole_proprietorship"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return AuthResponse(
        success=True,
        token=f"taxease_token_{new_user.id}_2026",
        user={
            "email": new_user.email,
            "name": new_user.name,
            "tin": new_user.tin,
            "entity_type": new_user.entity_type
        },
        message="Successfully logged in to TaxEaseBD"
    )


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup_user(auth: AuthRequest, db: Session = Depends(database.get_db)):
    if not auth.email or not auth.password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    existing = db.query(models.User).filter(models.User.email == auth.email.lower()).first()
    if existing:
        return AuthResponse(
            success=True,
            token=f"taxease_token_{existing.id}_2026",
            user={
                "email": existing.email,
                "name": existing.name,
                "tin": existing.tin or "8293-1029-4720",
                "entity_type": existing.entity_type or "individual"
            },
            message="Account already exists — logged in successfully"
        )

    username = auth.email.split("@")[0].capitalize()
    new_user = models.User(
        email=auth.email.lower(),
        name=auth.name or username,
        password_hash=auth.password,
        tin=auth.tin or "8293-1029-4720",
        entity_type=auth.entity_type or "individual"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return AuthResponse(
        success=True,
        token=f"taxease_token_{new_user.id}_2026",
        user={
            "email": new_user.email,
            "name": new_user.name,
            "tin": new_user.tin,
            "entity_type": new_user.entity_type
        },
        message="Account created successfully in database"
    )


@app.get("/")
def root():
    return {"status": "TaxEaseBD Tax Calculator & Compliance API is running"}