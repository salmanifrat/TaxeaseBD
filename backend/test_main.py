"""
Unit tests for TaxEaseBD Backend AI Engine & Tax Calculation Logic.
Runs without external network dependencies.
"""

import unittest
from database import SessionLocal
from main import (
    ChatQuery,
    TaxQuery,
    EntityType,
    chat_assistant,
    calculate_tax,
    _tokenize,
    extract_annual_income,
    compute_tax_breakdown_response,
    _score_laws,
)
from models import IncomeTaxLaw


class TestTaxEaseBDBackend(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    # ----------------------------------------------------
    # 1. AI Feature: Tokenization & Digit Normalization
    # ----------------------------------------------------
    def test_tokenize_bengali_digits_and_lowercasing(self):
        tokens = _tokenize("আয়কর আইন ২০২৩ এর ১৮৪ ধারা")
        # Bengali digits "২০২৩" should normalize to "2023", "১৮৪" to "184"
        self.assertIn("2023", tokens)
        self.assertIn("184", tokens)

    def test_tokenize_english(self):
        tokens = _tokenize("Section 184 mandatory PSR return proof")
        self.assertIn("184", tokens)
        self.assertIn("mandatory", tokens)
        self.assertIn("psr", tokens)

    # ----------------------------------------------------
    # 2. AI Feature: Natural Language Income Parser
    # ----------------------------------------------------
    def test_extract_annual_income_lakh(self):
        income = extract_annual_income("My annual salary is 5 lakh BDT")
        self.assertEqual(income, 500000.0)

    def test_extract_annual_income_bengali_lakh(self):
        income = extract_annual_income("আমার বার্ষিক আয় ১০ লাখ টাকা")
        self.assertEqual(income, 1000000.0)

    def test_extract_annual_income_k(self):
        income = extract_annual_income("I earn 600k a year")
        self.assertEqual(income, 600000.0)

    def test_extract_annual_income_raw_number(self):
        income = extract_annual_income("Calculate tax for 750,000 income")
        self.assertEqual(income, 750000.0)

    # ----------------------------------------------------
    # 3. Strategy Pattern: Tax Breakdown Computation
    # ----------------------------------------------------
    def test_compute_tax_breakdown_tax_free(self):
        # Income below threshold BDT 375,000 -> 0 tax
        response = compute_tax_breakdown_response(
            income=350000,
            user_name="Rahim",
            entity_title_en="Individual Taxpayer",
            entity_title_bn="ব্যক্তিগত করদাতা",
            company_name=None,
            is_bengali=False,
            top_source_url="https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"
        )
        self.assertIn("BDT 350,000", response)
        self.assertIn("Official NBR Gazette Source PDF", response)

    def test_compute_tax_breakdown_taxable(self):
        # Gross: 500,000 -> Taxable: 125,000 -> Calculated tax 10%: 12,500
        response = compute_tax_breakdown_response(
            income=500000,
            user_name="Karim",
            entity_title_en="Individual Taxpayer",
            entity_title_bn="ব্যক্তিগত করদাতা",
            company_name=None,
            is_bengali=False,
            top_source_url="https://nbr.gov.bd/uploads/acts/Income_tax_act_2023.pdf"
        )
        self.assertIn("12,500", response)
        self.assertIn("Section 163", response)  # minimum tax provision
        self.assertIn("Official NBR Gazette Source PDF", response)

    # ----------------------------------------------------
    # 4. Search & Keyword Matching Scoring Engine
    # ----------------------------------------------------
    def test_score_laws_relevance(self):
        sample_law = IncomeTaxLaw(
            section_no="Section 184",
            act_title="Income Tax Act 2023",
            chapter_topic="Proof of Submission of Return (PSR)",
            content_en="Section 184 mandates proof of return submission for 40+ public services.",
            content_bn="১৮৪ ধারা অনুযায়ী পিএসআর দাখিল বাধ্যতামূলক।",
            keywords="section 184, psr, proof of return, ১৮৪ ধারা"
        )
        scores = _score_laws([sample_law], ["184", "psr"])
        self.assertTrue(len(scores) > 0)
        top_score, matched_law, kw_hit = scores[0]
        self.assertEqual(matched_law.section_no, "Section 184")
        self.assertGreater(top_score, 0)

    # ----------------------------------------------------
    # 5. Direct Endpoint Execution Tests (/api/chat, /api/calculate-tax)
    # ----------------------------------------------------
    def test_chat_assistant_legal_query(self):
        # Answer text is now LLM-phrased prose (Groq), so it no longer
        # contains a fixed template string - assert on the structured
        # `sources`/`grounded` fields instead, which stay deterministic.
        query = ChatQuery(message="Section 184 mandatory PSR proof of return", language="en")
        response = chat_assistant(query=query, db=self.db, user=None)
        self.assertIsNotNone(response.answer)
        self.assertTrue(response.grounded)
        self.assertTrue(len(response.sources) > 0)
        self.assertTrue(any("nbr.gov.bd" in s for s in response.sources))

    def test_chat_assistant_numerical_query(self):
        query = ChatQuery(message="Calculate tax for 6 lakh income", language="en")
        response = chat_assistant(query=query, db=self.db, user=None)
        self.assertIn("Income Tax Calculation Breakdown", response.answer)
        self.assertIn("Official NBR Gazette Source PDF", response.answer)

    def test_calculate_tax_function(self):
        query = TaxQuery(entity_type=EntityType.individual, annual_income_or_turnover=600000)
        response = calculate_tax(query=query, db=self.db, user=None)
        self.assertEqual(response.tax_free_threshold, 375000.0)
        self.assertEqual(response.income_tax_or_corporate_tax, 22500.0)


if __name__ == "__main__":
    unittest.main()
