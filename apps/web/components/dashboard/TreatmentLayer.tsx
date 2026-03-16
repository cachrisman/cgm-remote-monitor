"use client";

import type { ReactElement } from "react";
import { Area } from "recharts";

import type { TreatmentPlotPoint } from "./useShortTermChartData";

type TreatmentLayerProps = {
  points: TreatmentPlotPoint<any>[];
  maxAmount: number;
  orientation: "up" | "down";
  color: string;
  smallTextThreshold: number;
  formatValue: (value: number) => string;
  offsetPx?: number;
};

export function renderTreatmentLayer({
  points,
  maxAmount,
  orientation,
  color,
  smallTextThreshold,
  formatValue,
  offsetPx = 26,
}: TreatmentLayerProps): ReactElement | null {
  if (points.length === 0 || maxAmount <= 0) return null;

  return (
    <Area
      yAxisId="glucose"
      dataKey="glucose"
      type="monotone"
      stroke="transparent"
      strokeWidth={0}
      fill="transparent"
      data={points}
      dot={({ cx, cy, payload }) => {
        const payloadWithTreatment = payload as TreatmentPlotPoint<any> | undefined;
        if (
          !payloadWithTreatment ||
          cx === undefined ||
          cy === undefined ||
          Number.isNaN(cx) ||
          Number.isNaN(cy)
        ) {
          return <g key="treatment-empty" />;
        }

        const amount = payloadWithTreatment.amount;

        const minTriangleSize = 5;
        const maxTriangleSize = minTriangleSize * 2.5; // 12px
        const sizeRange = maxTriangleSize - minTriangleSize;
        const normalizedAmount = amount / maxAmount;
        let triangleHeight = minTriangleSize + sizeRange * normalizedAmount;

        triangleHeight = triangleHeight * 1.33;

        const baseFontSize = 15;
        const fontSize = amount < smallTextThreshold ? baseFontSize * 0.67 : baseFontSize;

        const triangleCenterY = orientation === "down" ? cy - offsetPx : cy + offsetPx;
        const trianglePointY =
          orientation === "down"
            ? triangleCenterY + triangleHeight / 2
            : triangleCenterY - triangleHeight / 2;
        const triangleBaseY =
          orientation === "down"
            ? triangleCenterY - triangleHeight / 2
            : triangleCenterY + triangleHeight / 2;

        const triangleHalfWidth = triangleHeight / 2;
        const labelOffset = orientation === "down" ? 15 : 28;
        const textY =
          orientation === "down"
            ? triangleCenterY - labelOffset
            : triangleCenterY + labelOffset;

        return (
          <g key={`treatment-group-${payloadWithTreatment.time}`}>
            <path
              key={`treatment-path-${payloadWithTreatment.time}`}
              d={`M ${cx - triangleHalfWidth} ${triangleBaseY} L ${cx} ${trianglePointY} L ${
                cx + triangleHalfWidth
              } ${triangleBaseY} Z`}
              fill={color}
              stroke="none"
            />
            <text
              key={`treatment-text-${payloadWithTreatment.time}`}
              x={cx}
              y={textY}
              textAnchor="middle"
              fill="white"
              fontSize={fontSize}
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="500"
            >
              {formatValue(amount)}
            </text>
          </g>
        );
      }}
      isAnimationActive={false}
      connectNulls={false}
    />
  );
}
