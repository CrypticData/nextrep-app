"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ToastTone = "success" | "error";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastListener = (toast: Toast | null) => void;

const listeners = new Set<ToastListener>();
let currentToast: Toast | null = null;
let nextToastId = 0;

function emitToast(message: string, tone: ToastTone) {
  currentToast = {
    id: ++nextToastId,
    message,
    tone,
  };

  for (const listener of listeners) {
    listener(currentToast);
  }
}

function clearToast(id?: number) {
  if (id !== undefined && currentToast?.id !== id) {
    return;
  }

  currentToast = null;

  for (const listener of listeners) {
    listener(null);
  }
}

export function useToast() {
  return useMemo(
    () => ({
      error: (message: string) => emitToast(message, "error"),
      success: (message: string) => emitToast(message, "success"),
    }),
    [],
  );
}

export function ToastProvider() {
  const [toast, setToast] = useState<Toast | null>(currentToast);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    listeners.add(setToast);

    return () => {
      listeners.delete(setToast);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!toast) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      clearToast(toast.id);
    }, 2500);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast]);

  if (!toast) {
    return null;
  }

  const toneClassName =
    toast.tone === "success"
      ? "border-emerald-300/25 bg-emerald-300/15 text-emerald-100"
      : "border-amber-300/25 bg-amber-300/15 text-amber-100";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.75rem+var(--safe-area-bottom))] z-[60] flex justify-center px-[calc(1.25rem+var(--safe-area-left))]">
      <button
        type="button"
        onClick={() => clearToast(toast.id)}
        className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-xl shadow-black/40 transition active:scale-[0.99] ${toneClassName}`}
      >
        {toast.message}
      </button>
    </div>
  );
}
