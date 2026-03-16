"use client";

import { useMemo } from "react";

import type { BasalDataPoint } from "@/lib/basal-data";
import type { GlucoseValue } from "@/lib/nightscout-client";

export type Treatment = {
  eventType?: string;
  insulin?: number;
  created_at?: string;
  carbs?: number;
  note?: string;
  time?: number;
  [key: string]: unknown;
};

export type ChartDatum = {
  time: number;
  displayTime: string;
  glucose?: number;
  basal?: number;
  basalDisplay?: string;
  basalIcicle?: number;
};

export type TreatmentPlotPoint<T extends TreatmentWithNearest> = {
  time: number;
  glucose: number;
  amount: number;
  treatment: T;
};

export type InsulinTreatmentWithNearest = Treatment & {
  insulin: number;
  time: number;
  nearestGlucosePoint: ChartDatum | null;
};
export type CarbTreatmentWithNearest = Treatment & {
  carbs: number;
  time: number;
  nearestGlucosePoint: ChartDatum | null;
};

function formatTimeTick(timestamp: number, selectedHours: number): string {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();

  if (selectedHours <= 3) {
    if (minutes === 0) {
      return date.toLocaleTimeString([], { hour: "numeric" });
    } else if (minutes === 30) {
      return date
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        .replace(/ [AP]M/i, "");
    }
    return "";
  } else if (selectedHours <= 6) {
    if (minutes === 0) {
      return date.toLocaleTimeString([], { hour: "numeric" });
    }
    return "";
  } else {
    if (minutes === 0 && date.getHours() % 3 === 0) {
      return date.toLocaleTimeString([], { hour: "numeric" });
    }
    return "";
  }
}

function generateTimeTicks(
  minTime: number,
  maxTime: number,
  selectedHours: number
): number[] {
  const ticks: number[] = [];

  let intervalMs: number;
  if (selectedHours <= 3) {
    intervalMs = 30 * 60 * 1000;
  } else if (selectedHours <= 6) {
    intervalMs = 60 * 60 * 1000;
  } else {
    intervalMs = 3 * 60 * 60 * 1000;
  }

  const startMs = Math.floor(minTime / intervalMs) * intervalMs;

  for (let t = startMs; t <= maxTime; t += intervalMs) {
    if (t >= minTime) {
      ticks.push(t);
    }
  }

  return ticks;
}

function mergeChartData(
  entries: GlucoseValue[],
  basalData: BasalDataPoint[],
  startTime: number,
  endTime: number
): ChartDatum[] {
  const timeSet = new Set<number>();

  entries.forEach((e) => {
    const ts = new Date(e.measuredAt).getTime();
    if (ts >= startTime && ts <= endTime) {
      timeSet.add(ts);
    }
  });

  basalData.forEach((b) => {
    if (b.time >= startTime && b.time <= endTime) {
      timeSet.add(b.time);
    }
  });

  const times = Array.from(timeSet).sort((a, b) => a - b);

  const glucoseByTime = new Map<number, number>();
  entries.forEach((e) => {
    const ts = new Date(e.measuredAt).getTime();
    glucoseByTime.set(ts, e.mgdl);
  });

  const chartData: ChartDatum[] = [];
  let currentBasal = 0;
  let basalIndex = 0;

  for (const t of times) {
    // Update currentBasal if we've passed a basal change point
    while (basalIndex < basalData.length && basalData[basalIndex].time <= t) {
      currentBasal = basalData[basalIndex].rate;
      basalIndex++;
    }

    // Check if this time point is exactly a basal change point
    const isBasalChangePoint = basalData.some(b => b.time === t);

    chartData.push({
      time: t,
      displayTime: new Date(t).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
      glucose: glucoseByTime.get(t),
      // Include basal if > 0 OR if this is a basal change point (to ensure change points are visible)
      basal: (currentBasal > 0 || isBasalChangePoint) ? currentBasal : undefined,
      basalDisplay: (currentBasal > 0 || isBasalChangePoint) ? `${currentBasal.toFixed(2)}U` : undefined,
    });
  }

  return chartData;
}

export function useShortTermChartData({
  entries,
  basalData,
  treatments,
  startTime,
  endTime,
  selectedHours,
}: {
  entries: GlucoseValue[];
  basalData: BasalDataPoint[];
  treatments: Treatment[];
  startTime: number;
  endTime: number;
  selectedHours: number;
}) {
  const chartData = useMemo(
    () => mergeChartData(entries, basalData, startTime, endTime),
    [entries, basalData, startTime, endTime]
  );

  const insulinTreatments = useMemo<InsulinTreatmentWithNearest[]>(() => {
    const filtered = treatments
      .filter((t) => {
        const eventType = t.eventType;
        return (
          (eventType === "Bolus" ||
            eventType === "SMB" ||
            eventType === "External Insulin") &&
          t.insulin !== undefined &&
          t.insulin > 0 &&
          t.created_at
        );
      })
      .map((t) => {
        const time = new Date(t.created_at!).getTime();
        const glucosePoints = chartData.filter((d) => d.glucose !== undefined);
        let nearestGlucosePoint: ChartDatum | null = null;
        if (glucosePoints.length > 0) {
          nearestGlucosePoint = glucosePoints.reduce((closest, current) => {
            const currentDiff = Math.abs(current.time - time);
            const closestDiff = Math.abs(closest.time - time);
            return currentDiff < closestDiff ? current : closest;
          });
        }

        return {
          ...t,
          time,
          insulin: Number(t.insulin),
          nearestGlucosePoint,
        } as InsulinTreatmentWithNearest;
      })
      .filter(
        (t) =>
          t.time >= startTime &&
          t.time <= endTime &&
          t.nearestGlucosePoint !== null
      );

    return filtered;
  }, [treatments, chartData, startTime, endTime]);

  const carbTreatments = useMemo<CarbTreatmentWithNearest[]>(() => {
    const filtered = treatments
      .filter(
        (t) =>
          t.eventType === "Carb Correction" &&
          t.carbs !== undefined &&
          t.carbs > 0 &&
          t.created_at
      )
      .map((t) => {
        const time = new Date(t.created_at!).getTime();
        const glucosePoints = chartData.filter((d) => d.glucose !== undefined);
        let nearestGlucosePoint: ChartDatum | null = null;
        if (glucosePoints.length > 0) {
          nearestGlucosePoint = glucosePoints.reduce((closest, current) => {
            const currentDiff = Math.abs(current.time - time);
            const closestDiff = Math.abs(closest.time - time);
            return currentDiff < closestDiff ? current : closest;
          });
        }
        return {
          ...t,
          time,
          carbs: Number(t.carbs),
          nearestGlucosePoint,
        } as CarbTreatmentWithNearest;
      })
      .filter(
        (t) =>
          t.time >= startTime &&
          t.time <= endTime &&
          t.nearestGlucosePoint !== null
      );

    return filtered;
  }, [treatments, chartData, startTime, endTime]);

  const maxInsulin = useMemo(() => {
    if (insulinTreatments.length === 0) return 1;
    return Math.max(...insulinTreatments.map((t) => t.insulin!));
  }, [insulinTreatments]);
  const maxCarbs = useMemo(() => {
    if (carbTreatments.length === 0) return 1;
    return Math.max(...carbTreatments.map((t) => t.carbs!));
  }, [carbTreatments]);

  const glucoseValues = chartData
    .filter((d) => d.glucose !== undefined)
    .map((d) => d.glucose as number);
  const minGlucose =
    glucoseValues.length > 0 ? Math.min(...glucoseValues, 40) : 40;
  const maxGlucose =
    glucoseValues.length > 0 ? Math.max(...glucoseValues, 250) : 250;
  const glucoseDomain: [number, number] = [
    Math.min(40, minGlucose),
    Math.max(250, maxGlucose),
  ];
  const glucoseTicks = [40, 80, 120, 160, 200, 240];

  const basalValues = chartData
    .filter((d) => d.basal !== undefined && d.basal > 0)
    .map((d) => d.basal as number);
  const maxBasal = basalValues.length > 0 ? Math.max(...basalValues) : 0;
  const hasBasalData = maxBasal > 0;

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    const basalPointsCount = chartData.filter(d => d.basal !== undefined).length;
    const nonZeroBasalCount = basalValues.length;
    if (basalData.length > 0 && !hasBasalData) {
      console.warn('[basal] Basal data points exist but chart shows no basal:', {
        basalDataPoints: basalData.length,
        chartDataPoints: chartData.length,
        pointsWithBasal: basalPointsCount,
        nonZeroBasalPoints: nonZeroBasalCount,
        maxBasal,
        sampleBasalValues: chartData.filter(d => d.basal !== undefined).slice(0, 5).map(d => ({ time: d.time, basal: d.basal }))
      });
    }
  }

  const glucoseRange = glucoseDomain[1] - glucoseDomain[0];
  const icicleHeight = glucoseRange * 0.25;
  const icicleTop = glucoseDomain[1];

  const icicleChartData = useMemo(() => {
    const safeMaxBasal = maxBasal > 0 ? maxBasal : 1;
    return chartData.map((d) => ({
      ...d,
      basalIcicle:
        d.basal !== undefined
          ? icicleTop - (d.basal / safeMaxBasal) * icicleHeight
          : undefined,
    }));
  }, [chartData, icicleTop, icicleHeight, maxBasal]);

  const timeTicks = useMemo(
    () => generateTimeTicks(startTime, endTime, selectedHours),
    [startTime, endTime, selectedHours]
  );

  const insulinPlotPoints: TreatmentPlotPoint<InsulinTreatmentWithNearest>[] = useMemo(
    () =>
      insulinTreatments
        .filter((treatment) => treatment.nearestGlucosePoint !== null)
        .map((treatment) => {
          const glucosePoint = chartData.find(
            (d) =>
              d.time === treatment.nearestGlucosePoint!.time &&
              d.glucose !== undefined
          );
          if (!glucosePoint) return null;

          return {
            time: treatment.time,
            glucose: glucosePoint.glucose as number,
            amount: treatment.insulin,
            treatment: {
              ...treatment,
              nearestGlucosePoint: treatment.nearestGlucosePoint!,
            },
          };
        })
        .filter(
          (d): d is TreatmentPlotPoint<InsulinTreatmentWithNearest> =>
            d !== null
        ),
    [insulinTreatments, chartData]
  );

  const carbPlotPoints: TreatmentPlotPoint<CarbTreatmentWithNearest>[] =
    useMemo(
      () =>
        carbTreatments
          .filter((treatment) => treatment.nearestGlucosePoint !== null)
          .map((treatment) => {
            const glucosePoint = chartData.find(
              (d) =>
                d.time === treatment.nearestGlucosePoint!.time &&
                d.glucose !== undefined
            );
            if (!glucosePoint) return null;

            return {
              time: treatment.time,
              glucose: glucosePoint.glucose as number,
              amount: treatment.carbs,
              treatment: {
                ...treatment,
                nearestGlucosePoint: treatment.nearestGlucosePoint!,
              },
            };
          })
          .filter(
            (d): d is TreatmentPlotPoint<CarbTreatmentWithNearest> =>
              d !== null
          ),
      [carbTreatments, chartData]
    );

  return {
    chartData,
    icicleChartData,
    insulinTreatments,
    carbTreatments,
    insulinPlotPoints,
    carbPlotPoints,
    glucoseDomain,
    glucoseTicks,
    hasBasalData,
    icicleTop,
    maxInsulin,
    maxCarbs,
    timeTicks,
    formatTimeTick,
  };
}
