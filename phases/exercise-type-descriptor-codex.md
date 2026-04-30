# Exercise Type Descriptor — Plan for Codex

## Context

The four exercise type values (`weight_reps`, `bodyweight_reps`, `weighted_bodyweight`, `assisted_bodyweight`) are checked as string literals in **76 places across 11 files**. Every surface independently re-derives the same per-type rules:

- "weight_reps shows the weight column; bodyweight_reps doesn't"
- "weighted_bodyweight adds the input load to bodyweight; assisted subtracts"
- "only weight_reps stores `inputWeightUnit`"
- "weighted_bodyweight prefixes the label with 'Add'; assisted prefixes with 'Assist'"

Display helpers `getWeightColumnLabel`, `getWeightInputLabel`, `getExerciseTypeLabel`, `formatSetLabel`, `getSetLabelClassName` are also duplicated between `workout-app.tsx`, `edit-workout-app.tsx`, and (partially) `saved-workout-detail-app.tsx`.

**Why now:** this refactor is mechanical and behavior-preserving, and it unblocks two larger refactors in the same architecture review:

- Consolidating set-effective-weight math (currently duplicated in `workout-set-api.ts` and `completed-workout-edit-api.ts`) — that work consumes the descriptor.
- Extracting shared set-row UI between live workout and edit workout — those components consume the same display helpers.

User-confirmed scope decisions:

- **Scope = display + per-type predicates only.** Set-weight math (assist clamping, weighted-bodyweight addition, volume calculation) stays in `workout-set-api.ts` / `completed-workout-edit-api.ts` for this phase. That's a separate refactor.
- **No DB or schema changes.** The `ExerciseType` enum in `prisma/schema.prisma` keeps its four values exactly. This is a TypeScript-only refactor.
- **Behavior must not change.** Every display string the user sees today must remain identical after the refactor. Lint + build + manual smoke confirm.

Out of scope for this phase: set-weight resolver consolidation (review item #1), set-numbering consolidation (#2), shared set-row component (#3), live-workout store (#4).

---

## New module: `src/lib/exercise-type.ts`

A single source of truth for per-type behavior and display.

### Descriptor table

```ts
import type { ExerciseType } from "@/generated/prisma";

type ExerciseTypeDescriptor = {
  // Whether the user enters a weight value alongside reps for this type.
  hasWeightInput: boolean;
  // Whether the user's bodyweight contributes to the effective load.
  usesBodyweight: boolean;
  // For bodyweight variants: how the entered load combines with bodyweight.
  // null for weight_reps and bodyweight_reps.
  loadModifier: "add" | "subtract" | null;
  // Whether the per-set inputWeightUnit column applies to this type.
  // (Only weight_reps stores a per-set unit; bodyweight types use the session unit.)
  storesInputWeightUnit: boolean;
};

export const EXERCISE_TYPE_BEHAVIOR: Record<ExerciseType, ExerciseTypeDescriptor> = {
  weight_reps:         { hasWeightInput: true,  usesBodyweight: false, loadModifier: null,       storesInputWeightUnit: true  },
  bodyweight_reps:     { hasWeightInput: false, usesBodyweight: true,  loadModifier: null,       storesInputWeightUnit: false },
  weighted_bodyweight: { hasWeightInput: true,  usesBodyweight: true,  loadModifier: "add",      storesInputWeightUnit: false },
  assisted_bodyweight: { hasWeightInput: true,  usesBodyweight: true,  loadModifier: "subtract", storesInputWeightUnit: false },
};

export const hasWeightInput        = (t: ExerciseType) => EXERCISE_TYPE_BEHAVIOR[t].hasWeightInput;
export const usesBodyweight        = (t: ExerciseType) => EXERCISE_TYPE_BEHAVIOR[t].usesBodyweight;
export const storesInputWeightUnit = (t: ExerciseType) => EXERCISE_TYPE_BEHAVIOR[t].storesInputWeightUnit;
export const isBodyweightVariant   = (t: ExerciseType) => EXERCISE_TYPE_BEHAVIOR[t].usesBodyweight;
```

### Display helpers (move, don't rewrite)

Move the existing helper bodies verbatim from `edit-workout-app.tsx:1966-2006` into the new module:

```ts
import type { WeightUnit } from "@/generated/prisma";

export function getWeightColumnLabel(exerciseType: ExerciseType, weightUnit: WeightUnit): string;
export function getWeightInputLabel(exerciseType: ExerciseType): string;
export function getExerciseTypeLabel(exerciseType: ExerciseType): string;
```

Keep the bodies as `if`-chains exactly as today. (Switching them to use the descriptor table is a follow-up if-and-when needed; the goal of this phase is consolidation, not cleverness.)

### What does NOT belong here

- `formatSetLabel` and `getSetLabelClassName` — these key off `set_type` (warmup/normal/drop/failure/top), not `exercise_type`. They are duplicated and should move into a shared module too, but a different one — propose `src/lib/set-display.ts` in the same phase or split it out. **Recommend bundling here:** add `src/lib/set-display.ts` in the same commit so the live and edit screens both stop carrying the helpers locally.
- Set-weight math (`resolveEffectiveWeight`, `getDisplayWeight`, volume calculation). Stays in the API libs for now.

---

## Migration: replace literals with descriptor calls

For each file, rewrite the per-type branches to use the descriptor or one of the predicates. Do **not** invent new behavior — match the existing if-chains exactly.

### Server side (`src/lib/`)

**`src/lib/workout-set-api.ts`**
- `:169` — `exerciseType === "assisted_bodyweight"` → keep as-is (it's a one-off precondition, not duplication). Optional: `EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "subtract"`. Pick whichever reads better.
- `:199` — `exerciseType === "weight_reps" && ...` → `storesInputWeightUnit(exerciseType) && ...`
- `:518` — `if (exerciseType === "bodyweight_reps")` → `if (!hasWeightInput(exerciseType) && usesBodyweight(exerciseType))`
- `:537` — `if (exerciseType === "weight_reps")` → leave; this gates the entire weight_reps math branch and reads more clearly as a literal.
- `:605-607` — the `weighted/assisted` branch → `EXERCISE_TYPE_BEHAVIOR[exerciseType].loadModifier === "add" | "subtract"`.

**Guideline for the lib files:** do *not* mass-rewrite every literal. Replace literals where the rewrite *clarifies the intent* (e.g., `storesInputWeightUnit` is more meaningful than `=== "weight_reps"`). Leave literals that are gating distinct math branches; they read fine.

**`src/lib/completed-workout-edit-api.ts`** — same pattern as `workout-set-api.ts`. Mirror the same set of replacements.

**`src/lib/exercise-history-api.ts:212, 227, 273`** — `exerciseType === "bodyweight_reps"` → `!hasWeightInput(exerciseType)`.

**`src/lib/exercise-weight-unit-preference-api.ts:45`** and **`src/app/api/exercises/[id]/weight-unit-preference/route.ts:61`** — `exercise.exerciseType !== "weight_reps"` → `!storesInputWeightUnit(exercise.exerciseType)`. The error string `"unsupported_exercise_type"` and HTTP 400 stay identical.

**`src/lib/exercise-api.ts`** — review the literals; most are likely validation against the enum and should stay as literals.

### Client side (`src/app/`)

**`src/app/workout-app.tsx`**
- Delete the local helpers at `:3133-3300` (`formatSetLabel`, `getSetLabelClassName`, `getWeightColumnLabel`, `getWeightInputLabel`, plus any inline `getExerciseTypeLabel`).
- Import from `@/lib/exercise-type` and `@/lib/set-display`.
- Replace per-type branches inside the component body where appropriate (e.g., the `inputWeightUnit` decision around set rendering uses `storesInputWeightUnit`).

**`src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`**
- Delete the local helpers at `:1917-2006`.
- Import from the new modules.

**`src/app/profile/workouts/[id]/saved-workout-detail-app.tsx`**
- Delete the local `formatSetLabel` (`:457`) and `getSetLabelClassName` (`:473`).
- Import from `@/lib/set-display`.

**`src/app/exercise-library-app.tsx`**
- `getExerciseTypeLabel` usage (`:905`) → import from `@/lib/exercise-type`.
- The exercise create/edit form's `exerciseTypeOptions` (`:1366`) is a UI definition list; it can stay as literals. (It's the one place where listing all four explicitly is the *point* — the exhaustiveness is the safety check.)

---

## Critical files

**New:**
- `src/lib/exercise-type.ts` — descriptor + `hasWeightInput` / `usesBodyweight` / `storesInputWeightUnit` / `isBodyweightVariant` predicates + `getWeightColumnLabel` / `getWeightInputLabel` / `getExerciseTypeLabel` display helpers.
- `src/lib/set-display.ts` — `formatSetLabel` + `getSetLabelClassName` moved verbatim.

**Edited:**
- `src/lib/workout-set-api.ts`, `src/lib/completed-workout-edit-api.ts`, `src/lib/exercise-history-api.ts`, `src/lib/exercise-weight-unit-preference-api.ts`
- `src/app/api/exercises/[id]/weight-unit-preference/route.ts`
- `src/app/workout-app.tsx`, `src/app/profile/workouts/[id]/edit/edit-workout-app.tsx`, `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx`, `src/app/exercise-library-app.tsx`

**Untouched:**
- `prisma/schema.prisma` — enum values stay exactly.
- Migrations — none.
- All API request/response shapes.
- All user-visible strings.

---

## Verification

1. **Static checks:**
   - `npm run lint` passes.
   - `npm run build` passes.
   - `git diff --check` passes.
2. **Behavior — manual smoke (golden paths):**
   - Open the Exercise Library. The exercise type pill on each exercise renders the same label as before ("Weight", "Bodyweight", "Weighted", "Assisted").
   - Create a new exercise of each type. The form renders. The created exercise persists with the right type.
   - Start a workout, add one exercise of each type, log a set. Verify column labels: `weight_reps` shows `LBS`/`KG`, `bodyweight_reps` shows `BW`, `weighted_bodyweight` shows `Add LBS`, `assisted_bodyweight` shows `Assist LBS`.
   - Verify the weight input `aria-label` per type (`"Weight"` / `"Added"` / `"Assist"`) using browser devtools inspect.
   - Save the workout. Open the saved workout detail. Same labels, same numbers.
   - Open the saved workout in edit mode. Same labels, same numbers. Save without changes; confirm the diff is empty.
   - For a `weight_reps` exercise, change the per-exercise weight unit preference (Settings → Units, or per-exercise unit selector). For a `bodyweight_reps` exercise, confirm the unit selector path returns the existing `unsupported_exercise_type` error.
3. **Sanity check on literal count:**
   - `grep -rn -E '"(weight_reps|bodyweight_reps|weighted_bodyweight|assisted_bodyweight)"' src/ | wc -l` should drop from 76 to roughly 25-35 (the descriptor table itself, the exhaustive `switch` in `getExerciseTypeLabel`, the form's `exerciseTypeOptions` list, and the few intentionally-left literal gates in the API libs).
4. **HANDOFF + commit:**
   - Append `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md` summarizing what moved, the literal-count delta, and any places literals were intentionally kept.
   - Single commit titled `Extract exercise type descriptor`. Push to `origin/main`.

---

## Sequencing

1. Create `src/lib/exercise-type.ts` with the descriptor table and predicates.
2. Move display helpers (`getWeightColumnLabel`, `getWeightInputLabel`, `getExerciseTypeLabel`) into the same file. Verify lint passes by importing from one client file (e.g. `exercise-library-app.tsx`) before moving on.
3. Create `src/lib/set-display.ts` with `formatSetLabel` + `getSetLabelClassName` from `edit-workout-app.tsx`.
4. Replace duplicates in `workout-app.tsx`, `edit-workout-app.tsx`, `saved-workout-detail-app.tsx`. Build and smoke after each file.
5. Sweep `src/lib/*.ts` and `src/app/api/.../weight-unit-preference/route.ts` for predicate replacements (only where the rewrite clarifies intent).
6. Run the full smoke list above.
7. Commit + push + HANDOFF.

---

## Why this is low-risk

- No DB writes, no migration, no API shape changes.
- Display helpers are moved verbatim — no rewriting the if-chains.
- Predicate replacements are 1:1 with the existing literal checks.
- Schema §15 hard rules: untouched. (Checkmark behavior, `row_index` ≠ `set_number`, snapshot-on-add, finish/edit backend validation, drag-handle-only — all unaffected.)
- If something does break, `git revert` is a single commit.
