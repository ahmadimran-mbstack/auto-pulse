# Session Loss on Tab Close / Reopen — Root Cause & Fix Report

## 1. Root Cause (Evidence First)

### Browser trace explanation
When closing a tab and reopening `/app`, the browser trace showed:
1. `POST /api/auth/sign-out` → `200`
2. `GET /api/auth/token` → `401`
3. `GET /app` → `307` redirect to `/auth/sign-in`

### Inventory of all `signOut` calls and tab/lifecycle listeners
- **`frontend/hooks/use-sign-out.ts`**: Explicit manual sign-out hook triggered when the user clicks Sign Out (`POST /api/auth/sign-out`, `authClient.signOut()`, `signOutAction()`, clears storage, broadcasts `"logout"` over `BroadcastChannel("autopulse-auth")` and `localStorage.autopulse_logout_event`).
- **`frontend/components/app/app-shell.tsx`**:
  - `pageshow`: reloads only when `event.persisted` (bfcache restore). Does not call `signOut`.
  - `BroadcastChannel("autopulse-auth")` and `window.addEventListener("storage")`: listens for `"logout"` / `autopulse_logout_event` from another tab's manual sign-out.
  - No `beforeunload`, `pagehide`, `visibilitychange`, or idle timer exists in the codebase.
- **`frontend/lib/api.ts`** (`apiCall` lines 99–105 & 157–181; `fetchPostImageBlob` lines 394–413 & 437–459):
  - **This was the culprit.** Whenever `getFreshToken(isRetry)` returned `null` OR any backend call returned `401` on retry (`isRetry === true`), `apiCall` / `fetchPostImageBlob` **unconditionally called `await authClient.signOut()`**, wiped `localStorage`/`sessionStorage`, and navigated to `/auth/sign-in`.
  - Because `tokenCache` (`frontend/lib/token-cache.ts`) is in-memory, closing and reopening a tab starts with an empty token cache. Multiple React Query hooks (`useDashboardQuery`, `usePostsQuery`, etc.) fire concurrently on mount. If `getFreshToken` returned `null` (transient network/5xx/race) OR the backend returned `401` (e.g., Railway still pointed at the old project's JWKS/auth URL, or token verification mismatch), `apiCall` immediately called `POST /api/auth/sign-out` (`200`), which deleted the session cookie. The concurrent/next `GET /api/auth/token` then returned `401`, and `/app` returned `307` to `/auth/sign-in`.

### Cookie & Backend Verification (New Neon Project)
- **Cookies issued on login (no values logged):**
  - `__Secure-neon-auth.session_token`: `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, 7-day expiry.
  - `__Secure-neon-auth.local.session_data`: `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`, 5-minute expiry.
- **Backend `current_user` (`backend/app/core/auth.py`):**
  - Validates `EdDSA` JWT against `settings.jwks_url` (`<NEON_AUTH_BASE_URL>/.well-known/jwks.json`) with `issuer == settings.auth_origin` and `audience == settings.auth_origin`.
  - Does **not** require a pre-existing `profiles` row (`GET /profile` calls `get_or_create_profile` on first authenticated request).
- **Auth config:**
  - `NEON_AUTH_COOKIE_SECRET` is read stably from env in `frontend/lib/env.ts` and fails loudly at startup if missing or `< 32` characters.

---

## 2. Code Changes (Line-by-Line in Plain Words)

1. **`frontend/lib/api.ts`**
   - Added a lightweight `reconnecting` state (`setReconnecting`, `subscribeReconnecting`) so the UI can show a `"Reconnecting to server..."` indicator on transient failures instead of logging the user out.
   - Added `confirmSessionInvalid()` (deduplicated across concurrent callers) which calls `authClient.getSession()` once:
     - Returns `true` **only** when Neon Auth explicitly reports no active session (`401` or `data === null` with no error).
     - Returns `false` on network errors, timeouts, `5xx` errors, or when a valid user session still exists.
   - Extracted `handleUnauthorizedOrMissingToken()` (shared by both `apiCall` and `fetchPostImageBlob`, removing duplicate sign-out blocks):
     - If `confirmSessionInvalid()` returns `false`, sets `reconnecting = true` and throws a retryable `503` (`reconnecting`) so the user stays on the page and React Query retries quietly.
     - Only if `confirmSessionInvalid()` returns `true` does it log `[AUTH_SIGN_OUT] reason=... code=invalid_session url=... status=...` in one line, call `authClient.signOut()` once, and redirect to `/auth/sign-in`.
   - Sets `reconnecting = true` on network failures or `5xx` responses, and `reconnecting = false` on `response.ok`.
2. **`frontend/components/app/app-shell.tsx`**
   - Subscribes to `subscribeReconnecting` and renders a non-intrusive `"Reconnecting to server..."` banner (using theme tokens and a `16px` `RefreshCw` icon) when `reconnecting` is true.
3. **`frontend/hooks/use-sign-out.ts`**
   - Logs manual sign-outs in one line: `[AUTH_SIGN_OUT] reason=manual_user_action code=user_sign_out url=/api/auth/sign-out status=200`.
4. **`frontend/app/api/auth/[...path]/route.ts`**
   - Logs a clear warning when Neon Auth rejects an untrusted origin (`403 INVALID_ORIGIN`), naming the rejected origin so it can be added to Neon Auth Trusted Domains.
5. **`frontend/lib/auth/server.ts`**
   - Logs the configured `NEON_AUTH_BASE_URL` origin once at startup (no secrets).
6. **`frontend/app/app/settings/settings-schemas.test.ts`**
   - Added `approval_lead_minutes: 180` to the `scheduleFormSchema` unit test fixtures so all 114 Vitest tests pass.

---

## 3. Verification Results

- **TypeScript (`npx tsc --noEmit`):** 0 errors.
- **Unit tests (`npx vitest run`):** 15 test files, 114 tests passed.
- **Production build (`npm run build`):** Succeeded.
- **Playwright end-to-end verification (`localhost:3000` + `127.0.0.1:8000`):**
  1. `LOGIN`: OK (clean browser profile, zero `sign-out` calls).
  2. `RELOAD`: OK (stayed on `/app`, zero `sign-out` calls).
  3. `CLOSE_AND_REOPEN_TAB`: OK (closed tab, opened new tab to `/app`, stayed signed in, zero `sign-out` calls).
  4. `BACKEND_500_RECONNECTING`: OK (simulated backend `500`, stayed on `/app`, `"Reconnecting to server..."` banner shown, zero `sign-out` calls).
  5. `INVALID_SESSION_SINGLE_SIGNOUT`: OK (simulated invalid session, logged `[AUTH_SIGN_OUT]`, called `sign-out` once, redirected to `/auth/sign-in` with no loop).
  6. `MANUAL_SIGNOUT_AND_RESIGNIN`: OK (manual sign-out cleared session cookie and redirected; signed in again cleanly).

---

## 4. Manual Checklist (Deployed Site)

1. **Neon Auth Console (new project):**
   - Add Trusted Domains / Allowed Origins: `https://autopulse-three.vercel.app`, `https://autopulse.vercel.app`, any Vercel preview domain used, and `http://localhost:3000`.
2. **Railway (Backend API):**
   - Update `DATABASE_URL` (pooled), `DATABASE_URL_DIRECT` (if set explicitly), and `NEON_AUTH_BASE_URL` (`https://ep-jolly-salad-be8919i2.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth`) and restart. *(If Railway still had the old `NEON_AUTH_BASE_URL`, every backend API call would return `401` against tokens from the new Neon Auth project!)*
3. **Vercel (Frontend — Production & Preview):**
   - Update `NEON_AUTH_BASE_URL` (`https://ep-jolly-salad-be8919i2.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth`) and **redeploy**.
   - Verify `NEON_AUTH_COOKIE_SECRET` is set (`>= 32` chars) and unchanged between deploys.
   - No `NEXT_PUBLIC_*` variable points to Neon, though a redeploy is required for the server-side `NEON_AUTH_BASE_URL` change to take effect.

---

## 5. Remaining Notes / Weaknesses
- If the deployed Railway backend's `NEON_AUTH_BASE_URL` still points to the old Neon project while Vercel points to the new one, backend calls will still return `401` (though the frontend will now show `"Reconnecting to server..."` instead of falsely destroying the user's Neon Auth session). Updating `NEON_AUTH_BASE_URL` on Railway resolves the mismatch.
- Pre-existing ESLint `@typescript-eslint/no-explicit-any` errors exist on untouched lines in `frontend/app/api/auth/[...path]/route.ts`, `frontend/hooks/use-sign-out.ts`, `frontend/lib/api.ts`, and `frontend/lib/auth/server.ts`.
