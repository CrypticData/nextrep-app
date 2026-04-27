"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  mainClassName?: string;
  subpage?: boolean;
  title: string;
};

const navItems = [
  { href: "/", label: "Workout", icon: PlayIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function AppShell({
  action,
  backHref,
  backLabel = "Back",
  children,
  mainClassName = "px-5 pb-6 pt-4",
  subpage = false,
  title,
}: AppShellProps) {
  return (
    <div className="h-dvh overflow-hidden bg-[#050505] text-zinc-50">
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#101010] shadow-2xl shadow-black/40">
        <header className="shrink-0 border-b border-white/10 px-5 pb-4 pt-6">
          {subpage ? (
            <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
              {backHref ? (
                <Link
                  href={backHref}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white active:scale-95"
                  aria-label={backLabel}
                >
                  <BackIcon className="h-5 w-5" />
                </Link>
              ) : (
                <div className="h-11 w-11" />
              )}
              <h1 className="min-w-0 truncate text-center text-xl font-semibold tracking-normal text-white">
                {title}
              </h1>
              {action ? (
                <div className="flex h-11 w-11 items-center justify-center">
                  {action}
                </div>
              ) : (
                <div className="h-11 w-11" />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                  NextRep
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">
                  {title}
                </h1>
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
          )}
        </header>

        <main className={`min-h-0 flex-1 overflow-y-auto ${mainClassName}`}>
          {children}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 grid shrink-0 grid-cols-2 border-t border-white/10 bg-[#111]/95 px-2 pb-3 pt-2 backdrop-blur">
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
