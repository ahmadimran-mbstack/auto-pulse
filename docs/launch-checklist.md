# AutoPulse Launch Checklist

## 1. Remove `TEST_LAB_REMOVE` Items Before Production Launch
Ensure `TEST_LAB_ENABLED` is unset or `false` (`ENABLE_TEST_LAB` defaults to `False`), and remove all `TEST_LAB_REMOVE` blocks listed below (see also `docs/TEST_LAB_REMOVAL.md`):

### Backend
- `backend/.env.example` (line 79) — `ENABLE_TEST_LAB` / `TEST_LAB_ENABLED` example
- `backend/app/core/config.py` (line 96) — `ENABLE_TEST_LAB`, `TEST_LAB_ALLOWED_EMAILS`
- `backend/app/main.py` (lines 34, 238, 345) — `test_lab_router` import/include and scheduler tick
- `backend/app/models/post.py` (line 70) — `Post.is_test` column
- `backend/app/api/routes/dashboard.py` (lines 89, 94, 148) — `Post.is_test.is_(False)` filters
- `backend/app/jobs/dispatch.py` (lines 49, 593) — `is_test IS FALSE` filters
- `backend/app/jobs/publish.py` (lines 47, 82) — `p.is_test IS FALSE` filters
- `backend/app/repositories/post.py` (lines 20, 50, 65, 196) — `Post.is_test.is_(False)` filters
- `backend/app/services/analytics.py` (lines 126, 202, 495) — `is_test IS FALSE` filters
- `backend/app/test_lab/` — remove entire directory and `test_lab_runs` migration/table

### Frontend
- `frontend/lib/env.ts` (line 56) — `enableTestLab` flag
- `frontend/app/app/playground/PlaygroundClient.tsx` (lines 17, 42, 43, 132, 427, 443) — `TestLabPanel` import and tab
- `frontend/src/features/test-lab/` — remove directory

## 2. Billing, Limits, and Ops Environment Variables
- Set `OPS_ALERT_EMAIL` in backend environment for daily spend limit alerts.
- Set `NEXT_PUBLIC_CONTACT_EMAIL` (or equivalent contact email env var) for the manual plan activation dialog.
- Verify `CUSTOMIZATION_ENABLED` and `TEST_LAB_ENABLED=false` in production.
