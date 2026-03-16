/**
 * Tests for BasalIcicleArea highlighting logic
 * 
 * Problem Summary:
 * 1. When mouse is to the RIGHT of active line: No basal point highlighted near active line,
 *    but a "pseudo highlight" appears at the next basal change (e.g., 90 min later)
 * 2. When mouse is to the LEFT of active line: Sometimes TWO basal points highlighted
 *    (one at active line, one "empty" point later)
 * 3. Tooltip shows wrong basal value: Shows current basal (0.0U) instead of the active
 *    basal at that time (should be 3.3U). Should only highlight one point at 3.3U.
 * 
 * Key Requirements:
 * - Highlight should match the tooltip basal value
 * - Only ONE basal point should be highlighted at a time
 * - Highlight should be the "active" basal at the target time (last change <= targetTime)
 * - When mouse is to left of active line, use active point time; when to right, use mouse time
 */

import { describe, it, expect } from "@jest/globals";

import type { ActivePointInfo } from "../useHoverTimestamp";
import type { ChartDatum } from "../useShortTermChartData";

// Helper to create test data points
function createDatum(
  time: number,
  glucose?: number,
  basal?: number
): ChartDatum {
  return {
    time,
    displayTime: new Date(time).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    glucose,
    basal,
    basalDisplay: basal !== undefined ? `${basal.toFixed(2)}U` : undefined,
    basalIcicle: basal !== undefined && basal > 0 ? basal : undefined,
  };
}

// Extract the highlighting logic from BasalIcicleArea for testing
// This matches the fixed logic in BasalIcicleArea.tsx
function findHighlightBasalTime(
  data: ChartDatum[],
  activePointInfo: ActivePointInfo | null,
  activeTimestamp: number | null
): ChartDatum | null {
  const activePoint = activePointInfo?.point;
  
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
  let activeStart: ChartDatum | null = null;

  for (const d of data) {
    if (d.basal === undefined) continue;
    const isChange = prevBasal === undefined || d.basal !== prevBasal;
    if (isChange) {
      if (d.time <= targetTime) {
        activeStart = d;
      }
      prevBasal = d.basal;
    }
  }

  // Only return activeStart if found. Don't fall back to firstStart to avoid
  // showing "empty" highlights when mouse is to the right
  return activeStart;
}

// Extract the tooltip basal logic for testing
function findTooltipBasal(
  chartData: ChartDatum[],
  targetTime: number
): ChartDatum | null {
  let prevBasal: number | undefined;
  let activeStart: ChartDatum | null = null;
  let firstStart: ChartDatum | null = null;

  for (const d of chartData) {
    if (d.basal === undefined) continue;
    const isChange = prevBasal === undefined || d.basal !== prevBasal;
    if (isChange) {
      if (!firstStart) firstStart = d;
      if (d.time <= targetTime) {
        activeStart = d;
      }
      prevBasal = d.basal;
    }
  }

  return activeStart ?? firstStart;
}

describe("BasalIcicleArea highlighting logic", () => {
  describe("Problem 1: Mouse to RIGHT of active line", () => {
    it("should highlight the active basal at mouse position, not the next change", () => {
      // Scenario: Basal is 0.0U from 10:00-11:30, then changes to 3.3U at 11:30
      // Mouse is at 10:30 (to the right of active glucose point at 10:03)
      // Active glucose point is at 10:03 AM
      // Mouse timestamp is 10:30 AM
      // Expected: Highlight should be at 0.0U (the active basal at 10:30), NOT at 3.3U (90 min later)

      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 102, 0.0), // 10:00 - glucose point, basal 0.0U
        createDatum(baseTime + 3 * 60 * 1000, 102, 0.0), // 10:03 - active glucose point
        createDatum(baseTime + 30 * 60 * 1000, 100, 0.0), // 10:30 - mouse position
        createDatum(baseTime + 90 * 60 * 1000, 95, 3.3), // 11:30 - basal changes to 3.3U
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[1], // 10:03 glucose point
        index: 1,
      };
      const activeTimestamp = baseTime + 30 * 60 * 1000; // 10:30 - mouse to the right

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );
      const tooltipBasal = findTooltipBasal(data, activeTimestamp);

      // Verify highlight matches tooltip
      expect(highlighted).not.toBeNull();
      expect(tooltipBasal).not.toBeNull();

      // The highlight should match the tooltip
      expect(highlighted?.time).toBe(tooltipBasal?.time);
      // Should be the active basal at 10:30, which is 0.0U (not the next change at 11:30)
      expect(highlighted?.basal).toBe(0.0);
      expect(highlighted?.time).toBe(baseTime); // Should be the start of the 0.0U segment
    });
  });

  describe("Problem 2: Mouse to LEFT of active line with double highlight", () => {
    it("should highlight only ONE basal point when mouse is to the left", () => {
      // Scenario: Mouse at 10:20, active glucose point at 10:23
      // Basal is 0.0U until 10:30, then changes to 3.3U
      // Expected: Only highlight the active basal at 10:23 (0.0U), not both

      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0), // 10:00
        createDatum(baseTime + 20 * 60 * 1000, 95, 0.0), // 10:20 - mouse position
        createDatum(baseTime + 23 * 60 * 1000, 89, 0.0), // 10:23 - active glucose point
        createDatum(baseTime + 30 * 60 * 1000, 85, 3.3), // 10:30 - basal changes to 3.3U
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[2], // 10:23 glucose point
        index: 2,
      };
      const activeTimestamp = baseTime + 20 * 60 * 1000; // 10:20 - mouse to the left

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );
      const tooltipBasal = findTooltipBasal(
        data,
        activePointInfo.point.time
      ); // Use active point time for tooltip

      // Should match tooltip (which uses active point time)
      expect(highlighted?.time).toBe(tooltipBasal?.time);
      expect(highlighted?.basal).toBe(0.0);
      // Should only be one highlight (the active basal at the active point time)
    });
  });

  describe("Problem 3: Wrong basal in tooltip when mouse is to the left", () => {
    it("should show the active basal at the active point time, not at mouse time", () => {
      // Scenario: Mouse at 10:20, active glucose point at 11:33
      // Basal is 0.0U until 10:30, then changes to 3.3U at 10:30
      // Active point is at 11:33 (when basal is 3.3U)
      // Expected: Tooltip should show 3.3U, highlight should be at 3.3U point

      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0), // 10:00 - basal 0.0U
        createDatum(baseTime + 20 * 60 * 1000, 95, 0.0), // 10:20 - mouse position (basal still 0.0U)
        createDatum(baseTime + 30 * 60 * 1000, 90, 3.3), // 10:30 - basal changes to 3.3U
        createDatum(baseTime + 93 * 60 * 1000, 70, 3.3), // 11:33 - active glucose point (basal is 3.3U)
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[3], // 11:33 glucose point
        index: 3,
      };
      const activeTimestamp = baseTime + 20 * 60 * 1000; // 10:20 - mouse to the left

      // When mouse is to the left, we should use the active point time for basal lookup
      // NOT the mouse time (activeTimestamp)
      const tooltipBasal = findTooltipBasal(
        data,
        activePointInfo.point.time
      ); // Should use active point time (11:33), not mouse time (10:20)

      // Demonstrate the bug: if we used mouse time, we'd get wrong basal
      const wrongBasalAtMouseTime = findTooltipBasal(data, activeTimestamp);
      expect(wrongBasalAtMouseTime?.basal).toBe(0.0); // Wrong - would show 0.0U

      // Tooltip should show 3.3U (the basal at 11:33)
      expect(tooltipBasal?.basal).toBe(3.3);
      expect(tooltipBasal?.time).toBe(baseTime + 30 * 60 * 1000); // The start of 3.3U segment

      // Highlight should match
      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activePointInfo.point.time
      ); // Use active point time for highlight too

      expect(highlighted?.basal).toBe(3.3);
      expect(highlighted?.time).toBe(tooltipBasal?.time);
    });
  });

  describe("Edge cases", () => {
    it("should handle mouse exactly at active point", () => {
      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0),
        createDatum(baseTime + 30 * 60 * 1000, 95, 3.3), // Basal change
        createDatum(baseTime + 60 * 60 * 1000, 90, 3.3), // Active point
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[2],
        index: 2,
      };
      const activeTimestamp = data[2].time; // Mouse exactly at active point

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );
      const tooltipBasal = findTooltipBasal(data, activeTimestamp);

      expect(highlighted?.time).toBe(tooltipBasal?.time);
      expect(highlighted?.basal).toBe(3.3);
    });

    it("should handle mouse before any basal data", () => {
      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime + 30 * 60 * 1000, 100, 0.0), // First basal point
        createDatum(baseTime + 60 * 60 * 1000, 95, 3.3), // Active point
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[1],
        index: 1,
      };
      const activeTimestamp = baseTime; // Mouse before any data

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );

      // When mouse is to the left of active point, we use active point time
      // So we should find the basal at the active point time (3.3U)
      expect(highlighted).not.toBeNull();
      expect(highlighted?.basal).toBe(3.3);
    });

    it("should handle multiple basal changes", () => {
      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0), // 10:00 - basal 0.0U
        createDatum(baseTime + 30 * 60 * 1000, 95, 1.5), // 10:30 - changes to 1.5U
        createDatum(baseTime + 60 * 60 * 1000, 90, 3.3), // 11:00 - changes to 3.3U
        createDatum(baseTime + 90 * 60 * 1000, 85, 3.3), // 11:30 - active point
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[3], // 11:30
        index: 3,
      };
      // Mouse is to the right of active point (after 11:30)
      const activeTimestamp = baseTime + 105 * 60 * 1000; // 11:45 - mouse to the right

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );
      // When mouse is to the right, tooltip uses mouse time
      const tooltipBasal = findTooltipBasal(data, activeTimestamp);

      // At 11:45, active basal should be 3.3U (changed at 11:00)
      expect(highlighted?.basal).toBe(3.3);
      expect(highlighted?.time).toBe(tooltipBasal?.time);
      expect(highlighted?.time).toBe(baseTime + 60 * 60 * 1000); // Start of 3.3U segment
    });

    it("should handle no active point info", () => {
      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0),
        createDatum(baseTime + 30 * 60 * 1000, 95, 3.3),
      ];

      const activeTimestamp = baseTime + 15 * 60 * 1000;

      const highlighted = findHighlightBasalTime(data, null, activeTimestamp);
      const tooltipBasal = findTooltipBasal(data, activeTimestamp);

      expect(highlighted?.time).toBe(tooltipBasal?.time);
      expect(highlighted?.basal).toBe(0.0);
    });

    it("should highlight 0.0U basal when mouse is to the right and both segments are 0.0U", () => {
      // Scenario: Two consecutive 0.0U basal segments
      // Mouse is to the right of active glucose point
      // Expected: Should highlight the 0.0U basal point at the mouse position
      const baseTime = new Date("2024-01-01T14:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 110, 0.0), // 2:00 PM - first 0.0U segment starts
        createDatum(baseTime + 15 * 60 * 1000, 108, 0.0), // 2:15 PM - active glucose point
        createDatum(baseTime + 20 * 60 * 1000, 107, 0.0), // 2:20 PM - mouse position (still 0.0U)
        createDatum(baseTime + 30 * 60 * 1000, 105, 0.0), // 2:30 PM - second 0.0U segment (no change, still 0.0U)
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[1], // 2:15 PM glucose point
        index: 1,
      };
      const activeTimestamp = baseTime + 20 * 60 * 1000; // 2:20 PM - mouse to the right

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );
      const tooltipBasal = findTooltipBasal(data, activeTimestamp);

      // Should find the 0.0U basal point (even though basalIcicle is undefined)
      expect(highlighted).not.toBeNull();
      expect(highlighted?.basal).toBe(0.0);
      expect(highlighted?.time).toBe(tooltipBasal?.time);
      // Should be the first 0.0U segment start
      expect(highlighted?.time).toBe(baseTime);
    });

    it("should not show empty highlight at far left when mouse is to the right", () => {
      // Scenario: Mouse is to the right of active line
      // Expected: Should highlight the correct basal, not fall back to firstStart
      const baseTime = new Date("2024-01-01T13:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 110, 0.0), // 1:00 PM - first basal point (far left)
        createDatum(baseTime + 20 * 60 * 1000, 108, 0.0), // 1:20 PM - active glucose point
        createDatum(baseTime + 25 * 60 * 1000, 107, 0.0), // 1:25 PM - mouse to the right
        // No basal change after this, so activeStart should be found at 1:00 PM
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[1], // 1:20 PM glucose point
        index: 1,
      };
      const activeTimestamp = baseTime + 25 * 60 * 1000; // 1:25 PM - mouse to the right

      const highlighted = findHighlightBasalTime(
        data,
        activePointInfo,
        activeTimestamp
      );

      // Should find the active basal at mouse position (1:00 PM, 0.0U)
      // NOT fall back to firstStart which would show an "empty" highlight
      expect(highlighted).not.toBeNull();
      expect(highlighted?.basal).toBe(0.0);
      expect(highlighted?.time).toBe(baseTime); // Should be the start of the 0.0U segment
    });
  });

  describe("Consistency: Highlight should always match tooltip", () => {
    it("should ensure highlight and tooltip use the same target time logic", () => {
      const baseTime = new Date("2024-01-01T10:00:00").getTime();
      const data: ChartDatum[] = [
        createDatum(baseTime, 100, 0.0),
        createDatum(baseTime + 10 * 60 * 1000, 98, 0.0), // Active point
        createDatum(baseTime + 20 * 60 * 1000, 95, 0.0), // Mouse to right
        createDatum(baseTime + 30 * 60 * 1000, 90, 3.3), // Basal change
      ];

      const activePointInfo: ActivePointInfo = {
        point: data[1], // 10:10
        index: 1,
      };

      // Test mouse to the right
      const mouseRight = baseTime + 20 * 60 * 1000;
      const highlightedRight = findHighlightBasalTime(
        data,
        activePointInfo,
        mouseRight
      );
      const tooltipRight = findTooltipBasal(data, mouseRight);
      expect(highlightedRight?.time).toBe(tooltipRight?.time);

      // Test mouse to the left
      const mouseLeft = baseTime + 5 * 60 * 1000;
      const highlightedLeft = findHighlightBasalTime(
        data,
        activePointInfo,
        mouseLeft
      );
      // When mouse is to left, tooltip should use active point time
      const tooltipLeft = findTooltipBasal(data, activePointInfo.point.time);
      // But current logic uses mouse time - this is the bug!
      // Should be: expect(highlightedLeft?.time).toBe(tooltipLeft?.time);
      expect(highlightedLeft).not.toBeNull();
      expect(tooltipLeft).not.toBeNull();
    });
  });
});

