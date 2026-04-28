"use client";

type ConfirmSheetProps = {
  cancelLabel?: string;
  confirmLabel: string;
  confirmingLabel?: string;
  description: string;
  error?: string | null;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export function ConfirmSheet({
  cancelLabel = "Cancel",
  confirmLabel,
  confirmingLabel = "Working",
  description,
  error = null,
  isConfirming = false,
  onCancel,
  onConfirm,
  title,
}: ConfirmSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <section className="confirm-sheet-in relative w-full max-w-md rounded-t-3xl border border-white/10 bg-[#141414] px-5 pb-5 shadow-2xl shadow-black">
        <div className="flex justify-center py-3">
          <div className="h-1 w-9 rounded-full bg-white/15" />
        </div>
        <div className="px-1 pb-2 text-center">
          <h2 className="text-xl font-semibold tracking-normal text-white">
            {title}
          </h2>
          <p className="mx-auto mt-2 max-w-72 text-sm leading-6 text-zinc-400">
            {description}
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="h-12 w-full rounded-2xl bg-red-500/15 px-4 text-base font-bold text-red-300 ring-1 ring-red-500/30 transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-base font-bold text-white transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
