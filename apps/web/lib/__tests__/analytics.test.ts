import { calculateGlucoseMetrics } from "../analytics";
import type { GlucoseValue } from "../nightscout-client";

describe("calculateGlucoseMetrics", () => {
  const entries: GlucoseValue[] = [
    { mgdl: 120, direction: "Flat", measuredAt: "2024-01-01T00:00:00Z" },
    { mgdl: 95, direction: "FortyFiveUp", measuredAt: "2024-01-01T00:05:00Z" },
    { mgdl: 210, direction: "FortyFiveDown", measuredAt: "2024-01-01T00:10:00Z" }
  ];

  it("calculates percentages and summary stats with defaults", () => {
    const metrics = calculateGlucoseMetrics(entries);

    expect(metrics.timeInRange).toBe(67);
    expect(metrics.averageMgdl).toBe(142);
    expect(metrics.min).toBe(95);
    expect(metrics.max).toBe(210);
  });

  it("respects a custom glucose range", () => {
    const metrics = calculateGlucoseMetrics(entries, { lower: 80, upper: 140 });

    expect(metrics.timeInRange).toBe(67);
  });

  it("handles empty inputs", () => {
    const metrics = calculateGlucoseMetrics([]);

    expect(metrics).toEqual({
      timeInRange: 0,
      averageMgdl: null,
      min: null,
      max: null
    });
  });

  it("ignores entries without numeric values", () => {
    const metrics = calculateGlucoseMetrics([
      { mgdl: Number.NaN, direction: "Flat", measuredAt: "2024-01-01" }
    ] as GlucoseValue[]);

    expect(metrics).toEqual({
      timeInRange: 0,
      averageMgdl: null,
      min: null,
      max: null
    });
  });
});
