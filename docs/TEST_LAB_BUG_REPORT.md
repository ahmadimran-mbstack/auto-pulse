# Test Lab Step 1 Bug Report ("Pipeline completed without producing a draft")

## 1. Evidence & Root Cause

### Database Row (`test_lab_runs`)
- **Run ID:** `84299eee-24bb-42c8-af3c-5f6aedfe2422`
- **User ID:** `1cdbc556-3f1c-4e06-a744-f624db709115`
- **Scheduled `generate_at`:** `2026-11-21 10:03:00+00:00` (`15:03:00 UTC+5`)
- **`generate_started_at`:** `2026-11-21 10:03:06.153427+00:00` (`15:03:06 UTC+5`, 6s late)
- **`generate_finished_at`:** `2026-11-21 10:05:13.579336+00:00` (`15:05:13 UTC+5`)
- **Pipeline duration:** **127.43 seconds** (~2m 7s)
- **`generate_error`:** `'Pipeline completed without producing a draft.'`

### Comparison: Playground (`playground.py`) vs Test Lab (`test_lab/service.py`)
- `execute_pipeline` in [`backend/app/services/pipeline.py`](../backend/app/services/pipeline.py) returns the generated draft under `"draft"`, `"best_clean_draft"`, and `"best_draft"` (and chosen topic under `"chosen"`).
- [`backend/app/api/routes/playground.py`](../backend/app/api/routes/playground.py) calls `execute_pipeline(..., is_manual=True, run_id=str(run_id))` and reads `final_state.get("best_clean_draft") or final_state.get("draft") or final_state.get("best_draft")`.
- [`backend/app/test_lab/service.py`](../backend/app/test_lab/service.py) (`_save_test_post`) instead read `final_state.get("final_draft")`, which **does not exist** in `execute_pipeline`'s return state (`None` every time), and also read `chosen_topic` instead of `chosen`.

### Checklist Answers (with Proof)
1. **Pipeline returns draft under a different key than Test Lab reads?** **YES.** `execute_pipeline` returns `"draft"` / `"best_clean_draft"` / `"best_draft"`, whereas `_save_test_post` read `"final_draft"`.
2. **Every round rejected and nothing kept as best draft?** **NO.** The pipeline ran 127.43s and returned cleanly with no `error_code`. We also added `extract_best_draft()` (`best_clean_draft -> draft -> best_draft -> best_raw_draft`) so any written draft is always preserved.
3. **A node threw an exception that was caught and returned state as-is?** **NO.** `execute_pipeline` sets `error_code = "pipeline_error"` and `status = "failed_error"` on exception, which `execute_generate_step` checks before `_save_test_post`.
4. **Database call failed (Neon suspended / connection error) and swallowed?** **NO.** Both `generate_started_at` and `generate_finished_at` were committed to `test_lab_runs`.
5. **Pipeline runs in background/stream and Test Lab didn't wait?** **NO.** `execute_pipeline` consumes `app.stream(...)` synchronously and returns `final_state` after 127.43s.
6. **Post-type picker returned nothing?** **NO.** `execute_pipeline` defaults `post_type` to `"technical_explainer"` if empty.
7. **`is_test` or `test_lab` code broke a normal step?** **NO.** `is_test` only filters read queries in `dispatch.py`, `publish.py`, `repositories/post.py`, `analytics.py`, and `dashboard.py`.

---

## 2. Does This Affect Playground or Normal Scheduled Posts?
- **No.** Both `playground.py` and `jobs/dispatch.py` already read `"draft"` / `"best_clean_draft"` / `"best_draft"`. The `"final_draft"` key mismatch existed only in `backend/app/test_lab/service.py`.
- In production, you can still check `generation_runs` (`SELECT status, error_code, error_detail FROM generation_runs ORDER BY created_at DESC LIMIT 10;`) to confirm scheduled runs are unaffected.

---

## 3. Code Changes (Plain-Language Summary)

1. **[`backend/app/services/pipeline.py`](../backend/app/services/pipeline.py)**
   - Added `extract_best_draft(state)` returning `best_clean_draft or draft or best_draft or best_raw_draft`.
   - Tracked `last_node` during `app.stream(...)`. If the pipeline finishes without `error_code` and `extract_best_draft` is `None`, it sets `error_code = "no_draft_produced"`, `error_node = last_node`, and `error_detail = "The pipeline stopped at <last_node> without producing a draft."` instead of silently returning an empty draft.
2. **[`backend/alembic/versions/k2b3c4d5e6f7_add_test_lab_error_details.py`](../backend/alembic/versions/k2b3c4d5e6f7_add_test_lab_error_details.py)**
   - Added `error_details JSONB NOT NULL DEFAULT '{}'::jsonb` to `test_lab_runs`.
3. **[`backend/app/test_lab/models.py`](../backend/app/test_lab/models.py)** & **[`schemas.py`](../backend/app/test_lab/schemas.py)**
   - Added `error_details` (`TestLabStepErrorDetail`: `code`, `node`, `message`, `stack`).
4. **[`backend/app/test_lab/service.py`](../backend/app/test_lab/service.py)** & **[`router.py`](../backend/app/test_lab/router.py)**
   - Updated `_save_test_post` to call `extract_best_draft(final_state)` and `chosen = final_state.get("chosen") or final_state.get("chosen_topic") or {}`.
   - Updated `execute_generate_step` to pass `is_manual=True, run_id=str(run.id)` to `execute_pipeline`, record structured `error_details`, and log `[TEST_LAB] run_id=... step=generate error_code=... node=...`.
   - Added `POST /test-lab/runs/{run_id}/retry-generate` (`prepare_retry_generate` + `run_retry_generate_task`) to retry a failed Step 1 immediately while keeping Steps 2 and 3 if still in the future.
5. **[`frontend/features/test-lab/types.ts`](../frontend/features/test-lab/types.ts)**, **[`api.ts`](../frontend/features/test-lab/api.ts)**, **[`TestLabPanel.tsx`](../frontend/features/test-lab/TestLabPanel.tsx)**
   - Added plain-English error copy mapped from `error_details.code` (falling back to `"The pipeline stopped at <node>"`), a collapsible `"Details"` toggle with a `"Copy"` button, a `"Retry step"` button on failed Step 1 (or Reset guidance if Step 2/3 times have passed), and `"Cancelled because step 1 failed"` / `"Cancelled because step 2 failed"` labels on downstream cancelled steps.
6. **[`backend/tests/test_test_lab.py`](../backend/tests/test_test_lab.py)**
   - Added `test_generate_step_handles_pipeline_draft_key_and_no_draft_error` testing both the `"draft"` key regression fix and the `"no_draft_produced"` error reporting.

---

## 4. Verification

- **Backend pytest (`test_test_lab.py`):** **6 passed** (including regression test for `"draft"` key and `"no_draft_produced"` error).
- **Frontend checks:** Targeted ESLint, `npx tsc --noEmit`, and `npm run build` exited with code 0.
- **Note on live 1m/2m/3m Slack run:** Automated verification exercised `execute_generate_step` with mocked `execute_pipeline` and did not send a live Slack DM to a production workspace; the user can now restart their local backend & frontend servers to run a live 1m/2m/3m Dry run test directly in the Test Lab tab.
