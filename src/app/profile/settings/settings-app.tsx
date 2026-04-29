"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { writeAppSettingsCache } from "../../app-settings-cache";
import { AppShell } from "../../app-shell";

type WeightUnit = "lbs" | "kg";

type Settings = {
  weight_unit: WeightUnit;
  default_weight_unit: WeightUnit;
  silence_success_toasts: boolean;
};

export function SettingsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    setIsLoading(true);
    setError(null);

    try {
      const appSettings = await fetchJson<Settings>("/api/settings");
      setSettings(appSettings);
      writeAppSettingsCache({
        silenceSuccessToasts: appSettings.silence_success_toasts,
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <AppShell
      backHref="/profile"
      backLabel="Back to profile"
      subpage
      title="Settings"
    >
      <div className="space-y-5 pb-24">
        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {isLoading ? <SettingsSkeleton /> : null}

        {!isLoading ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">General</h2>
          <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#181818]">
            <SettingsRow
              href="/profile/settings/units"
              icon={<ScaleIcon className="h-5 w-5" />}
              label="Units"
              value={settings ? formatUnit(settings.weight_unit) : "Unavailable"}
            />
            <SettingsRow
              href="/profile/settings/notifications"
              icon={<BellIcon className="h-5 w-5" />}
              label="Notifications"
              value={
                settings
                  ? settings.silence_success_toasts
                    ? "Off"
                    : "On"
                  : "Unavailable"
              }
            />
          </div>
        </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function SettingsSkeleton() {
  return (
    <section>
      <div className="mb-3 h-5 w-20 animate-pulse rounded-full bg-white/[0.04]" />
      <div className="h-16 animate-pulse rounded-3xl bg-white/[0.04]" />
    </section>
  );
}

function SettingsRow({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04] active:scale-[0.995]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-emerald-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-base font-semibold text-white">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-500">{value}</span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-zinc-600" />
    </Link>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  return (await response.json()) as T;
}

async function readErrorResponse(response: Response) {
  try {
    const data: unknown = await response.json();

    if (isErrorBody(data)) {
      return data.error;
    }
  } catch {
    return response.statusText || "Request failed.";
  }

  return response.statusText || "Request failed.";
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatUnit(unit: WeightUnit) {
  return unit === "lbs" ? "lbs" : "kg";
}

type IconProps = {
  className?: string;
};

function ScaleIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 20h12M8 20l4-14 4 14M5 9h14M5 9l-3 5h6L5 9Zm14 0-3 5h6l-3-5ZM12 6V4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M15 17H9M18 10a6 6 0 0 0-12 0c0 3-1 5-2 6h16c-1-1-2-3-2-6ZM10 20a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
