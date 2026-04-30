"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  readAppSettingsCache,
  writeAppSettingsCache,
} from "./app-settings-cache";
import { ActiveWorkoutCard } from "./active-workout-card";
import {
  useActiveWorkout,
  useRestTimerRemainingSeconds,
} from "./active-workout-context";
import {
  TOP_BAR_BORDER_CLASS,
  TOP_BAR_ROW_CLASS,
  TOP_BAR_TITLE_CLASS,
} from "./top-bar";
import { ToastProvider } from "./toast";

type AppShellProps = {
  action?: ReactNode;
  backAction?: () => void;
  backHref?: string;
  backLabel?: string;
  backText?: string;
  children: ReactNode;
  hideFloatingCard?: boolean;
  hideHeader?: boolean;
  hideRestTimer?: boolean;
  hideBottomNav?: boolean;
  mainClassName?: string;
  showRestTimer?: boolean;
  subpage?: boolean;
  title: string;
};

type AppSettingsResponse = {
  silence_success_toasts: boolean;
  sound_enabled: boolean;
};

const navItems = [
  { href: "/", label: "Workout", icon: PlayIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function AppShell({
  action,
  backAction,
  backHref,
  backLabel = "Back",
  backText,
  children,
  hideFloatingCard = false,
  hideHeader = false,
  hideRestTimer = false,
  hideBottomNav = false,
  mainClassName = "safe-main-x pb-6 pt-4",
  showRestTimer = false,
  subpage = false,
  title,
}: AppShellProps) {
  const pathname = usePathname();
  const { session } = useActiveWorkout();
  const showFloatingCard =
    !hideFloatingCard &&
    session !== null &&
    (pathname === "/" || pathname === "/profile");
  const showBottomNav =
    !hideBottomNav && (pathname === "/" || pathname === "/profile");

  useEffect(() => {
    if (readAppSettingsCache()) {
      return;
    }

    const abortController = new AbortController();

    async function hydrateAppSettingsCache() {
      try {
        const response = await fetch("/api/settings", {
          signal: abortController.signal,
        });

        if (!response.ok) {
          return;
        }

        const settings = (await response.json()) as AppSettingsResponse;
        writeAppSettingsCache({
          silenceSuccessToasts: settings.silence_success_toasts,
          soundEnabled: settings.sound_enabled,
        });
      } catch {
        // Cache hydration is best-effort; errors still show without it.
      }
    }

    void hydrateAppSettingsCache();

    return () => abortController.abort();
  }, []);

  return (
    <div className="h-svh overflow-hidden bg-[#050505] text-zinc-50">
      <div className="mx-auto flex h-svh min-h-0 w-full max-w-md flex-col overflow-hidden bg-[#101010] shadow-2xl shadow-black/40">
        {hideHeader ? null : (
          <header
            className={`safe-header shrink-0 bg-[#181818] ${TOP_BAR_BORDER_CLASS}`}
          >
            {subpage ? (
              <div
                className={
                  backText
                    ? `grid grid-cols-[74px_1fr_74px] gap-3 ${TOP_BAR_ROW_CLASS}`
                    : `grid grid-cols-[40px_1fr_40px] gap-3 ${TOP_BAR_ROW_CLASS}`
                }
              >
                {backAction ? (
                  <button
                    type="button"
                    onClick={backAction}
                    className={
                      backText
                        ? "flex h-10 items-center text-sm font-semibold leading-none text-zinc-300 transition hover:text-white active:scale-95"
                        : "flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white active:scale-95"
                    }
                    aria-label={backLabel}
                  >
                    {backText ?? <BackIcon className="h-5 w-5" />}
                  </button>
                ) : backHref ? (
                  <Link
                    href={backHref}
                    className={
                      backText
                        ? "flex h-10 items-center text-sm font-semibold leading-none text-zinc-300 transition hover:text-white active:scale-95"
                        : "flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white active:scale-95"
                    }
                    aria-label={backLabel}
                  >
                    {backText ?? <BackIcon className="h-5 w-5" />}
                  </Link>
                ) : (
                  <div className="h-10 w-10" />
                )}
                <h1
                  className={`min-w-0 truncate text-center text-xl font-semibold tracking-normal text-white ${TOP_BAR_TITLE_CLASS}`}
                >
                  {title}
                </h1>
                {action ? (
                  <div className="flex h-10 w-10 items-center justify-center justify-self-end">
                    {action}
                  </div>
                ) : (
                  <div className="h-10 w-10 justify-self-end" />
                )}
              </div>
            ) : (
              <div className={`flex justify-between gap-4 ${TOP_BAR_ROW_CLASS}`}>
                <h1
                  className={`min-w-0 truncate text-xl font-semibold tracking-normal text-white ${TOP_BAR_TITLE_CLASS}`}
                >
                  {title}
                </h1>
                {action ? <div className="shrink-0">{action}</div> : null}
              </div>
            )}
          </header>
        )}

        <main className={`min-h-0 flex-1 overflow-y-auto ${mainClassName}`}>
          {children}
        </main>

        {showRestTimer && !hideRestTimer ? <RestTimerBar /> : null}

        {showFloatingCard ? <ActiveWorkoutCard session={session} /> : null}

        {showBottomNav ? <BottomNav /> : null}
        <ToastProvider />
      </div>
    </div>
  );
}

function RestTimerBar() {
  const { adjustRest, session, skipRest } = useActiveWorkout();
  const remainingSeconds = useRestTimerRemainingSeconds();
  const previousRemainingRef = useRef(remainingSeconds);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasActiveRest = Boolean(session?.active_rest_started_at);
  const durationSeconds = session?.active_rest_duration_seconds ?? 0;
  const progress =
    durationSeconds > 0
      ? Math.max(0, Math.min(100, (remainingSeconds / durationSeconds) * 100))
      : 0;

  useEffect(() => {
    if (
      hasActiveRest &&
      previousRemainingRef.current > 0 &&
      remainingSeconds === 0
    ) {
      if (readAppSettingsCache()?.soundEnabled ?? true) {
        playRestEndSound(audioContextRef);
      }

      void skipRest().catch(() => undefined);
    }

    previousRemainingRef.current = remainingSeconds;
  }, [hasActiveRest, remainingSeconds, skipRest]);

  if (!hasActiveRest || remainingSeconds <= 0) {
    return null;
  }

  return (
    <div className="safe-floating-card shrink-0 border-t border-white/10 bg-[#181818] px-3 pb-2 pt-2 shadow-2xl shadow-black/40">
      <div className="mb-2 h-0.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid grid-cols-[52px_1fr_52px_64px] items-center gap-2">
        <button
          type="button"
          onClick={() => void adjustRest(-15)}
          className="h-10 rounded-xl bg-white/[0.08] text-sm font-bold text-emerald-100 transition active:scale-95"
        >
          -15
        </button>
        <div className="text-center font-mono text-3xl font-semibold leading-none text-white">
          {formatCountdown(remainingSeconds)}
        </div>
        <button
          type="button"
          onClick={() => void adjustRest(15)}
          className="h-10 rounded-xl bg-white/[0.08] text-sm font-bold text-emerald-100 transition active:scale-95"
        >
          +15
        </button>
        <button
          type="button"
          onClick={() => void skipRest()}
          className="h-10 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-white transition active:scale-95"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function playRestEndSound(
  audioContextRef: MutableRefObject<AudioContext | null>,
) {
  try {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    const audioContext =
      audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.8);
  } catch {
    // Browser audio permissions are best-effort for this v1 timer.
  }
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom-nav sticky bottom-0 z-20 grid shrink-0 grid-cols-2 border-t border-white/10 bg-[#111]/95 pt-2 backdrop-blur">
      {navItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-emerald-300"
                : "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-zinc-500 transition hover:bg-white/[0.03] hover:text-zinc-300"
            }
          >
            <Icon className="h-5 w-5" />
            <span className="text-[11px] font-semibold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type IconProps = {
  className?: string;
};

function UserIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function BackIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m15 19-7-7 7-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M8 5v14l11-7L8 5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
