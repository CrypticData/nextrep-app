import { AppShell } from "../../app-shell";

export default function ProfileMeasuresPage() {
  return (
    <AppShell backHref="/profile" backLabel="Back to profile" subpage title="Measures">
      <div className="flex min-h-[58dvh] flex-col justify-center">
        <section className="rounded-3xl border border-white/10 bg-[#181818] p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
            <MeasuresIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">Measures</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Body measurements will appear here in a later phase.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function MeasuresIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 17 17 4l3 3L7 20H4v-3ZM14 7l3 3M5 12l2 2M9 8l2 2M13 4l2 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
