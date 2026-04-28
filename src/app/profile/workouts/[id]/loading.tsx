import { AppShell } from "@/app/app-shell";

export default function LoadingSavedWorkoutDetail() {
  return (
    <AppShell
      backHref="/profile"
      mainClassName="px-5 pb-24 pt-4"
      subpage
      title="Workout"
    >
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
          <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
          <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
      </div>
    </AppShell>
  );
}
