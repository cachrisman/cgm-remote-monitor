"use client";

import clsx from "clsx";

import type { ReactNode } from "react";

type PillProps = {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "critical";
};

type CurrentReadingPanelProps = {
  glucose: string;
  direction?: string | null;
  directionLabel?: string | null;
  timestamp?: string | null;
  recency?: string | null;
  state?: string;
  delta?: string | null;
  iob?: string | null;
  cob?: string | null;
  basal?: string | null;
  pump?: string | null;
  battery?: string | null;
  openaps?: string | null;
  dbUsage?: string | null;
  hoursOptions?: number[];
  selectedHours?: number;
  onSelectHours?: (hours: number) => void;
  debugPanel?: ReactNode;
};

function _Pill({ label, value, tone = "default" }: PillProps) {
  const toneClasses =
    tone === "critical"
      ? "bg-red-500/10 text-red-200 border-red-500/40"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-200 border-amber-400/40"
        : "bg-slate-800/80 text-slate-100 border-slate-700";

  return (
    <span className={clsx("rounded-full border px-3 py-1 text-xs font-medium", toneClasses)}>
      <span className="mr-1 opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function CurrentReadingPanel({
  glucose,
  direction,
  directionLabel,
  timestamp,
  recency,
  state,
  delta,
  iob,
  cob,
  basal,
  pump,
  battery,
  openaps,
  dbUsage,
  hoursOptions = [2, 3, 4, 6, 12, 24],
  selectedHours,
  onSelectHours,
  debugPanel
}: CurrentReadingPanelProps) {
  return (
    <section className="flex w-full items-stretch gap-6 rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-4">
      {/* LEFT: legacy-style status pills + hours */}
      <div className="flex w-72 flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            {timestamp ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            {recency ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            {state ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            Pump {pump ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            Battery {battery ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            OpenAPS {openaps ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            DB {dbUsage ?? "—"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
          <span className="font-semibold uppercase tracking-[0.18em] text-slate-400">Hours:</span>
          <div className="flex flex-wrap gap-1">
            {hoursOptions.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onSelectHours?.(h)}
                className={clsx(
                  "rounded-md border px-2 py-1 text-[11px]",
                  h === selectedHours
                    ? "border-emerald-400 bg-emerald-400 text-slate-900"
                    : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500"
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MIDDLE: big glucose + detail pills */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-baseline gap-4">
          <span className="text-[5rem] font-extrabold leading-none text-emerald-400">
            {glucose ?? "—"}
          </span>
          <span className="text-xl font-semibold text-emerald-400">
            {directionLabel ?? direction ?? ""}
          </span>
        </div>
        <span className="mt-[-0.4rem] text-2xl font-bold uppercase tracking-wide text-emerald-400">
          MG/DL
        </span>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            Δ {delta ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            IOB {iob ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            COB {cob ?? "—"}
          </span>
          <span className="rounded-lg bg-slate-800/80 px-3 py-1 text-xs text-slate-100 shadow-inner">
            Basal {basal ?? "—"}
          </span>
        </div>
      </div>

      {/* RIGHT: debug panel */}
      {debugPanel && (
        <div className="flex w-[576px] shrink-0 flex-col">
          {debugPanel}
        </div>
      )}
    </section>
  );
}
