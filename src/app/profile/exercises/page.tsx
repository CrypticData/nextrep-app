import { ExerciseLibraryApp } from "../../exercise-library-app";

type ProfileExercisesPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
  }>;
};

export default async function ProfileExercisesPage({
  searchParams,
}: ProfileExercisesPageProps) {
  const { mode } = await searchParams;
  const firstMode = Array.isArray(mode) ? mode[0] : mode;

  return (
    <ExerciseLibraryApp
      mode={firstMode === "add-to-workout" ? "add-to-workout" : "manage"}
    />
  );
}
