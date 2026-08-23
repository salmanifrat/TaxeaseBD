# TaxEaseBD

A bilingual (English/Bengali) tax and compliance platform for Bangladeshi small
businesses, freelancers, and MSMEs. See `SRS-for-TaxEaseBD.pdf` for the full
product spec.

## Quick start

**macOS / Linux:**
```bash
./start-mac.sh
```

**Windows:**
```bat
start-windows.bat
```

Either script creates a fresh Python virtual environment, installs both the
backend and frontend dependencies, and starts both dev servers. First run
takes a minute or two; after that it's fast.

Once it's running, open **http://localhost:3000**.
The backend API lives at `http://127.0.0.1:8000` (interactive docs at `/docs`).

### Manual setup (if you'd rather not use the scripts)

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then edit JWT_SECRET
python main.py                   # serves on :8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                      # serves on :3000
```

## Project layout

| Feature (SRS §4)                     | Frontend page                                             | Backend                                  |
|---------------------------------------|-------------------------------------------------------------|-------------------------------------------|
| Landing / marketing page              | `frontend/src/components/LandingPage.tsx`                  | —                                          |
| Login                                  | `frontend/src/components/LoginPage.tsx`                    | `POST /api/auth/login`                    |
| Signup                                 | `frontend/src/components/SignupPage.tsx`                   | `POST /api/auth/signup`                   |
| Dashboard / home                       | `frontend/src/components/DashboardView.tsx`                 | `GET /api/history` (once logged in)       |
| 4.2 Multi-Entity Tax Calculator        | `frontend/src/components/CalculatorView.tsx`                | `POST /api/calculate-tax`                 |
| Business Structure Simulator           | `frontend/src/components/SimulatorView.tsx`                  | — (computed client-side)                  |
| Form Pre-Filler (Form K / VAT-1 / TL)  | `frontend/src/components/FormsView.tsx`                     | — (PDF generated client-side)             |
| VAT Ledger Automation (Mushak 6.3/9.1) | `frontend/src/components/MushakView.tsx`                    | — (CSV import/export client-side)         |
| Compliance Calendar & Alerts           | `frontend/src/components/CalendarView.tsx`                  | — (static demo data; no SMS/WhatsApp integration wired up) |
| 4.1/4.4 Conversational Tax Assistant   | `frontend/src/components/AssistantView.tsx`                  | `POST /api/chat`                          |
| Global navigation                      | `frontend/src/components/Navbar.tsx`                         | —                                          |
| Language toggle (EN/BN)                | `frontend/src/context/LanguageContext.tsx`, `frontend/src/data/translations.ts` | — |
| Shared API/session helper              | `frontend/src/lib/api.ts`                                    | —                                          |

Backend, all in `backend/`:
- `main.py` — the FastAPI app (single entrypoint; run it directly with `python main.py`)
- `auth.py` — password hashing (PBKDF2) and JWT session tokens
- `models.py` / `database.py` — SQLAlchemy models and the SQLite/Postgres connection

## Notes on scope

- **The AI assistant is a curated keyword-matched knowledge base, not an LLM.**
  It answers from a small fixed set of NBR/RJSC facts and says so plainly when
  a question doesn't match anything it knows, rather than inventing an answer.
- **The calculator numbers are estimates**, clearly labeled as such in the API
  response and the UI. Verify against the current NBR circular before filing.
- **No live SMS/WhatsApp or government e-filing integration** — the compliance
  calendar and "send alert" modal are UI previews of that flow, not wired to
  Greenweb/BoomCast or the WhatsApp Business API.
