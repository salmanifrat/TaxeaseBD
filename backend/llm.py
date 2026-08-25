"""
TaxEaseBD - Groq-backed answer generation
--------------------------------------------
This is the "generation" half of RAG. Retrieval - deciding WHICH law
section(s) are actually relevant to a question - happens in main.py's
_score_laws()/chat_assistant() and is unchanged by this file. This module
only rephrases what retrieval already found; it is never handed the
question without also being handed the grounding text, and it is
instructed not to state anything as fact beyond that text.

Setup: get a free API key at https://console.groq.com, then set
GROQ_API_KEY in backend/.env. If it's not set, or the API call fails for
any reason (network, bad key, rate limit, model deprecated), callers must
catch the exception and fall back to a plain templated answer - the app
has to keep working without Groq, just less polished.
"""
import os
from typing import List, Optional

from groq import Groq

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# Override in .env if this model gets deprecated - check
# console.groq.com/docs/models for the current lineup.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

_client: Optional[Groq] = None


def is_configured() -> bool:
    return bool(GROQ_API_KEY)


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def generate_grounded_answer(
    question: str,
    law_excerpts: List[dict],
    history: Optional[List[dict]] = None,
    is_bengali: bool = False,
    user_name: Optional[str] = None,
    entity_title: Optional[str] = None,
    company_name: Optional[str] = None,
) -> str:
    """
    law_excerpts: [{"section_no", "act_title", "content"}, ...] - already
    the laws main.py's retrieval decided are relevant, and already in the
    right language (content_bn or content_en). This function does not
    choose which laws to use, only explains them - it must not introduce
    a rate, date, form name, or procedure that isn't in the excerpt text.
    """
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")

    context = "\n\n".join(
        f"[{law['act_title']} - {law['section_no']}]\n{law['content']}"
        for law in law_excerpts
    )

    who = ""
    if user_name or entity_title:
        who = (
            f"The user's name is {user_name or 'unknown'} and they are registered as a "
            f"{entity_title or 'taxpayer'}"
            + (f" ({company_name})" if company_name else "")
            + ". You may greet them by name and refer to their entity type, but do not "
            "invent other details about their situation."
        )

    system_prompt = (
        "You are TaxEaseBD's tax compliance assistant for Bangladesh, helping small "
        "business owners, freelancers, and people with no legal background understand "
        "their tax obligations.\n\n"
        "Hard rules - breaking these makes the answer unsafe to publish:\n"
        "1. Use ONLY the law excerpts below for any fact: rates, thresholds, dates, "
        "penalties, form names, or procedures. Never state a number or rule that is "
        "not written in the excerpts, even if you believe it to be generally true.\n"
        "2. If the excerpts don't actually answer what was asked, say so plainly "
        "instead of filling the gap with general knowledge.\n"
        "3. Explain in plain, everyday language for someone who has never read a law "
        "before - avoid legal jargon where you can, and keep it concise (a few short "
        "paragraphs, not an essay).\n"
        "4. Always name the specific section number(s) your answer is based on.\n"
        "5. You may add generic, universally-safe next steps (e.g. \"keep your TIN, "
        "NID, and bank statement ready\", \"file before the deadline noted above\") "
        "but do not invent specific figures, extra sections, or procedures beyond the "
        "excerpts.\n"
        f"6. {'Answer in Bengali (বাংলা).' if is_bengali else 'Answer in English.'} "
        "If the user wrote in Banglish (Bengali typed in English letters) or mixed "
        "English/Bengali, understand it, but still answer in the language from rule 6.\n\n"
        + (who + "\n\n" if who else "")
        + f"Relevant law excerpts (this is your only source of facts):\n{context}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for item in (history or [])[-6:]:
        role = "assistant" if item.get("role") == "ai" else "user"
        text = item.get("text", "")
        if text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": question})

    response = _get_client().chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=0.2,
        max_tokens=700,
        timeout=10,
    )
    text = response.choices[0].message.content
    if not text or not text.strip():
        raise RuntimeError("Groq returned an empty response")
    return text.strip()
