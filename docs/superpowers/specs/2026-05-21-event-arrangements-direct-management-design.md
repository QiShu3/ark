# Event Arrangements Direct Management Design

## Goal

Make the created-event arrangement page manage real tasks and schedules directly.

The page should no longer expose a draft workflow or event-template workflow. After an event already exists, this page is for managing the event's actual arrangements only.

## Confirmed Decisions

- Remove the user-visible draft concept from the created-event arrangement page.
- Keep event-template features in the add-event flow. This change only affects the page opened from an existing event.
- Remove `选择事件模板`, `套用模板`, and `模板工作台` from this page.
- Remove other template actions from this page, including saving current content as a template and writing current content back to a source template.
- Remove `生成正式安排`.
- Merge `安排内容` and `已创建安排` into one real arrangement area.
- Keep the two-column arrangement layout: tasks on the left, schedules on the right.

## User Experience

The page has three conceptual sections:

- `事件总览`: event name, start date, due time, primary-event status, edit, delete, and set-primary controls.
- `安排内容`: the real tasks and schedules linked to this event.
- `成就摘要`: the existing read-only event achievement summary.

In `安排内容`:

- The task column lists actual tasks whose `event_id` is the current event.
- The schedule column lists actual appointments whose `event_id` is the current event.
- Clicking `添加任务` creates a real task after the inline editor is saved.
- Clicking `添加日程` creates a real appointment after the inline editor is saved.
- Clicking an existing task or schedule opens an inline editor for that real record.
- Deleting an item deletes the real task or appointment through the existing delete endpoints.

There is no separate right-side `已创建安排` panel because all visible arrangement content is already created.

## Data Flow

The existing workbench response can continue to provide `created_tasks` and `created_appointments`. The frontend should stop using `plan_draft` for this page.

Task creation should use the existing task API with conservative defaults:

- `title`: editor title
- `content`: editor note or `null`
- `event`: current event name
- `event_id`: current event id
- `due_date`: selected task time, or `null`
- `status`: `todo`
- `task_type`: `focus`
- `period_type`: `once`
- recurrence and completion settings: existing one-off defaults

Schedule creation should use the existing appointment API:

- `title`: editor title
- `content`: editor note or `null`
- `event_id`: current event id
- `starts_at`: `null` unless the editor later grows start-time support
- `ends_at`: selected schedule time
- `status`: `pending`
- `period_type`: `once`

Updating an item should call the existing task or appointment patch endpoint. Deleting should call the existing task or appointment delete endpoint.

## Legacy Draft Data

Existing `event_plan_drafts` and `event_plan_draft_items` can remain in the backend for now. They should become legacy implementation details and should not drive this page.

This change should not automatically convert existing draft rows into tasks or appointments. Silent conversion could create real work items the user did not explicitly confirm. If legacy draft migration is needed later, handle it as a separate explicit cleanup.

## Scope

In scope:

- Refactor `frontend/src/components/events/EventWorkbenchModal.tsx` so its arrangement area reads and mutates real tasks and appointments.
- Add small frontend API helpers if needed for creating, updating, and deleting tasks and appointments.
- Update frontend tests for the created-event arrangement page.
- Keep created-event arrangement copy focused on `安排` and `安排内容`.
- Verify in the browser that the page no longer shows template controls and that adding a task or schedule creates a real arrangement.

Out of scope:

- Do not remove template support from the add-event flow.
- Do not remove template management globally.
- Do not drop legacy draft database tables or routes in this change.
- Do not redesign the full task or schedule editor.
- Do not migrate old draft rows automatically.

## Acceptance Criteria

- Existing-event arrangement page does not render `选择事件模板`, `套用模板`, `模板工作台`, `另存为事件模板`, `回写源模板`, or `生成正式安排`.
- `安排内容` shows real event-linked tasks and schedules in two columns.
- Adding a task creates a real task linked to the current event.
- Adding a schedule creates a real appointment linked to the current event.
- Editing and deleting visible items act on the real task or appointment.
- Created-event arrangement tests cover the removed template controls and the direct-management task/schedule flows.
- Browser verification confirms the current page behaves without the old draft/template layer.
