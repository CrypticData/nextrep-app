# SWE Handoff: Global Weight Unit, Measures Unit, Exercise Unit Preference, and Workout Volume Display

This document defines how weight units should work across the app.

The key rule is that there are **multiple unit concepts**, and they should not overwrite each other.

```text
1. Global app weight unit
2. Measures/bodyweight record unit
3. Exercise preferred weight unit
4. Workout session calculation unit
5. Workout set input + normalized units
```

Each has a different responsibility.

---

# Current app context

The app currently has:

```text
Bottom nav:
Workout     Profile
```

Routes:

```text
/                    -> Workout screen
/profile             -> Profile menu
/profile/exercises   -> Exercise Library
/profile/measures    -> Measures / Bodyweight screen
/exercises            -> redirects to /profile/exercises
```

Relevant completed work:

```text
AppSettings.weightUnit exists.
BodyweightRecord exists.
ExerciseType exists.
Exercise type is immutable after exercise creation.
Measures screen exists.
Workout sessions exist.
Workout timer uses server_now.
Exercise Library lives under Profile > Exercises.
```

This doc focuses on how to correctly implement and wire weight units before Phase 4 workout logging gets deeper.

---

# Big picture rule

## Global unit

The global unit is the user’s default app-wide preference.

```ts
AppSettings.weightUnit // "lb" | "kg"
```

It controls:

```text
Measures display
Measures default input unit
Workout-level summary volume display
Workout history card volume display
Default unit for new weight_reps exercises with no saved preference
Future metrics/calendar summaries
```

It does **not** rewrite old data.

It does **not** override an exercise’s saved preferred unit.

---

## Measures unit

Measures has **no local kg/lb toggle**.

Measures always renders according to:

```ts
AppSettings.weightUnit
```

Bodyweight records store the unit used when the record was created, but the Measures screen displays all records converted to the current global unit.

---

## Exercise preferred unit

For `weight_reps` exercises only, the app should remember the last unit selected for that exercise during a live workout.

Example:

```text
Bench Press preferred unit = lb
Machine Row preferred unit = kg
Cable Stack preferred unit = kg
```

This preference controls:

```text
Default unit when adding that exercise in future workouts
Exercise-level set row display
Exercise-specific history display
```

It does **not** affect:

```text
Global settings
Measures display
Other exercises
Non-weight_reps exercise types
```

---

# 1. Global app weight unit

## Type

```ts
type WeightUnit = "lb" | "kg";
```

## Source of truth

```ts
AppSettings.weightUnit
```

There should be one global source of truth.

Do not create separate global unit state elsewhere.

---

## Settings API

Confirm or implement:

```http
GET /api/settings
```

Response:

```json
{
  "weight_unit": "lb"
}
```

Update:

```http
PATCH /api/settings
```

Payload:

```json
{
  "weight_unit": "kg"
}
```

Validation:

```text
Only "lb" and "kg" are valid.
Invalid values return 400.
Changing settings does not mutate bodyweight records.
Changing settings does not mutate workout sets.
Changing settings does not reset exercise unit preferences.
Changing settings does not change active workout calculation units.
```

---

# 2. Measures / bodyweight behavior

Measures follows the global unit.

There should be **no kg/lb toggle inside Measures**.

## Create behavior

When creating a bodyweight record, default the record unit to the current global unit.

Example:

```text
Global unit = lb
User enters 185
```

Store:

```text
weight = 185
weight_unit = lb
```

Later:

```text
User changes global unit to kg
User enters 83.2
```

Store:

```text
weight = 83.2
weight_unit = kg
```

The database may contain mixed stored units:

```text
185 lb
184 lb
83.2 kg
```

That is correct.

---

## Display behavior

Measures renders all records using the current global unit.

Stored records:

```text
185 lb
184 lb
83.2 kg
```

If current global unit is `kg`, Measures displays:

```text
83.91 kg
83.46 kg
83.20 kg
```

If current global unit is `lb`, Measures displays:

```text
185.00 lb
184.00 lb
183.42 lb
```

Rule:

```ts
displayWeight = convertWeight(
  record.weight,
  record.weightUnit,
  appSettings.weightUnit,
);
```

---

## Recommended bodyweight API response

Return both raw stored values and display values.

```ts
type BodyweightRecordResponse = {
  id: string;

  // Stored/original value
  weight: string;
  weight_unit: WeightUnit;

  // Converted for current app display
  display_weight: string;
  display_weight_unit: WeightUnit;

  measured_on: string;
};
```

Example: record stored as `185 lb`, current global unit is `kg`.

```json
{
  "id": "record-id",
  "weight": "185.00",
  "weight_unit": "lb",
  "display_weight": "83.91",
  "display_weight_unit": "kg",
  "measured_on": "2026-04-27"
}
```

The Measures UI should render:

```text
display_weight + display_weight_unit
```

not the raw stored value.

---

# 3. Shared weight conversion utility

Create one shared backend conversion helper and use it everywhere.

```ts
const LB_PER_KG = 2.2046226218;

function convertWeight(
  value: Decimal,
  fromUnit: WeightUnit,
  toUnit: WeightUnit,
): Decimal {
  if (fromUnit === toUnit) {
    return value;
  }

  if (fromUnit === "kg" && toUnit === "lb") {
    return value.mul(LB_PER_KG);
  }

  return value.div(LB_PER_KG);
}
```

Use this for:

```text
Bodyweight display mapping
Exercise history display mapping
Workout-level volume display mapping
Future workout set normalization
Future bodyweight snapshot conversion
Future volume calculations
```

Avoid duplicating conversion logic in React components.

---

# 4. Exercise preferred weight unit

This is separate from the global unit.

For `weight_reps` exercises only, persist the last unit the user selected for that exercise.

Example:

```text
Global unit = lb

Workout 1:
Machine Row changed to kg
User logs 30 kg
Machine Row preference becomes kg
History shows Machine Row in kg

Workout 2:
Machine Row changed to lb
User logs 66.14 lb
Machine Row preference becomes lb
History converts all Machine Row records to lb

User changes global unit to kg:
Machine Row history still shows lb
```

This means exercise history follows the **exercise preferred unit**, not the global unit.

---

## Recommended model

For the current single-user app:

```prisma
model ExerciseWeightUnitPreference {
  id         String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  exerciseId String    @unique @map("exercise_id") @db.Uuid
  weightUnit WeightUnit @map("weight_unit")
  updatedAt  DateTime   @updatedAt @map("updated_at")

  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)

  @@map("exercise_weight_unit_preferences")
}
```

Later, if multi-user support is added, change uniqueness from:

```text
exercise_id
```

to:

```text
user_id + exercise_id
```

Do not store this preference on `AppSettings`.

Do not treat this as part of the permanent Exercise Library definition unless the product intentionally wants that unit preference shared by all users.

---

# 5. Restrict exercise unit preference to `weight_reps`

Only this exercise type should support the lb/kg exercise preference:

```ts
"weight_reps"
```

Do not support it for:

```text
bodyweight_reps
weighted_bodyweight
assisted_bodyweight
duration
distance
```

Reason:

```text
The exercise unit preference exists for external loads where equipment may be labeled in a different unit.
```

Example:

```text
Global unit = lb
Machine stack says 30 kg
User switches that exercise to kg
User logs 30 kg directly
```

Backend validation:

```ts
if (
  requestedWeightUnitPreference &&
  exercise.exerciseType !== "weight_reps"
) {
  return Response.json(
    {
      error:
        "Exercise weight unit preference is only supported for weight_reps exercises.",
    },
    { status: 400 },
  );
}
```

---

# 6. Live workout behavior

When the user adds a `weight_reps` exercise to a live workout, resolve the input unit in this order:

```ts
const inputUnit =
  exerciseWeightUnitPreference?.weightUnit ??
  appSettings.weightUnit;
```

So:

```text
If the exercise has a saved preference, use that.
Otherwise fall back to the global unit.
```

Example:

```text
Global unit = lb
Machine Row preference = kg

User adds Machine Row to workout
Input unit starts as kg
```

If no preference exists:

```text
Global unit = lb
New exercise has no preference

User adds exercise
Input unit starts as lb
```

---

# 7. Current workout exercise input unit

When the exercise is added to the workout, save the resolved input unit on the workout exercise instance.

Recommended future field:

```prisma
model WorkoutExercise {
  id               String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workoutSessionId String      @map("workout_session_id") @db.Uuid
  exerciseId       String      @map("exercise_id") @db.Uuid

  inputWeightUnit  WeightUnit? @map("input_weight_unit")

  @@map("workout_exercises")
}
```

`inputWeightUnit` is the active input unit for this exercise instance in this workout.

It is seeded from:

```text
ExerciseWeightUnitPreference.weightUnit
```

or, if no preference exists:

```text
AppSettings.weightUnit
```

---

# 8. Changing exercise unit during a live workout

When the user changes the unit for a `weight_reps` exercise during a live workout:

```text
Machine Row: lb -> kg
```

Update both:

```text
WorkoutExercise.inputWeightUnit = kg
ExerciseWeightUnitPreference.weightUnit = kg
```

Why both?

```text
WorkoutExercise.inputWeightUnit controls the current workout screen.
ExerciseWeightUnitPreference.weightUnit remembers this choice for future workouts and exercise history display.
```

This matches the reference app behavior.

---

## This change does not affect

Changing the exercise unit does **not**:

```text
Change AppSettings.weightUnit
Change Measures display
Change other exercises
Change non-weight_reps exercises
Rewrite historical set data
```

It only changes:

```text
The active unit for that exercise in this workout
The remembered preferred unit for that exercise going forward
The display unit used by that exercise’s history
```

---

# 9. Workout session calculation unit snapshot

When a workout starts, snapshot the current global unit onto the workout session.

Recommended future field:

```prisma
model WorkoutSession {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  status            WorkoutStatus
  startedAt         DateTime    @default(now()) @map("started_at")
  completedAt       DateTime?   @map("completed_at")

  defaultWeightUnit WeightUnit  @map("default_weight_unit")

  @@map("workout_sessions")
}
```

When starting a workout:

```ts
workoutSession.defaultWeightUnit = appSettings.weightUnit;
```

Purpose:

```text
This is the workout’s calculation unit.
```

Why this matters:

```text
If a workout starts when global unit is lb, that workout calculates in lb.
If the user later changes global unit to kg, this workout’s calculations remain stable.
```

This field is for calculation stability. It is not necessarily the same as the input/display unit for every exercise.

---

# 10. Workout set storage

For `weight_reps` sets, store both:

```text
what the user typed
what the system uses for math
```

Recommended future fields:

```prisma
model WorkoutSet {
  id                    String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workoutExerciseId     String      @map("workout_exercise_id") @db.Uuid

  reps                  Int?

  weightInputValue      Decimal?    @map("weight_input_value") @db.Decimal(10, 2)
  weightInputUnit       WeightUnit? @map("weight_input_unit")

  weightNormalizedValue Decimal?    @map("weight_normalized_value") @db.Decimal(10, 2)
  weightNormalizedUnit  WeightUnit? @map("weight_normalized_unit")

  volumeValue           Decimal?    @map("volume_value") @db.Decimal(12, 2)
  volumeUnit            WeightUnit? @map("volume_unit")

  @@map("workout_sets")
}
```

Example:

```text
AppSettings.weightUnit = lb
WorkoutSession.defaultWeightUnit = lb
Machine Row inputWeightUnit = kg
User logs 30 kg x 10
```

Store:

```text
weight_input_value = 30
weight_input_unit = kg

weight_normalized_value = 66.14
weight_normalized_unit = lb

volume_value = 661.40
volume_unit = lb
```

Calculations use:

```ts
volume = weightNormalizedValue * reps;
```

not the current UI display value.

---

# 11. Exercise history display

For a specific exercise’s history, render all historical sets in that exercise’s **current preferred unit**.

Use:

```ts
const historyDisplayUnit =
  exerciseWeightUnitPreference?.weightUnit ??
  appSettings.weightUnit;

historyDisplayWeight = convertWeight(
  set.weightNormalizedValue,
  set.weightNormalizedUnit,
  historyDisplayUnit,
);
```

Example:

```text
Machine Row preference = kg

History:
30 kg x 10
30 kg x 8
32.5 kg x 6
```

If the user later changes Machine Row to `lb` in a live workout:

```text
Machine Row preference = lb
```

Then Machine Row history displays:

```text
66.14 lb x 10
66.14 lb x 8
71.65 lb x 6
```

No secondary converted display is needed.

Important:

```text
Exercise history does not follow global unit if the exercise has a saved preferred unit.
Exercise history does not necessarily show the original input unit.
Exercise history follows the exercise’s current preferred unit.
```

---

# 12. Workout-level volume display

Workout-level totals display in the **global unit**, not the exercise preferred unit.

This applies to:

```text
Workout Detail top Volume
Workout history card Volume
Profile workout summary Volume
Future metrics/calendar workout totals
```

Example from reference behavior:

```text
Global unit = kg
Bench Press preferred unit = lb

Workout Detail:
Volume: 300 kg

Exercise row:
66.14 lb x 10
```

This is intentional.

The same screen can show:

```text
Top summary = global unit
Exercise set row = exercise preferred unit
```

---

## Backend display rule for workout volume

Store volume in the workout session’s calculation unit, then convert to global unit for top-level display.

Example stored set:

```text
weight_input_value = 66.14
weight_input_unit = lb

weight_normalized_value = 66.14
weight_normalized_unit = lb

volume_value = 661.40
volume_unit = lb
```

If global unit is currently `kg`, the workout detail response should expose:

```json
{
  "volume_value": "661.40",
  "volume_unit": "lb",
  "display_volume": "300.00",
  "display_volume_unit": "kg"
}
```

The UI renders:

```text
300 kg
```

For exercise rows, use the exercise preferred unit.

For workout-level totals, use global unit.

---

# 13. Measures vs Exercise History vs Workout Summary

These three displays intentionally use different unit rules.

## Measures

Measures follows the global unit:

```ts
displayUnit = appSettings.weightUnit;
```

Example:

```text
Global unit = kg
All bodyweight records display in kg.
```

---

## Exercise history

Exercise history follows the exercise preferred unit:

```ts
displayUnit =
  exerciseWeightUnitPreference?.weightUnit ??
  appSettings.weightUnit;
```

Example:

```text
Global unit = kg
Machine Row preferred unit = lb
Machine Row history displays in lb.
```

---

## Workout-level summary volume

Workout summary volume follows the global unit:

```ts
displayUnit = appSettings.weightUnit;
```

Example:

```text
Global unit = kg
Workout volume displays in kg
Exercise set rows may still display in lb
```

---

# 14. What happens when global unit changes?

Changing global unit should:

```text
Update AppSettings.weightUnit.
Immediately affect Measures display.
Immediately affect workout-level summary volume display.
Set default for new weight_reps exercises with no saved preference.
Set defaultWeightUnit for future workout sessions.
```

Changing global unit should **not**:

```text
Rewrite bodyweight records.
Rewrite workout sets.
Reset exercise unit preferences.
Force exercise history to change if the exercise has a preferred unit.
Change active workout calculation unit.
```

Example:

```text
Global unit = lb
Machine Row preference = lb
Measures display = lb
Workout summary volume = lb

User changes global unit to kg

Now:
Measures display = kg
Workout summary volume = kg
Machine Row history still displays = lb
New exercises with no preference default = kg
Future workout sessions defaultWeightUnit = kg
Existing workout sessions keep their own defaultWeightUnit
```

---

# 15. What happens when exercise unit changes?

Changing a `weight_reps` exercise unit should:

```text
Update WorkoutExercise.inputWeightUnit for the active workout exercise.
Update ExerciseWeightUnitPreference.weightUnit for that exercise.
Affect future workouts for that same exercise.
Affect exercise history display for that same exercise.
```

Changing a `weight_reps` exercise unit should **not**:

```text
Update AppSettings.weightUnit.
Affect Measures.
Affect workout-level global volume display except through normal calculations.
Affect other exercises.
Affect non-weight_reps exercises.
Rewrite old set rows.
```

Example:

```text
Global unit = lb
Machine Row preference = kg

User changes Machine Row to lb in live workout

Now:
Machine Row active input = lb
Machine Row saved preference = lb
Machine Row history displays in lb
Global unit remains lb
Measures remains lb
```

If global unit later changes to kg:

```text
Machine Row history remains lb
Workout-level summaries display kg
Measures display kg
```

---

# 16. Conflict checks

## Conflict: Measures and exercise history behave differently

This is expected.

```text
Measures = global display unit.
Exercise history = exercise preferred display unit.
```

Do not force them into the same rendering model.

---

## Conflict: Workout summary and exercise rows show different units

This is expected.

```text
Workout summary volume = global unit.
Exercise set rows = exercise preferred unit.
```

Example:

```text
Top Volume: 300 kg
Set row: 66.14 lb x 10
```

This is not a bug.

---

## Conflict: App-wide unit vs exercise preference

The global unit is still app-wide, but `weight_reps` exercise input/history has an explicit exception.

Use this hierarchy:

```text
Measures:
AppSettings.weightUnit

Workout-level summaries:
AppSettings.weightUnit

Exercise input/history:
ExerciseWeightUnitPreference.weightUnit if it exists
else AppSettings.weightUnit
```

---

## Conflict: User changes global unit mid-active workout

Workout calculations should use:

```text
WorkoutSession.defaultWeightUnit
```

not live `AppSettings.weightUnit`.

Active workout math remains stable.

---

## Conflict: User changes exercise unit mid-workout

Existing sets should not be rewritten.

New sets use the new `WorkoutExercise.inputWeightUnit`.

History display can convert all sets to the exercise preferred unit.

---

## Conflict: Mixed historical set input units

This is fine.

Sets may store:

```text
30 kg
66.14 lb
32.5 kg
```

Calculations use normalized values, and history display converts normalized values into the current exercise preferred unit.

---

# 17. Recommended implementation order

## Step 1 — Shared conversion helper

Create shared backend utility:

```text
convertWeight(value, fromUnit, toUnit)
```

Use Decimal-safe math.

---

## Step 2 — Harden global settings

Confirm:

```text
GET /api/settings returns weight_unit.
PATCH /api/settings accepts only lb/kg.
AppSettings.weightUnit remains the single global source of truth.
```

---

## Step 3 — Update Measures API mapping

Bodyweight APIs should:

```text
Store weight + weight_unit as entered.
Default weight_unit to AppSettings.weightUnit when omitted.
Return display_weight + display_weight_unit converted to current AppSettings.weightUnit.
Not mutate old records when global unit changes.
```

---

## Step 4 — Add exercise weight unit preference model

Add:

```text
ExerciseWeightUnitPreference
```

For now:

```text
unique exercise_id
```

Later with users:

```text
unique user_id + exercise_id
```

Only allow preferences for `weight_reps`.

---

## Step 5 — Add workout session default unit snapshot

Add:

```text
WorkoutSession.defaultWeightUnit
```

Set it from `AppSettings.weightUnit` when the workout starts.

---

## Step 6 — Add workout exercise input unit

Add:

```text
WorkoutExercise.inputWeightUnit
```

When adding a `weight_reps` exercise to a workout:

```text
inputWeightUnit = exercise preference if exists, else AppSettings.weightUnit
```

When user changes the exercise unit:

```text
update WorkoutExercise.inputWeightUnit
upsert ExerciseWeightUnitPreference
```

---

## Step 7 — Add workout set input/normalized values

For `weight_reps` sets:

```text
weightInputValue
weightInputUnit
weightNormalizedValue
weightNormalizedUnit
volumeValue
volumeUnit
```

Normalize to:

```text
WorkoutSession.defaultWeightUnit
```

---

## Step 8 — Exercise history display

For each exercise:

```text
display unit = exercise preference if exists, else global unit
```

Display history rows converted to that unit.

No secondary display.

---

## Step 9 — Workout summary volume display

For workout-level totals:

```text
display unit = AppSettings.weightUnit
```

Return display fields from APIs where possible:

```ts
type WorkoutSummaryResponse = {
  volume_value: string;
  volume_unit: WeightUnit;

  display_volume: string;
  display_volume_unit: WeightUnit;
};
```

---

# Final summary for SWE

```text
AppSettings.weightUnit is the global default.

Measures has no local unit toggle. It stores bodyweight records in the unit used at creation time, but renders every record converted to the current global unit.

Workout-level volume summaries also render in the current global unit.

For weight_reps exercises only, persist an ExerciseWeightUnitPreference. This remembers the last lb/kg selected for that exercise in a live workout.

Exercise input and exercise history display use the exercise preferred unit if one exists; otherwise they fall back to AppSettings.weightUnit.

Changing global unit affects Measures, workout-level summaries, and defaults for new/no-preference exercises. It does not reset exercise preferences.

When a workout starts, copy AppSettings.weightUnit to WorkoutSession.defaultWeightUnit. This is the calculation unit for that workout.

When a weight_reps exercise is added to a workout, set WorkoutExercise.inputWeightUnit from the exercise preference if it exists, otherwise from AppSettings.weightUnit.

When the user changes a weight_reps exercise unit during a live workout, update both WorkoutExercise.inputWeightUnit and ExerciseWeightUnitPreference.weightUnit.

Workout sets store both the user-entered value/unit and the normalized value/unit. Normalized values are converted to WorkoutSession.defaultWeightUnit and are used for calculations.

Exercise history displays all historical sets converted to the exercise’s current preferred unit.

Workout-level summary volume displays in AppSettings.weightUnit.

Do not show the exercise unit toggle for non-weight_reps exercise types.
```
