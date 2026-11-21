# Overview Dashboard Regression — Root Cause & Fix Report

## 1. What Changed in the Session Fix Task (Suspects)
Commits from the session-fix task (`6f7e954`, `37c1287`, `4d8c66b`, `4a1d547`, `d102cf2`):
- `frontend/lib/api.ts` (`6f7e954`): Added `setReconnecting`/`subscribeReconnecting`, `confirmSessionInvalid()`, and `handleUnauthorizedOrMissingToken()`, replacing automatic `signOut()` on missing token / backend `401`.
- `frontend/components/app/app-shell.tsx` (`6f7e954`): Added the `"Reconnecting to server..."` banner subscribed to `subscribeReconnecting`.
- `frontend/hooks/use-sign-out.ts` (`37c1287`): Added one-line `[AUTH_SIGN_OUT]` log on manual sign-out.
- `frontend/app/api/auth/[...path]/route.ts` (`37c1287`): Added warning log on `403 INVALID_ORIGIN` from Neon Auth.
- `frontend/lib/auth/server.ts` (`37c1287`): Added startup log of the configured Neon Auth origin.
- `frontend/app/app/settings/settings-schemas.ts` & `.test.ts` (`4d8c66b`, `d102cf2`): Fixed `approval_lead_minutes` schema/test types.

---

## 2. Root Cause (Evidence First)

### Why `"Reconnecting to server..."` + `"Unable to load dashboard"` appeared together
1. **Suspect #1 (`frontend/lib/api.ts`, commit `6f7e954`):**
   - In `handleUnauthorizedOrMissingToken()`, whenever a backend request returned `401` (for example, when the deployed Railway backend still pointed to the old `NEON_AUTH_BASE_URL` while Vercel pointed to the new Neon Auth project), `confirmSessionInvalid()` saw that the user WAS signed in to Neon Auth (`data.user` existed) and returned `false`.
   - `handleUnauthorizedOrMissingToken()` then **wrongly called `setReconnecting(true)`** and threw a synthetic `503 ("Reconnecting to your session...")`, **hiding the real `401` error**.
   - `apiCall` also called `setReconnecting(true)` on HTTP `500+` responses (not only real network failures).
   - Meanwhile, `queryClient` (`frontend/lib/queries.ts`) retried twice (`failureCount < 2`) and stopped, causing `AppDashboardClient` to render `"Unable to load dashboard"` **while `reconnecting` remained `true` forever**, leaving `"Reconnecting to server..."` stuck at the top of a dead error page.
2. **Error state visibility (`frontend/components/app/ErrorState.tsx`, `AppDashboardClient.tsx`):**
   - `AppDashboardClient` did not pass the failing `error` object or render a `"Details"` toggle with the HTTP status code and failing request URL.

### Checklist Answers (Yes / No with Proof)
- **Frontend stopped sending auth token/cookie?** **No.** Local diagnostic showed `Authorization: Bearer <token>` and `/api/auth/token` `200` on all routes.
- **Backend rejects token (issuer/audience/JWKS) or changed header?** **No locally** (both local `.env` and `.env.local` point to `ep-jolly-salad-be8919i2`). **Yes on deployed site if Railway still has the old `NEON_AUTH_BASE_URL`**, which returns `401` and triggered the `setReconnecting(true)` + `503` masking bug.
- **"Create user row on first request" fails or loops?** **No.** `backend/app/core/auth.py` does not require a `profiles` row, and `get_or_create_profile` creates one on demand.
- **Wrong database URL or suspended DB?** **No.** Local backend uses pooled `ep-jolly-salad-be8919i2-pooler.c-9.us-east-2.aws.neon.tech` (`200` on all endpoints).
- **Railway/Vercel missing or mismatched variable?** **Likely on deployed site** until Railway's `NEON_AUTH_BASE_URL` and `DATABASE_URL` and Vercel's `NEON_AUTH_BASE_URL` are updated and redeployed.
- **CORS or cookie settings block API calls?** **No.** Local `/app`, `/posts`, `/dashboard`, `/analytics`, `/profile` all return `200`.
- **New "reconnecting" logic retries and hides a real error?** **Yes.** `handleUnauthorizedOrMissingToken` masked `backend_401` as `503` + `setReconnecting(true)`, and `setReconnecting(true)` was never cleared when React Query exhausted retries.

---

## 3. Code Changes (Line-by-Line in Plain Words)

1. **`frontend/lib/api.ts`**
   - Added `requestUrl` and `isNetworkError` fields to `ApiClientError`, and passed `url` to every `ApiClientError` thrown in `apiCall`.
   - Replaced `confirmSessionInvalid()` (boolean) with `checkAuthSessionState()` returning `"valid" | "invalid" | "network_error"`:
     - `"invalid"` (Neon Auth explicitly says no session): logs `[AUTH_SIGN_OUT]`, signs out once, redirects to `/auth/sign-in`.
     - `"network_error"` (auth server unreachable / 5xx): sets `reconnecting = true` and throws `ApiClientError(0, { code: "network_error" }, null, url, true)` so React Query retries.
     - `"valid"` (user IS signed in, yet backend returned `401`): clears `reconnecting` and throws the **real** `ApiClientError(401, { code: "backend_unauthorized" }, null, url, false)` without hiding it or signing out.
   - `setReconnecting(true)` is now called **only** on real network errors (`fetch` throws). Any HTTP response (`2xx`, `4xx`, `5xx`) clears `reconnecting` (`setReconnecting(false)`).
2. **`frontend/lib/queries.ts`**
   - Added `QueryCache({ onError: () => setReconnecting(false) })` so the `"Reconnecting to server..."` banner is always cleared when retries finish and never sits on screen next to a dead error page.
   - Updated `retry` to retry **only** real network errors (`error.isNetworkError === true`) up to **3 times** (`failureCount < 3`) with increasing wait (`retryDelay`: `1s`, `2s`, `4s`).
3. **`frontend/components/app/ErrorState.tsx`**
   - Enhanced the shared `ErrorState` component with optional `title`, `error`, and a `"Details"` toggle button that displays `Status` (`Network error` or HTTP status code), `Request` (the failing URL), and `Code`.
4. **`frontend/app/app/components/AppDashboardClient.tsx`, `AnalyticsClient.tsx`, `PostsClient.tsx`, `ConnectionsClient.tsx`**
   - Wired `AppDashboardClient` to `<ErrorState title="Unable to load dashboard" ... error={dashError || postsError} />` and passed `error` to `<ErrorState />` in `AnalyticsClient`, `PostsClient`, and `ConnectionsClient`.
5. **`frontend/lib/api.test.ts`**
   - Added 4 Vitest unit tests covering: backend `401` with valid session (no `signOut`, no `reconnecting`), real network failure (`reconnecting=true`, `isNetworkError=true`), HTTP `500` (no `reconnecting`, preserves status & URL), and explicit invalid session (`signOut` called once).

---

## 4. Smoke Test Table (`localhost:3000` + `127.0.0.1:8000`)

| Check / Page | Result | Request Statuses Observed |
|---|---|---|
| Sign up & Sign in | PASS | `200 /api/auth/sign-up/email`, `200 /api/auth/sign-in/email` |
| Reload (F5) | PASS | `200 /app`, `200 /api/auth/token`, `200 /dashboard`, `200 /posts` |
| Close & reopen tab | PASS | `200 /app`, `200 /api/auth/token`, `200 /dashboard`, `200 /posts` |
| Sign out & Sign in again | PASS | `200 /api/auth/sign-out`, then `200 /api/auth/sign-in/email` |
| Overview (`/app`) | PASS | `200 /api/auth/token`, `200 /dashboard`, `200 /posts` |
| Notifications | PASS | Bell popover opens cleanly |
| Analytics (`/app/analytics`) | PASS | `200 /dashboard`, `200 /posts`, `200 /integrations/slack/status` |
| Posts (`/app/posts`) | PASS | `200 /api/auth/token`, `200 /posts` |
| Playground + Write with agents | PASS | `200 /api/linkedin/status`, `POST /playground/runs` -> `completed` |
| Customize (all 5 tabs + drawer) | PASS | `200 /customization/documents`, `200 /customization/context` |
| Connections (`/app/connections`) | PASS | `200 /connections`, `200 /integrations/slack/status`, `200 /profile` |
| Settings (`/app/settings`) | PASS | `200 /profile`, `200 /integrations/slack/status` |
| Backend failure & recovery | PASS | Aborted API -> `"Reconnecting to server..."` -> 3 retries -> banner cleared -> `"Unable to load dashboard"` + `"Details"` (`Network error`, `/dashboard`) -> unrouted & `"Try again"` -> recovered |
| External LinkedIn / Slack OAuth | Not tested | Live external OAuth round-trips require browser interaction with LinkedIn/Slack |

---

## 5. Verification Commands
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run lib/api.test.ts lib/sign-out.test.ts lib/token-cache.test.ts`: 3 files, 16 tests passed.
- `npm run build`: Succeeded.

---

## 6. Manual Deployment Checklist
1. **Railway (Backend API):** Update `DATABASE_URL` (pooled), `DATABASE_URL_DIRECT` (if set), and `NEON_AUTH_BASE_URL` (`https://ep-jolly-salad-be8919i2.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth`), then restart.
2. **Vercel (Frontend — Production & Preview):** Update `NEON_AUTH_BASE_URL` and redeploy. (No `NEXT_PUBLIC_*` variable points to Neon.)
3. **Neon Auth Console:** Ensure `https://autopulse-three.vercel.app`, `https://autopulse.vercel.app`, any preview domain, and `http://localhost:3000` are in Trusted Domains.
