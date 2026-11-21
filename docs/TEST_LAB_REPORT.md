# Test Lab Implementation Report

## 1. Overview & Scheduling Mechanism Choice

- **Scheduling mechanism chosen:** Reused the existing 60-second `_background_scheduler_loop` -> `_run_scheduler_cycle()` tick in [`backend/app/main.py`](../backend/app/main.py) (gated behind `if settings.ENABLE_TEST_LAB:`), backed by the `test_lab_runs` PostgreSQL table.
- **Why:** AutoPulse already runs a 60-second scheduler loop for `run_dispatch(db)` and `run_publisher(db)` without Redis. Adding a second polling loop would increase Neon compute wakeups, whereas hooking `process_due_test_lab_runs(db)` into the existing tick adds zero new database wakeups when idle, requires no Redis, survives server restarts, and automatically catches up overdue steps while recording the exact delay (`delay_seconds`).
- **Atomic step claiming:** Each step (`generate`, `approve`, `upload`) is claimed with a single conditional `UPDATE test_lab_runs ... WHERE id = :id AND ... AND <step>_status = 'pending' AND <step>_at <= now() RETURNING <step>_started_at` statement, matching the production `claim_publication` pattern so two processes or a restart at the due time can never execute the same step twice.

---

## 2. Production Behavior on Rejection or Expiry

- **Rejected in Slack / Email / Dashboard (`decide_approval` in `backend/app/services/approval.py`):**
  - Atomically sets `approvals.decision = 'rejected'`, updates `posts.status = 'rejected'`, and does **not** create a `PostPublication` row.
- **Expired approval link (`decide_approval`):**
  - If `approvals.expires_at <= now()`, updates `posts.status = 'expired'` (if still `draft` or `awaiting_approval`) and returns `410 Gone`.
- **Expired by dispatcher (`expire_passed_posts` in `backend/app/jobs/dispatch.py`):**
  - Marks non-playground `draft` / `awaiting_approval` posts whose `publish_at <= now()` as `'expired'`. (Excluded `is_test IS FALSE` so Test Lab posts are not prematurely expired before Step 3 runs.)
- **Missed publish window (`fail_missed_window_posts` in `backend/app/jobs/publish.py`):**
  - Marks `approved` posts whose `publish_at < now() - 6 hours` as `'failed'` with `error_code = 'window_missed'`.
- **Test Lab Step 3 behavior:** At `upload_at`, if `post.status != 'approved'` (e.g., `awaiting_approval`, `rejected`, or `expired`), Step 3 does **not** call `publish_post_to_linkedin` and marks `upload_status = 'skipped_not_approved'` with an explanation in the UI.

---

## 3. Exact Places Where `is_test` Posts Are Excluded

Every exclusion is marked with `TEST_LAB_REMOVE`:

1. [`backend/app/jobs/dispatch.py`](../backend/app/jobs/dispatch.py)
   - `expire_passed_posts`: `AND is_test IS FALSE` (prevents normal dispatcher from expiring Test Lab posts before `upload_at`).
   - `run_dispatch`: `Post.is_test.is_(False)` (prevents a Test Lab post from blocking the user's normal daily scheduled draft).
2. [`backend/app/jobs/publish.py`](../backend/app/jobs/publish.py)
   - `fail_missed_window_posts` & `find_eligible_publications`: `AND p.is_test IS FALSE` (ensures Test Lab Step 3 controls the exact `upload_at` publish time without racing `run_publisher`).
3. [`backend/app/repositories/post.py`](../backend/app/repositories/post.py)
   - `get_caller_posts`: `Post.is_test.is_(False)` (keeps `/posts` list clean).
   - `get_recent_titles_and_captions`: `Post.is_test.is_(False)` (excludes test posts from 14-day topic deduplication).
   - `get_user_post_history`: `Post.is_test.is_(False)` (excludes test posts from topic variety and `post_type` rotation counters).
   - `delete_draft_and_run_for_date`: `Post.is_test.is_(False)`.
4. [`backend/app/services/analytics.py`](../backend/app/services/analytics.py)
   - `BASE_POSTS_CTE`, `_resolve_user_context` (`all_time_posts`), and `query_approval_turnaround`: `AND p.is_test IS FALSE` / `AND is_test IS FALSE` (keeps analytics numbers untouched).
5. [`backend/app/api/routes/dashboard.py`](../backend/app/api/routes/dashboard.py)
   - `stmt_posts` and `stmt_stats`: `Post.is_test.is_(False)` (keeps dashboard recent posts and 30d counts untouched).

---

## 4. Files Changed & Why

### Backend
- [`backend/app/core/config.py`](../backend/app/core/config.py) & [`backend/.env.example`](../backend/.env.example): Added `ENABLE_TEST_LAB` (default `false`) and `TEST_LAB_ALLOWED_EMAILS` (default `""`).
- [`backend/app/models/post.py`](../backend/app/models/post.py): Added `is_test: Mapped[bool]` (default `false`).
- [`backend/alembic/versions/j1a2b3c4d5e6_add_test_lab_tables.py`](../backend/alembic/versions/j1a2b3c4d5e6_add_test_lab_tables.py): Migration adding `posts.is_test` and `test_lab_runs` (with partial unique index `uq_test_lab_runs_active_user` enforcing one active test per user).
- [`backend/app/test_lab/models.py`](../backend/app/test_lab/models.py), [`schemas.py`](../backend/app/test_lab/schemas.py), [`service.py`](../backend/app/test_lab/service.py), [`router.py`](../backend/app/test_lab/router.py): Isolated Test Lab module implementing flag + allowlist gate (`404` when off, `403` when unlisted), timezone-aware prechecks, 3-time validation (`>=1m` from now, `>=1m` gaps, `<=7d` ahead), atomic step execution using the real pipeline, `request_approval`, and `claim_publication` + `publish_post_to_linkedin`.
- [`backend/app/main.py`](../backend/app/main.py): Registered `test_lab_router` and `process_due_test_lab_runs(db)` in `_run_scheduler_cycle()`.
- [`backend/tests/test_test_lab.py`](../backend/tests/test_test_lab.py): Integration & unit tests for flag off (`404`), allowlist (`403`), time validation (`422`), single active run (`409`), cancel, atomic concurrent claim, dry-run skip, not-approved skip, and `is_test` exclusion.

### Frontend
- [`frontend/lib/env.ts`](../frontend/lib/env.ts): Added `env.enableTestLab` (`NEXT_PUBLIC_ENABLE_TEST_LAB === "true"`, default `false`).
- [`frontend/features/test-lab/types.ts`](../frontend/features/test-lab/types.ts), [`api.ts`](../frontend/features/test-lab/api.ts), [`TestLabPanel.tsx`](../frontend/features/test-lab/TestLabPanel.tsx): Isolated Test Lab UI with `"Development only"` badge, user timezone + UTC offset display, Slack/LinkedIn precheck banners, topic hint, Dry run switch + live-publish confirmation dialog with checkbox, three step cards with inline validation and late-delay display, vertical-rail changelog, generated post preview (with first comment), and React Query polling while active.
- [`frontend/app/app/playground/PlaygroundClient.tsx`](../frontend/app/app/playground/PlaygroundClient.tsx): Added the `Test Lab` tab (`FlaskConical` + `"Development only"` badge) gated by `env.enableTestLab`.

---

## 5. Verification & Known Limitations

- **Backend tests:** `pytest backend/tests/test_test_lab.py` — **5 passed** against PostgreSQL.
- **Frontend checks:** Targeted ESLint on `features/test-lab/*` and `lib/env.ts`, `npx tsc --noEmit`, and `npm run build` all passed with exit code 0.
- **Playwright screenshots:** Captured light and dark screenshots at `1440px` and `390px` in `docs/test-lab-screenshots/` across `empty`, `scheduled`, `running`, `waiting_approval`, `finished`, `failed`, and `skipped` states.
- **Live 1m/2m/3m Slack + LLM E2E note:** We verified `LLM_API_KEY` and `SlackIntegration` rows exist in the dev database, and tested `process_due_test_lab_runs` + `execute_upload_step` against the real DB in `test_test_lab.py`, but did **not** fire a live Slack DM to a real user's workspace during automated verification to avoid sending unsolicited test messages to real Slack channels.
- **What is still weak:** Because the scheduler tick runs every 60 seconds, a step scheduled at `14:01:00` can start anywhere from `0s` to `59s` late (shown in the UI as `"ran at ..., Xs late"`).
