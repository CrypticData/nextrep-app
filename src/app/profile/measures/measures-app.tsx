"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "../../app-shell";
import { ConfirmSheet } from "../../confirm-sheet";

type WeightUnit = "lbs" | "kg";

type BodyweightRecord = {
  id: string;
  weight: string;
  weight_unit: WeightUnit;
  display_weight: string;
  display_weight_unit: WeightUnit;
  measured_on: string;
  value: string;
  unit: WeightUnit;
  measured_at: string;
  created_at: string;
  updated_at: string;
};

type BodyweightPayload = {
  value: string;
  measured_at: string;
};

type Settings = {
  weight_unit: WeightUnit;
  default_weight_unit: WeightUnit;
};

type ModalMode =
  | { kind: "create" }
  | { kind: "edit"; record: BodyweightRecord };

export function MeasuresApp() {
  const [records, setRecords] = useState<BodyweightRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] =
    useState<BodyweightRecord | null>(null);

  const latestRecord = records[0] ?? null;

  useEffect(() => {
    void loadRecords();
  }, []);

  async function loadRecords() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [bodyweightRecords, appSettings] = await Promise.all([
        fetchJson<BodyweightRecord[]>("/api/bodyweight-records"),
        fetchJson<Settings>("/api/settings"),
      ]);
      setRecords(bodyweightRecords);
      setSettings(appSettings);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveRecord(payload: BodyweightPayload) {
    const editingRecord =
      modalMode?.kind === "edit" ? modalMode.record : null;
    const record = await fetchJson<BodyweightRecord>(
      editingRecord
        ? `/api/bodyweight-records/${editingRecord.id}`
        : "/api/bodyweight-records",
      {
        method: editingRecord ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    setRecords((currentRecords) => {
      const nextRecords = editingRecord
        ? currentRecords.map((currentRecord) =>
            currentRecord.id === record.id ? record : currentRecord,
          )
        : [...currentRecords, record];

      return sortRecords(nextRecords);
    });
    setModalMode(null);
    setActionError(null);
  }

  async function handleDeleteRecord(record: BodyweightRecord) {
    setDeletingRecordId(record.id);
    setActionError(null);

    try {
      await fetchJson<void>(`/api/bodyweight-records/${record.id}`, {
        method: "DELETE",
      });
      setRecords((currentRecords) =>
        currentRecords.filter(
          (currentRecord) => currentRecord.id !== record.id,
        ),
      );
      setDeleteRecordTarget(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setDeletingRecordId(null);
    }
  }

  return (
    <AppShell
      backHref="/profile"
      backLabel="Back to profile"
      subpage
      title="Measures"
      action={
        <button
          type="button"
          onClick={() => setModalMode({ kind: "create" })}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 transition active:scale-95"
          aria-label="Add bodyweight"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      }
    >
      <div className="space-y-5 pb-24">
        <LatestBodyweightCard
          isLoading={isLoading}
          latestRecord={latestRecord}
        />

        {actionError ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {actionError}
          </div>
        ) : null}

        <BodyweightHistory
          deletingRecordId={deletingRecordId}
          isLoading={isLoading}
          loadError={loadError}
          onDelete={setDeleteRecordTarget}
          onEdit={(record) => setModalMode({ kind: "edit", record })}
          onRetry={() => void loadRecords()}
          records={records}
        />
      </div>

      {modalMode ? (
        <BodyweightModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSave={handleSaveRecord}
          weightUnit={settings?.weight_unit ?? "lbs"}
        />
      ) : null}

      {deleteRecordTarget ? (
        <ConfirmSheet
          confirmLabel="Delete Record"
          confirmingLabel="Deleting"
          description={`This removes ${formatBodyweight(deleteRecordTarget)} from ${formatDate(deleteRecordTarget.measured_at)}.`}
          error={actionError}
          isConfirming={deletingRecordId === deleteRecordTarget.id}
          onCancel={() => {
            if (deletingRecordId !== deleteRecordTarget.id) {
              setDeleteRecordTarget(null);
              setActionError(null);
            }
          }}
          onConfirm={() => void handleDeleteRecord(deleteRecordTarget)}
          title="Delete this bodyweight record?"
        />
      ) : null}
    </AppShell>
  );
}

function LatestBodyweightCard({
  isLoading,
  latestRecord,
}: {
  isLoading: boolean;
  latestRecord: BodyweightRecord | null;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#181818] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-500">Latest</p>
          <p className="mt-2 text-4xl font-semibold tracking-normal text-white">
            {latestRecord ? formatBodyweight(latestRecord) : "--"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {latestRecord
              ? formatDate(latestRecord.measured_at)
              : isLoading
                ? "Loading bodyweight history"
                : "No bodyweight recorded"}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
          <ScaleIcon className="h-6 w-6" />
        </div>
      </div>
    </section>
  );
}

function BodyweightHistory({
  deletingRecordId,
  isLoading,
  loadError,
  onDelete,
  onEdit,
  onRetry,
  records,
}: {
  deletingRecordId: string | null;
  isLoading: boolean;
  loadError: string | null;
  onDelete: (record: BodyweightRecord) => void;
  onEdit: (record: BodyweightRecord) => void;
  onRetry: () => void;
  records: BodyweightRecord[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-500">History</h2>
        <p className="text-xs font-medium text-zinc-600">
          {records.length === 1 ? "1 record" : `${records.length} records`}
        </p>
      </div>

      {loadError ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-red-200">
            Could not load bodyweight records
          </p>
          <p className="mt-2 text-sm leading-6 text-red-100/70">
            {loadError}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loadError && isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl bg-white/[0.04]"
            />
          ))}
        </div>
      ) : null}

      {!loadError && !isLoading && records.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Bodyweight records will appear here.
          </p>
        </div>
      ) : null}

      {!loadError && records.length > 0 ? (
        <div className="grid gap-3">
          {records.map((record) => (
            <BodyweightRow
              key={record.id}
              deletingRecordId={deletingRecordId}
              onDelete={onDelete}
              onEdit={onEdit}
              record={record}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BodyweightRow({
  deletingRecordId,
  onDelete,
  onEdit,
  record,
}: {
  deletingRecordId: string | null;
  onDelete: (record: BodyweightRecord) => void;
  onEdit: (record: BodyweightRecord) => void;
  record: BodyweightRecord;
}) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#181818] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-white">
          {formatBodyweight(record)}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {formatDate(record.measured_at)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(record)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        aria-label={`Edit ${formatBodyweight(record)}`}
      >
        <EditIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(record)}
        disabled={deletingRecordId === record.id}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-700"
        aria-label={`Delete ${formatBodyweight(record)}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </article>
  );
}

function BodyweightModal({
  mode,
  onClose,
  onSave,
  weightUnit,
}: {
  mode: ModalMode;
  onClose: () => void;
  onSave: (payload: BodyweightPayload) => Promise<void>;
  weightUnit: WeightUnit;
}) {
  const editingRecord = mode.kind === "edit" ? mode.record : null;
  const [value, setValue] = useState(editingRecord?.display_weight ?? "");
  const [measuredAt, setMeasuredAt] = useState(
    toDateInputValue(editingRecord?.measured_at ?? new Date().toISOString()),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = editingRecord ? "Edit Bodyweight" : "Add Bodyweight";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedValue = value.trim();
    const numericValue = Number(normalizedValue);

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue) || numericValue <= 0) {
      setError("Enter a positive bodyweight with at most 2 decimals.");
      return;
    }

    if (!measuredAt) {
      setError("Date is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSave({
        value: normalizedValue,
        measured_at: dateInputToIsoDate(measuredAt),
      });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0">
      <button
        type="button"
        aria-label="Close bodyweight form"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black"
      >
        <div className="flex justify-center px-5 py-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center border-b border-white/10 px-5 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-zinc-400"
          >
            Cancel
          </button>
          <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-white">
            {title}
          </h2>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isSubmitting ? "Saving" : "Save"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <FormField label="Bodyweight">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="decimal"
                placeholder="138.89"
                className="h-12 min-w-0 rounded-2xl border border-white/10 bg-[#232323] px-4 text-[15px] text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/70"
              />
              <div className="flex h-12 min-w-16 items-center justify-center rounded-2xl bg-[#232323] px-4 text-sm font-bold text-zinc-300">
                {editingRecord?.display_weight_unit ?? weightUnit}
              </div>
            </div>
          </FormField>

          <FormField label="Date">
            <input
              type="date"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#232323] px-4 text-[15px] text-white outline-none transition focus:border-emerald-400/70"
            />
          </FormField>
        </div>
      </form>
    </div>
  );
}

function FormField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  if (response.status === 204) {
    return undefined as T;
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

function sortRecords(records: BodyweightRecord[]) {
  return [...records].sort((first, second) => {
    const measuredDiff =
      new Date(second.measured_at).getTime() -
      new Date(first.measured_at).getTime();

    if (measuredDiff !== 0) {
      return measuredDiff;
    }

    return (
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime()
    );
  });
}

function formatBodyweight(record: BodyweightRecord) {
  return `${record.display_weight} ${record.display_weight_unit}`;
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function toDateInputValue(isoDate: string) {
  return new Date(isoDate).toISOString().slice(0, 10);
}

function dateInputToIsoDate(dateValue: string) {
  return `${dateValue}T12:00:00.000Z`;
}

type IconProps = {
  className?: string;
};

function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

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

function EditIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 17.5V20h2.5L18.8 7.7l-2.5-2.5L4 17.5ZM15.4 6.1l2.5 2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
