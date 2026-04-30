# NextRep

NextRep is a single-user workout tracker for logging workouts live and reviewing personal workout history.

## Language

**Exercise Type**:
The logging pattern for an exercise, such as weight and reps, bodyweight reps, weighted bodyweight, or assisted bodyweight.
_Avoid_: Exercise set type

**Set Type**:
The role of a set row within an exercise, such as normal, warmup, failure, or drop.
_Avoid_: Exercise type

**Previous**:
The historical value shown beside a live set row from the most recent completed workout where the same exercise had the matching recorded set position.
_Avoid_: Last workout

**Previous Quick Fill**:
A ghost value from **Previous** that appears in live set inputs and can be tapped to copy the historical values into the current set.
_Avoid_: Auto-save, auto-record

**Exercise Template Seeding**:
Creating a newly added live exercise's set rows from prior completed history, without copying historical values as real entries.
_Avoid_: Auto-fill, auto-log

**Live Progress Summary**:
The top-of-workout progress strip that reflects checked workout progress during an active workout.
_Avoid_: Saved workout summary

**Displayed Set Identity**:
The user-facing identity of a set row, based on set type and set numbering rather than physical row order.
_Avoid_: Row position, row index

**Numbered Set Lane**:
The displayed set sequence shared by normal and failure sets because both consume set numbers.
_Avoid_: Normal-only set sequence

## Relationships

- A **Workout Session** contains one or more **Workout Exercises**.
- A **Workout Exercise** has one **Exercise Type** and one or more set rows.
- A set row has one **Set Type**.
- **Previous** belongs to a live set row and is derived from completed workout history for the same source exercise and matching **Displayed Set Identity**.
- **Previous** matches exercise history by source exercise identity only, not by saved snapshot names.
- Normal and failure rows share the same **Numbered Set Lane** for **Previous** matching.
- **Previous** shows weight and reps for exercise types with an external weight input, but the value omits unit and plus/minus signs because the live weight column header provides that context.
- **Previous** converts historical external weight into the live workout exercise's current input unit before display.
- **Previous** displays converted external weight values with two decimal places.
- **Previous** uses only completed workout history; active and unfinished workouts do not contribute.
- **Previous** is recalculated when a live row's **Set Type** changes because the row's **Displayed Set Identity** and the identities of later rows may change.
- **Previous** matches duplicate exercise blocks by source exercise occurrence number within the workout, derived from workout exercise order.
- **Previous** is shown in live workout logging and completed workout edit, not in read-only exercise history or saved workout detail.
- In completed workout edit, **Previous** starts from each row's own saved value; if the row's **Displayed Set Identity** changes, it looks only at completed workouts before the workout being edited.
- **Previous Quick Fill** shows historical weight and/or reps as gray ghost input values until the user enters or copies values.
- **Previous Quick Fill** is triggered from the combined **Previous** value, not from the individual weight or reps input cells.
- **Previous Quick Fill** copies values into the live set when tapped, but it does not mark the set checked.
- Empty live weight or reps inputs fall back to showing their **Previous Quick Fill** ghost value in gray; manually entered values replace the ghost until deleted.
- Recomputing **Previous** after a **Displayed Set Identity** change does not overwrite manually entered live values.
- A historical zero weight is a real **Previous Quick Fill** value; an empty input's default gray zero placeholder is not.
- When **Previous** comes from an exercise type with an external weight input and historical weight is missing, the weight portion defaults to zero.
- **Previous Quick Fill** does not copy RPE because RPE belongs to the current workout's perceived effort.
- For a first exercise occurrence, **Exercise Template Seeding** copies the previous first occurrence's set row structure.
- For duplicate exercise occurrences, **Exercise Template Seeding** always starts with one normal set row.
- A duplicate occurrence's initial normal row uses **Previous** from the matching occurrence's numbered Set 1, skipping historical warmups.
- **Exercise Template Seeding** uses recorded historical rows regardless of **Exercise Type**; **Exercise Type** controls only the **Previous** display and quick-fill values.
- **Live Progress Summary** volume follows checked-set progress, while saved workout volume and history continue to use recorded sets.

## Example dialogue

> **Dev:** "Should Previous show weight for this row?"
> **Domain expert:** "Show weight and reps when the **Exercise Type** has an external weight input; otherwise show reps only."

> **Dev:** "Should Previous match row 3 to historical row 3?"
> **Domain expert:** "No — match the same **Displayed Set Identity**, because warmup and drop rows change physical row order."

## Flagged ambiguities

- "exercise set type" was used to mean **Exercise Type**. Resolved: **Exercise Type** controls the input/display pattern, while **Set Type** is normal, warmup, failure, or drop.
