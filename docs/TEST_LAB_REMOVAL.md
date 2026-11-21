# How to Remove Test Lab

Test Lab is isolated so you can remove it cleanly once testing is complete.

## 1. Delete the Test Lab folders & docs
Delete these folders and files:
- `backend/app/test_lab/` (entire folder: `__init__.py`, `models.py`, `schemas.py`, `service.py`, `router.py`)
- `backend/tests/test_test_lab.py`
- `frontend/features/test-lab/` (entire folder: `types.ts`, `api.ts`, `TestLabPanel.tsx`)
- `docs/TEST_LAB_REPORT.md`
- `docs/TEST_LAB_REMOVAL.md`
- `docs/test-lab-screenshots/` (if present)

## 2. Remove `TEST_LAB_REMOVE` lines
Search the codebase for `TEST_LAB_REMOVE` and remove those marked lines/blocks in:
- `backend/app/main.py` (router import, `app.include_router(test_lab_router)`, and `process_due_test_lab_runs(db)` call in `_run_scheduler_cycle`)
- `backend/app/core/config.py` (`ENABLE_TEST_LAB` and `TEST_LAB_ALLOWED_EMAILS`)
- `backend/.env.example` (`ENABLE_TEST_LAB` and `TEST_LAB_ALLOWED_EMAILS`)
- `backend/app/models/post.py` (`is_test` column)
- `backend/app/jobs/dispatch.py` (`is_test` filters in `expire_passed_posts` and `run_dispatch`)
- `backend/app/jobs/publish.py` (`is_test` filters in `fail_missed_window_posts` and `find_eligible_publications`)
- `backend/app/repositories/post.py` (`is_test` filters in `get_caller_posts`, `get_recent_titles_and_captions`, `get_user_post_history`, `delete_draft_and_run_for_date`)
- `backend/app/services/analytics.py` (`is_test` filters in `BASE_POSTS_CTE`, `_resolve_user_context`, `query_approval_turnaround`)
- `backend/app/api/routes/dashboard.py` (`is_test` filters in `stmt_posts` and `stmt_stats`)
- `frontend/lib/env.ts` (`enableTestLab`)
- `frontend/app/app/playground/PlaygroundClient.tsx` (`FlaskConical` import, `TestLabPanel` import, `test-lab` tab state, `AppTabsTrigger`, and `TabsContent`)

## 3. Drop the database table & column
1. Delete any test posts created by Test Lab if you do not want them in `posts`:
   ```sql
   DELETE FROM posts WHERE is_test IS TRUE;
   ```
2. Downgrade the Alembic migration `j1a2b3c4d5e6` (or run the equivalent SQL):
   ```bash
   alembic -c backend/alembic.ini downgrade h8c9d0e1f2a3
   ```
   This drops `uq_test_lab_runs_active_user`, `ix_test_lab_runs_user_id`, the `test_lab_runs` table, and the `posts.is_test` column, then delete `backend/alembic/versions/j1a2b3c4d5e6_add_test_lab_tables.py`.

### Should `posts.is_test` stay or be dropped?
- **Drop it** (via the downgrade above) after deleting any `WHERE is_test IS TRUE` rows so `posts` returns to its exact original schema. Only keep `is_test` if you want to retain historical test posts in `posts` without showing them in analytics/history.

## 4. Delete environment variables
Remove `ENABLE_TEST_LAB`, `TEST_LAB_ALLOWED_EMAILS`, and `NEXT_PUBLIC_ENABLE_TEST_LAB` from your local `.env` / `.env.local` and hosting environment settings.
