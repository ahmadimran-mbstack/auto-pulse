# Inspect Learned Items Drawer & Border Fix Report

## 1. Root Causes Found

### Layout & Overflow
- `frontend/components/ui/sheet.tsx` had `max-w-sm` on `SheetContent` and no horizontal padding on the body container. `DocumentDetailSheet.tsx` only gave `SheetHeader` `p-4` and placed `<div className="mt-6 space-y-6">` directly inside `SheetContent` without `px-6`, causing cards to touch the drawer edges and overflow on the right.
- `SheetOverlay` used `bg-black/50 backdrop-blur-[2px]` instead of a plain dim without blur.

### Card Borders
- `frontend/app/globals.css` defined `--border` and `--card-border` as `rgba(8, 9, 12, 0.05)` in light mode and `rgba(255, 255, 255, 0.10)` in dark mode, with `--card-shadow: none` and `--card: #111111` (identical to `--popover: #111111` in dark mode). As a result, cards blended into the drawer and page backgrounds.

---

## 2. Code Changes (Plain-Language Line-by-Line Summary)

### Frontend
1. **[`frontend/app/globals.css`](../frontend/app/globals.css)**
   - Raised light-mode `--border` and `--card-border` from `rgba(8, 9, 12, 0.05)` to `rgba(0, 0, 0, 0.12)`, added `--border-hover: rgba(0, 0, 0, 0.20)`, raised `--input` to `rgba(0, 0, 0, 0.20)`, and set `--card-shadow: 0 1px 2px rgba(0, 0, 0, 0.04)`.
   - Raised dark-mode `--border` and `--card-border` from `rgba(255, 255, 255, 0.10)` to `rgba(255, 255, 255, 0.14)`, added `--border-hover: rgba(255, 255, 255, 0.22)`, raised `--input` to `rgba(255, 255, 255, 0.20)`, and lightened `--card` from `#111111` to `#171717` so cards sit slightly lighter than `--popover` (`#111111`) in the drawer.
   - Added `--status-violet-*` and `--status-teal-*` theme tokens (and `@theme` mappings) for category badges in both light and dark modes with WCAG AA contrast.

2. **[`frontend/components/ui/sheet.tsx`](../frontend/components/ui/sheet.tsx)**
   - Removed `backdrop-blur-[2px]` from `SheetOverlay` and replaced it with `bg-black/40 dark:bg-black/60` and a 200ms fade (`duration-200 motion-reduce:animate-none motion-reduce:transition-none`).
   - Updated `SheetContent` (`side === "right"` / `"left"`) to `w-full sm:max-w-[520px]` with 200ms slide-in/out and `motion-reduce` support.

3. **[`frontend/components/app/StatusBadge.tsx`](../frontend/components/app/StatusBadge.tsx)**
   - Changed the `disabled` (Paused) status variant from `"neutral"` to `"warning"` (amber) so paused sources stand out consistently across the Customize page and the drawer.

4. **[`frontend/app/app/customize/components/categoryBadges.tsx`](../frontend/app/app/customize/components/categoryBadges.tsx)** *(new)*
   - Maps all real database categories (`company`, `product`, `team`, `metric`, `result`, `customer`, `market`, `pricing`, `mission`, `differentiator`, `event`, `events`, `career origin`, `management`, `current role`, `hook`, `body`, `ending`, `format`, `voice`, `cta`, `topic`, `hashtags`, `length`, `banned`, `other`), playbook scopes (`all`, `build_in_public`, `technical_explainer`, `hot_take`, `project_showcase_video`, `first_comment_action`), and document kinds (`business`, `playbook`, `previous_posts`) to fixed theme-token colors and 16px (`stroke-[1.75]`) Lucide icons. Never displays color alone or rule IDs.

5. **[`frontend/app/app/customize/components/DocumentDetailSheet.tsx`](../frontend/app/app/customize/components/DocumentDetailSheet.tsx)**
   - Rebuilt the drawer with a sticky header (`px-4 sm:px-6 py-4`), an independently scrolling body (`flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5`), and a sticky footer (`px-4 sm:px-6 py-3.5`).
   - Header shows source icon (`Link2`, `FileText`, or `ClipboardPaste`), wrapping title, clickable external URL (URLs only), kind badge, `StatusBadge`, character count (`tabular-nums`), and added date.
   - Body renders: Paused callout with `Resume source`; Processing progress (`StageProgress` + auto-polling); Failed error copy with `Retry` and collapsible `Details`; real-count summary strip; zero-numbers warning callout with `Add business document` button; category filter chips (shown only when `> 5` items and `> 1` category); 12px-spaced item cards (`space-y-3`) with category/core/scope badges, monospace number chips, expandable `Evidence` row (`Quote` icon + `evidence_quote` + `source_label`), and icon action buttons with tooltips (`Star`, `Copy`, `Trash2` soft-remove with Undo toast; `Pin`, `EyeOff`, `Copy` for previous-post samples); and an empty state with `Re-extract`.
   - Footer includes `Re-extract`, `Pause source` / `Resume source`, and primary `Test in Playground`.
   - Uses `onCloseAutoFocus` to deterministically return focus to the inspect icon button that opened the drawer.

6. **[`frontend/app/app/customize/components/DocumentRow.tsx`](../frontend/app/app/customize/components/DocumentRow.tsx)**
   - Updated the inspect icon button `aria-label` and tooltip to `"Inspect N learned items"` when `item_count` is available.

7. **[`frontend/app/app/customize/components/BusinessSection.tsx`](../frontend/app/app/customize/components/BusinessSection.tsx)** & **[`frontend/app/app/customize/CustomizeClient.tsx`](../frontend/app/app/customize/CustomizeClient.tsx)**
   - Added `id="business-documents-section"` to `BusinessSection` so the zero-numbers callout button closes the drawer, switches to the Business tab, and scrolls to Business documents.
   - Wired `factMutation` (`PATCH /customization/facts/{id}`), `onToggleEnabled`, `onReprocess`, and `lastInspectTriggerRef` focus return in `CustomizeClient.tsx`.

8. **[`frontend/types/customization.ts`](../frontend/types/customization.ts)** & **[`frontend/lib/customization.ts`](../frontend/lib/customization.ts)**
   - Added `item_count` on `DocumentSummary`, `evidence_quote` and `applies_to` on `FactView`, and `patchCustomizationFact` API helper.

### Backend
1. **[`backend/app/jobs/customization_worker.py`](../backend/app/jobs/customization_worker.py)**
   - Added `"document_id": str(f.document_id)` to `facts_dicts` in `_handle_compile`.
2. **[`backend/app/services/customization/compiler.py`](../backend/app/services/customization/compiler.py)**
   - Computed `active_doc_ids = {str(d["id"]) for d in active_docs}` and filtered `biz_facts`, `doc_experiences`, and `active_samples` so items belonging to paused/disabled/non-ready documents are excluded from compiled versions.
3. **[`backend/app/services/customization/retrieval.py`](../backend/app/services/customization/retrieval.py)**
   - Joined `CustomizationDocument` in `retrieve_for_topic` for `business_fact`, `documented_experience`, and `CustomizationPostSample` queries, filtering on `enabled=True`, `status="ready"`, and `deleted_at IS NULL`.
4. **[`backend/app/schemas/customization.py`](../backend/app/schemas/customization.py)** & **[`backend/app/repositories/customization.py`](../backend/app/repositories/customization.py)**
   - Added `item_count` to `DocumentSummary`, `evidence_quote` and `applies_to` to `FactView`, and `FactPatchRequest`. Populated `evidence_quote`, `applies_to`, and `item_count` in `get_document_detail` and `list_customization_documents`.
5. **[`backend/app/api/routes/customization.py`](../backend/app/api/routes/customization.py)**
   - Added `PATCH /customization/facts/{fact_id}` with `require_customization_enabled` + `user.id` ownership filter, syncing `is_core` / `removed` (and `overrides.removed_fact_ids`) and queueing a `compile` job.
   - Filtered `_build_policy_items` playbook facts by active, non-paused documents.
6. **[`backend/tests/test_customization_distillers_compiler.py`](../backend/tests/test_customization_distillers_compiler.py)** & **[`backend/tests/test_customization_routes.py`](../backend/tests/test_customization_routes.py)**
   - Added tests for paused-document fact/sample exclusion in the compiler and `PATCH /customization/facts/{fact_id}` (core toggle, soft-remove, undo, IDOR protection, compile job queueing).

---

## 3. Answers to the Three Backend Checks

1. **Paused document (`ahmadimran.vercel.app`)**:
   - **Database evidence**: Document `a02241cb-6043-487a-bd19-4d78018be7dc` (`ahmadimran.vercel.app`, user `1cdbc556-3f1c-4e06-a744-f624db709115`) had `status='disabled'`, `enabled=False`. In active compiled version `12`, `compiled.sources` correctly excluded `ahmadimran.vercel.app`, **but `compiled.guidance.business_facts` still contained all 6 facts from `ahmadimran.vercel.app`** (out of 9 total).
   - **Cause**: `_handle_compile` did not pass `document_id` on facts, `compile_customization_context` did not filter `facts`/`samples` by `active_doc_ids`, and `retrieve_for_topic` queried `CustomizationFact` and `CustomizationPostSample` without joining `CustomizationDocument` to check `enabled=True` and `status='ready'`.
   - **Fix**: Fixed in `customization_worker.py`, `compiler.py`, `retrieval.py`, and `_build_policy_items`. `PATCH /customization/documents/{doc_id}` already queues a `compile` job (`delay_seconds=2`) when pausing/resuming.

2. **What `is_core` actually does in the pipeline**:
   - During business document distillation (`customization_worker.py`), the `one_liner` fact is created with `is_core=True` and other facts with `is_core=False`.
   - During compilation (`compiler.py`), `is_core` is included in `input_fingerprint`, up to 5 core fact IDs are recorded in `core_fact_ids`, and `is_core` is stored on each item in `guidance.business_facts`.
   - During topic retrieval (`retrieval.py`), after semantic similarity + MMR selection, every fact in `context.guidance.business_facts` with `is_core=True` is **always appended to `selected_facts` with `sim: 1.0`**, even if it did not match the topic's semantic search.
   - The Core badge tooltip reflects this exact behavior: *"Always included in every post's business context, even when not matched by topic search."*

3. **Endpoints for core toggle, soft-remove (with undo), and re-extract**:
   - `POST /customization/documents/{doc_id}/reprocess` already existed with `user.id` ownership check.
   - Added `PATCH /customization/facts/{fact_id}` (`FactPatchRequest`: `is_core`, `removed`) with `require_customization_enabled` and `CustomizationFact.user_id == user.id` ownership enforcement, syncing `removed_fact_ids` overrides and queueing a `compile` job (`delay_seconds=1`) so the UI shows the `Rebuilding` state.

---

## 4. Verification Results

- **Backend pytest**: `17 passed` (`test_customization_routes.py`, `test_customization_distillers_compiler.py`, `test_customization_validation.py`, `test_customization_extractors.py`).
- **Frontend grep checks**: 0 matches for `Sparkles`, hardcoded hex colors, or rule IDs (`U0XX-`) in `DocumentDetailSheet.tsx` and `categoryBadges.tsx`.
- **Frontend targeted ESLint, `tsc --noEmit`, `npm run build`**: All passed with exit code 0 after the final edit. (Repo-wide `npm run lint` still reports 55 pre-existing errors in unrelated files.)
- **Playwright verification**:
  - Keyboard test: `Tab` moved focus inside `[data-slot="sheet-content"]` (`activeInDrawer: true`), and `Escape` closed the drawer and returned focus to `button[aria-label="Inspect 6 learned items"]`.
  - Screenshots saved in `docs/screenshots/`:
    - `customize-business-light-1440.png`
    - `drawer-biz-paused-light-1440.png`
    - `drawer-biz-paused-dark-1440.png`
    - `drawer-biz-paused-light-390.png`
    - `drawer-biz-paused-dark-390.png`
    - `drawer-playbook-17-light-1440.png`
    - `drawer-playbook-17-dark-1440.png`
    - `drawer-prev-posts-light-1440.png`
    - `drawer-processing-light-1440.png`
    - `drawer-failed-light-1440.png`
    - `drawer-empty-light-1440.png`
    - `playground-light-1440.png`
