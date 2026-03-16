# Basal Highlighting Bugs - Problem Summary & Test Documentation

## Problem Summary

Based on the three screenshots provided, there are three main issues with the basal icicle highlighting behavior:

### Problem 1: Mouse to RIGHT of Active Line
**Symptom**: When the mouse pointer is positioned to the right of the active glucose point's vertical line:
- No basal point is highlighted near the active line
- Instead, a "pseudo highlight" dot appears at the next basal rate change (e.g., 90 minutes later)
- The highlighted point doesn't correspond to the active basal at the mouse position

**Example**: 
- Active glucose point at 10:03 AM (basal: 0.0U)
- Mouse at 10:30 AM (basal still 0.0U)
- Highlight appears at 11:30 AM (basal: 3.3U) - WRONG!

**Root Cause**: The highlighting logic in `BasalIcicleArea.tsx` uses `find()` with `>= targetTime`, which finds the NEXT basal change, not the ACTIVE basal at the target time.

### Problem 2: Mouse to LEFT of Active Line - Double Highlight
**Symptom**: When the mouse pointer is positioned to the left of the active glucose point's vertical line:
- TWO basal points are highlighted when there should be only ONE
- One highlight at the active line (correct)
- One "empty" highlight point later (incorrect)

**Example**:
- Mouse at 10:20 AM
- Active glucose point at 10:23 AM
- Basal is 0.0U until 10:30 AM, then changes to 3.3U
- Both 0.0U point (at active line) AND 3.3U point (65 min later) are highlighted - WRONG!

**Root Cause**: The logic is finding both the active basal at the active point time AND the next basal change, causing double highlighting.

### Problem 3: Wrong Basal in Tooltip When Mouse is to LEFT
**Symptom**: When the mouse is to the left of the active line:
- Tooltip shows the basal value at the mouse position time (e.g., 0.00U)
- But it should show the basal value at the active glucose point time (e.g., 3.3U)
- Highlight shows the wrong point (0.0U) instead of the correct one (3.3U)

**Example**:
- Mouse at 10:20 AM (basal: 0.0U)
- Active glucose point at 11:33 AM (basal: 3.3U)
- Tooltip shows "Basal: 0.00U" - WRONG! Should show 3.3U
- Highlight is at 0.0U point - WRONG! Should be at 3.3U point

**Root Cause**: The tooltip logic in `ShortTermTooltip.tsx` uses `activeTimestamp` (mouse time) when it should use `activePoint.time` (active glucose point time) when the mouse is to the left.

## Test Coverage

The test file `BasalIcicleArea.test.tsx` covers all three problems plus edge cases:

### Test Structure

1. **Problem 1 Tests**: `describe("Problem 1: Mouse to RIGHT of active line")`
   - Verifies that when mouse is to the right, the highlight matches the active basal at mouse position
   - Ensures it doesn't jump to the next basal change

2. **Problem 2 Tests**: `describe("Problem 2: Mouse to LEFT of active line with double highlight")`
   - Verifies only ONE basal point is highlighted
   - Ensures the highlight matches the tooltip value

3. **Problem 3 Tests**: `describe("Problem 3: Wrong basal in tooltip when mouse is to the left")`
   - Verifies tooltip shows basal at active point time, not mouse time
   - Ensures highlight matches tooltip
   - Demonstrates the bug by showing what wrong value would be returned

4. **Edge Cases**: `describe("Edge cases")`
   - Mouse exactly at active point
   - Mouse before any basal data
   - Multiple basal changes
   - No active point info

5. **Consistency Tests**: `describe("Consistency: Highlight should always match tooltip")`
   - Ensures highlight and tooltip always use the same target time logic
   - Tests both mouse-left and mouse-right scenarios

## Key Test Functions

### `findHighlightBasalTime()`
Extracts the highlighting logic from `BasalIcicleArea.tsx` for testing. Currently uses:
```typescript
const next = starts.find((d) => d.time >= targetTime);
```
This finds the NEXT change, which is the bug.

### `findTooltipBasal()`
Extracts the tooltip logic from `ShortTermTooltip.tsx` for testing. Uses:
```typescript
if (d.time <= targetTime) {
  activeStart = d;
}
```
This finds the ACTIVE basal (last change <= targetTime), which is correct.

## Expected Behavior After Fix

1. **When mouse is to RIGHT of active line**:
   - Use `activeTimestamp` (mouse time) for both highlight and tooltip
   - Find the ACTIVE basal at that time (last change <= mouse time)
   - Highlight should match tooltip

2. **When mouse is to LEFT of active line**:
   - Use `activePoint.time` (active glucose point time) for both highlight and tooltip
   - Find the ACTIVE basal at that time (last change <= active point time)
   - Highlight should match tooltip

3. **Only ONE highlight**:
   - The logic should find exactly one basal change point to highlight
   - No "empty" or "pseudo" highlights

## Implementation Notes

The fix will require changes to:
1. `BasalIcicleArea.tsx`: Change from `>= targetTime` to `<= targetTime` logic
2. `BasalIcicleArea.tsx`: Determine correct target time based on mouse position relative to active point
3. `ShortTermTooltip.tsx`: Use active point time when mouse is to the left

The tests will help verify the fix works correctly for all scenarios.

