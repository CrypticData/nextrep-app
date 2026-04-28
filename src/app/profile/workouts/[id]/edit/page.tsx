import { EditWorkoutApp } from "./edit-workout-app";

type EditWorkoutPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditWorkoutPage({ params }: EditWorkoutPageProps) {
  const { id } = await params;

  return <EditWorkoutApp workoutId={id} />;
}
