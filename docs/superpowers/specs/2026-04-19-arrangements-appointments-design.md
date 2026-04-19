# Arrangements and Appointments Design

## Summary

This design introduces `appointment` as a first-class object that is parallel to `task`, then elevates the current task entry point into a broader `arrangement` experience.

The goal is to keep the existing home-page interaction model stable while splitting two different semantics cleanly:

- `task` means something the user needs to invest focused effort into
- `appointment` means something the user mainly needs to show up for or confirm happened by a deadline

The current task modal already behaves like a control center instead of a plain CRUD list. This design preserves that structure and evolves it rather than replacing it.

## Product Language

- Top-level user-facing entry name changes from `任务` to `安排`
- `task` remains a dedicated object
- `appointment` is added as a dedicated object
- A future independent `event` entity is intentionally out of scope for this change

## Core Concepts

### Task

Tasks require focus. They are the only arrangement type that supports focus workflows, pomodoro-style timing, and similar deep-work tooling.

Tasks may have:

- no time constraint
- only a deadline
- both a start time and an end time

### Appointment

Appointments do not support focus tooling. They represent fixed commitments or occurrences that the user needs to attend, confirm, or acknowledge.

Appointments must always have an `ends_at` value. They may optionally have a `starts_at` value.

Examples:

- meeting
- exam
- pickup
- registration deadline
- doctor visit

### Arrangement

`arrangement` is a UI umbrella concept, not a new storage entity. It groups `task` and `appointment` into one entry surface while preserving their separate behavior and models.

## Distinguishing Rules

### Behavioral split

- If the user needs focus support, the item is a `task`
- If the user only needs to be present or later confirm the occurrence, the item is an `appointment`

### Time representation

- Tasks with explicit `start + end` render as timeline blocks
- Tasks with only a deadline render as deadline dots
- Appointments render as deadline dots anchored to `ends_at`

Appointments deliberately do not render as blocks even when they span time. The UI should emphasize the decisive moment rather than a literal occupied duration.

## Appointment State Model

### Stored states

- `pending`
- `needs_confirmation`
- `attended`
- `missed`
- `cancelled`

### State semantics

- `pending`: before the appointment deadline
- `needs_confirmation`: the deadline has passed but the user has not confirmed the result
- `attended`: the user confirms they attended
- `missed`: the user confirms they missed it
- `cancelled`: the appointment was cancelled and should remain visible in a weakened form

### State transitions

- `pending -> needs_confirmation` happens automatically once `ends_at` has passed
- `needs_confirmation -> attended | missed | cancelled` happens through user action
- `pending -> cancelled` is allowed before the deadline

`rescheduled` is not a status. Rescheduling is modeled by editing the appointment data.

## Repeating Appointments

### Requirements

- repeating appointments are supported
- each occurrence can be confirmed independently
- first version only supports editing the whole series, not a single occurrence override

### Model direction

The design should separate:

- appointment series/template definition
- individual appointment occurrences/results

This avoids forcing one status to represent the whole series.

## Task and Appointment Relationship

- a task may be linked to at most one appointment
- an appointment may be linked to at most one task

This is a strict one-to-one relationship in the first version.

The purpose is to support cases like “prepare materials for this appointment” without opening a broader graph model.

## Home Entry and Modal Evolution

### Home entry

The current single home entry pattern remains.

- Replace the home label `任务` with `安排`
- Keep the existing interaction shape: click entry -> open management modal

The home page should not split into separate top-level task and appointment entry points.

### Arrangement modal structure

The existing task modal evolves into an arrangement modal with the same broad skeleton:

- left column: summary/control view
- right column: inventory/management view

### Left column

The current `今日焦点` area becomes `安排总览`.

Default section order:

1. `今日任务`
2. `今日日程`
3. `待确认日程`

If any appointments are in `needs_confirmation`, the modal should also surface a stronger reminder above the content hierarchy, such as a badge, accent pill, or header-level notice.

Entries in the left column remain directly actionable. Clicking a task or appointment opens its editor immediately rather than bouncing the user into the right column first.

### Right column

The current `任务仓库` becomes `安排仓库`.

The top-level control becomes a type switch:

- `任务`
- `日程`

Under `任务`, the existing task-oriented filtering can stay available or be adapted:

- `全部`
- `每日`
- `每周`
- `周期`
- `自定义`

Under `日程`, the first version should support:

- `全部`
- `今日`
- `待确认`
- `重复`

## Creation Flows

### Structured creation

The current custom task flow becomes structured arrangement creation.

The user first chooses the arrangement kind:

- `任务`
- `日程`

After that, the form exposes the fields relevant to that type.

### Natural language creation

The current quick task assistant becomes `快捷安排`.

It should:

- parse natural language into either tasks or appointments
- surface a recommendation for the detected type
- allow the user to confirm or adjust before final creation

## Editing Flows

### Task editing

Task editing continues to use the existing direct-edit modal pattern.

### Appointment editing

Appointments should use the same interaction standard:

- click summary card
- open appointment editor directly

For `needs_confirmation` appointments, the editor is still the entry point. Confirmation actions live inside the editor rather than in a separate lightweight quick-confirm popover.

## Calendar and Timeline Behavior

### Modal calendar

The current task calendar should evolve into an arrangement-aware calendar.

It must support combined viewing, but visual distinction matters:

- task blocks for scheduled focus work
- deadline dots for deadline-only tasks
- deadline dots for appointments

### Combined timeline / overview

The user approved a combined overview view, but it is a derived view rather than the default management mode.

Its meaning is:

- blocks represent time the user expects to invest
- dots represent decisive moments or deadlines the user must not forget

This is intentionally not a literal occupancy map.

## Data Modeling Direction

### Keep task independent

The existing `tasks` table and task routes remain, but task semantics become stricter:

- focus behavior belongs only to tasks
- task time fields continue to support optional scheduling

### Add appointment entities

Introduce storage for:

- appointment definitions
- repeating metadata
- occurrence confirmation state

The exact schema can be finalized during implementation, but it must support:

- independent appointment CRUD
- repeating appointments
- per-occurrence confirmation
- one-to-one optional task linkage

### Event compatibility

Do not introduce a full standalone `event` entity in this change.

However, avoid task-only assumptions so both tasks and appointments can later be migrated onto a shared `event` container with minimal churn.

## API Direction

The backend should expose independent appointment APIs rather than folding appointments into `/todo/tasks`.

Expected capability groups:

- appointment create/list/detail/update
- appointment confirmation actions
- appointment calendar/timeline queries
- arrangement-oriented summary queries if needed by the modal

Task APIs continue to exist independently.

## Migration Strategy

This feature should ship incrementally rather than as a hidden big-bang rewrite.

Recommended order:

1. introduce backend appointment model and tests
2. add frontend appointment types and APIs
3. rename task entry surfaces to arrangement language
4. add right-column tab split
5. evolve left-column summary into task + appointment sections
6. upgrade quick creation to arrangement parsing
7. extend calendar/overview views

## Testing Strategy

### Backend

Add route and state tests for:

- appointment CRUD
- automatic `needs_confirmation` transition behavior
- confirmation result actions
- repeating appointment occurrence handling
- task/appointment link validation

### Frontend

Add component and interaction tests for:

- arrangement modal type tabs
- left-column section rendering
- pending confirmation reminder visibility
- appointment editor opening from summary cards
- quick arrangement assistant type detection/flow
- combined calendar rendering rules

## Non-Goals

This change does not include:

- a standalone `event` entity
- per-occurrence rescheduling overrides for repeating appointments
- making appointments participate in focus workflows
- replacing the current home entry with multiple top-level entry points

## Open Decisions Already Resolved

The following decisions were explicitly confirmed during design:

- appointments are independent from tasks, not a `task_type`
- the top-level entry becomes `安排`
- the modal keeps a unified entry point
- the right column uses `任务 / 日程` tabs
- the left column order is `今日任务 -> 今日日程 -> 待确认日程`
- confirmation-needed appointments still open full edit directly
- appointments require `ends_at`; `starts_at` is optional
- appointments are shown as deadline dots, not blocks
- cancelled appointments remain visible
- repeating appointments support per-occurrence confirmation
- task and appointment linkage is one-to-one
- quick creation supports both kinds
