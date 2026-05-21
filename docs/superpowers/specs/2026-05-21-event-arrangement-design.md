# Event Arrangement Design

## Goal

Replace the visible event-workbench concept with "安排" and reshape arrangement content into a two-column task/schedule editor.

## Business Rules

- Visible "事件工作台" wording becomes "安排".
- Visible "工作台内容" wording becomes "安排内容".
- Arrangement content is split into two equal columns: tasks on the left, schedules on the right.
- List mode shows only each task or schedule title.
- Each column ends with an add action: "添加任务" or "添加日程".
- Clicking an add action opens an editor for that column.
- Saving the editor returns the item to its column.
- Clicking an existing task or schedule title reopens the editor for that item.

## Scope

- Update the add-event editor in `frontend/src/components/EventCountdownCard.tsx`.
- Update the created-event arrangement modal in `frontend/src/components/events/EventWorkbenchModal.tsx`.
- Keep backend routes and database names as-is for now. They remain implementation details behind the new product wording.
- Update focused frontend tests for the new interaction.

## Acceptance

- Add-event editor shows "安排", "安排内容", a left task column, and a right schedule column.
- Add-event editor can add and edit task/schedule items from their columns.
- Created-event modal is labeled "安排" and uses the same two-column arrangement-content pattern.
- Tests prove add and edit behavior for both surfaces.
