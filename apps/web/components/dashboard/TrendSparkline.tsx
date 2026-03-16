"use client";

import { useId, useMemo } from "react";

import type { GlucoseValue } from "@/lib/nightscout-client";

type TrendSparklineProps = {
  entries: GlucoseValue[];
};

const WIDTH = 140;
const HEIGHT = 90;
const PADDING = { top: 8, bottom: 22, left: 8, right: 28 };

function niceStep(range: number, targetSteps = 4) {
  const rough = range / targetSteps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  if (residual >= 5) return 5 * magnitude;
  if (residual >= 2) return 2 * magnitude;
  return magnitude;
}

function buildYScale(values: number[]) {
  if (values.length === 0) return { min: 0, max: 1, ticks: [0, 1] };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const step = niceStep(range);
  const scaledMin = Math.floor(min / step) * step;
  const scaledMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let value = scaledMin; value <= scaledMax; value += step) {
    ticks.push(value);
  }

  return { min: scaledMin, max: scaledMax, ticks };
}

export function TrendSparkline({ entries }: TrendSparklineProps) {
  const gradientId = useId();

  const { path, yTicks, xTicks } = useMemo(() => {
    if (entries.length === 0) {
      return { path: "", yTicks: [], xTicks: [] };
    }

    const values = entries.map((entry) => entry.mgdl);
    const yScale = buildYScale(values);
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const xStep = innerWidth / Math.max(entries.length - 1, 1);

    const toY = (value: number) =>
      PADDING.top +
      innerHeight -
      ((value - yScale.min) / Math.max(yScale.max - yScale.min, 1)) * innerHeight;

    const commands = values.map((value, index) => {
      const x = PADDING.left + index * xStep;
      const y = toY(value);

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    const xTicks = entries.length <= 1 ? [] : [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const i = Math.min(entries.length - 1, Math.round((entries.length - 1) * p));
      return {
        x: PADDING.left + i * xStep,
        label: new Date(entries[i].measuredAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit"
        })
      };
    });

    return { path: commands.join(" "), yTicks: yScale.ticks, xTicks };
  }, [entries]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" aria-hidden="true">
      <g>
        <line
          x1={WIDTH - PADDING.right}
          y1={PADDING.top}
          x2={WIDTH - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
          stroke="#1f2937"
          strokeWidth="0.6"
        />
        {yTicks.map((tick) => {
          const y =
            PADDING.top +
            (1 - (tick - Math.min(...yTicks)) / Math.max(Math.max(...yTicks) - Math.min(...yTicks), 1)) *
              (HEIGHT - PADDING.top - PADDING.bottom);
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={WIDTH - PADDING.right + 2}
                y2={y}
                stroke="#111827"
                strokeWidth="0.4"
                strokeDasharray="2 2"
              />
              <text
                x={WIDTH - PADDING.right + 6}
                y={y + 2}
                fontSize="6"
                fill="#94a3b8"
              >
                {tick}
              </text>
            </g>
          );
        })}

        <line
          x1={PADDING.left}
          y1={HEIGHT - PADDING.bottom}
          x2={WIDTH - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
          stroke="#1f2937"
          strokeWidth="0.6"
        />
        {xTicks.map((tick, idx) => (
          <g key={`${tick.x}-${idx}`}>
            <line
              x1={tick.x}
              y1={HEIGHT - PADDING.bottom}
              x2={tick.x}
              y2={HEIGHT - PADDING.bottom + 3}
              stroke="#1f2937"
              strokeWidth="0.6"
            />
            <text
              x={tick.x}
              y={HEIGHT - PADDING.bottom + 10}
              fontSize="6"
              fill="#94a3b8"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}
      </g>

      <path
        data-testid="sparkline-path"
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="50%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
    </svg>
  );
}
