"use client";

import { useMemo, useRef } from "react";

import type { ActivePointInfo } from "./useHoverTimestamp";
import type { ChartDatum } from "./useShortTermChartData";

type BasalDebugPanelProps = {
  data: ChartDatum[];
  activePointInfo: ActivePointInfo | null;
  activeTimestamp: number | null;
};

type DebugInfo = {
  hasData: boolean;
  activePointTime: number | null;
  mouseTimestamp: number | null;
  targetTime: number | null;
  activeBasalValue: number | null | undefined;
  highlightPoint: {
    time: number;
    basal: number;
    basalIcicle: number | undefined;
    timeDiff: number;
  } | null;
  mousePosition: "left" | "right" | null;
  basalChanges: Array<{ time: number; basal: number }>;
};

export function BasalDebugPanel({
  data,
  activePointInfo,
  activeTimestamp,
}: BasalDebugPanelProps) {
  // Keep last debug info when mouse leaves
  const lastDebugInfoRef = useRef<DebugInfo | null>(null);

  const debugInfo = useMemo(() => {
    const activePoint = activePointInfo?.point;

    // Determine target time
    let targetTime: number | null = null;
    if (activePoint && activeTimestamp !== null) {
      targetTime = activeTimestamp < activePoint.time ? activePoint.time : activeTimestamp;
    } else {
      targetTime = activeTimestamp ?? activePoint?.time ?? null;
    }

    if (targetTime === null) {
      const noDataInfo: DebugInfo = {
        hasData: false,
        activePointTime: null,
        mouseTimestamp: activeTimestamp,
        targetTime: null,
        activeBasalValue: null,
        highlightPoint: null,
        mousePosition: activeTimestamp !== null && activePoint ? (activeTimestamp < activePoint.time ? "left" : "right") : null,
        basalChanges: [],
      };
      // Update ref if mouse is active
      if (activeTimestamp !== null) {
        lastDebugInfoRef.current = noDataInfo;
        return noDataInfo;
      }
      // Return last info if mouse left
      return lastDebugInfoRef.current ?? noDataInfo;
    }

    // Find active basal value
    let prevBasal: number | undefined;
    let activeBasalValue: number | undefined = undefined;
    const basalChanges: Array<{ time: number; basal: number }> = [];

    for (const d of data) {
      if (d.basal === undefined) continue;
      const isChange = prevBasal === undefined || d.basal !== prevBasal;
      if (isChange) {
        basalChanges.push({ time: d.time, basal: d.basal });
        if (d.time <= targetTime) {
          activeBasalValue = d.basal;
        } else {
          break;
        }
        prevBasal = d.basal;
      }
    }

    // Find highlight point
    let closestPoint: ChartDatum | null = null;
    let minTimeDiff = Infinity;
    let bestAfterTarget: ChartDatum | null = null;
    let minAfterDiff = Infinity;

    if (activeBasalValue !== undefined) {
      for (const d of data) {
        if (d.basal === activeBasalValue && d.time !== undefined) {
          const timeDiff = Math.abs(d.time - targetTime);

          if (d.time >= targetTime) {
            const afterDiff = d.time - targetTime;
            if (afterDiff < minAfterDiff) {
              minAfterDiff = afterDiff;
              bestAfterTarget = d;
            }
          }

          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPoint = d;
          }
        }
      }
    }

    const highlightPoint =
      bestAfterTarget && minAfterDiff <= 10 * 60 * 1000
        ? bestAfterTarget
        : closestPoint && minTimeDiff <= 5 * 60 * 1000
          ? closestPoint
          : null;

    const info: DebugInfo = {
      hasData: true,
      activePointTime: activePoint?.time ?? null,
      mouseTimestamp: activeTimestamp,
      targetTime,
      activeBasalValue,
      highlightPoint: highlightPoint
        ? {
            time: highlightPoint.time,
            basal: highlightPoint.basal ?? 0,
            basalIcicle: highlightPoint.basalIcicle,
            timeDiff: Math.min(minAfterDiff, minTimeDiff),
          }
        : null,
      mousePosition:
        activeTimestamp !== null && activePoint
          ? activeTimestamp < activePoint.time
            ? "left"
            : "right"
          : null,
      basalChanges: basalChanges.slice(-5), // Last 5 changes
    };

    // Update ref when we have data or mouse is active
    if (info.hasData || activeTimestamp !== null) {
      lastDebugInfoRef.current = info;
      return info;
    }
    // Return last info if mouse left
    return lastDebugInfoRef.current ?? info;
  }, [data, activePointInfo, activeTimestamp]);

  // Find all points with the active basal value within the active segment
  const activeBasalPoints = useMemo(() => {
    if (!debugInfo.hasData || debugInfo.activeBasalValue === undefined || debugInfo.activeBasalValue === null || debugInfo.targetTime === null) {
      return [];
    }

    // Find the boundaries of the active basal segment
    // Segment starts at the last change before/at targetTime
    // Segment ends at the next change after targetTime
    let segmentStart: number | null = null;
    let segmentEnd: number | null = null;
    let prevBasal: number | undefined;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.basal === undefined || d.time === undefined) continue;
      
      const isChange = prevBasal === undefined || d.basal !== prevBasal;
      
      if (isChange) {
        if (d.time <= debugInfo.targetTime) {
          // This is the start of the active segment
          segmentStart = d.time;
        } else if (segmentStart !== null && segmentEnd === null) {
          // This is the end of the active segment
          segmentEnd = d.time;
          break;
        }
        prevBasal = d.basal;
      }
    }

    // If no end found, segment extends to the end of data
    if (segmentStart !== null && segmentEnd === null) {
      segmentEnd = data[data.length - 1]?.time ?? null;
    }

    // Only include points within the active segment that have the active basal value
    const points: Array<{
      time: number;
      basal: number;
      basalIcicle: number | undefined;
      isSelected: boolean;
      isVisible: boolean;
    }> = [];

    for (const d of data) {
      if (
        d.basal === debugInfo.activeBasalValue &&
        d.time !== undefined &&
        segmentStart !== null &&
        d.time >= segmentStart &&
        (segmentEnd === null || d.time < segmentEnd)
      ) {
        // Use time comparison with small tolerance for floating point precision
        const isSelected = debugInfo.highlightPoint?.time !== undefined && 
          d.time !== undefined &&
          Math.abs(debugInfo.highlightPoint.time - d.time) < 1000; // Within 1 second
        
        // Point is "visible" (rendered) if it has basalIcicle (non-zero) OR is selected
        const isVisible = d.basalIcicle !== undefined || isSelected;

        points.push({
          time: d.time,
          basal: d.basal,
          basalIcicle: d.basalIcicle,
          isSelected,
          isVisible,
        });
      }
    }

    return points;
  }, [data, debugInfo.hasData, debugInfo.activeBasalValue, debugInfo.targetTime, debugInfo.highlightPoint?.time]);

  if (!debugInfo.hasData && !lastDebugInfoRef.current) {
    return null;
  }

  const formatTime = (time: number | null) => {
    if (time === null) return "null";
    return new Date(time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatTimeDiff = (ms: number | null) => {
    if (ms === null) return "null";
    const mins = Math.round(ms / 60000);
    return `${mins} min`;
  };

  return (
    <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-3 text-xs">
      <div className="mb-2 font-semibold uppercase tracking-wide text-purple-300">
        Debug: Basal Highlight
      </div>
      <div className="grid grid-cols-3 gap-2 text-purple-200">
        <div>
          <span className="text-purple-400">Mouse Pos:</span>{" "}
          {debugInfo.mousePosition ?? "—"}
        </div>
        <div>
          <span className="text-purple-400">Active Point:</span>{" "}
          {formatTime(debugInfo.activePointTime)}
        </div>
        <div>
          <span className="text-purple-400">Mouse Time:</span>{" "}
          {formatTime(debugInfo.mouseTimestamp)}
        </div>
        <div>
          <span className="text-purple-400">Target Time:</span>{" "}
          {formatTime(debugInfo.targetTime)}
        </div>
        <div>
          <span className="text-purple-400">Active Basal:</span>{" "}
          {debugInfo.activeBasalValue !== undefined && debugInfo.activeBasalValue !== null
            ? `${debugInfo.activeBasalValue.toFixed(2)}U`
            : "—"}
        </div>
        <div>
          <span className="text-purple-400">Highlight Time:</span>{" "}
          {formatTime(debugInfo.highlightPoint?.time ?? null)}
        </div>
        <div>
          <span className="text-purple-400">Highlight Basal:</span>{" "}
          {debugInfo.highlightPoint?.basal !== undefined
            ? `${debugInfo.highlightPoint.basal.toFixed(2)}U`
            : "—"}
        </div>
        <div>
          <span className="text-purple-400">Time Diff:</span>{" "}
          {formatTimeDiff(debugInfo.highlightPoint?.timeDiff ?? null)}
        </div>
      </div>

      {/* Bottom section: Recent Changes and Active Basal Points side by side */}
      {(debugInfo.basalChanges && debugInfo.basalChanges.length > 0) || activeBasalPoints.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-purple-500/20 pt-2">
          {debugInfo.basalChanges && debugInfo.basalChanges.length > 0 && (
            <div className="col-span-1">
              <span className="text-purple-400">Recent Changes:</span>
              <div className="mt-1 space-y-0.5">
                {debugInfo.basalChanges.map((change: { time: number; basal: number }, idx: number) => (
                  <div key={idx} className="text-purple-300">
                    {formatTime(change.time)} → {change.basal.toFixed(2)}U
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeBasalPoints.length > 0 && (
            <div className={debugInfo.basalChanges && debugInfo.basalChanges.length > 0 ? "col-span-2" : "col-span-3"}>
              <span className="text-purple-400">Active Basal Points ({activeBasalPoints.length}):</span>
              <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {activeBasalPoints.map((point, idx) => (
                  <div
                    key={idx}
                    className={point.isSelected ? "text-purple-100 font-semibold" : "text-purple-300"}
                  >
                    {formatTime(point.time)} → {point.basal.toFixed(2)}U
                    {point.isSelected && (
                      <span className="ml-2 text-xs text-purple-400">[SELECTED - middle dot]</span>
                    )}
                    {!point.isSelected && point.isVisible && (
                      <span className="ml-2 text-xs text-purple-400">[visible - white dot]</span>
                    )}
                    {!point.isSelected && !point.isVisible && (
                      <span className="ml-2 text-xs text-purple-400">[hidden]</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

