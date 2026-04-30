# Previous Quick Fill Design Notes

Status: design resolved through grill-me sessions on 2026-04-30. No implementation has been started from this document.

## Purpose

Replace the current `Previous` placeholder in live workout set rows with useful historical guidance and quick-fill behavior. The same concept also applies in completed workout edit, with edit-specific rules.

This feature is not for read-only exercise history or saved workout detail.

## Core Terms

- **Exercise Type**: the logging pattern for an exercise, such as `weight_reps`, `bodyweight_reps`, `weighted_bodyweight`, or `assisted_bodyweight`.
- **Set Type**: the row role: `normal`, `warmup`, `failure`, or `drop`.
- **Displayed Set Identity**: the user-facing identity of a set row, based on set type and set numbering rather than physical `row_index`.
- **Numbered Set Lane**: the shared numbered sequence for `normal` and `failure` rows.
- **Previous**: the historical value associated with a row's current displayed identity.
- **Previous Quick Fill**: a tappable combined Previous value that copies historical weight/reps into the current row.
- **Exercise Template Seeding**: creating newly added exercise rows from prior completed history without copying historical values as real entries.
- **Live Progress Summary**: the active workout top strip that reflects checked progress.

See also `CONTEXT.md`, created during the design session.

## Previous Matching

Previous matches by source `exercise_id` only. It does not match saved snapshot names. If the source exercise has been hard-deleted from the library, Previous shows `-` for all rows in that exercise block — there is no fallback to snapshot-name matching.

Previous matches by **Displayed Set Identity**, not physical `row_index`.

Rules:

- `normal` and `failure` share the numbered set lane.
- Current Set 2 searches for historical Set 2, skipping workouts that only had one matching set.
- Warmups match by warmup order, such as Warmup #1 and Warmup #2.
- Drops match by drop identity under their parent displayed set, if possible. If the most recent completed workout has no matching drop under that parent's identity, Previous shows `-` immediately — do not search farther back for a different workout's drop. Drops are tied to their parent.
- If no matching recorded historical row exists, show `-`.
- Recorded historical rows are rows with `reps >= 1`; checked state is not the save filter.

Example:

- Previous workout had Row 1 Warmup, Row 2 Working Set 1.
- Current workout has Row 1 Working Set 1, Row 2 Working Set 2.
- Current Working Set 1 matches historical Working Set 1, even though it was row 2.
- Current Working Set 2 searches farther back for historical Working Set 2.

## Duplicate Exercise Occurrences

Duplicate exercise blocks are matched by occurrence number within the workout, derived from workout exercise order.

Example:

- Previous workout:
  - Pull Up occurrence 1: Set 1 = `8`
  - Pull Up occurrence 2: Set 1 = `5`
- Current workout:
  - Pull Up occurrence 1 Previous = `8`
  - Pull Up occurrence 2 Previous = `5`

If the latest completed workout has only occurrence 1, occurrence 2 searches farther back for a completed workout that has occurrence 2.

## Previous Display

Previous display depends on whether the exercise type has an external weight input.

- `weight_reps`: show weight and reps, e.g. `135.00 x 8`
- `weighted_bodyweight`: show weight and reps, e.g. `25.00 x 8`
- `assisted_bodyweight`: show weight and reps, e.g. `40.00 x 8`
- `bodyweight_reps`: show reps only, e.g. `12`

For weighted bodyweight and assisted bodyweight, do not include `+`, `-`, or unit in the combined Previous value. The live weight column header already shows the load direction and unit, such as `-lbs`.

Historical external weights are converted into the live workout exercise's current input unit before display. Use two decimal places.

RPE is never copied or ghosted from Previous. RPE belongs to the current workout's perceived effort.

The set table column header for Previous is the literal word **`Previous`**.

## Missing And Zero Values

Zero is a real value.

- Historical `0 lbs x 3` displays as `0.00 x 3`.
- Tapping it fills real `0` and `3`.

Empty input placeholders are not real values.

- If no history exists, Previous shows `-`.
- Empty weight/reps fields may still show normal gray `0` placeholders, but those are not Previous and are not tappable quick-fill values.

If historical reps are missing, there is no Previous value for that row.

If historical weight is missing for an exercise type with external weight input, default the weight portion to zero.

## Quick Fill Behavior

The combined Previous value is the tap target. Individual weight and reps cells are not quick-fill tap targets because the user may want to manually change either field.

Ghost behavior:

- Previous values appear as gray ghost values in the corresponding empty input fields.
- Manually entered values turn white and replace the ghost.
- If the user deletes all text in a field, that field returns to the current Previous ghost.
- Recomputing Previous does not overwrite manually entered values.

Quick-fill behavior:

- Tapping the combined Previous value copies all available visible Previous fields into the row.
- For external-weight exercise types, it copies weight and reps.
- For `bodyweight_reps`, it copies reps only.
- It persists immediately through the same save queue as manual set edits.
- It does not mark the checkmark checked.
- If entered values already exist, tapping Previous overwrites them with the current Previous values.

## Live Progress Summary

Keep backend/save behavior unchanged:

- Sets persist when typed.
- Finish/save/history use `reps >= 1`.
- Checkmark is not a save filter.

Change only the active workout top strip behavior:

- Visible `Sets` already follows checked-set count.
- Visible `Volume` should also follow checked-set volume.
- Unchecking a row subtracts that row from the live progress volume.
- Saved workout volume and history volume continue to use recorded sets.

Volume unit display:

- The volume number on the top strip follows the **global app unit setting**. It acts as a translator.
- If the workout includes exercises in different input units (e.g., bench in lbs and an assisted machine in kg), all checked-set volumes convert to the global unit before summing. One number, one label.
- Saved workout volume and history volume are unaffected by this rule — they continue to use stored units per the existing behavior.

## Live Workout Behavior

Live workout Previous lookup searches all completed workouts newest-first. There is no hard cap on search depth. The search is **lazy** — for each row, stop at the first completed workout that has a matching recorded row for that displayed identity. Skip workouts that don't have the matching identity entirely.

Previous should be included in the active workout exercise list response or an equivalent server-derived read model so rows render with correct ghosts and avoid client-side duplication of matching rules.

Previous recomputes after changes that affect displayed identity:

- set type changes
- add set
- delete set
- reorder or duplicate occurrence changes if they affect occurrence number
- exercise unit changes

Recomputed Previous changes ghosts and combined Previous value, but does not overwrite typed current values.

Ghost recompute is a **silent swap** — no animation, flash, or fade. The ghost text simply updates in place.

When the user changes the exercise's input unit mid-workout, typed values in the live rows **convert to the new unit** along with the ghost recompute (consistent with the app's existing unit-conversion behavior). Previous ghosts also display in the new unit.

Example:

- Set 1 warmup Previous `95.00 x 6`, current values `95` and `7`.
- Set 2 normal Previous `170.00 x 8`, current values `170` and `8`.
- User changes Set 2 to warmup.
- Set 2 becomes Warmup #2.
- Previous recomputes to the last historical Warmup #2, such as `115.00 x 6`.
- Current values stay `170` and `8` until the user deletes them or taps Previous.

## Exercise Template Seeding

When adding an exercise as the first occurrence:

- Search newest-first for the most recent completed workout where the first occurrence of that exercise has recorded rows.
- Clone that first occurrence's recorded set row structure.
- Copy set types and row count, but not values, checked state, or RPE.
- Historical values appear only as Previous ghosts.
- If no history exists, create one normal row.
- If a copied first row would be invalid, such as a drop row without a parent, fall back safely to normal.

Example:

- Previous first occurrence had Warmup `50 x 10` and Normal Set 1 `100 x 8`.
- New first occurrence creates Warmup and Normal Set 1.
- Values are ghosts until quick-filled or typed.

When adding duplicate occurrences, occurrence 2 or later:

- Always create one normal row.
- Do not copy row count or first-row set type.
- The initial normal row uses Previous from the matching occurrence's numbered Set 1, skipping historical warmups.

Example:

- Previous workout:
  - Exercise A occurrence 1: 1 set
  - Exercise A occurrence 2: warmup plus two normal sets
- Next session:
  - Add Exercise A first time: seed from occurrence 1.
  - Add Exercise A second time: create one normal row only.
  - That row's Previous comes from occurrence 2's Normal Set 1, not its warmup.

Exercise Template Seeding uses recorded historical rows regardless of exercise type. Exercise type controls only Previous display and quick-fill values.

## Completed Workout Edit

Previous is visible in completed workout edit as well as live workout logging.

Completed edit has two modes:

- Existing rows loaded from the saved workout start with Previous equal to that row's own saved values. Each existing row remembers its **originally-saved displayed identity**.
- Newly added exercises and sets follow live workout rules, except historical lookup is relative to the workout being edited.

If an existing row's current displayed identity matches its originally-saved identity:

- Previous remains the row's original saved value.
- Tapping Previous restores that original saved row value.
- This rule also applies if the user changed the identity and then changed it back to the original — Previous returns to the original saved value once identity matches again.

If an existing row's current displayed identity differs from its originally-saved identity:

- Previous recomputes based on the new displayed identity.
- Lookup uses only completed workouts before the edited workout's `started_at`.
- The workout being edited and later workouts are excluded.
- Recomputing does not overwrite current typed values.

Newly added sets in completed workout edit follow **live rules with the edit cutoff**:

- A new row has no original saved identity, so Previous is computed from the current displayed identity using only completed workouts before the edited workout's `started_at`.
- If no match exists in that window, show `-`.

Example:

- Original saved Row 2 is Normal Set 1, `170 x 8`.
- User changes Row 2 to Warmup.
- Current values remain `170` and `8`.
- Previous recomputes as Warmup #2 using workouts before the edited workout's `started_at`, such as `115 x 6`.
- User changes Row 2 back to Normal Set 1. Previous returns to the original saved value `170 x 8` because the current identity now matches the originally-saved identity again.

## Implementation Pointers

Likely areas to inspect before coding:

- `src/app/workout-app.tsx` for live set rows, quick-fill UI, summary counters, and set update queue.
- `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx` for completed edit set rows and draft identity tracking.
- `src/lib/workout-exercise-api.ts` for add-exercise behavior and active workout exercise response mapping.
- `src/lib/workout-set-api.ts` for set numbering, row reindexing, and normalized volume calculations.
- `src/lib/exercise-history-api.ts` for existing completed exercise history read patterns and weight conversion.
- `src/lib/completed-workout-edit-api.ts` for completed edit save/recalculation behavior.

No ADR was created. The decisions are product/domain behavior and can be captured in `CONTEXT.md` plus this design note.
