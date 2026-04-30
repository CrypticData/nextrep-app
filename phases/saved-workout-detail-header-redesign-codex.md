# Saved Workout Detail — Header Redesign — Plan for Codex

## Context

The current saved workout detail top section is a compact 3-stat bordered card (Duration / Volume / Started). On a narrow phone with a large Volume value (e.g. "22,246.7 lbs") and a date in the same row, the values truncate. Reference design (see `screenshots/REFERENCE.jpeg`) replaces this with a flat layout that breathes: workout name as a large inline heading, abbreviated date row underneath, then a borderless 4-stat row (Time / Volume / Sets / Records) with each stat getting its own breathing room.

User-confirmed scope decisions:
- Drop the profile thumb + username row from the reference. We're keeping it minimal — just the workout name + date + stats.
- Title bar reads **"Workout Details"** (static). No more dual-rendering of the workout name in the chrome.
- **Sets** counts all rows including warmups and drop-set children (literal row count from `workout.exercises[].sets`).
- **Records** is a visual placeholder showing **"-"** for now (future feature; no data wired up).
- Description placement stays the same (below stat row, before Exercises section).
- Date format: **"Wed, Apr 29, 2026 · 1:34am"** (abbreviated weekday + abbreviated month + year + middot + lowercase am/pm with no space).

Out of scope: actually computing personal records, identity row, any redesign of the exercise sections below.

---

## Target layout

Inside `WorkoutDetail` (`saved-workout-detail-app.tsx:259-296`), top to bottom:

```
Full Body B                                 ← large bold inline heading (text-3xl-ish)
Wed, Apr 29, 2026 · 1:34am                  ← zinc-500, smaller (text-sm)

Time          Volume          Sets    Records
2h 0min       22,246.7 lbs    29      -

[optional description, if present]

EXERCISES
…
```

- No card border, no `bg-[#1a1a1a]` container, no vertical dividers.
- Generous vertical spacing between blocks.
- Stat row uses flexible columns so Volume gets enough room to never truncate. Reuse the technique from the live stats strip (`workout-app.tsx:1765-1769`): `grid-cols-[auto_minmax(0,1fr)_auto_auto]` with `gap-x-4` (or similar) — Volume is the only flex column.
- Labels are mixed-case, smaller, zinc-grey. Values are bold white, larger.

---

## Implementation pieces

### 1. AppShell title — make it static

**File:** `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx:171`

Change:
```tsx
title={workout?.name ?? "Workout Details"}
```
to:
```tsx
title="Workout Details"
```

### 2. Inline workout name + date row

In `WorkoutDetail` (`saved-workout-detail-app.tsx:259-296`), prepend a header block before the stat row:

- `<h1>` rendering `workout.name` — large bold white (e.g. `text-3xl font-bold` or match the reference scale).
- `<p>` underneath rendering `formatDateTime(workout.started_at)` in the new format — zinc-500, `text-sm`.

Stack with `space-y-1` or similar tight spacing.

### 3. Replace stat strip with flat 4-column row

Replace the existing `<dl>` (`saved-workout-detail-app.tsx:262-276`) with a borderless grid:

- Container: `grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-4` (no border, no background, no dividers).
- 4 cells, each label + value stacked:
  - **Time** — `formatDuration(workout.duration_seconds)` (existing helper).
  - **Volume** — `formatVolume(workout.volume.value, workout.volume.unit)` (existing helper). This is the flex column.
  - **Sets** — total set count: `workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)`.
  - **Records** — literal string `"-"`.
- Drop the `WorkoutDetailStat` component (lines 298-321) as-is and write a slimmer one inline, or keep the component name and update its styles to drop the divider/center alignment. Recommendation: rename to `WorkoutHeaderStat` and update to:
  - Label: `text-[12px] font-medium text-zinc-500` (mixed case — pass through as-is).
  - Value: `text-lg font-bold text-white` (or match reference scale).
  - No `border-r`, no `text-center` — left-align contents within each cell.

### 4. Update `formatDateTime`

**File:** `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx:514-527`

Replace with:
```ts
function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const weekday = date.toLocaleString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleString("en-US", { month: "short", day: "numeric" });
  const year = date.getFullYear();
  const time = date
    .toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();

  return `${weekday}, ${monthDay}, ${year} · ${time}`;
}
```

Output example: `"Wed, Apr 29, 2026 · 1:34am"`.

### 5. Description stays where it is

`saved-workout-detail-app.tsx:278-282` — keep as-is, between the new stat row and the Exercises section.

---

## Critical files

- `src/app/profile/workouts/[id]/saved-workout-detail-app.tsx` — only file modified.

## Reusable patterns

- `formatDuration`, `formatVolume`, `formatDecimal` (`saved-workout-detail-app.tsx:529-561`) — reuse unchanged.
- `minmax(0,1fr)` Volume flex column technique — same shape as `src/app/workout-app.tsx:1765-1769`.

## Verification

1. `npm run lint` passes.
2. `npm run build` passes.
3. `git diff --check` passes.
4. Local browser smoke:
   - Open a saved workout with large numbers (volume 22,000+ lbs). Confirm:
     - Title bar reads "Workout Details" (not the workout name).
     - Workout name appears inline as a large heading.
     - Date row underneath reads "Wed, Apr 29, 2026 · 1:34am" format.
     - 4-stat row renders Time / Volume / Sets / Records with values 2h Xmin / 22,246.7 lbs / 29 / -.
     - Volume value is fully visible on a 375px-wide phone viewport (Chrome devtools iPhone SE simulation).
     - No border or vertical dividers around the stat row.
     - Description (if present) appears below the stat row, before the Exercises section.
   - Open a saved workout with 0 working sets but warmup rows logged — confirm Sets count includes them.
   - Open a saved workout with no description — layout still looks correct (stats followed directly by Exercises).
5. Append `## YYYY-MM-DD (Codex)` HANDOFF entry per CLAUDE.md handoff rules.
6. Commit + push as a single change.

## Sequencing

1. Title bar change (1-line edit).
2. `formatDateTime` rewrite.
3. Replace `<dl>` stat block with flat grid; add inline name + date heading above.
4. Drop or repurpose `WorkoutDetailStat` (whichever is cleaner).
5. Manual smoke + commit + push.
