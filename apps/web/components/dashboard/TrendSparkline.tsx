"use client";

import { useMemo } from "react";
import type { GlucoseValue } from "@/lib/nightscout-client";

type TrendSparklineProps = {
  entries: GlucoseValue[];
};

function scale(values: number[], size: number) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  return values.map((value) => size - ((value - min) / range) * size);
}

export function TrendSparkline({ entries }: TrendSparklineProps) {
  const path = useMemo(() => {
    if (entries.length === 0) {
      return "";
    }

    const values = entries.map((entry) => entry.mgdl);
    const scaled = scale(values, 60);
    const step = 120 / Math.max(entries.length - 1, 1);

    const commands = scaled.map((value, index) => {
      const x = index * step;
      const y = value;

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    return commands.join(" ");
  }, [entries]);

  return (
    <svg viewBox="0 0 120 60" className="h-16 w-full">
      <path
        d={path}
        fill="none"
        stroke="url(#glucoseGradient)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="glucoseGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="50%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
    </svg>
  );
}
