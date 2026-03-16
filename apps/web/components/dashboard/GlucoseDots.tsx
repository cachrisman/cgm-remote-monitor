"use client";

import type { ReactElement } from "react";
import { Area } from "recharts";

import { getGlucoseColor } from "@/lib/glucose-colors";

import type { GlucoseThresholds } from "@/lib/glucose-colors";
import type { ActivePointInfo } from "./useHoverTimestamp";
import type { ChartDatum } from "./useShortTermChartData";

type GlucoseDotsProps = {
  data: ChartDatum[];
  thresholds: GlucoseThresholds;
  activePointInfo: ActivePointInfo | null;
};

export function renderGlucoseDots({
  data,
  thresholds,
  activePointInfo,
}: GlucoseDotsProps): ReactElement {
  const activePoint = activePointInfo?.point;
  const activeIndex = activePointInfo?.index ?? -1;

  return (
    <Area
      data={data}
      yAxisId="glucose"
      dataKey="glucose"
      type="monotone"
      stroke="transparent"
      strokeWidth={0}
      fill="transparent"
      dot={({ cx, cy, payload, index }) => {
        if (payload.glucose === undefined || cx === undefined || cy === undefined) {
          return <g key={`glucose-empty-${payload.time ?? index}`} />;
        }
        const color = getGlucoseColor(payload.glucose, thresholds);

        const isActive =
          !!activePoint &&
          activeIndex != null &&
          typeof index === "number" &&
          index === activeIndex &&
          activePoint.time === payload.time &&
          activePoint.glucose === payload.glucose;

        return (
          <circle
            key={`glucose-dot-${payload.time ?? index}`}
            cx={cx}
            cy={cy}
            r={4}
            fill={color}
            stroke={isActive ? "white" : "#0f172a"}
            strokeWidth={isActive ? 2 : 1}
          />
        );
      }}
      isAnimationActive={false}
      connectNulls={false}
    />
  );
}
