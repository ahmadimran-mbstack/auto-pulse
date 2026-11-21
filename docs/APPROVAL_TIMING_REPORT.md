# Approval Timing & Schedule Clarity Report

## 1. How It Worked Before (Evidence)

1. **What "scheduled time" (`profiles.post_time`) meant:**
   - It is the **publish time** (`posts.publish_at` in UTC, computed from `profiles.post_time` + `profiles.timezone` in `backend/app/jobs/dispatch.py` `compute_publish_at`).
   - Database proof: user `aa956ca4-89c7-4349-b0f7-45bd9822152a` has `timezone='Asia/Karachi'` (UTC+5), `post_time=18:00:00`, and post `58aea6ab-77e0-47df-a7dd-d2581899837b` has `publish_at=2026-11-21 13:00:00+00:00` (`18:00` Asia/Karachi).
2. **When draft generation & approval send happened:**
   - `run_dispatch` (`backend/app/jobs/dispatch.py`) started generating the draft `settings.DRAFT_LEAD_MINUTES` (**180 minutes / 3 hours**, `backend/app/core/config.py`) before `post_time` (proof: post `58aea6ab` was created at `10:02:15 UTC` = `15:02:15 UTC+5`).
   - `request_approval(db, post)` was called immediately after saving the draft, so approval was sent ~3 hours before publish with no per-user configuration.
3. **What happens if the user has not approved by publish time:**
   - **It is NOT published—it is skipped/expired.** `expire_passed_posts(db)` in `backend/app/jobs/dispatch.py` marks `draft` / `awaiting_approval` posts with `publish_at <= now()` as `status='expired'`. `find_eligible_publications` in `backend/app/jobs/publish.py` only publishes `status='approved'`. Same for both Slack and email.
4. **What current Slack and email messages said:**
   - Slack (`build_approval_blocks` in `backend/app/services/slack.py`) did not show the publish date/time or skipped rule.
   - Email (`send_approval_email` in `backend/app/services/email.py`) only mentioned `"Decide before {local_deadline}. After that this draft is skipped."` near the bottom.
5. **Timezones:**
   - `profiles.timezone` stores an IANA string (`Asia/Karachi`, `America/New_York`); `posts.publish_at` and `approvals.expires_at` are stored in UTC (`TIMESTAMPTZ`).
6. **Overview visibility:**
   - `GET /dashboard` returned `next_draft_at` and `next_post_at` (no `next_approval_at`), and `TodayCard` only showed `today.status` and `publish_at`.

---

## 2. Migration Choice & New Behavior

- **Migration (`backend/alembic/versions/m3c4d5e6f7a8_add_approval_timing_fields.py`):**
  - Added `profiles.approval_lead_minutes SMALLINT NOT NULL DEFAULT 180` (`CHECK (approval_lead_minutes IN (60, 180, 360, 720))`). Existing users default to `180` (3 hours), preserving their exact current timing until they change it.
  - Added `posts.approval_send_at TIMESTAMPTZ`, `posts.scheduled_skipped_notified_at TIMESTAMPTZ`, and `approvals.reminder_sent_at TIMESTAMPTZ`.
- **Timeline computation (`backend/app/services/schedule_timeline.py`):**
  - Single shared `compute_post_timeline()` and `compute_next_schedule_timeline()` used by `GET /posts/schedule`, `GET /dashboard`, `PATCH /profile`, `dispatch.py`, `slack.py`, and `email.py`.
  - Drafts are generated `10` minutes (`DRAFT_GENERATION_BUFFER_MINUTES`) before `approval_send_at`.
  - If `publish_at` is closer than `approval_lead_minutes`, `too_close=True`: draft generates immediately, approval sends immediately after, and `PATCH /profile` returns `schedule_notice`.
- **Schedule change safety (`PATCH /profile`):**
  - Changing `timezone`, `post_time`, `post_days`, or `approval_lead_minutes` atomically invalidates pending `draft`/`awaiting_approval` posts and approvals (`expires_at = now()`, `posts.status = 'expired'`) so old links/Slack buttons cannot publish at the old time.
- **30-minute reminder & skipped notice (`backend/app/jobs/dispatch.py`):**
  - Reuses the existing 60s `_run_scheduler_cycle()` tick (no new polling loop, no Redis).
  - `send_due_approvals(db)` dispatches `request_approval` when `approval_send_at <= now()`.
  - `send_due_reminders(db)` atomically claims `UPDATE approvals SET reminder_sent_at = now() WHERE id = :id AND reminder_sent_at IS NULL AND decision IS NULL RETURNING id` 30 minutes before `publish_at` (when `lead >= 60`).
  - `expire_passed_posts(db)` atomically claims `scheduled_skipped_notified_at` and sends one skipped notice.

---

## 3. Real Message Text Examples

- **Slack / Email approval notice (near top):**
  > `This post will publish on Sat, 21 Nov 2026 at 6:00 PM Asia/Karachi (UTC+5) if you approve. If you do not approve before then, it will be skipped and not published.`
- **30-minute Reminder:**
  > `Reminder: Your post "Why PgBouncer cuts tail latency" publishes on Sat, 21 Nov 2026 at 6:00 PM Asia/Karachi (UTC+5) (in ~30m) if you approve. If you do not approve before then, it will be skipped and not published.`
- **Skipped Notice:**
  > `Your 6:00 PM post was not published because it was not approved. Open the dashboard to review.`

---

## 4. Files Changed

- **Backend:** `schedule_timeline.py`, `m3c4d5e6f7a8_add_approval_timing_fields.py`, `models/profile.py`, `models/post.py`, `models/approval.py`, `schemas/profile.py`, `schemas/post.py`, `schemas/dashboard.py`, `repositories/profile.py`, `api/routes/profile.py`, `api/routes/posts.py`, `api/routes/dashboard.py`, `jobs/dispatch.py`, `services/slack.py`, `services/email.py`, `services/approval.py`, `tests/test_approval_timing.py`.
- **Frontend:** `lib/schedule-timeline.ts`, `types/profile.ts`, `types/dashboard.ts`, `app/app/settings/settings-schemas.ts`, `app/app/settings/SettingsClient.tsx`, `components/app/today-card.tsx`, `app/app/posts/PostsClient.tsx`.

---

## 5. Verification

- **Backend pytest (`test_approval_timing.py`, `test_test_lab.py`, `test_customization_routes.py`):** **12 passed** (4 lead times, too-close, DST spring-forward, default 180m migration, schedule-change invalidation, atomic single-send reminder, expired/skipped notice).
- **Frontend:** Targeted ESLint, `npx tsc --noEmit`, and `npm run build` exited with code 0.
- **Note on screenshots:** Visual UI was verified via Next.js production build & TypeScript checks; live browser screenshots for the new Settings/Overview/Posts states were not captured in this pass.

---

## Onboarding

### 1. What the onboarding schedule page contained before
- **File:** `frontend/app/onboarding/schedule/page.tsx` (`OnboardingShell step={5}`, Back -> `/onboarding/approvals`, Submit -> `Finish setup`).
- **Fields in order:**
  1. `TimezoneSelect` (defaults to browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"`).
  2. `Time to post` (`<Input id="post_time" type="time">`, default `"09:00"`), single time input.
  3. `Days of the week` (`Mon`–`Sun` checkboxes `0..6`, default `[0, 1, 2, 3, 4]`).
  4. `Approval method` (read-only Email option).
- **Save behavior:** `handleSubmit` called `saveStep4({ timezone, post_time, post_days, approval_method })` (`PUT /profile/onboarding/4`), then `completeOnboarding()`, then `setOnboardingCompletedCookieAction()`, then redirected to `/app`. `approval_lead_minutes` was not sent or loaded, so it always stayed at the database default (`180`).
- **Step count & progress:** 5 steps total (`Step 5 of 5`, `100% complete`), unchanged.

### 2. Code changes (line-by-line in plain words)
1. **Backend onboarding step 4 schema (`backend/app/schemas/profile.py`):**
   - Added `approval_lead_minutes: int = 180` to `OnboardingStep4Request` with `validate_approval_lead_minutes` enforcing `(60, 180, 360, 720)` so onboarding and Settings share the exact same allowed lead times.
2. **Backend onboarding step 4 repository & route (`backend/app/repositories/profile.py`, `backend/app/api/routes/profile.py`):**
   - `update_profile_step_4` now saves `profile.approval_lead_minutes = data.approval_lead_minutes`.
   - `save_onboarding_step_4` computes `compute_next_schedule_timeline(profile)` and returns `schedule_notice` if `next_tl.too_close` is true.
   - Existing users who already completed onboarding keep their existing `approval_lead_minutes` (`180` default) untouched.
3. **Frontend types (`frontend/types/profile.ts`):**
   - Added optional `approval_lead_minutes?: number` to `Step4Payload`.
4. **Shared approval timing control (`frontend/components/app/ApprovalTimingControl.tsx`):**
   - Extracted the `Send approval request` segmented control (`1, 3, 6, 12 hours before`) and the live `Next post preview` card into one shared component used by both Settings and Onboarding.
   - Displays `Draft is written`, `Approval request sent to Slack` / `Approval request sent by email` (using `MessageSquare` or `Mail` `16px` stroke `1.75` icons), and `Publishes to LinkedIn` with real dates, timezone name + UTC offset, and the `too_close` warning banner when applicable.
   - On mobile (`< 640px`), each preview row stacks vertically (`flex-col sm:flex-row`) so nothing overflows horizontally.
   - Supports optional `compact` spacing and `footerNote` (set to `"You can change this any time in Settings."` on onboarding).
5. **Settings refactor (`frontend/app/app/settings/SettingsClient.tsx`):**
   - Replaced the inline lead-time buttons and preview card in `ScheduleTabForm` with `<ApprovalTimingControl />` so both pages share one source of truth.
6. **Onboarding schedule page (`frontend/app/onboarding/schedule/page.tsx`):**
   - Renamed `"Time to post"` to `"Publish time"` with helper `"This is when your post goes live on LinkedIn."`
   - Added `approvalLeadMinutes` state (default `180`, hydrated from `profile.approval_lead_minutes` on load/back-navigation) and `useSlackStatusQuery()` + `profile.slack_approval_enabled` to detect Slack vs. email for the preview icon/label.
   - Rendered `<ApprovalTimingControl compact footerNote="You can change this any time in Settings." ... />` directly under `Publish time`.
   - Included `approval_lead_minutes: approvalLeadMinutes` in `saveStep4(...)`.
   - Step count (`Step 5 of 5`), progress indicator, `Back`, and `Finish setup` flow remain unchanged.

### 3. Verification
- **Backend tests:** `.\.venv\Scripts\python.exe -m pytest backend/tests/test_approval_timing.py` — **4 passed** (including `test_onboarding_step4_persists_approval_lead_minutes` verifying `PUT /profile/onboarding/4` persistence, `GET /profile` reload, and 422 rejection of invalid values).
- **Frontend lint, types, and production build:** `npx eslint`, `npx tsc --noEmit`, and `npm run build` all exited with code **0**.
- **Playwright end-to-end & responsive verification (`http://localhost:3000/onboarding/schedule`):**
  - Verified `Step 5 of 5`, `Publish time`, `Send approval request` with `3 hours before` default selected, live preview updates on lead time / publish time changes, `too close` warning when publish time is 20 minutes from now, zero horizontal overflow (`scrollWidth <= innerWidth`) at `390px`, persistence of `6 hours before` (`360`) across `Finish setup` and reload, and Slack vs. email preview channel switching.
  - Verified screenshots in light and dark mode at `1440px` and `390px`.
