"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../../app-shell";

type WeightUnit = "lbs" | "kg";

type Settings = {
  weight_unit: WeightUnit;
  default_weight_unit: WeightUnit;
};

export function UnitsSettingsApp() {
  const [unit, setUnit] = useState<WeightUnit>("lbs");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    setIsLoading(true);
    setError(null);

    try {
      const settings = await fetchJson<Settings>("/api/settings");
      setUnit(settings.weight_unit);
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

  async function handleSelectUnit(nextUnit: WeightUnit) {
    if (nextUnit === unit || isSaving) {
      return;
    }

    const previousUnit = unit;
    setUnit(nextUnit);
    setIsSaving(true);
    setError(null);

    try {
      const settings = await fetchJson<Settings>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight_unit: nextUnit }),
      });
      setUnit(settings.weight_unit);
    } catch (saveError) {
      setUnit(previousUnit);
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      backHref="/profile/settings"
      backLabel="Back to settings"
      subpage
      title="Units"
    >
      <div className="space-y-5 pb-24">
        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">Weight</h2>
          <div className="grid gap-3">
            <UnitOption
              disabled={isLoading || isSaving}
              label="lbs"
              onSelect={() => void handleSelectUnit("lbs")}
              selected={unit === "lbs"}
            />
            <UnitOption
              disabled={isLoading || isSaving}
              label="kg"
              onSelect={() => void handleSelectUnit("kg")}
              selected={unit === "kg"}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function UnitOption({
  disabled,
  label,
  onSelect,
  selected,
}: {
  disabled: boolean;
  label: WeightUnit;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={
        selected
          ? "flex h-16 items-center justify-between rounded-3xl border border-emerald-400/40 bg-emerald-400/[0.09] px-5 text-left text-white transition active:scale-[0.99] disabled:cursor-not-allowed"
          : "flex h-16 items-center justify-between rounded-3xl border border-white/[0.08] bg-[#181818] px-5 text-left text-white transition hover:bg-[#1d1d1d] active:scale-[0.99] disabled:cursor-not-allowed disabled:text-zinc-500"
      }
    >
      <span className="text-base font-semibold">{label}</span>
      <span
        className={
          selected
            ? "flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"
            : "h-7 w-7 rounded-full border border-white/15"
        }
      >
        {selected ? <CheckIcon className="h-4 w-4" /> : null}
      </span>
    </button>
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

type IconProps = {
  className?: string;
};

function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}
