export const CALENDAR_DAY_HEADER_HEIGHT = 64;
export const CALENDAR_TASK_LAYER_TOP = 76;
export const CALENDAR_TASK_ROW_HEIGHT = 37;
export const CALENDAR_TASK_FOOTER_PADDING = 18;
export const CALENDAR_MIN_CELL_HEIGHT = 236;
export const CALENDAR_MAX_VISIBLE_DOTS = 6;
export const CALENDAR_DOT_STACK_TOP_GAP = 12;
export const CALENDAR_DOT_ROW_HEIGHT = 28;
export const CALENDAR_DOT_ROW_GAP = 6;
export const CALENDAR_DOT_OVERFLOW_HEIGHT = 14;
export const CALENDAR_DOT_STACK_BOTTOM_GAP = 12;

export function getCalendarDotStackHeight(dotCount: number): number {
  if (dotCount <= 0) return 0;

  const visibleRows = Math.min(dotCount, CALENDAR_MAX_VISIBLE_DOTS);
  const rowGaps = Math.max(visibleRows - 1, 0) * CALENDAR_DOT_ROW_GAP;
  const overflowHeight = dotCount > CALENDAR_MAX_VISIBLE_DOTS ? CALENDAR_DOT_ROW_GAP + CALENDAR_DOT_OVERFLOW_HEIGHT : 0;

  return CALENDAR_DOT_STACK_TOP_GAP
    + visibleRows * CALENDAR_DOT_ROW_HEIGHT
    + rowGaps
    + overflowHeight
    + CALENDAR_DOT_STACK_BOTTOM_GAP;
}
