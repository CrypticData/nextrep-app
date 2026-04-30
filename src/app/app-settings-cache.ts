"use client";

export type AppSettingsCache = {
  silenceSuccessToasts: boolean;
  soundEnabled: boolean;
};

const APP_SETTINGS_CACHE_KEY = "nextrep:app-settings";

export function readAppSettingsCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(APP_SETTINGS_CACHE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (
      typeof parsedValue === "object" &&
      parsedValue !== null &&
      !Array.isArray(parsedValue) &&
      "silenceSuccessToasts" in parsedValue &&
      typeof parsedValue.silenceSuccessToasts === "boolean"
    ) {
      return {
        silenceSuccessToasts: parsedValue.silenceSuccessToasts,
        soundEnabled:
          "soundEnabled" in parsedValue &&
          typeof parsedValue.soundEnabled === "boolean"
            ? parsedValue.soundEnabled
            : true,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function writeAppSettingsCache(settings: AppSettingsCache) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      APP_SETTINGS_CACHE_KEY,
      JSON.stringify({
        silenceSuccessToasts: settings.silenceSuccessToasts,
        soundEnabled: settings.soundEnabled,
      }),
    );
  } catch {
    // Best-effort cache only; DB remains authoritative.
  }
}
