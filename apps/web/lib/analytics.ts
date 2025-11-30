import type { GlucoseValue } from "./nightscout-client";

export type GlucoseMetrics = {
  timeInRange: number;
  averageMgdl: number | null;
  min: number | null;
  max: number | null;
};

const DEFAULT_RANGE = {
  lower: 70,
  upper: 180
};

export function calculateGlucoseMetrics(
  entries: GlucoseValue[],
  range: { lower: number; upper: number } = DEFAULT_RANGE
): GlucoseMetrics {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      timeInRange: 0,
      averageMgdl: null,
      min: null,
      max: null
    };
  }

  const boundedEntries = entries.filter((entry) =>
    Number.isFinite(entry.mgdl)
  );

  if (boundedEntries.length === 0) {
    return {
      timeInRange: 0,
      averageMgdl: null,
      min: null,
      max: null
    };
  }

  const values = boundedEntries.map((entry) => entry.mgdl);
  const inRange = boundedEntries.filter(
    (entry) => entry.mgdl >= range.lower && entry.mgdl <= range.upper
  ).length;

  const sum = values.reduce((acc, value) => acc + value, 0);

  return {
    timeInRange: Math.round((inRange / boundedEntries.length) * 100),
    averageMgdl: Math.round(sum / boundedEntries.length),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}
