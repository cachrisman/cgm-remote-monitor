"use client";

import { Tooltip } from "recharts";

import type {
  ChartDatum,
  CarbTreatmentWithNearest,
  InsulinTreatmentWithNearest,
} from "./useShortTermChartData";
import type { ReactElement } from "react";

type ShortTermTooltipProps = {
  activePoint: ChartDatum | null;
  hoverX: number | null;
  activeTimestamp: number | null;
  insulinTreatments: InsulinTreatmentWithNearest[];
  carbTreatments: CarbTreatmentWithNearest[];
  chartData: ChartDatum[];
};

export function renderShortTermTooltip({
  activePoint,
  hoverX,
  activeTimestamp,
  insulinTreatments,
  carbTreatments,
  chartData,
}: ShortTermTooltipProps): ReactElement {
  return (
    <Tooltip
      active={!!activePoint}
      filterNull={false}
      payload={
        activePoint
          ? [
              {
                name: "glucose",
                value: activePoint.glucose ?? undefined,
                payload: activePoint,
              },
            ]
          : []
      }
      position={hoverX !== null ? { x: hoverX, y: 60 } : { y: 60 }}
      cursor={false}
      content={() => {
        if (!activePoint) return null;
        const datum = activePoint;
        // When mouse is to the left of active point, use active point time for basal lookup
        // Otherwise use the mouse timestamp
        const targetTime =
          activeTimestamp !== null && activeTimestamp < datum.time
            ? datum.time
            : activeTimestamp ?? datum.time;

        const treatmentWindow = 2.5 * 60 * 1000;
        const nearbyInsulin = insulinTreatments.filter((t) => {
          const timeDiff = Math.abs((t.time ?? 0) - datum.time);
          return timeDiff <= treatmentWindow;
        });
        const nearbyCarbs = carbTreatments.filter((t) => {
          const timeDiff = Math.abs((t.time ?? 0) - datum.time);
          return timeDiff <= treatmentWindow;
        });

        const deltaValue =
          datum.glucose !== undefined && chartData.length > 1
            ? (() => {
                const idx = chartData.findIndex((d) => d.time === datum.time);
                if (idx <= 0 || chartData[idx - 1].glucose === undefined)
                  return null;
                const d =
                  datum.glucose - (chartData[idx - 1].glucose as number);
                const sign = d > 0 ? "+" : "";
                return `${sign}${Math.round(d)} mg/dL`;
              })()
            : null;

        return (
          <div className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-lg">
            <div className="font-semibold">{datum.displayTime}</div>
            {datum.glucose !== undefined && (
              <div className="text-slate-300">
                Glucose: {Math.round(datum.glucose)} mg/dL
              </div>
            )}
            {deltaValue && <div className="text-slate-300">Δ {deltaValue}</div>}
            {(() => {
              const basalSourceTime = targetTime ?? datum.time;
              let prevBasal: number | undefined;
              let activeStart: ChartDatum | null = null;
              let firstStart: ChartDatum | null = null;

              for (const d of chartData) {
                if (d.basal === undefined) continue;
                const isChange =
                  prevBasal === undefined || d.basal !== prevBasal;
                if (isChange) {
                  if (!firstStart) firstStart = d;
                  if (d.time <= basalSourceTime) {
                    activeStart = d;
                  }
                  prevBasal = d.basal;
                }
              }

              const candidate = activeStart ?? firstStart;
              if (!candidate || candidate.basal === undefined) return null;
              return (
                <div className="text-sky-400">Basal: {candidate.basalDisplay}</div>
              );
            })()}
            {(nearbyInsulin.length > 0 || nearbyCarbs.length > 0) && (
              <div className="mt-2 border-t border-slate-700 pt-2">
                <div className="mb-1 font-semibold text-sky-300">Treatments:</div>
                {nearbyInsulin.map((treatment, idx) => (
                  <div
                    key={`tooltip-treatment-insulin-${treatment.time ?? idx}-${idx}`}
                    className="text-sky-200"
                  >
                    {treatment.eventType}: {(treatment.insulin ?? 0).toFixed(2)}U
                  </div>
                ))}
                {nearbyCarbs.map((treatment, idx) => (
                  <div
                    key={`tooltip-treatment-carbs-${treatment.time ?? idx}-${idx}`}
                    className="text-amber-200"
                  >
                    {treatment.eventType}: {(treatment.carbs ?? 0).toFixed(0)}g
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
