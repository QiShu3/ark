# Multi-week Calendar Design

## Summary

Clicking the home page calendar opens a large dark-glass multi-week planner instead of a small month-only check-in modal. The planner defaults to a 2-week view, can switch to a 3-week view, and displays dense daily tasks as transparent glass labels so users can scan busy days at a glance.

The accepted visual direction is the dark glass mockup, version 3: deep black-blue background, translucent calendar surface, subtle grid lines, cyan today highlight, and very transparent task labels with colored borders, left glow strips, and small dots.

## Goals

- Turn the home calendar from a check-in-only widget into a task planning entry point.
- Make dense daily tasks scannable across 2 or 3 weeks.
- Preserve Ark's existing dark glass home page visual language.
- Keep the first implementation bounded: 2-week and 3-week views only, not arbitrary week counts.
- Reuse existing task date fields (`start_date`, `due_date`) where possible.
- Keep check-in visibility, but make task scheduling the primary purpose of the expanded view.

## Non-goals

- Do not replace the existing task management modal.
- Do not implement a full Google Calendar-style timed day schedule in the first version.
- Do not support arbitrary custom week counts in the first version.
- Do not add recurring task expansion beyond what existing task data already supports.
- Do not build advanced analytics in the first version.

## User Flow

1. User clicks the small calendar widget in the home right panel or the calendar icon in the navigation bar.
2. A large modal opens with the multi-week planner.
3. The planner defaults to the user's last selected week count from local storage, falling back to 2 weeks.
4. User can switch between 2 weeks and 3 weeks from the toolbar.
5. User can navigate backward, forward, or return to today.
6. User scans each date cell for task load and task labels.
7. User clicks a date cell to open a date detail drawer.
8. User clicks a task label to open the existing task editing flow for that task.

## Visual Design

### Modal Shell

- Use a large centered overlay, preferably 80-90% viewport width and height on desktop.
- Background overlay should stay consistent with current modal style: black translucent layer with blur.
- Calendar surface uses dark glass:
  - Deep blue-black translucent panel.
  - Subtle border using `white/10` to `white/20`.
  - Backdrop blur.
  - Soft shadow.
  - Optional faint background grid or glow, only if it does not compete with task content.

### Toolbar

The toolbar sits at the top of the modal and includes:

- Month label, for example `9 月`.
- Add button for creating a task.
- Week count segmented control with `2 周` and `3 周`.
- Navigation controls: previous, `今天`, next.
- More menu button reserved for later settings; the first version can render it disabled or omit the menu content.

The initial implementation can make the add button open the existing create task flow with no date preselected, or with the currently selected date if one exists.

### Calendar Grid

- Use 7 columns: 周日, 周一, 周二, 周三, 周四, 周五, 周六.
- Use one row per visible week.
- 2-week view has 14 date cells.
- 3-week view has 21 date cells.
- The date range starts at the beginning of the week containing the anchor date.
- Today is highlighted with a cyan filled circle around the date number and a subtle cell background.
- Empty days remain visible and subdued.

### Task Labels

Task labels should follow the approved transparent style:

- Very low color fill, approximately 3%-13% color opacity.
- Colored border, approximately 25% opacity.
- Left vertical glow strip.
- Small colored dot.
- High-contrast text, not transparent, to preserve readability.
- Rounded corners around 10px.
- Light inner highlight and very soft shadow.

Each date cell shows up to 4 task labels by default. If more tasks exist, show a `+N 项折叠` row. Clicking the overflow row opens the date detail drawer.

### Density Indicator

Optionally show a subtle bottom density line per date cell:

- Cool gradient for normal load.
- Warm rose/amber gradient for heavy load.
- Heavy load can be defined as more than 4 active tasks for the day in the first version.

## Task Placement Rules

A task appears on a date if:

- `start_date` falls on that date, or
- `due_date` falls on that date, or
- the date is between `start_date` and `due_date` for multi-day tasks.

If both `start_date` and `due_date` are missing, the task does not appear in the multi-week calendar.

For the first version, each task appears as a single label in each matching date cell. It does not need to render as a continuous multi-day bar across cells.

Task ordering inside a day:

1. Incomplete tasks before completed tasks.
2. Higher priority first.
3. Earlier due date first.
4. More recently updated tasks last as a stable fallback.

## Date Detail Drawer

Clicking a date cell opens a right-side drawer inside the modal.

The drawer includes:

- Selected date heading.
- Active tasks for the day.
- Completed tasks for the day, collapsed by default if there are many.
- Quick create button that opens task creation with `start_date` and `due_date` defaulted to that date.
- Optional daily check-in state.
- Optional focus summary for that day if data is available.

The drawer should be dismissible without closing the entire calendar modal.

## Data Model And API

The frontend currently loads all tasks from `/todo/tasks?limit=100`. The first implementation may reuse this endpoint if that remains performant enough, but the preferred design is to add a range endpoint:

`GET /todo/tasks/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD`

Response shape can reuse `TaskOut[]`.

Server filtering should include tasks where:

- `start_date < range_end`, and
- `due_date >= range_start`, when both dates exist.

For tasks with only one date:

- Include tasks with `start_date` inside the range.
- Include tasks with `due_date` inside the range.

The endpoint should exclude deleted tasks by default and include both `todo` and `done` tasks so completed work can be shown in the date drawer.

## Frontend Components

Recommended component split:

- `CalendarWidget`: remains the compact home card. It opens the new multi-week calendar modal.
- `MultiWeekCalendarModal`: owns modal state, anchor date, week count, selected date, and data loading.
- `MultiWeekCalendarGrid`: renders weekday header and date cells.
- `CalendarDayCell`: renders date number, task labels, overflow row, and density indicator.
- `CalendarTaskLabel`: renders the transparent task label.
- `CalendarDateDrawer`: renders selected date details and quick actions.

This split keeps the current large `PlaceholderCard` from gaining more responsibilities.

## State Management

Frontend state:

- `isOpen`: modal visibility.
- `anchorDate`: date used to calculate visible week range.
- `weekCount`: `2 | 3`, persisted in local storage.
- `selectedDate`: date currently shown in the drawer.
- `tasks`: tasks returned for the visible range.
- `loading` and `error`: range loading status.

Local storage key:

`ark-calendar-week-count`

## Error Handling

- If task loading fails, show a non-blocking error state inside the modal.
- Keep the calendar grid visible with empty cells when possible.
- Retry when the user navigates or reopens the modal.
- If the user is unauthenticated, existing `apiJson` behavior should redirect to login.

## Accessibility

- The modal should have a dialog role and accessible label.
- The week count control should expose the selected state.
- Date cells should be keyboard focusable.
- Task labels should be buttons when clickable.
- Today should not rely on color alone; include an accessible label such as `今天`.
- The drawer close button should be keyboard accessible.

## Testing

Frontend tests should cover:

- Compact calendar opens the multi-week modal.
- Week count defaults to 2 when no preference exists.
- Week count persists after switching to 3.
- Grid renders 14 cells for 2 weeks and 21 cells for 3 weeks.
- Tasks are placed on dates from `start_date`, `due_date`, and date ranges.
- Days with more than 4 tasks show an overflow row.
- Clicking a date opens the date detail drawer.
- Clicking a task label opens task editing or calls the expected callback.

Backend tests should cover the range endpoint if added:

- Includes tasks with `start_date` in range.
- Includes tasks with `due_date` in range.
- Includes multi-day tasks that overlap the range.
- Excludes deleted tasks.
- Does not return tasks from another user.

## Implementation Phasing

### Phase 1

- Build the modal, 2/3 week grid, transparent task labels, local week preference, and date drawer.
- Use existing task data loading if practical, or add the range endpoint if needed during implementation.

### Phase 2

- Add drag-and-drop date reassignment.
- Add richer focus summary per day.
- Add task color settings or legend.

### Phase 3

- Add custom week counts beyond 2/3 if the fixed choices feel limiting.
- Add analytics/weekly review overlays.
