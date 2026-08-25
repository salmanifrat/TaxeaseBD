"""
TaxEaseBD - Compliance calendar deadlines (hardcoded seed data)
-------------------------------------------------------------------
`due_date` here is an ANCHOR, not a literal date to display as-is: for a
"monthly" recurrence only the day-of-month matters (e.g. VAT return due
the 15th of every month); for "annual" only the month+day matters (e.g.
Tax Day is always November 30). main.py computes the real next
occurrence relative to today from this anchor - that's what makes the
calendar not go stale the way a fixed stored date did (a deadline of
"2026-08-15" silently becomes a deadline that already passed once today
moves past the 15th).

database.py syncs this table from this list on every backend startup,
same as the income tax law dataset - editing this file is the only way
to change the deadlines, no separate SQL editing.
"""

COMPLIANCE_DEADLINES = [
    {
        "title_en": "Mushak 9.1 Monthly VAT Return",
        "title_bn": "মুসক ৯.১ মাসিক ভ্যাট রিটার্ন দাখিল",
        "description_en": "File monthly VAT return for the preceding month at NBR eVAT portal (vat.gov.bd) to avoid BDT 10,000 penalty.",
        "description_bn": "১০,০০০ টাকা জরিমানা এড়াতে NBR eVAT পোর্টালে (vat.gov.bd) পূর্ববর্তী মাসের ভ্যাট রিটার্ন দাখিল করুন।",
        "due_date": "2026-01-15",  # anchor: 15th of every month
        "recurrence": "monthly",
        "category": "VAT",
    },
    {
        "title_en": "Trade License Annual Renewal",
        "title_bn": "ট্রেড লাইসেন্স বার্ষিক নবায়ন",
        "description_en": "Annual trade license renewal with local City Corporation or Municipality without surcharge.",
        "description_bn": "সারচার্জ ছাড়া স্থানীয় সিটি কর্পোরেশনে বার্ষিক ট্রেড লাইসেন্স নবায়ন।",
        "due_date": "2026-06-30",  # anchor: June 30 every year
        "recurrence": "annual",
        "category": "Trade License",
    },
    {
        "title_en": "Individual Income Tax Day Filing",
        "title_bn": "ব্যক্তিগত আয়কর রিটার্ন দাখিল (ট্যাক্স ডে)",
        "description_en": "National Tax Day deadline for filing individual income tax returns under Income Tax Act 2023 Section 183.",
        "description_bn": "আয়কর আইন ২০২৩ এর ১৮৩ ধারা অনুযায়ী ব্যক্তিগত আয়কর রিটার্ন দাখিলের জাতীয় ট্যাক্স ডে সময়সীমা।",
        "due_date": "2026-11-30",  # anchor: November 30 every year
        "recurrence": "annual",
        "category": "Income Tax",
    },
    {
        "title_en": "RJSC Form 23 & Audited Accounts",
        "title_bn": "আরজেএসসি ফরম ২৩ ও নিরীক্ষিত হিসাবপত্র দাখিল",
        "description_en": "Filing of Annual Return (Form 23) and Audited Financial Statements with RJSC within 30 days of AGM for Private Limited companies.",
        "description_bn": "প্রাইভেট লিমিটেড কোম্পানির এজিএমের ৩০ দিনের মধ্যে আরজেএসসিতে বার্ষিক রিটার্ন (ফরম ২৩) ও নীরিক্ষিত আর্থিক বিবরণী দাখিল।",
        # Generic placeholder anchor (Dec 31) - a real company's actual
        # deadline depends on its own AGM date, which this app doesn't
        # track per-user yet.
        "due_date": "2026-12-31",
        "recurrence": "annual",
        "category": "RJSC",
    },
]
