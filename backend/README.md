# AutoPulse Backend

FastAPI backend service for AutoPulse. Handles token verification for Neon Auth, database connectivity via Neon PostgreSQL, and core API health checks.

---

## 1. Prerequisites

- Python 3.12+ installed
- Virtual environment created (e.g. `.venv`)
- Real credentials configured in `backend/.env` (see `.env.example` for required variable names)

---

## 2. Installation

From the project root or the `backend/` folder:

```bash
# Using pip
pip install -r requirements.txt

# Or using uv (faster)
uv pip install -r requirements.txt
```

---

## 3. Environment Variables

All settings are read from `backend/.env`. Never commit `.env` to Git.

Refer to [`.env.example`](file:///backend/.env.example) for required variables:

- `NEON_AUTH_BASE_URL`: Neon Auth base URL (e.g. `https://<id>.neon.tech/neondb/auth`).
- `DATABASE_URL`: Neon pooled PostgreSQL connection string (must include `sslmode=require`).
- `DATABASE_URL_DIRECT`: Neon direct PostgreSQL connection string (used only by Alembic, must include `sslmode=require`).
- `FRONTEND_URL`: Allowed CORS origin(s), comma-separated (e.g. `http://localhost:3000`).
- `ENV`: Application mode (`development` or `production`).
- `LOG_LEVEL`: Optional logging level (defaults to `INFO`).

---

## 4. Database Migrations (Alembic)

Alembic uses the direct connection string (`DATABASE_URL_DIRECT`) to run schema migrations.

```bash
# From the backend directory:
alembic upgrade head
```

---

## 5. Running the Application

To start the development server with live reload:

```bash
# Navigate to the backend directory
cd backend

# Run with uvicorn
uvicorn app.main:app --reload --port 8000
```

Once running, you can visit:
- **Liveness Health Check**: `http://localhost:8000/health`
- **Database Health Check**: `http://localhost:8000/health/db`
- **Swagger Interactive Docs** (in development mode): `http://localhost:8000/docs`

---

## 6. Running Tests

Tests run completely isolated without calling Neon Auth or external databases. Test keys and fake settings are used.

```bash
# From the backend directory:
pytest -q
```
