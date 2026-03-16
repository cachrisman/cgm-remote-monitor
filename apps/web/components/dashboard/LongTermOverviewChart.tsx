"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { getGlucoseColor, type GlucoseThresholds } from "@/lib/glucose-colors";

import type { GlucoseValue } from "@/lib/nightscout-client";

type LongTermOverviewChartProps = {
  entries: GlucoseValue[];
  thresholds: GlucoseThresholds;
  selectedStartTime: number;
  selectedEndTime: number;
  onSelectionChange: (startTime: number, endTime: number) => void;
};

type Datum = {
  time: number;
  glucose: number;
};

/**
 * Format time tick for long-term chart
 * - Midnight: show short date like "Nov 30"
 * - Other 6-hour intervals: show time like "6 AM", "12 PM", "6 PM"
 */
function formatLongTermTick(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  
  // Midnight - show date
  if (hours === 0) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  
  // Other 6-hour marks - show time
  return date.toLocaleTimeString([], { hour: "numeric" });
}

/**
 * Generate tick values every 6 hours aligned to clock time (0:00, 6:00, 12:00, 18:00)
 */
function generateLongTermTicks(minTime: number, maxTime: number): number[] {
  const ticks: number[] = [];
  
  // Start from the minTime, round down to nearest 6-hour boundary in local time
  const startDate = new Date(minTime);
  startDate.setMinutes(0, 0, 0);
  const startHour = startDate.getHours();
  // Round down to nearest 6-hour mark (0, 6, 12, 18)
  startDate.setHours(startHour - (startHour % 6));
  
  let t = startDate.getTime();
  const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  
  while (t <= maxTime + intervalMs) {
    ticks.push(t);
    t += intervalMs;
  }
  
  return ticks;
}

export function LongTermOverviewChart({ entries, thresholds, selectedStartTime, selectedEndTime, onSelectionChange }: LongTermOverviewChartProps) {
  const data: Datum[] = entries
    .map((e) => ({
      time: new Date(e.measuredAt).getTime(),
      glucose: e.mgdl
    }))
    .sort((a, b) => a.time - b.time);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-800/70 bg-slate-950/60 text-sm text-slate-400">
        No data available
      </div>
    );
  }

  const min = Math.min(...data.map((d) => d.glucose), thresholds.bgTargetBottom);
  const max = Math.max(...data.map((d) => d.glucose), thresholds.bgTargetTop);
  const pad = Math.max(10, (max - min) * 0.05);
  const domain: [number, number] = [Math.max(0, min - pad), max + pad];

  // Use exact 48-hour range to fill the entire width
  // Calculate time values once per render to avoid callback dependency issues
  const now = Date.now();
  const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
  const timeTicks = useMemo(() => generateLongTermTicks(fortyEightHoursAgo, now), [fortyEightHoursAgo, now]);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store time range in refs to avoid callback recreation
  const timeRangeRef = useRef({ fortyEightHoursAgo, now });
  timeRangeRef.current = { fortyEightHoursAgo, now };

  // Convert pixel X coordinate to time value
  const pixelToTime = useCallback((pixelX: number, containerWidth: number): number => {
    const { fortyEightHoursAgo: domainMin, now: domainMax } = timeRangeRef.current;
    const domainRange = domainMax - domainMin;
    const pixelRatio = pixelX / containerWidth;
    return domainMin + pixelRatio * domainRange;
  }, []);

  // Convert time value to pixel X coordinate
  const timeToPixel = useCallback((time: number, containerWidth: number): number => {
    const { fortyEightHoursAgo: domainMin, now: domainMax } = timeRangeRef.current;
    const domainRange = domainMax - domainMin;
    const timeRatio = (time - domainMin) / domainRange;
    return timeRatio * containerWidth;
  }, []);

  // Track if mouse is over selection area for cursor styling
  const [isHoveringSelection, setIsHoveringSelection] = useState(false);

  // Handle mouse down on selection area
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const containerWidth = rect.width;
    
    // Check if mouse is within the selection area
    const selectionStartPixel = timeToPixel(selectedStartTime, containerWidth);
    const selectionEndPixel = timeToPixel(selectedEndTime, containerWidth);
    
    if (mouseX >= selectionStartPixel && mouseX <= selectionEndPixel) {
      setIsDragging(true);
      setDragStartX(mouseX);
      setDragStartTime(selectedStartTime);
      e.preventDefault();
    }
  }, [selectedStartTime, selectedEndTime, timeToPixel]);

  // Handle mouse move to detect hovering over selection
  const handleMouseMoveOverlay = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isDragging) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const containerWidth = rect.width;
    
    const selectionStartPixel = timeToPixel(selectedStartTime, containerWidth);
    const selectionEndPixel = timeToPixel(selectedEndTime, containerWidth);
    
    const hovering = mouseX >= selectionStartPixel && mouseX <= selectionEndPixel;
    setIsHoveringSelection(hovering);
  }, [selectedStartTime, selectedEndTime, timeToPixel, isDragging]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const containerWidth = rect.width;
    
    const deltaX = mouseX - dragStartX;
    const deltaTime = pixelToTime(deltaX, containerWidth) - pixelToTime(0, containerWidth);
    
    const newStartTime = dragStartTime + deltaTime;
    const selectionWidth = selectedEndTime - selectedStartTime;
    const newEndTime = newStartTime + selectionWidth;
    
    // Clamp to valid range using current time range
    const { fortyEightHoursAgo: minStartTime, now: maxEndTime } = timeRangeRef.current;
    const clampedStartTime = Math.max(minStartTime, Math.min(newStartTime, maxEndTime - selectionWidth));
    const clampedEndTime = clampedStartTime + selectionWidth;
    
    if (clampedEndTime <= maxEndTime) {
      onSelectionChange(clampedStartTime, clampedEndTime);
    }
  }, [isDragging, dragStartX, dragStartTime, selectedStartTime, selectedEndTime, pixelToTime, onSelectionChange]);

  // Handle mouse up to end drag
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveOverlay}
      style={{ cursor: isDragging ? 'grabbing' : (isHoveringSelection ? 'grab' : 'default') }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 0, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#111827" strokeDasharray="2 2" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          domain={[fortyEightHoursAgo, now]}
          ticks={timeTicks}
          tickFormatter={formatLongTermTick}
          tick={{ fill: "#94a3b8", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDataOverflow
          padding={{ left: 0, right: 0 }}
        />
        <YAxis
          domain={domain}
          orientation="right"
          tick={false}
          axisLine={false}
          tickLine={false}
          width={0}
          hide
        />

        {/* High threshold line (bgTargetTop) */}
        <ReferenceLine
          y={thresholds.bgTargetTop}
          stroke="#6b7280"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Low threshold line (bgTargetBottom) */}
        <ReferenceLine
          y={thresholds.bgTargetBottom}
          stroke="#6b7280"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Dimmed area before selection */}
        {selectedStartTime > fortyEightHoursAgo && (
          <ReferenceArea
            x1={fortyEightHoursAgo}
            x2={selectedStartTime}
            fill="#000000"
            fillOpacity={0.4}
          />
        )}

        {/* Dimmed area after selection */}
        {selectedEndTime < now && (
          <ReferenceArea
            x1={selectedEndTime}
            x2={now}
            fill="#000000"
            fillOpacity={0.4}
          />
        )}

        {/* Highlight area for selected window */}
        <ReferenceArea
          x1={selectedStartTime}
          x2={selectedEndTime}
          fill="#1e293b"
          fillOpacity={0.6}
          stroke="#94a3b8"
          strokeWidth={1}
        />

        <Line
          type="monotone"
          dataKey="glucose"
          stroke="transparent"
          strokeWidth={0}
          dot={({ cx, cy, payload }) => {
            const c = getGlucoseColor(payload.glucose, thresholds);
            return <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={2} fill={c} stroke="#0f172a" strokeWidth={0.5} />;
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
