"use client";

import { useEffect, useRef } from "react";
import { CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import type { BasalDataPoint } from "@/lib/basal-data";
import type { GlucoseThresholds } from "@/lib/glucose-colors";
import type { GlucoseValue } from "@/lib/nightscout-client";

import { renderBasalIcicleArea } from "./BasalIcicleArea";
import { renderGlucoseDots } from "./GlucoseDots";
import { renderShortTermTooltip } from "./ShortTermTooltip";
import { renderTreatmentLayer } from "./TreatmentLayer";
import { useHoverTimestamp, type ActivePointInfo } from "./useHoverTimestamp";
import {
  useShortTermChartData,
  type Treatment,
  type ChartDatum,
} from "./useShortTermChartData";

type ShortTermChartProps = {
  entries: GlucoseValue[];
  basalData: BasalDataPoint[];
  treatments?: Treatment[];
  thresholds: GlucoseThresholds;
  selectedHours: number;
  startTime: number;
  endTime: number;
  onDebugInfo?: (info: {
    activePointInfo: ActivePointInfo | null;
    activeTimestamp: number | null;
    data: ChartDatum[];
  }) => void;
};

export function ShortTermChart({
  entries,
  basalData,
  treatments: _treatments = [],
  thresholds,
  selectedHours,
  startTime,
  endTime,
  onDebugInfo,
}: ShortTermChartProps) {
  const {
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
  } = useShortTermChartData({
    entries,
    basalData,
    treatments: _treatments,
    startTime,
    endTime,
    selectedHours,
  });

  const now = Date.now();

  const {
    containerRef,
    hoverX,
    activePointInfo,
    activeTimestamp,
    handleMouseMove,
    handleMouseLeave,
  } = useHoverTimestamp({
    startTime,
    endTime,
    data: icicleChartData,
  });

  const activePoint = activePointInfo?.point || null;
  const hasGlucoseData = icicleChartData.some((d) => d.glucose !== undefined);
  const hasBasalIcicle = hasBasalData && icicleChartData.some((d) => d.basalIcicle !== undefined);
  const hasInsulin = insulinPlotPoints.length > 0;
  const hasCarbs = carbPlotPoints.length > 0;

  // Store latest data in ref to avoid infinite loops
  const dataRef = useRef(icicleChartData);
  dataRef.current = icicleChartData;

  // Store previous values to avoid unnecessary updates
  const prevActivePointInfoRef = useRef(activePointInfo);
  const prevActiveTimestampRef = useRef(activeTimestamp);

  // Expose debug info to parent component
  useEffect(() => {
    // Only update if values actually changed
    const activePointChanged =
      activePointInfo?.point?.time !== prevActivePointInfoRef.current?.point?.time ||
      activePointInfo?.index !== prevActivePointInfoRef.current?.index;
    const timestampChanged = activeTimestamp !== prevActiveTimestampRef.current;

    if (onDebugInfo && (activePointChanged || timestampChanged)) {
      prevActivePointInfoRef.current = activePointInfo;
      prevActiveTimestampRef.current = activeTimestamp;

      onDebugInfo({
        activePointInfo,
        activeTimestamp,
        data: dataRef.current,
      });
    }
  }, [onDebugInfo, activePointInfo, activeTimestamp]);

  if (chartData.length === 0 || (!hasGlucoseData && !hasBasalIcicle && !hasInsulin && !hasCarbs)) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-800/70 bg-slate-950/60 text-sm text-slate-400">
        No data available for the selected window
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={icicleChartData}
          margin={{ top: 10, right: 0, bottom: 20, left: 0 }}
        >
          <defs>
            {/* Gradient for icicle: darker at top (where it hangs from), lighter at bottom */}
            <linearGradient id="basalGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0099ff" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#0099ff" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="#1f2937"
            strokeDasharray="2 2"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            type="number"
            domain={[startTime, endTime]}
            ticks={timeTicks.filter(t => t >= startTime && t <= endTime)}
            tickFormatter={(value) => formatTimeTick(value, selectedHours)}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDataOverflow
          />

          <YAxis
            yAxisId="glucose"
            type="number"
            orientation="right"
            domain={glucoseDomain}
            ticks={glucoseTicks}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            mirror
          />

          {renderBasalIcicleArea({
            data: icicleChartData,
            icicleTop,
            hasBasalData,
            activePointInfo,
            activeTimestamp,
          })}

          <ReferenceLine
            yAxisId="glucose"
            y={thresholds.bgTargetTop}
            stroke="#6b7280"
            strokeDasharray="3 3"
            strokeWidth={1}
          />

          <ReferenceLine
            yAxisId="glucose"
            y={thresholds.bgTargetBottom}
            stroke="#6b7280"
            strokeDasharray="3 3"
            strokeWidth={1}
          />

          <ReferenceLine
            yAxisId="glucose"
            x={now}
            stroke="#6b7280"
            strokeDasharray="3 3"
            strokeWidth={1}
          />

          {renderGlucoseDots({
            data: icicleChartData,
            thresholds,
            activePointInfo,
          })}

          {renderTreatmentLayer({
            points: insulinPlotPoints,
            maxAmount: maxInsulin,
            orientation: "down",
            color: "#5A90E9",
            smallTextThreshold: 1,
            formatValue: (val) => val.toFixed(2),
          })}

          {renderTreatmentLayer({
            points: carbPlotPoints,
            maxAmount: maxCarbs,
            orientation: "up",
            color: "#E49A55",
            smallTextThreshold: 15,
            formatValue: (val) => val.toFixed(0),
          })}

          {activePoint && (
            <ReferenceLine
              x={activePoint.time}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
              yAxisId="glucose"
            />
          )}

          {renderShortTermTooltip({
            activePoint,
            hoverX,
            activeTimestamp,
            insulinTreatments,
            carbTreatments,
            chartData,
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
