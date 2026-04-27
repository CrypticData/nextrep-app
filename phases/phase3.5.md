# Final SWE Write-up: Profile Menu Rework + Exercise Menu Scroll Fix

This update is based on the current `AppShell` implementation.

The main architectural change is:

```text
Before:
Bottom nav = Workout + Exercises

After:
Bottom nav = Workout + Profile

Profile menu becomes the main dashboard surface.
The existing ExerciseLibraryApp moves behind Profile > Exercises.
```

---

# 1. Current AppShell impact

Current `AppShell` already provides:

```tsx
<header />
<main className="flex-1 overflow-y-auto ...">
  {children}
</main>
<BottomNav />
```

This means:

* The `header` does not scroll.
* The `main` area is the scroll container.
* The bottom nav stays outside the scrollable content.

That is good for this project. The Profile menu can reuse `AppShell`.

The main changes needed in `AppShell` are:

1. Replace the bottom nav item `Exercises` with `Profile`.
2. Keep `Workout` pointing to the existing workout menu.
3. Move the exercise menu route behind the Profile menu.

---

# 2. Update bottom nav

Current nav:

```ts
const navItems = [
  { href: "/", label: "Workout", icon: PlayIcon },
  { href: "/exercises", label: "Exercises", icon: DumbbellIcon },
];
```

Update to:

```ts
const navItems = [
  { href: "/", label: "Workout", icon: PlayIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];
```

Recommended route model:

```text
/                  -> existing Workout menu
/profile           -> new Profile menu
/profile/exercises -> existing ExerciseLibraryApp
/profile/measures  -> Measures screen
```

Using `/profile/exercises` is preferred because the current active-state logic already works:

```ts
pathname === item.href || pathname.startsWith(`${item.href}/`)
```

So when the user is on `/profile/exercises`, the Profile tab stays active.

If the app keeps `/exercises`, then `BottomNav` needs custom active matching so Profile is active while on `/exercises`.

---

# 3. New Profile menu

Create a new `ProfileMenuApp`.

It should reuse `AppShell`.

The Profile screen should contain:

```text
Profile header
Profile summary
Dashboard tiles
Workout history section
```

It should not contain the exercise list directly.

Suggested structure:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";

export function ProfileMenuApp() {
  const router = useRouter();

  const profile: UserProfile = {
    id: "current-user",
    username: "crypticdata",
    avatarUrl: null,
    workoutCount: 12,
  };

  const workoutHistoryState: WorkoutHistoryState = "unavailable";
  const workouts: WorkoutHistoryCardViewModel[] = [];

  return (
    <AppShell
      title={profile.username}
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/profile/edit")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Edit profile"
          >
            <EditIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-24">
        <ProfileSummary profile={profile} />

        <DashboardSection
          onOpenExercises={() => router.push("/profile/exercises")}
          onOpenMeasures={() => router.push("/profile/measures")}
          onOpenMetrics={() => alert("Metrics coming soon")}
          onOpenCalendar={() => alert("Calendar coming soon")}
        />

        <WorkoutHistorySection
          state={workoutHistoryState}
          workouts={workouts}
          onOpenWorkout={(workoutId) => router.push(`/workouts/${workoutId}`)}
        />
      </div>
    </AppShell>
  );
}
```

No share action is needed in the top header.

Header should effectively be:

```text
crypticdata                         edit settings
```

---

# 4. Profile summary

At the top of the Profile menu:

```text
[Avatar]  crypticdata
          Workouts
          12
```

Type:

```ts
type UserProfile = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  workoutCount: number;
};
```

Component:

```tsx
function ProfileSummary({ profile }: { profile: UserProfile }) {
  return (
    <section className="flex items-center gap-4">
      <ProfileAvatar
        username={profile.username}
        avatarUrl={profile.avatarUrl}
      />

      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold text-white">
          {profile.username}
        </h2>

        <div className="mt-2">
          <p className="text-sm font-medium text-zinc-500">Workouts</p>
          <p className="text-lg font-semibold text-white">
            {profile.workoutCount}
          </p>
        </div>
      </div>
    </section>
  );
}
```

---

# 5. Dashboard section

Dashboard tiles:

```text
Dashboard

Exercises     Measures
Metrics       Calendar
```

Behavior:

```text
Exercises -> existing ExerciseLibraryApp
Measures  -> Measures screen
Metrics   -> placeholder
Calendar  -> placeholder
```

Important: do not rebuild the exercise menu inside Profile. The Exercises tile should route to the existing `ExerciseLibraryApp`.

```tsx
function DashboardSection({
  onOpenExercises,
  onOpenMeasures,
  onOpenMetrics,
  onOpenCalendar,
}: {
  onOpenExercises: () => void;
  onOpenMeasures: () => void;
  onOpenMetrics?: () => void;
  onOpenCalendar?: () => void;
}) {
  const tiles = [
    {
      id: "exercises",
      label: "Exercises",
      icon: <DumbbellIcon className="h-5 w-5" />,
      onClick: onOpenExercises,
    },
    {
      id: "measures",
      label: "Measures",
      icon: <MeasuresIcon className="h-5 w-5" />,
      onClick: onOpenMeasures,
    },
    {
      id: "metrics",
      label: "Metrics",
      icon: <MetricsIcon className="h-5 w-5" />,
      onClick: onOpenMetrics,
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: <CalendarIcon className="h-5 w-5" />,
      onClick: onOpenCalendar,
    },
  ] satisfies DashboardTileConfig[];

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">
        Dashboard
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <DashboardTile
            key={tile.id}
            icon={tile.icon}
            label={tile.label}
            onClick={tile.onClick}
          />
        ))}
      </div>
    </section>
  );
}
```

---

# 6. Existing ExerciseLibraryApp migration

Keep `ExerciseLibraryApp` mostly intact.

It should continue to own:

* Fetching exercises
* Fetching equipment types
* Fetching muscle groups
* Search
* Filters
* Exercise detail
* Create/edit modal
* Delete flow

Mount it under the Profile route:

```tsx
export default function ProfileExercisesPage() {
  return <ExerciseLibraryApp />;
}
```

Recommended route:

```text
/profile/exercises
```

That keeps the Profile bottom tab active while viewing exercises.

---

# 7. Exercise menu scroll fix

Current issue: in `ExerciseList`, everything scrolls together.

Desired behavior: the controls stay sticky, while rows scroll under them.

Sticky section:

```text
Search input
Equipment filter
Muscle filter
"X shown" text
```

Scrollable section:

```text
Loading skeletons
Empty state
No matches state
Exercise rows
```

Because `AppShell` already makes `<main>` the scroll container, do **not** create a second nested scroll area for exercise rows unless absolutely necessary.

Use one scroll container: the existing `main`.

So the refactor should be:

```tsx
<ExerciseList>
  <ExerciseListControls />   // sticky inside AppShell main
  <ExerciseResults />        // normal content below
</ExerciseList>
```

Updated `ExerciseList`:

```tsx
function ExerciseList({
  equipmentFilterId,
  equipmentTypes,
  exercises,
  isLoading,
  loadError,
  muscleFilterId,
  muscleGroups,
  onCreate,
  onRetry,
  onSearchChange,
  onSelectExercise,
  onSetEquipmentFilter,
  onSetMuscleFilter,
  search,
  totalExerciseCount,
}: {
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  exercises: Exercise[];
  isLoading: boolean;
  loadError: string | null;
  muscleFilterId: string;
  muscleGroups: Reference[];
  onCreate: () => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSelectExercise: (exercise: Exercise) => void;
  onSetEquipmentFilter: (value: string) => void;
  onSetMuscleFilter: (value: string) => void;
  search: string;
  totalExerciseCount: number;
}) {
  if (loadError) {
    return (
      <div className="flex min-h-[52dvh] flex-col items-center justify-center text-center">
        {/* keep existing load error UI */}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ExerciseListControls
        equipmentFilterId={equipmentFilterId}
        equipmentTypes={equipmentTypes}
        exercisesShownCount={exercises.length}
        muscleFilterId={muscleFilterId}
        muscleGroups={muscleGroups}
        onSearchChange={onSearchChange}
        onSetEquipmentFilter={onSetEquipmentFilter}
        onSetMuscleFilter={onSetMuscleFilter}
        search={search}
        totalExerciseCount={totalExerciseCount}
      />

      <ExerciseResults
        exercises={exercises}
        isLoading={isLoading}
        onCreate={onCreate}
        onSelectExercise={onSelectExercise}
        totalExerciseCount={totalExerciseCount}
      />
    </div>
  );
}
```

Sticky controls:

```tsx
function ExerciseListControls({
  equipmentFilterId,
  equipmentTypes,
  exercisesShownCount,
  muscleFilterId,
  muscleGroups,
  onSearchChange,
  onSetEquipmentFilter,
  onSetMuscleFilter,
  search,
  totalExerciseCount,
}: {
  equipmentFilterId: string;
  equipmentTypes: Reference[];
  exercisesShownCount: number;
  muscleFilterId: string;
  muscleGroups: Reference[];
  onSearchChange: (value: string) => void;
  onSetEquipmentFilter: (value: string) => void;
  onSetMuscleFilter: (value: string) => void;
  search: string;
  totalExerciseCount: number;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-5 space-y-4 bg-[#101010]/95 px-5 pb-4 pt-4 backdrop-blur">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
        <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" />

        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search exercise"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-600"
        />

        {search.length > 0 ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
            aria-label="Clear search"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FilterSelect
          label="Equipment"
          onChange={onSetEquipmentFilter}
          options={equipmentTypes}
          value={equipmentFilterId}
        />

        <FilterSelect
          label="Muscle"
          onChange={onSetMuscleFilter}
          options={muscleGroups}
          value={muscleFilterId}
        />
      </div>

      <p className="pt-1 text-sm font-medium text-zinc-500">
        {totalExerciseCount === 0
          ? "All Exercises"
          : `${exercisesShownCount} shown`}
      </p>
    </div>
  );
}
```

Exercise results should not have its own `overflow-y-auto` with the current `AppShell`:

```tsx
function ExerciseResults({
  exercises,
  isLoading,
  onCreate,
  onSelectExercise,
  totalExerciseCount,
}: {
  exercises: Exercise[];
  isLoading: boolean;
  onCreate: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  totalExerciseCount: number;
}) {
  return (
    <div className="space-y-3 pb-24">
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-[74px] animate-pulse rounded-2xl bg-white/[0.04]"
            />
          ))}
        </div>
      ) : null}

      {!isLoading && totalExerciseCount === 0 ? (
        <EmptyState
          cta="Create"
          message="Your exercise library is empty."
          onCreate={onCreate}
          title="No exercises yet"
        />
      ) : null}

      {!isLoading && totalExerciseCount > 0 && exercises.length === 0 ? (
        <EmptyState
          message="No exercises match the current search and filters."
          title="No matches"
        />
      ) : null}

      {!isLoading && exercises.length > 0 ? (
        <div className="space-y-2">
          {exercises.map((exercise) => (
            <ExerciseRow
              exercise={exercise}
              key={exercise.id}
              onClick={() => onSelectExercise(exercise)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

The key detail: with current `AppShell`, sticky should be relative to the scrollable `<main>`, so `sticky top-0` is correct.

---

# 8. Workout history section

The backend/domain workout definition exists, but the workout history card component does not.

So the Profile work should include a lightweight card.

For first pass, it is okay to render:

```text
Workouts

Workout history will appear here.
```

Then later replace with cards.

State type:

```ts
type WorkoutHistoryState =
  | "loading"
  | "ready"
  | "empty"
  | "unavailable";
```

Card view model:

```ts
type WorkoutHistoryCardViewModel = {
  id: string;
  user: {
    username: string;
    avatarUrl?: string | null;
  };
  title: string;
  completedAtLabel: string;
  durationLabel: string;
  volumeLabel: string;
  exercises: WorkoutExercisePreview[];
};

type WorkoutExercisePreview = {
  id: string;
  name: string;
  setCount: number;
  thumbnailLabel: string;
  thumbnailUrl?: string | null;
};
```

Build the UI against the view model, then add a mapper from the backend workout shape later.

---

# 9. Best implementation order

## Phase 1 — Update AppShell navigation

1. Change `navItems` from `Workout + Exercises` to `Workout + Profile`.
2. Point Workout to `/`.
3. Point Profile to `/profile`.
4. Add a `UserIcon` or equivalent icon for Profile.
5. Confirm Profile tab is active for:

   * `/profile`
   * `/profile/exercises`
   * `/profile/measures`

---

## Phase 2 — Preserve existing screens

1. Keep the existing Workout menu at `/`.
2. Keep `ExerciseLibraryApp` unchanged functionally.
3. Move/mount `ExerciseLibraryApp` under `/profile/exercises`.
4. Do not copy exercise list code into Profile.

---

## Phase 3 — Create Profile menu shell

1. Create `ProfileMenuApp`.
2. Reuse `AppShell`.
3. Set title to username.
4. Add header actions:

   * Edit
   * Settings
5. Do not add share.

---

## Phase 4 — Add Profile content

1. Add `ProfileSummary`.
2. Show avatar, username, workout count.
3. Add `DashboardSection`.
4. Add four tiles:

   * Exercises
   * Measures
   * Metrics
   * Calendar

---

## Phase 5 — Wire dashboard navigation

1. Exercises tile routes to `/profile/exercises`.
2. Measures tile routes to `/profile/measures`.
3. Metrics shows placeholder.
4. Calendar shows placeholder.

---

## Phase 6 — Fix Exercise menu scrolling

1. Refactor `ExerciseList` into:

   * `ExerciseListControls`
   * `ExerciseResults`
2. Move search, filters, and shown-count into `ExerciseListControls`.
3. Make `ExerciseListControls` sticky with `sticky top-0`.
4. Keep results in normal document flow because `AppShell main` already scrolls.
5. Test with many exercises.

---

## Phase 7 — Add workout history placeholder

1. Add `WorkoutHistorySection`.
2. Support `loading`, `ready`, `empty`, and `unavailable`.
3. Default to `unavailable` until real integration is ready.
4. Render placeholder text.

---

## Phase 8 — Build workout history card

1. Create `WorkoutHistoryCardViewModel`.
2. Build `WorkoutHistoryCard`.
3. Build `WorkoutMetric`.
4. Build `WorkoutExercisePreviewRow`.
5. Reuse `ExerciseThumb` where possible.
6. Validate with mock data.

---

## Phase 9 — Wire workout data later

1. Add mapper from backend workout type to `WorkoutHistoryCardViewModel`.
2. Format:

   * Date
   * Duration
   * Volume
3. Replace placeholder/mock data with real data.
4. Wire card click to workout detail if that route exists.

---

# Final intended app structure

```text
/
  Existing Workout menu

/profile
  New Profile menu
    - profile summary
    - Exercises tile
    - Measures tile
    - Metrics placeholder
    - Calendar placeholder
    - Workout history section

/profile/exercises
  Existing ExerciseLibraryApp
  with sticky search/filter/count controls

/profile/measures
  Measures screen

Bottom nav:
Workout     Profile
```
