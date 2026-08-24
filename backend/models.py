from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    tin = Column(String, nullable=True)
    entity_type = Column(String, default="individual")
    phone = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    business_address = Column(String, nullable=True)
    nid = Column(String, nullable=True)
    tax_zone = Column(String, nullable=True)
    profile_picture = Column(String, nullable=True)
    income_range = Column(String, nullable=True)
    rjsc_reg_no = Column(String, nullable=True)
    is_email_verified = Column(Integer, default=0)
    verification_otp = Column(String, nullable=True)
    otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    managed_companies = Column(JSON, nullable=True)
    uploaded_documents = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TaxCalculation(Base):
    __tablename__ = "tax_calculations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    entity_type = Column(String, nullable=False)
    annual_income_or_turnover = Column(Float, nullable=False)
    total_estimated_liability = Column(Float, nullable=False)
    calculation_notes = Column(JSON, nullable=True)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_message = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class IncomeTaxLaw(Base):
    __tablename__ = "income_tax_laws"

    id = Column(Integer, primary_key=True, index=True)
    section_no = Column(String(100), nullable=False)
    act_title = Column(String(255), nullable=False)
    chapter_topic = Column(String(255), nullable=False)
    content_en = Column(Text, nullable=False)
    content_bn = Column(Text, nullable=False)
    sro_ref = Column(String(255), nullable=True)
    effective_year = Column(String(50), default="2023-2026")
    keywords = Column(Text, nullable=False)
    source_url = Column(String(500), default="https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf")


class MushakTransaction(Base):
    __tablename__ = "mushak_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    transaction_date = Column(String(20), nullable=False)
    invoice_no = Column(String(100), nullable=False)
    customer_name = Column(String(255), nullable=False)
    item_description = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    vat_rate = Column(Float, default=15.0)
    vat_amount = Column(Float, nullable=False)
    input_credit = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ComplianceDeadline(Base):
    __tablename__ = "compliance_deadlines"

    id = Column(Integer, primary_key=True, index=True)
    title_en = Column(String(255), nullable=False)
    title_bn = Column(String(255), nullable=False)
    description_en = Column(Text, nullable=False)
    description_bn = Column(Text, nullable=False)
    due_date = Column(String(20), nullable=False)
    category = Column(String(50), nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

