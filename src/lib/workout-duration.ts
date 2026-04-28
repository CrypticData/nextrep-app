export const MAX_WORKOUT_DURATION_SECONDS = 4 * 60 * 60 + 59 * 60;
export const MAX_WORKOUT_DURATION_MINUTES =
  MAX_WORKOUT_DURATION_SECONDS / 60;

export function clampWorkoutDurationSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return 0;
  }

  return Math.min(
    MAX_WORKOUT_DURATION_SECONDS,
    Math.max(0, Math.floor(totalSeconds)),
  );
}

export function toVisibleDurationParts(totalSeconds: number) {
  const clampedSeconds = clampWorkoutDurationSeconds(totalSeconds);
  const roundedMinutes = Math.min(
    MAX_WORKOUT_DURATION_MINUTES,
    Math.max(0, Math.round(clampedSeconds / 60)),
  );

  return {
    hours: Math.floor(roundedMinutes / 60),
    minutes: roundedMinutes % 60,
    secondsAdjustment:
      roundedMinutes === MAX_WORKOUT_DURATION_MINUTES
        ? 0
        : clampedSeconds - roundedMinutes * 60,
  };
}

export function durationInputsToSeconds(
  hours: number,
  minutes: number,
  secondsAdjustment: number,
) {
  return clampWorkoutDurationSeconds(
    (hours * 60 + minutes) * 60 + secondsAdjustment,
  );
}

export function formatRoundedDuration(totalSeconds: number) {
  const roundedMinutes = Math.min(
    MAX_WORKOUT_DURATION_MINUTES,
    Math.max(0, Math.round(clampWorkoutDurationSeconds(totalSeconds) / 60)),
  );
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}min`;
}
