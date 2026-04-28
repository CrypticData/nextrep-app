"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  MAX_WORKOUT_DURATION_SECONDS,
  MAX_WORKOUT_DURATION_MINUTES,
  durationInputsToSeconds,
} from "@/lib/workout-duration";

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 3;
const PICKER_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const SELECTED_ROW_OFFSET = (PICKER_HEIGHT - ROW_HEIGHT) / 2;

type DurationChange = {
  hours: string;
  minutes: string;
  seconds: string;
};

type WorkoutMetadataSectionProps = {
  description: string;
  durationHours: string;
  durationLabel: string;
  durationMinutes: string;
  durationSecondsRemainder: string;
  name: string;
  onDescriptionChange: (value: string) => void;
  onDurationChange: (value: DurationChange) => void;
  onNameChange: (value: string) => void;
  onStartedAtLocalChange: (value: string) => void;
  startedAtLocal: string;
  volumeLabel: string;
  setsLabel: string;
};

export function WorkoutMetadataHeader({
  left,
  right,
  title,
}: {
  left: ReactNode;
  right: ReactNode;
  title: string;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-px bg-[#101010]">
      <div className="relative flex min-h-[56px] items-center justify-between border-b border-white/10 bg-[#181818] px-5 py-2">
        <div className="z-10 flex min-w-[72px] items-center justify-start">
          {left}
        </div>
        <h1 className="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 truncate text-center text-lg font-semibold tracking-normal text-white">
          {title}
        </h1>
        <div className="z-10 flex min-w-[72px] items-center justify-end">
          {right}
        </div>
      </div>
    </div>
  );
}

export function WorkoutMetadataSection({
  description,
  durationHours,
  durationLabel,
  durationMinutes,
  durationSecondsRemainder,
  name,
  onDescriptionChange,
  onDurationChange,
  onNameChange,
  onStartedAtLocalChange,
  startedAtLocal,
  volumeLabel,
  setsLabel,
}: WorkoutMetadataSectionProps) {
  const [isDurationSheetOpen, setIsDurationSheetOpen] = useState(false);
  const [isDateTimeSheetOpen, setIsDateTimeSheetOpen] = useState(false);

  return (
    <section className="-mx-5 border-b border-white/[0.07] bg-[#101010] px-5 pb-5 pt-5">
      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        maxLength={120}
        className="w-full bg-transparent text-[2.05rem] font-semibold leading-tight tracking-normal text-white outline-none placeholder:text-zinc-700 focus:placeholder:text-zinc-600"
        placeholder="Workout title"
      />

      <div className="mt-5 grid min-h-[64px] grid-cols-[minmax(116px,1.35fr)_minmax(74px,0.85fr)_minmax(52px,0.55fr)] gap-3 border-b border-white/10 pb-5">
        <MetadataStatButton
          accent
          label="Duration"
          onClick={() => setIsDurationSheetOpen(true)}
          value={durationLabel}
        />
        <MetadataStat label="Volume" value={volumeLabel} />
        <MetadataStat label="Sets" value={setsLabel} />
      </div>

      <button
        type="button"
        onClick={() => setIsDateTimeSheetOpen(true)}
        className="grid min-h-[64px] w-full grid-cols-[1fr_auto] items-center border-b border-white/10 text-left transition active:scale-[0.99]"
      >
        <span>
          <span className="block text-sm font-medium text-zinc-500">When</span>
          <span className="mt-1 block text-base font-semibold text-emerald-300">
            {formatWhenLabel(startedAtLocal)}
          </span>
        </span>
        <ChevronIcon className="h-5 w-5 text-zinc-500" />
      </button>

      <div className="mt-5">
        <label className="text-sm font-medium text-zinc-500">
          Description
        </label>
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={5}
          className="mt-2 w-full resize-none rounded-[22px] border border-white/10 bg-[#181818] px-4 py-4 text-base font-medium leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-[#1d1d1d]"
          placeholder="How did your workout go?"
        />
      </div>

      {isDurationSheetOpen ? (
        <DurationSheet
          hours={durationHours}
          minutes={durationMinutes}
          onClose={() => setIsDurationSheetOpen(false)}
          onDone={(value) => {
            onDurationChange(value);
            setIsDurationSheetOpen(false);
          }}
          seconds={durationSecondsRemainder}
        />
      ) : null}

      {isDateTimeSheetOpen ? (
        <DateTimeSheet
          onClose={() => setIsDateTimeSheetOpen(false)}
          onDone={(value) => {
            onStartedAtLocalChange(value);
            setIsDateTimeSheetOpen(false);
          }}
          value={startedAtLocal}
        />
      ) : null}
    </section>
  );
}

function MetadataStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="mt-2 truncate text-[1.35rem] font-semibold leading-none tracking-normal text-white">
        {value}
      </p>
    </div>
  );
}

function MetadataStatButton({
  accent = false,
  label,
  onClick,
  value,
}: {
  accent?: boolean;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 text-left transition active:scale-[0.99]"
    >
      <p className="text-sm font-medium tracking-normal text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-[1.35rem] font-semibold leading-none tracking-normal ${
          accent ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </button>
  );
}

function DurationSheet({
  hours,
  minutes,
  onClose,
  onDone,
  seconds,
}: {
  hours: string;
  minutes: string;
  onClose: () => void;
  onDone: (value: DurationChange) => void;
  seconds: string;
}) {
  const initialSelectedMinutes =
    clampWholeNumber(hours, 0, Math.floor(MAX_WORKOUT_DURATION_MINUTES / 60)) *
      60 +
    clampWholeNumber(minutes, 0, 59);
  const [selectedMinutes, setSelectedMinutes] = useState(
    Math.min(initialSelectedMinutes, MAX_WORKOUT_DURATION_MINUTES),
  );
  const secondsAdjustment = parseSignedInteger(seconds) ?? 0;
  const durationOptions = range(0, MAX_WORKOUT_DURATION_MINUTES);

  function applyDuration() {
    const selectedBaseSeconds = selectedMinutes * 60;
    const durationSeconds =
      selectedBaseSeconds >= MAX_WORKOUT_DURATION_SECONDS
        ? MAX_WORKOUT_DURATION_SECONDS
        : durationInputsToSeconds(
            Math.floor(selectedMinutes / 60),
            selectedMinutes % 60,
            secondsAdjustment,
          );

    onDone({
      hours: Math.floor(selectedMinutes / 60).toString(),
      minutes: (selectedMinutes % 60).toString(),
      seconds: (durationSeconds - selectedBaseSeconds).toString(),
    });
  }

  return (
    <MetadataBottomSheet onClose={onClose}>
      <MetadataSheetHeader
        action={
          <button
            type="button"
            onClick={applyDuration}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95"
          >
            Done
          </button>
        }
        onClose={onClose}
        title="Duration"
      />
      <div className="px-5 py-5">
        <div className="mx-auto max-w-[220px]">
          <WheelSelector
            onSelect={setSelectedMinutes}
            options={durationOptions}
            renderOption={formatDurationOption}
            selectedValue={selectedMinutes}
          />
        </div>
      </div>
    </MetadataBottomSheet>
  );
}

function DateTimeSheet({
  onClose,
  onDone,
  value,
}: {
  onClose: () => void;
  onDone: (value: string) => void;
  value: string;
}) {
  const now = useMemo(() => new Date(), []);
  const todayValue = toDateOptionValue(now);
  const initialParts = useMemo(() => readLocalParts(value, now), [now, value]);
  const [selectedDate, setSelectedDate] = useState(initialParts.date);
  const [selectedHour, setSelectedHour] = useState(initialParts.hour);
  const [selectedMinute, setSelectedMinute] = useState(initialParts.minute);
  const isTodaySelected = selectedDate === todayValue;
  const maxHour = isTodaySelected ? now.getHours() : 23;
  const clampedHour = Math.min(selectedHour, maxHour);
  const maxMinute =
    isTodaySelected && clampedHour === maxHour ? now.getMinutes() : 59;
  const clampedMinute = Math.min(selectedMinute, maxMinute);
  const dateOptions = useMemo(
    () => buildDateOptions(selectedDate, now),
    [now, selectedDate],
  );

  return (
    <MetadataBottomSheet onClose={onClose}>
      <MetadataSheetHeader
        action={
          <button
            type="button"
            onClick={() =>
              onDone(
                toClampedLocalDateTimeValue(
                  selectedDate,
                  clampedHour,
                  clampedMinute,
                  new Date(),
                ),
              )
            }
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition active:scale-95"
          >
            Done
          </button>
        }
        onClose={onClose}
        title="When"
      />
      <div className="px-5 pb-5 pt-4">
        <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(64px,0.65fr)_minmax(64px,0.65fr)] items-center gap-1">
          <DateWheelSelector
            ariaLabel="Date"
            onSelect={setSelectedDate}
            options={dateOptions}
            selectedValue={selectedDate}
          />
          <WheelSelector
            ariaLabel="Hour"
            onSelect={setSelectedHour}
            options={range(0, maxHour)}
            pad
            selectedValue={clampedHour}
          />
          <WheelSelector
            ariaLabel="Minute"
            onSelect={setSelectedMinute}
            options={range(0, maxMinute)}
            pad
            selectedValue={clampedMinute}
          />
        </div>
      </div>
    </MetadataBottomSheet>
  );
}

function WheelSelector({
  ariaLabel,
  label,
  onSelect,
  options,
  pad = false,
  renderOption,
  selectedValue,
}: {
  ariaLabel?: string;
  label?: string;
  onSelect: (value: number) => void;
  options: number[];
  pad?: boolean;
  renderOption?: (value: number) => string;
  selectedValue: number;
}) {
  const selectedIndex = Math.max(0, options.indexOf(selectedValue));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimerRef = useRef<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: selectedIndex * ROW_HEIGHT,
      behavior: "auto",
    });
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
    };
  }, []);

  function handleScroll() {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    if (scrollEndTimerRef.current) {
      window.clearTimeout(scrollEndTimerRef.current);
    }

    scrollEndTimerRef.current = window.setTimeout(() => {
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(container.scrollTop / ROW_HEIGHT)),
      );
      const option = options[index];

      if (option !== undefined && option !== selectedValue) {
        onSelect(option);
      }
    }, 80);
  }

  return (
    <div className="min-w-0">
      {label ? (
        <p className="mb-2 h-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </p>
      ) : null}
      <div
        className="relative overflow-hidden rounded-[16px] px-1"
        style={{ height: PICKER_HEIGHT }}
      >
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-9 -translate-y-1/2 rounded-[10px] bg-emerald-500/85 shadow-sm shadow-emerald-950/30" />
        <div
          aria-label={ariaLabel ?? label}
          className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
          ref={scrollRef}
          role="listbox"
          style={{
            paddingBottom: SELECTED_ROW_OFFSET,
            paddingTop: SELECTED_ROW_OFFSET,
          }}
        >
          {options.map((option, index) => (
            <button
              type="button"
              onClick={() => onSelect(option)}
              key={option}
              aria-selected={selectedValue === option}
              className={
                selectedValue === option
                  ? "flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-base font-bold text-white"
                  : `flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-base font-semibold text-zinc-400 transition active:bg-white/[0.05] ${getWheelFadeClassName(index, selectedIndex)}`
              }
              role="option"
              style={{ height: ROW_HEIGHT }}
            >
              {renderOption
                ? renderOption(option)
                : pad
                  ? option.toString().padStart(2, "0")
                  : option}
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[#181818]/80 to-transparent"
          style={{ height: ROW_HEIGHT }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#181818]/80 to-transparent"
          style={{ height: ROW_HEIGHT }}
        />
      </div>
    </div>
  );
}

function DateWheelSelector({
  ariaLabel,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  ariaLabel?: string;
  label?: string;
  onSelect: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  selectedValue: string;
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimerRef = useRef<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: selectedIndex * ROW_HEIGHT,
      behavior: "auto",
    });
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
    };
  }, []);

  function handleScroll() {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    if (scrollEndTimerRef.current) {
      window.clearTimeout(scrollEndTimerRef.current);
    }

    scrollEndTimerRef.current = window.setTimeout(() => {
      const index = Math.min(
        options.length - 1,
        Math.max(0, Math.round(container.scrollTop / ROW_HEIGHT)),
      );
      const option = options[index];

      if (option && option.value !== selectedValue) {
        onSelect(option.value);
      }
    }, 80);
  }

  return (
    <div className="min-w-0">
      {label ? (
        <p className="mb-2 h-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </p>
      ) : null}
      <div
        className="relative overflow-hidden rounded-[16px] px-1"
        style={{ height: PICKER_HEIGHT }}
      >
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-9 -translate-y-1/2 rounded-[10px] bg-emerald-500/85 shadow-sm shadow-emerald-950/30" />
        <div
          aria-label={ariaLabel ?? label}
          className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
          ref={scrollRef}
          role="listbox"
          style={{
            paddingBottom: SELECTED_ROW_OFFSET,
            paddingTop: SELECTED_ROW_OFFSET,
          }}
        >
          {options.map((option, index) => (
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              key={option.value}
              aria-selected={selectedValue === option.value}
              className={
                selectedValue === option.value
                  ? "flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-sm font-bold text-white"
                  : `flex w-full snap-center items-center justify-center rounded-[10px] px-2 text-sm font-semibold text-zinc-400 transition active:bg-white/[0.05] ${getWheelFadeClassName(index, selectedIndex)}`
              }
              role="option"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[#181818]/80 to-transparent"
          style={{ height: ROW_HEIGHT }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#181818]/80 to-transparent"
          style={{ height: ROW_HEIGHT }}
        />
      </div>
    </div>
  );
}

function MetadataSheetHeader({
  action,
  onClose,
  title,
}: {
  action: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <>
      <div className="flex justify-center px-5 py-3">
        <div className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      <div className="relative flex min-h-[48px] items-center justify-between border-b border-white/10 px-5 pb-4">
        <button
          type="button"
          onClick={onClose}
          className="z-10 min-w-[72px] text-left text-sm font-medium text-zinc-400"
        >
          Cancel
        </button>
        <h2 className="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 truncate text-center text-base font-semibold text-white">
          {title}
        </h2>
        <div className="z-10 flex min-w-[72px] justify-end">{action}</div>
      </div>
    </>
  );
}

function MetadataBottomSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="safe-sheet fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section className="safe-sheet-panel relative flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#141414] shadow-2xl shadow-black">
        {children}
      </section>
    </div>
  );
}

function formatWhenLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Set date and time";
  }

  return date.toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function readLocalParts(value: string, maxDate: Date) {
  const date = new Date(value);
  const resolvedDate =
    Number.isNaN(date.getTime()) || date.getTime() > maxDate.getTime()
      ? maxDate
      : date;

  return {
    date: toDateOptionValue(resolvedDate),
    hour: resolvedDate.getHours(),
    minute: resolvedDate.getMinutes(),
  };
}

function buildDateOptions(selectedDateValue: string, maxDate: Date) {
  const selectedDate = new Date(`${selectedDateValue}T12:00`);
  const today = new Date(maxDate);
  today.setHours(12, 0, 0, 0);
  const yearAgo = new Date(today);
  yearAgo.setDate(today.getDate() - 365);
  const startDate =
    !Number.isNaN(selectedDate.getTime()) && selectedDate < yearAgo
      ? selectedDate
      : yearAgo;
  const dayCount = Math.max(
    0,
    Math.floor((today.getTime() - startDate.getTime()) / 86400000),
  );

  return range(0, dayCount).map((offset) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + offset);

    return {
      label: date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        weekday: "short",
        year: "numeric",
      }),
      value: toDateOptionValue(date),
    };
  });
}

function toDateOptionValue(date: Date) {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    "-",
    (date.getMonth() + 1).toString().padStart(2, "0"),
    "-",
    date.getDate().toString().padStart(2, "0"),
  ].join("");
}

function toClampedLocalDateTimeValue(
  dateValue: string,
  hour: number,
  minute: number,
  maxDate: Date,
) {
  const candidate = new Date(
    `${dateValue}T${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`,
  );
  const resolvedDate =
    Number.isNaN(candidate.getTime()) || candidate.getTime() > maxDate.getTime()
      ? maxDate
      : candidate;

  return [
    toDateOptionValue(resolvedDate),
    "T",
    resolvedDate.getHours().toString().padStart(2, "0"),
    ":",
    resolvedDate.getMinutes().toString().padStart(2, "0"),
  ].join("");
}

function formatDurationOption(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}min`;
  }

  return `${hours}h ${minutes}min`;
}

function getWheelFadeClassName(index: number, selectedIndex: number) {
  const distance = Math.abs(index - selectedIndex);

  if (distance === 1) {
    return "opacity-80";
  }

  if (distance === 2) {
    return "opacity-55";
  }

  return "opacity-35";
}

function clampWholeNumber(value: string, min: number, max?: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return min;
  }

  return Math.min(Math.max(parsed, min), max ?? parsed);
}

function parseSignedInteger(value: string) {
  const trimmedValue = value.trim();

  if (!/^-?\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}
