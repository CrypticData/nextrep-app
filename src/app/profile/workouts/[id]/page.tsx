import { SavedWorkoutDetailApp } from "./saved-workout-detail-app";

type SavedWorkoutDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function SavedWorkoutDetailPage({
  params,
  searchParams,
}: SavedWorkoutDetailPageProps) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const firstReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  return (
    <SavedWorkoutDetailApp
      backHref={getSafeBackHref(firstReturnTo)}
      workoutId={id}
    />
  );
}

function getSafeBackHref(value: string | undefined) {
  if (!value || !value.startsWith("/")) {
    return "/profile";
  }

  if (value.startsWith("//")) {
    return "/profile";
  }

  return value;
}
