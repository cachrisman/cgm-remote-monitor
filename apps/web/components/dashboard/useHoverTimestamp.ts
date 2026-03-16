"use client";

import { useMemo, useRef, useState } from "react";

import type { ChartDatum } from "./useShortTermChartData";
import type React from "react";

export type ActivePointInfo = {
  point: ChartDatum;
  index: number;
};

export function useHoverTimestamp({
  startTime,
  endTime,
  data,
}: {
  startTime: number;
  endTime: number;
  data: ChartDatum[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeX, setActiveX] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const handleMouseMove = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;

    if (relativeX < 0 || relativeX > rect.width) {
      setActiveX(null);
      setHoverX(null);
      return;
    }

    const ratio = rect.width > 0 ? relativeX / rect.width : 0;
    const timestamp = startTime + ratio * (endTime - startTime);

    setHoverX(relativeX);
    setActiveX(timestamp);
  };

  const handleMouseLeave = () => {
    setActiveX(null);
    setHoverX(null);
  };

  const activePointInfo: ActivePointInfo | null = useMemo(() => {
    if (activeX === null) return null;

    const glucosePoints = data
      .map((d, idx) => ({ point: d, index: idx }))
      .filter(({ point }) => point.time !== undefined && point.glucose !== undefined);
    if (glucosePoints.length === 0) return null;

    let closest = glucosePoints[0];
    let minDiff = Math.abs(closest.point.time - activeX);

    for (const item of glucosePoints) {
      const diff = Math.abs(item.point.time - activeX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }

    return closest;
  }, [activeX, data]);

  return {
    containerRef,
    hoverX,
    activePointInfo,
    activeTimestamp: activeX, // Use actual mouse timestamp, not active point time
    handleMouseMove,
    handleMouseLeave,
  };
}
