import type { GlucoseEntry } from "./dedupe";

function toNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function normalizeGlucoseEntry(raw: Record<string, unknown> | null | undefined): GlucoseEntry | null {
  if (!raw) return null;

  const mgdl =
    toNumber(raw.mgdl) ??
    toNumber(raw.sgv) ??
    toNumber(raw.glucose) ??
    toNumber(raw.value);

  const measuredAt =
    toIsoString(raw.measuredAt) ??
    toIsoString(raw.dateString) ??
    toIsoString(raw.sysTime) ??
    toIsoString(raw.date);

  if (mgdl === null || measuredAt === null) return null;

  return {
    mgdl,
    direction: typeof raw.direction === "string" ? raw.direction : null,
    measuredAt
  };
}
