"use client";

import { Area } from "recharts";

import type { ActivePointInfo } from "./useHoverTimestamp";
import type { ChartDatum } from "./useShortTermChartData";
import type { ReactElement } from "react";

type BasalIcicleAreaProps = {
  data: ChartDatum[];
  icicleTop: number;
  hasBasalData: boolean;
  activePointInfo: ActivePointInfo | null;
  activeTimestamp: number | null;
};

export function renderBasalIcicleArea({
  data,
  icicleTop,
  hasBasalData,
  activePointInfo,
  activeTimestamp,
}: BasalIcicleAreaProps): ReactElement | null {
  if (!hasBasalData) return null;

  const activePoint = activePointInfo?.point;

  const highlightBasalTime = (() => {
    // Determine target time: if mouse is to the left of active point, use active point time
    // Otherwise use the mouse timestamp (or active point time as fallback)
    let targetTime: number | null = null;
    if (activePoint && activeTimestamp !== null) {
      // Mouse is to the left if activeTimestamp is before active point time
      targetTime = activeTimestamp < activePoint.time ? activePoint.time : activeTimestamp;
    } else {
      targetTime = activeTimestamp ?? activePoint?.time ?? null;
    }
    if (targetTime === null) return null;

    // Find the ACTIVE basal at targetTime (last change <= targetTime), not the next change
    // Note: We check basal !== undefined (not basalIcicle) to include 0.0U basal points
    let prevBasal: number | undefined;
    let activeBasalValue: number | undefined = undefined;

    // First, find what the active basal value is at targetTime
    for (const d of data) {
      if (d.basal === undefined) continue;
      const isChange = prevBasal === undefined || d.basal !== prevBasal;
      if (isChange) {
        if (d.time <= targetTime) {
          activeBasalValue = d.basal;
        } else {
          break;
        }
        prevBasal = d.basal;
      }
    }

    if (activeBasalValue === undefined) return null;

    // Now find the closest data point to targetTime that has this basal value
    // Prefer points that are at or after targetTime, and only look backwards if necessary
    let closestPoint: ChartDatum | null = null;
    let minTimeDiff = Infinity;
    let bestAfterTarget: ChartDatum | null = null;
    let minAfterDiff = Infinity;

    for (const d of data) {
      if (d.basal === activeBasalValue && d.time !== undefined) {
        const timeDiff = Math.abs(d.time - targetTime);
        
        // Prefer points at or after targetTime
        if (d.time >= targetTime) {
          const afterDiff = d.time - targetTime;
          if (afterDiff < minAfterDiff) {
            minAfterDiff = afterDiff;
            bestAfterTarget = d;
          }
        }
        
        // Also track the absolute closest for fallback
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestPoint = d;
        }
      }
    }

    // Prefer the point at or after targetTime if it's within 10 minutes
    if (bestAfterTarget && minAfterDiff <= 10 * 60 * 1000) {
      return bestAfterTarget;
    }

    // Otherwise, only use the closest point if it's very close (within 5 minutes)
    // This prevents highlighting points that are hours away at the far left
    if (closestPoint && minTimeDiff <= 5 * 60 * 1000) {
      return closestPoint;
    }

    return null;
  })();

  return (
    <Area
      data={data}
      yAxisId="glucose"
      dataKey="basalIcicle"
      type="stepAfter"
      stroke="#0099ff"
      strokeWidth={1}
      fill="url(#basalGradient)"
      fillOpacity={1}
      isAnimationActive={false}
      connectNulls
      baseValue={icicleTop}
      dot={({ cx, cy, payload, index }) => {
        if (cx === undefined || cy === undefined || payload.basal === undefined) {
          return <g key={`basal-empty-${payload.time ?? index}`} />;
        }

        // Compare by time instead of index, since Recharts might filter/transform data
        const isActive =
          highlightBasalTime &&
          payload.time !== undefined &&
          payload.time === highlightBasalTime.time;

        // Only render dots for non-zero basal OR when it's the active highlight (even if 0.0U)
        if (!isActive && (payload.basalIcicle === undefined || payload.basal <= 0)) {
          return <g key={`basal-empty-${payload.time ?? index}`} />;
        }

        return (
          <circle
            key={`basal-dot-${payload.time}`}
            cx={cx}
            cy={cy}
            r={isActive ? 5 : 0}
            fill="white"
            stroke="#0099ff"
            strokeWidth={isActive ? 2 : 0}
            opacity={isActive ? 1 : 0}
          />
        );
      }}
    />
  );
}
