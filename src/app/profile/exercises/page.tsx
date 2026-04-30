import { ExerciseLibraryApp } from "../../exercise-library-app";

type ProfileExercisesPageProps = {
  searchParams: Promise<{
    exercise?: string | string[];
    mode?: string | string[];
  }>;
};

export default async function ProfileExercisesPage({
  searchParams,
}: ProfileExercisesPageProps) {
  const { exercise, mode } = await searchParams;
  const firstExercise = Array.isArray(exercise) ? exercise[0] : exercise;
  const firstMode = Array.isArray(mode) ? mode[0] : mode;

  return (
    <ExerciseLibraryApp
      initialSelectedExerciseId={firstExercise ?? null}
      mode={firstMode === "add-to-workout" ? "add-to-workout" : "manage"}
    />
  );
}
