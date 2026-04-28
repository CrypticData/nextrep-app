import { SavedWorkoutDetailApp } from "./saved-workout-detail-app";

type SavedWorkoutDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SavedWorkoutDetailPage({
  params,
}: SavedWorkoutDetailPageProps) {
  const { id } = await params;

  return <SavedWorkoutDetailApp workoutId={id} />;
}
