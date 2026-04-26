"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppShellProps = {
  action?: ReactNode;
  children: ReactNode;
  title: string;
};

const navItems = [
  { href: "/", label: "Workout", icon: PlayIcon },
  { href: "/exercises", label: "Exercises", icon: DumbbellIcon },
];

export function AppShell({ action, children, title }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-[#050505] text-zinc-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#101010] shadow-2xl shadow-black/40">
        <header className="border-b border-white/10 px-5 pb-4 pt-6">
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
        </header>

        <main className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
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
    <nav className="sticky bottom-0 z-20 grid grid-cols-2 border-t border-white/10 bg-[#111]/95 px-2 pb-3 pt-2 backdrop-blur">
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

function DumbbellIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M6 7v10M18 7v10M3 9v6M21 9v6M7 12h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
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
