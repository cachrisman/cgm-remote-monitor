/**
 * Glucose color coding utilities based on Nightscout thresholds.
 * 
 * Thresholds define the ranges:
 * - Urgent Low: sgv < bgLow (default 55 mg/dL)
 * - Low (warning): sgv >= bgLow && sgv < bgTargetBottom (default 55-80 mg/dL)
 * - In-Range: sgv >= bgTargetBottom && sgv < bgTargetTop (default 80-180 mg/dL)
 * - High (warning): sgv >= bgTargetTop && sgv < bgHigh (default 180-260 mg/dL)
 * - Urgent High: sgv >= bgHigh (default 260+ mg/dL)
 */

export type GlucoseThresholds = {
  bgHigh: number;      // Urgent high threshold (default: 260 mg/dL)
  bgTargetTop: number; // Top of target range (default: 180 mg/dL)
  bgTargetBottom: number; // Bottom of target range (default: 80 mg/dL)
  bgLow: number;       // Urgent low threshold (default: 55 mg/dL)
};

export type GlucoseRange = 
  | 'urgentLow'
  | 'low'
  | 'inRange'
  | 'high'
  | 'urgentHigh';

/**
 * Default thresholds matching Nightscout defaults (in mg/dL)
 */
export const DEFAULT_THRESHOLDS: GlucoseThresholds = {
  bgHigh: 260,
  bgTargetTop: 180,
  bgTargetBottom: 80,
  bgLow: 55
};

/**
 * Color palette for glucose ranges
 * These colors are designed to be visible on dark backgrounds
 */
export const GLUCOSE_COLORS = {
  urgentLow: '#ef4444',  // Red - critical low
  low: '#fbbf24',        // Amber/yellow - low warning
  inRange: '#4cff00',    // Green - in target range
  high: 'yellow',       // Yellow - high warning
  urgentHigh: 'red', // Red - critical high
} as const;

/**
 * Determine the glucose range category for a given value
 */
export function getGlucoseRange(
  value: number, 
  thresholds: GlucoseThresholds = DEFAULT_THRESHOLDS
): GlucoseRange {
  if (value < thresholds.bgLow) {
    return 'urgentLow';
  }
  if (value < thresholds.bgTargetBottom) {
    return 'low';
  }
  if (value < thresholds.bgTargetTop) {
    return 'inRange';
  }
  if (value < thresholds.bgHigh) {
    return 'high';
  }
  return 'urgentHigh';
}

/**
 * Get the appropriate color for a glucose value based on thresholds
 * 
 * @param value - Glucose value in mg/dL
 * @param thresholds - Threshold configuration (defaults to Nightscout defaults)
 * @returns Hex color string
 */
export function getGlucoseColor(
  value: number, 
  thresholds: GlucoseThresholds = DEFAULT_THRESHOLDS
): string {
  const range = getGlucoseRange(value, thresholds);
  return GLUCOSE_COLORS[range];
}

/**
 * Get a human-readable label for a glucose range
 */
export function getGlucoseRangeLabel(range: GlucoseRange): string {
  switch (range) {
    case 'urgentLow':
      return 'Urgent Low';
    case 'low':
      return 'Low';
    case 'inRange':
      return 'In Range';
    case 'high':
      return 'High';
    case 'urgentHigh':
      return 'Urgent High';
  }
}

/**
 * Get color and range info for a glucose value
 * Useful for tooltips that need both color and label
 */
export function getGlucoseColorInfo(
  value: number,
  thresholds: GlucoseThresholds = DEFAULT_THRESHOLDS
): { color: string; range: GlucoseRange; label: string } {
  const range = getGlucoseRange(value, thresholds);
  return {
    color: GLUCOSE_COLORS[range],
    range,
    label: getGlucoseRangeLabel(range)
  };
}

