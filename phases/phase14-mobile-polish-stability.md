# Phase 14 - Mobile Polish and Stability

> **Author:** Codex (implementation plan).
> **Status:** Draft plan.
> **Scope:** Final MVP polish and stability pass across the core phone workout loop, network-backed screens, and local self-hosting operations.
> **Goal:** Make the core workout flow reliable and comfortable in a real mobile browser, and document a verified PostgreSQL backup/restore path for the self-hosted deployment.

---

## 1. Context

Phases 0-13 build the MVP workout tracker: exercise CRUD, active workout logging, autosync, finish/save, saved workout detail, completed-workout edit, reordering, and deletion.

Phase 14 does not add new product areas. It is the final stabilization pass called out in spec §12:

```txt
loading states
error states
toasts
input focus behavior
safe area spacing
real phone testing
PostgreSQL backups
```

The app is primarily used from a phone browser at the gym, through a single-user Tailscale-only self-hosted deployment. The polish target is therefore practical: the user should be able to start, log, save, reopen, edit, and delete workouts without blocked flows, hidden controls, layout jumps, or unclear failure states on a real phone.

## 2. Product Behavior

### 2.1 Loading, error, and toast consistency

Audit every network-backed screen and user action for an explicit loading, empty, success, and error path where applicable:

- Workout screen and active workout recovery
- Exercise Library list, detail, create/edit sheet, and add-to-workout flow
- Profile workout history
- Measures screen
- Settings/Profile configuration screens
- Saved workout detail
- Completed-workout edit screen
- Confirm sheets for destructive actions

Expected behavior:

- Initial page loads show skeletons or compact loading states instead of blank panes.
- Inline load failures give a readable message and a retry path when retry is meaningful.
- Save/delete/discard/reorder/add actions disable only the relevant control while in flight.
- Mutations that complete away from the current screen navigate cleanly without showing stale toasts.
- Toasts or small transient notices use consistent tone, placement, and duration.
- Errors from API JSON bodies are surfaced when useful; generic fallback text is used only when the response is unavailable or malformed.

### 2.2 Mobile input behavior

Audit set rows, notes, metadata fields, settings fields, measures inputs, and bottom sheets on real phone browsers.

Expected behavior:

- Numeric fields request the correct mobile keyboard through `inputMode`, `type`, and pattern choices appropriate to the value.
- Weight, reps, RPE, duration, and bodyweight fields accept expected decimal/integer input without fighting autocorrect or locale quirks.
- Focus order follows the logging flow: weight -> reps -> RPE where those controls are present.
- Focused inputs are not hidden behind the browser keyboard, bottom nav, floating active-workout card, or sticky headers.
- Bottom sheets remain scrollable while the keyboard is open.
- Notes and metadata textareas do not expand in a way that hides the active row or primary action.
- Blur/submit behavior does not accidentally lose unsaved edits or fire duplicate saves.

### 2.3 Safe-area spacing

Audit all fixed, sticky, and floating UI against iOS Safari and Android Chrome safe areas.

Areas to check:

- App header and subpage header
- Bottom nav
- Floating active-workout card
- Live workout sticky header and timer row
- Finish/Save/Edit sticky action bars
- Exercise picker and confirmation sheets
- Full-screen loading/error/empty states

Expected behavior:

- Nothing important is clipped by a notch, dynamic island, rounded display corner, browser toolbar, or home indicator.
- Bottom nav and floating active-workout card have enough bottom padding on devices with a home indicator.
- Sticky headers do not cover focused inputs or the first content row.
- Sheets account for both safe area and keyboard height.
- Main scroll containers have stable height and do not create nested scroll traps unless a sheet intentionally owns scrolling.

### 2.4 Real phone core-loop testing

Run the core loop on actual phone browsers, not only desktop responsive emulation:

```txt
start workout
add exercise
log sets
change set types
delete sets
reorder exercises
finish/save
reopen saved workout
edit completed workout
delete saved workout
discard active workout
```

Minimum device/browser matrix:

- iOS Safari on the user's normal phone, over the Tailscale or LAN URL used day to day
- Android Chrome if available, or document that only iOS Safari was available for this MVP pass
- Desktop browser quick smoke test for regressions

Critical checks:

- Tap targets are large enough for gym use.
- Scrolling while editing remains predictable.
- Drag handles do not fight vertical scroll.
- Timer remains accurate through minimize, resume, refresh, and navigation.
- Autosync failure messages are understandable and do not block unrelated edits.
- Refresh and back/forward navigation do not strand the user in a broken state.

### 2.5 PostgreSQL backup and restore operations

Document and verify a self-hosted backup path using Docker Compose and PostgreSQL-native tools.

Required operational docs or scripts:

- `pg_dump` command for the Compose `db` service.
- Restore command using `psql` or `pg_restore`, matching the chosen dump format.
- Where backup files should live on the local server.
- How to name backup files with timestamps.
- How to avoid accidentally writing backups into git-tracked paths.
- Caveats for a single-user local server: disk space, file permissions, container names, compose project names, and whether the app should be stopped during restore.
- Restore dry-run instructions against a disposable database or clearly documented local test target.

The backup plan should prefer simple, inspectable commands over a complex scheduler. Automated scheduling can be added only if the manual backup and restore path is verified first.

## 3. API and Schema Plan

No public API or Prisma schema changes are expected for Phase 14.

Phase 14 code work should be limited to UI polish, client-side state handling, small route-handler error consistency fixes, documentation, backup scripts, or operational notes unless testing finds a concrete bug. If testing reveals a backend validation or persistence defect, fix the defect directly and document the behavioral change in the handoff.

No social, auth, multi-user, routines, analytics, Previous column, or public sharing work belongs in this phase.

## 4. Workstreams

### 4.1 State audit

Create a screen/action checklist and mark each item as one of:

- already covered
- needs loading state
- needs empty state
- needs inline error
- needs toast
- needs retry
- needs disabled/in-flight state

Use the checklist to make small targeted fixes. Avoid redesigning screens unless layout testing shows a specific mobile failure.

### 4.2 Input and keyboard pass

Walk through each editing surface with real data:

- active set row weight/reps/RPE controls
- active exercise notes
- save workout title, description, date/time, and duration
- completed-workout edit metadata, exercise notes, and set controls
- exercise create/edit fields
- measures inputs
- settings inputs

Record any browser-specific behavior. Fix only issues that block or meaningfully slow the MVP workflow.

### 4.3 Safe-area and sticky-layout pass

Review shared layout primitives first, especially `AppShell`, bottom nav, floating active-workout card, live workout header, and sheet components. Prefer shared spacing fixes over per-screen patches when the same issue appears in multiple places.

Verify that any CSS changes preserve the existing dark mobile UI and do not introduce desktop-only assumptions.

### 4.4 Phone smoke test

Run the full core loop on a real phone with the app served through the same kind of URL the user will use in practice.

Capture:

- device and browser
- app URL type: localhost, LAN IP, hostname, or Tailscale IP
- date/time of test
- pass/fail notes for each core-loop step
- screenshots only for failures or ambiguous layout issues

### 4.5 Backup documentation and restore verification

Add a short operations document or script-driven README section for backups. Verify the commands against a disposable target before calling the phase done.

The restore test must prove that a dump can be read back by PostgreSQL. Prefer restoring into a separate local disposable database so production-like data is not destroyed during validation.

## 5. Validation Plan

For creating this plan:

- Confirm the markdown is readable and follows the existing phase-plan style.
- `git diff --check`

For future Phase 14 implementation:

- `npm run lint`
- `npm run build`
- `git diff --check`
- Real phone browser smoke test for the core loop in §2.4
- Backup and restore dry run against a disposable database or a clearly documented local test target
- API smoke checks only for defects fixed during this phase

## 6. Acceptance Criteria

Phase 14 is complete when:

- The core workout loop is not blocked on a real phone browser.
- No important UI is hidden behind safe areas, sticky chrome, floating cards, sheets, or the keyboard.
- Loading and error states exist for all network-backed screens.
- Mutating actions communicate in-flight, success, and failure states clearly enough for gym use.
- Numeric keyboards and focus behavior are comfortable for set logging and workout metadata editing.
- Exercise reorder handles remain handle-only and do not fight normal page scrolling.
- The backup command and restore procedure are documented and verified.
- `npm run lint`, `npm run build`, and `git diff --check` pass after implementation.

## 7. Handoff and Git

- Append a dated `(Codex)` or `(Claude)` entry to `HANDOFF.md` after each meaningful change, validation pass, or git operation.
- Do not stage or commit `HANDOFF.md` or `CLAUDE.md`; they are local-only workspace files.
- Do not commit or push Phase 14 polish work until it has passed lint, build, and the relevant manual smoke checks.
- If backup verification creates dump files, keep them outside git-tracked paths or add an explicit ignored backup directory before generating them.
