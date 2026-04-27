# Pre Phase 4 Implementation Plan: Profile, Exercise Types, and Bodyweight Measurements

## Purpose

Phase 3 is complete. Pre Phase 4 adds the smallest set of features needed to support the new exercise types and correct volume calculations for bodyweight-based exercises.

This phase introduces:

```txt
Profile tab
Exercises button inside Profile
Measure button inside Profile
Exercise Type on exercises
Measurements page
Bodyweight records
Bodyweight snapshotting on workout sets
Exercise-type-aware live workout set rows
Exercise-type-aware volume calculations
```

This phase should be implemented before going deeper into live workout polish, because exercise type and bodyweight affect workout set inputs and volume calculations.

---

# 1. Final Pre Phase 4 Scope

## Included

```txt
Rename Exercises bottom nav tab to Profile
Move current Exercise Library page behind Profile -> Exercises
Add Profile -> Measure button
Create Measurements page
Support bodyweight records only
Allow bodyweight records to be added, edited, and deleted
Add exercise_type to exercises
Add Exercise Type selector to create/edit exercise
Update live workout set rows based on exercise type
Use latest bodyweight record for bodyweight-based calculations
Snapshot bodyweight used onto workout_sets
Update volume calculation logic
```

## Not Included

Do not implement these in Pre Phase 4:

```txt
body fat
lean body mass
neck/shoulder/chest/bicep measurements
progress pictures
bodyweight charts
analytics dashboards
Previous column
routines
rest timer
exercise variants
social/profile features
```

The Profile tab is a personal dashboard/navigation hub, not a social profile.

---

# 2. Best Implementation Order

Build in this order to avoid rework.

---

## Step 1: Rename Bottom Nav Tab to Profile

Current state:

```txt
Exercises tab exists in bottom nav
```

Change to:

```txt
Profile tab
```

This is a UI/navigation change only.

Do not delete the existing Exercise Library page.

The Exercise Library page will be moved behind a Profile button in Step 2.

Acceptance criteria:

```txt
Bottom nav shows Profile instead of Exercises
Profile route/screen exists
Existing exercise library is still reachable temporarily or prepared for move
```

---

## Step 2: Build Profile Dashboard Screen

Create a simple Profile screen.

This screen should include at minimum two large buttons/cards:

```txt
Exercises
Measure
```

Behavior:

```txt
Tap Exercises -> opens Exercise Library page
Tap Measure -> opens Measurements page
```

Important:

```txt
No followers
No following
No social profile
No public stats
No feed behavior
```

The screenshot reference has social/profile elements, but this app does not need them.

Acceptance criteria:

```txt
Profile screen opens from bottom nav
Exercises button opens current Exercise Library
Measure button route exists, even if placeholder initially
```

---

## Step 3: Move Exercise Library Behind Profile -> Exercises

The current Exercise Library page should no longer be the bottom nav root.

It should be opened from:

```txt
Profile -> Exercises
```

The Exercise Library itself remains important and should continue supporting:

```txt
list exercises
search/filter if already built
create exercise
edit exercise
delete exercise
```

Acceptance criteria:

```txt
User taps Profile
User taps Exercises
Exercise Library opens
Existing exercise create/edit flows still work
```

---

## Step 4: Add Exercise Type to Data Model

Add `exercise_type` to exercises.

Supported values:

```txt
weight_reps
bodyweight_reps
weighted_bodyweight
assisted_bodyweight
```

Display labels:

```txt
weight_reps          -> Weight & Reps
bodyweight_reps      -> Bodyweight Reps
weighted_bodyweight  -> Weighted Bodyweight
assisted_bodyweight  -> Assisted Bodyweight
```

Recommended Prisma enum:

```prisma
enum ExerciseType {
  weight_reps
  bodyweight_reps
  weighted_bodyweight
  assisted_bodyweight
}
```

Recommended Exercise field:

```prisma
exerciseType ExerciseType @default(weight_reps) @map("exercise_type")
```

Default:

```txt
weight_reps
```

Acceptance criteria:

```txt
Prisma schema has ExerciseType enum
Exercise model has exerciseType field
Existing exercises default to weight_reps
Migration applies cleanly
```

---

## Step 5: Add Exercise Type Selector to Create/Edit Exercise

Update Create Exercise and Edit Exercise screens.

Exercise fields should now include:

```txt
name
description
equipment
primary muscle group
other/secondary muscles
exercise type
```

Exercise Type selector options:

```txt
Weight & Reps
Bodyweight Reps
Weighted Bodyweight
Assisted Bodyweight
```

Descriptions for selector UI:

```txt
Weight & Reps
Example: Bench Press, Dumbbell Curls
Inputs: weight + reps

Bodyweight Reps
Example: Pullups, Situps, Burpees
Inputs: reps only

Weighted Bodyweight
Example: Weighted Pullups, Weighted Dips
Inputs: added weight + reps

Assisted Bodyweight
Example: Assisted Pullups, Assisted Dips
Inputs: assistance weight + reps
```

Acceptance criteria:

```txt
User can select exercise type when creating exercise
User can edit exercise type later
If user does not select, default is Weight & Reps
Exercise type persists to database
```

---

## Step 6: Create Bodyweight Records Data Model

Do not store bodyweight only as a single app setting.

Use records so the user can add/edit/delete measurements.

Recommended Prisma model:

```prisma
model BodyweightRecord {
  id         String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  value      Decimal    @db.Decimal(8, 2)
  unit       WeightUnit @default(lbs)
  measuredAt DateTime   @map("measured_at") @db.Timestamptz(6)
  createdAt  DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([measuredAt])
  @@map("bodyweight_records")
}
```

Validation:

```txt
value required
value > 0
unit required: lbs or kg
measured_at required
```

Acceptance criteria:

```txt
bodyweight_records table exists
records can store value, unit, and measured_at
negative or zero bodyweight is rejected
```

---

## Step 7: Build Measurements Page

Route:

```txt
Profile -> Measure
```

This page should show only bodyweight for Pre Phase 4.

Minimum UI:

```txt
latest bodyweight value
list of bodyweight records
add button
```

List row:

```txt
Date       Bodyweight
Apr 23     138.89 lbs
Apr 22     139.88 lbs
```

Do not build charting yet unless it is trivial and does not delay the feature.

Acceptance criteria:

```txt
Measurements page opens from Profile -> Measure
Shows existing bodyweight records sorted newest first
Shows latest bodyweight prominently
Has Add button
```

---

## Step 8: Build Add/Edit/Delete Bodyweight Record Flows

Add Bodyweight screen fields:

```txt
date/time
bodyweight value
unit lbs/kg
```

Actions:

```txt
Save
Cancel
```

Edit behavior:

```txt
User can open an existing record
Change value/date/unit
Save changes
```

Delete behavior:

```txt
User can delete an existing record
Confirm before delete
```

Important historical rule:

```txt
Editing or deleting a bodyweight record must not change already snapshotted workout sets.
```

Acceptance criteria:

```txt
User can add bodyweight record
User can edit bodyweight record
User can delete bodyweight record
Measurements list updates correctly
Latest record updates correctly
```

---

## Step 9: Add Bodyweight Snapshot Field to Workout Sets

Add field to `workout_sets`:

```txt
bodyweight_used_in_default_unit
```

Recommended Prisma field:

```prisma
bodyweightUsedInDefaultUnit Decimal? @map("bodyweight_used_in_default_unit") @db.Decimal(10, 2)
```

Why this is required:

```txt
Live workout uses latest bodyweight record.
User may edit/delete bodyweight records later.
Saved workout volume must not change retroactively.
```

Acceptance criteria:

```txt
workout_sets has nullable bodyweight snapshot field
Existing sets remain valid
Migration applies cleanly
```

---

## Step 10: Update Live Workout Set Row UI by Exercise Type

Exercise type controls what inputs appear in the set row.

### Weight & Reps

```txt
Columns: set label | previous | LBS/KG | reps | RPE | checkmark
```

Weight input means external load.

### Bodyweight Reps

```txt
Columns: set label | previous | reps | RPE | checkmark
```

No weight field.

Strict bodyweight exercises do not show weight, +weight, or -weight.

### Weighted Bodyweight

```txt
Columns: set label | previous | +LBS/+KG | reps | RPE | checkmark
```

Weight input means added external load.

### Assisted Bodyweight

```txt
Columns: set label | previous | -LBS/-KG | reps | RPE | checkmark
```

Weight input means assistance/subtracted load.

Acceptance criteria:

```txt
Weight & Reps shows normal weight column
Bodyweight Reps shows reps only, no weight column
Weighted Bodyweight shows +LBS/+KG
Assisted Bodyweight shows -LBS/-KG
Existing set rules still work
```

---

## Step 11: Implement Latest Bodyweight Lookup

Live workout calculations use the latest bodyweight record.

Latest record rule:

```txt
ORDER BY measured_at DESC, created_at DESC
LIMIT 1
```

This latest record is used for:

```txt
bodyweight_reps
weighted_bodyweight
assisted_bodyweight
```

Convert latest bodyweight into the app's default weight unit before calculations.

Acceptance criteria:

```txt
Backend can fetch latest bodyweight record
Latest is based on measured_at, then created_at
Unit conversion works if bodyweight unit differs from default unit
```

---

## Step 12: Update Volume Calculation Logic

Volume calculations depend on exercise type.

### Weight & Reps

```txt
volume = weight_in_default_unit * reps
```

### Bodyweight Reps

```txt
volume = bodyweight_used_in_default_unit * reps
```

### Weighted Bodyweight

```txt
volume = (bodyweight_used_in_default_unit + weight_in_default_unit) * reps
```

### Assisted Bodyweight

```txt
volume = (bodyweight_used_in_default_unit - weight_in_default_unit) * reps
```

If effective weight would be below zero:

```txt
block the input or block save
```

Recommended:

```txt
Block assistance greater than current bodyweight
```

Acceptance criteria:

```txt
Weight & Reps volume unchanged
Bodyweight Reps volume uses latest bodyweight
Weighted Bodyweight volume uses bodyweight + added weight
Assisted Bodyweight volume uses bodyweight - assistance
Assisted weight greater than bodyweight is blocked
```

---

## Step 13: Snapshot Bodyweight During Set Save/Update

When a set belongs to an exercise type that uses bodyweight, store the bodyweight used.

Applies to:

```txt
bodyweight_reps
weighted_bodyweight
assisted_bodyweight
```

Does not apply to:

```txt
weight_reps
```

Write behavior:

```txt
1. Detect exercise_type from the workout exercise's source exercise/snapshot context
2. If type needs bodyweight, fetch latest bodyweight record
3. Convert latest bodyweight to app default unit
4. Store in workout_sets.bodyweight_used_in_default_unit
5. Calculate volume using the snapshot value
```

Important:

```txt
Do not recalculate old sets from newly edited bodyweight records.
Saved sets use their snapshot.
```

Acceptance criteria:

```txt
Bodyweight snapshot is stored on bodyweight-based sets
Editing/deleting a bodyweight record does not alter old set volume
Weight & Reps sets leave bodyweight snapshot null
```

---

## Step 14: Missing Bodyweight Handling

If no bodyweight record exists and the user logs a bodyweight-based exercise, the app needs clear behavior.

Recommended behavior:

```txt
Allow logging the set
Warn that bodyweight is missing
Do not calculate bodyweight-based volume until bodyweight exists
```

Alternative strict behavior:

```txt
Block bodyweight-based set save until bodyweight is added
```

Recommended for UX:

```txt
Allow logging, but show missing-bodyweight warning and exclude from volume
```

Acceptance criteria:

```txt
No crash if bodyweight is missing
User sees clear warning
Set can still be logged
Volume excludes that set or marks volume unavailable
```

---

## Step 15: Update Finish/Edit Validation

Existing rule remains:

```txt
recorded set = reps >= 1
```

Exercise type does not change the recorded set rule.

Validation additions:

```txt
Weight & Reps: weight can be 0, reps >= 1 records set
Bodyweight Reps: no weight required, reps >= 1 records set
Weighted Bodyweight: added weight can be 0, reps >= 1 records set
Assisted Bodyweight: assistance can be 0, reps >= 1 records set
Assisted Bodyweight: assistance must not exceed latest bodyweight if bodyweight exists
```

Invalid weighted row warning still applies to exercise types with a weight field:

```txt
weight_reps
weighted_bodyweight
assisted_bodyweight
```

For bodyweight_reps:

```txt
no weight field, so invalid weighted row warning does not apply
```

Acceptance criteria:

```txt
Finish validation still requires at least one reps >= 1 set
Bodyweight Reps can finish with reps only
Invalid weighted row warning ignores bodyweight-only exercises
Assisted > bodyweight is blocked when bodyweight exists
```

---

# 3. API Endpoints Needed

## Exercise Type

Existing exercise create/edit endpoints should accept:

```json
{
  "exercise_type": "weight_reps"
}
```

Allowed values:

```txt
weight_reps
bodyweight_reps
weighted_bodyweight
assisted_bodyweight
```

---

## Bodyweight Records

Recommended endpoints:

```txt
GET    /api/bodyweight-records
POST   /api/bodyweight-records
GET    /api/bodyweight-records/latest
PATCH  /api/bodyweight-records/:id
DELETE /api/bodyweight-records/:id
```

Create request:

```json
{
  "value": 138.89,
  "unit": "lbs",
  "measured_at": "2026-04-23T12:00:00Z"
}
```

Latest response:

```json
{
  "id": "uuid",
  "value": "138.89",
  "unit": "lbs",
  "measured_at": "2026-04-23T12:00:00Z"
}
```

---

# 4. Prisma Notes

Add enum:

```prisma
enum ExerciseType {
  weight_reps
  bodyweight_reps
  weighted_bodyweight
  assisted_bodyweight
}
```

Add to `Exercise`:

```prisma
exerciseType ExerciseType @default(weight_reps) @map("exercise_type")
```

Add model:

```prisma
model BodyweightRecord {
  id         String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  value      Decimal    @db.Decimal(8, 2)
  unit       WeightUnit @default(lbs)
  measuredAt DateTime   @map("measured_at") @db.Timestamptz(6)
  createdAt  DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([measuredAt])
  @@map("bodyweight_records")
}
```

Add to `WorkoutSet`:

```prisma
bodyweightUsedInDefaultUnit Decimal? @map("bodyweight_used_in_default_unit") @db.Decimal(10, 2)
```

Recommended raw SQL constraint:

```sql
ALTER TABLE bodyweight_records
ADD CONSTRAINT bodyweight_records_value_positive
CHECK (value > 0);
```

---

# 5. UX Summary

## Profile

```txt
Profile
- Exercises
- Measure
```

## Exercises

Create/Edit Exercise includes:

```txt
Exercise Type
```

## Measure

Measurements page includes:

```txt
Latest bodyweight
Bodyweight record history
Add bodyweight record
Edit bodyweight record
Delete bodyweight record
```

## Live Workout

Exercise type controls visible columns:

```txt
Weight & Reps          -> LBS/KG + reps
Bodyweight Reps        -> reps only
Weighted Bodyweight    -> +LBS/+KG + reps
Assisted Bodyweight    -> -LBS/-KG + reps
```

---

# 6. Key Rules

```txt
Exercise type is selected on the exercise, not per set.
Bodyweight Reps has no weight input.
Weighted Bodyweight weight means added load.
Assisted Bodyweight weight means assistance/subtracted load.
Latest bodyweight record is used for live calculations.
Bodyweight used must be snapshotted on workout sets.
Editing/deleting bodyweight records does not change old workouts.
Recorded set rule remains reps >= 1.
Checkmark remains visual only.
```

---

# 7. Completion Checklist

Pre Phase 4 is complete when:

```txt
Profile tab replaces Exercises tab
Profile has Exercises and Measure buttons
Exercise Library opens from Profile -> Exercises
Exercise Type exists on exercises
Create/Edit Exercise supports Exercise Type
Measurements page exists
User can add bodyweight record
User can edit bodyweight record
User can delete bodyweight record
Latest bodyweight lookup works
Workout sets can snapshot bodyweight used
Live workout rows change by exercise type
Volume calculation handles all four exercise types
Missing bodyweight is handled gracefully
Assisted > bodyweight is blocked when bodyweight exists
Finish/edit validation still works
```

---

# 8. Recommended Build Sequence Summary

```txt
1. Rename bottom nav tab to Profile
2. Build Profile dashboard with Exercises and Measure buttons
3. Move Exercise Library behind Profile -> Exercises
4. Add exercise_type to Exercise model
5. Add Exercise Type selector to create/edit exercise
6. Add bodyweight_records model/table
7. Build Measurements page
8. Add/edit/delete bodyweight records
9. Add bodyweight snapshot field to workout_sets
10. Update live workout UI per exercise type
11. Implement latest bodyweight lookup
12. Update volume calculations
13. Snapshot bodyweight during set save/update
14. Handle missing bodyweight
15. Update finish/edit validation
```

This order keeps UI navigation, exercise metadata, bodyweight records, and live workout calculations progressing in the correct dependency order.
