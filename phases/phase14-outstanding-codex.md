# Phase 14 Outstanding — Plan for Codex

## Context

Phase 14 (mobile polish & stability) is the final MVP phase. Initial work has landed: safe-area CSS vars + utilities, viewport `cover` + `interactiveWidget: "resizes-visual"`, global focus scroll-margin, `text-base` (16px) on most form inputs to avoid iOS Safari zoom, and a verified `pg_dump`/restore runbook in `docs/backup-restore.md`.

What remains is the §2.1 (loading/error/in-flight/toast consistency) audit fixes, the §2.2 (mobile input) pass, residual §2.3 sticky-layout gaps, and §2.4 phone smoke testing (user-driven; defects surfaced there get fixed in this same phase).

Goal: a phone-first core loop that gives clear feedback on every mutation, never zooms inputs on iOS, never hides important UI behind sticky chrome or the keyboard, and surfaces actual API errors instead of generic fallbacks.

User scope decisions for this plan:
- **Patch helpers in place** — no shared `src/lib` consolidation of `FormField`, `getErrorMessage`/`readErrorResponse`, or `AutoHeightTextarea`.
- **Add a lightweight shared toast primitive** for mutation feedback (closes the audit's biggest gap: no completion signal today).
- **Full mobile input pass** — fix every item the audit surfaced.

Out of scope: new product features, schema changes, API redesign, post-MVP work (routines, Previous column, analytics, variants).

## Workstream A — Shared toast primitive

**Files**
- New `src/app/toast.tsx` — exports a `<ToastProvider>` mounted in `src/app/app-shell.tsx` and a `useToast()` hook returning `{ success, error }` callers.
- `src/app/app-shell.tsx` — wrap children with `<ToastProvider>`. Toast viewport uses `safe-bottom`/`safe-sheet-panel` so it clears bottom nav and home indicator.

**Behavior**
- Bottom-anchored, above bottom nav and floating active-workout card. Auto-dismiss after ~2.5s; tap to dismiss.
- One toast at a time (queue or replace — replace is simpler).
- Visual style matches existing dark UI; reuse the in-file `SyncBusyToast` pattern from `src/app/workout-app.tsx` for consistency, then **delete `SyncBusyToast`** and route its single caller through `useToast()`.

**Adopt at mutation sites** (success on completion, error with parsed message on failure):
- Saved workout delete and edit save (`src/app/profile/workouts/[id]/saved-workout-detail-app.tsx`, `.../edit/edit-workout-app.tsx`).
- Live workout finish/save (already has inline error — add a success toast on save commit).
- Bodyweight create/update/delete (`src/app/profile/measures/measures-app.tsx`).
- Exercise create/edit/delete in `src/app/exercise-library-app.tsx`.
- Settings/units changes (`src/app/profile/settings/...`).
- Reorder commit on live workout and edit-workout.

Use the API JSON `{error}` body as the toast message when present; fall back to a per-action verb ("Couldn't save workout") only when the response is unavailable or malformed. The existing per-screen `getErrorMessage`/`readErrorResponse` helpers stay where they are.

## Workstream B — Loading / error / in-flight gaps (§2.1)

Patch only the gaps the audit surfaced; don't redesign screens.

| Surface | Gap | Fix |
|---|---|---|
| `src/app/workout-app.tsx` live load | No initial loading indicator before workout data arrives | Add a compact skeleton/loading panel matching the shell, similar to existing `EditWorkoutSkeleton` |
| `src/app/exercise-library-app.tsx` detail panel | No detail skeleton; no in-flight disable on create/edit submit button | Skeleton on detail load; disable submit during save with visible label change |
| Settings + units screens | "Loading" plain text, no error JSON message | Replace with the same skeleton pattern used in measures; surface parsed error |
| All mutation error states (delete/save) | No retry button — user has to close/reopen sheet | Add a "Try again" action inside the existing `ConfirmSheet` error block (already accepts `error` prop in `src/app/confirm-sheet.tsx`) |
| Generic "Something went wrong" fallbacks | API error bodies parsed but discarded | Pass the parsed message into the inline error block / toast; keep generic only as a true fallback |

No new error utility module; keep the existing duplicated `getErrorMessage`/`readErrorResponse` pattern (per scope decision).

## Workstream C — Mobile input pass (§2.2)

Fix in place at each call site. No new shared component.

**Numeric inputs (already mostly correct):**
- `src/app/workout-app.tsx` set rows: weight (`inputMode="decimal"`) and reps (`inputMode="numeric"`) are correct. Add `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`. Optional: `pattern="[0-9]*\.?[0-9]*"` on weight, `pattern="[0-9]*"` on reps for older iOS.
- Same updates on `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx` set rows.
- `src/app/profile/measures/measures-app.tsx` bodyweight input — already `inputMode="decimal"`; add the autoComplete/autoCorrect/autoCapitalize trio.

**Text inputs missing `inputMode` / mobile attrs:**
- `src/app/workout-metadata-ui.tsx` workout title (line ~84) and description textarea — add `autoCapitalize="sentences"`, `autoCorrect="on"` (these are prose, not numbers).
- `src/app/exercise-library-app.tsx` search input (~559) — `inputMode="search"`, `autoCorrect="off"`, `autoCapitalize="none"`.
- Exercise name input (~1234) — `autoCapitalize="words"`, `autoCorrect="off"`.
- Exercise description textarea (~1243) — `autoCapitalize="sentences"`, `autoCorrect="on"`.

**iOS zoom risk:**
- `AutoHeightTextarea` in `src/app/workout-app.tsx` (~2074) renders at `text-sm` (14px). Bump to `text-base` (16px) — the only sub-16px input left after Phase 14's earlier pass.

**Focus order check (no code change unless broken):**
- Verify weight → reps → (RPE button picker) tab order on the live and edit set sheets. RPE is a button, so it's expected to break native tab flow; that's fine.

## Workstream D — Sticky-layout / sheet residuals (§2.3)

Most of §2.3 already shipped (safe-area utilities, focus scroll-margin). Remaining checks Codex should do statically before phone testing:

- Confirm every bottom sheet (`workout-app.tsx`, `workout-metadata-ui.tsx`, `exercise-library-app.tsx`, `measures-app.tsx`, `confirm-sheet.tsx`) uses `safe-sheet`/`safe-sheet-panel` from `src/app/globals.css`. Patch any that don't.
- Confirm the floating active-workout card and `AppShell` bottom nav both apply `safe-bottom` (or equivalent inset padding). Already verified earlier in Phase 14, but re-verify after toast viewport lands above them.
- Toast viewport must sit above the floating active-workout card visually but not block its tap target — give it its own z-index above nav (z-index: 60+) and limit width.

## Workstream E — Phone smoke test (user-driven, defect-fix loop)

Codex does not run the phone test, but should be ready to fix what it surfaces. Once the user runs the §2.4 core loop on iOS Safari over Tailscale (start → add exercise → log → reorder → finish/save → reopen → edit → delete → discard), Codex:

- Treats the test report as a punch list, fixes defects in place, and re-validates per §5.
- Does not commit Phase 14 work until the user signs off on the phone test.

## Critical files

- `src/app/app-shell.tsx` — toast provider mount point.
- `src/app/toast.tsx` — new primitive.
- `src/app/confirm-sheet.tsx` — add retry action inside existing error block.
- `src/app/workout-app.tsx` — set row mobile attrs, AutoHeightTextarea font bump, replace SyncBusyToast, initial loading state, mutation toasts.
- `src/app/workout-metadata-ui.tsx` — title/description mobile attrs.
- `src/app/exercise-library-app.tsx` — search/name/description mobile attrs, detail skeleton, submit in-flight, mutation toasts.
- `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx` — mutation toasts + retry on delete error.
- `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx` — set row mobile attrs, mutation toasts, retry on save error.
- `src/app/profile/measures/measures-app.tsx` — bodyweight input mobile attrs, mutation toasts.
- `src/app/profile/settings/...` and units settings — skeleton parity, error surfacing, mutation toasts.
- `src/app/globals.css` — only if a sheet/safe-area gap is found; no preemptive edits.

## Verification

For each landed change Codex must, before committing:

1. `npm run lint`
2. `npm run build`
3. `git diff --check`
4. Local browser smoke:
   - Start a workout, log a set, finish/save → success toast.
   - Trigger an API failure (block a network request in devtools or stop the db briefly) on save and on delete → error toast with API message + retry button works.
   - Tap each text/number input, confirm correct keyboard, no iOS zoom (use Safari responsive-design or a real device if available — desktop Chrome can't replicate iOS zoom).
5. Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md` per CLAUDE.md handoff rules; do not stage `HANDOFF.md` or `CLAUDE.md`.
6. **Do not commit or push Phase 14 work until the user has run the §2.4 phone smoke test and confirmed the core loop passes.** Land changes locally, append handoff entries, and wait.

Acceptance per the existing `phases/phase14-mobile-polish-stability.md` §6 criteria, all of which are already in scope above.
