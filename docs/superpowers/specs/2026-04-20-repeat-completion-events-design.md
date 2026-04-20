# Repeat Completion and Event Binding Design

## Summary

This design upgrades `task`, `appointment`, and `event` into a coherent arrangement model with two major capabilities:

- repeat completion rules shared by tasks and appointments
- formal event binding so arrangement deadlines can inherit from event deadlines

The current codebase already has pieces of these ideas, but they are incomplete and inconsistent:

- tasks store loose `event` and `event_ids` values instead of a formal event relationship
- appointments have repeat expansion, but no shared completion-rule model
- repeat completion is not a first-class concept for either object type
- task completion still relies on a permanent `status = done` toggle

The goal is to keep `task`, `appointment`, and `event` as separate entities while making completion behavior and event linkage feel like one system.

## Approved Product Decisions

The user approved the following product rules during brainstorming:

- tasks and appointments should both support repeat completion
- one task or appointment can bind to at most one event
- event binding is formal, not a loose text label
- event time is inherited by default, but the user may manually override it later
- if an event time changes, only arrangements that still inherit event time should auto-sync
- one-time items remain permanently completed after completion
- repeating items do not become permanently completed when one cycle is finished
- repeating frequency and completion period are the same concept, not separate configuration
- the default max completions per period is `1`
- max completions per period is user-configurable
- weekday restriction means Monday through Friday only
- items blocked by repeat rules should disappear from the actionable list instead of showing a disabled action

## Goals

- Make repeat completion a formal capability shared by tasks and appointments
- Preserve existing task and appointment domain boundaries instead of collapsing them into one table
- Promote `event` into a real relationship used by tasks and appointments
- Move repeat completion logic to the backend so the frontend consumes derived state instead of reimplementing rules
- Prepare the arrangement modal refactor to consume clean derived arrangement state instead of home-grown heuristics

## Non-Goals

- Merging `task` and `appointment` into a single storage model
- Adding holiday-calendar or region-aware working day logic
- Supporting multiple events per task or appointment
- Supporting separate repeat frequency and completion frequency
- Supporting arbitrary RRULE-style recurrence editing in the first version

## Current State

### Tasks

Tasks currently expose:

- `status`
- `current_cycle_count`
- `target_cycle_count`
- `cycle_period`
- `cycle_every_days`
- `event`
- `event_ids`
- `due_date`

But the system does not use those fields to enforce repeat completion. In practice, task completion is still a permanent `todo -> done` transition.

### Appointments

Appointments currently expose:

- `status`
- `starts_at`
- `ends_at`
- `repeat_rule`
- `linked_task_id`

Appointments support repeated occurrences and independent occurrence confirmation, but they do not share a completion-rule model with tasks and are not formally linked to events.

### Events

Events are currently independent records with:

- `name`
- `due_at`
- `is_primary`

They are used by the countdown UI, but they do not formally drive task or appointment deadlines.

## Conceptual Model

### Keep Three Primary Entities

- `task`: focused effort and work-oriented flows
- `appointment`: attendance / acknowledgment-oriented arrangements
- `event`: external milestone or deadline anchor

These remain separate because their behavior still differs meaningfully.

### Add Shared Completion Semantics

Tasks and appointments both gain the same conceptual completion layer:

- is this item one-time or repeating
- if repeating, what is the recurrence period
- how many times can it be completed inside one active period
- is completion allowed only on weekdays

### Add Formal Event Binding

Tasks and appointments both gain:

- `event_id`
- time inheritance metadata

An event becomes a true anchor object instead of a loose label.

## Data Model Direction

### Task Changes

Add or reinterpret task fields so they support the new shared completion model cleanly.

Recommended shape:

- keep `status` for one-time lifecycle state and backwards compatibility during migration
- add `event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL`
- add `is_recurring BOOLEAN NOT NULL DEFAULT FALSE`
- add `period_type VARCHAR(...) NOT NULL DEFAULT 'once'`
- add `custom_period_days INTEGER NULL`
- add `max_completions_per_period INTEGER NOT NULL DEFAULT 1`
- add `weekday_only BOOLEAN NOT NULL DEFAULT FALSE`
- add `time_inherits_from_event BOOLEAN NOT NULL DEFAULT FALSE`
- add `time_overridden BOOLEAN NOT NULL DEFAULT FALSE`

`due_date` remains on the task row because the user approved manual override after inheritance.

### Appointment Changes

Appointments need the same formal rule shape.

Recommended additions:

- `event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL`
- `is_recurring BOOLEAN NOT NULL DEFAULT FALSE`
- `period_type VARCHAR(...) NOT NULL DEFAULT 'once'`
- `custom_period_days INTEGER NULL`
- `max_completions_per_period INTEGER NOT NULL DEFAULT 1`
- `weekday_only BOOLEAN NOT NULL DEFAULT FALSE`
- `time_inherits_from_event BOOLEAN NOT NULL DEFAULT FALSE`
- `time_overridden BOOLEAN NOT NULL DEFAULT FALSE`

`ends_at` remains on the appointment row for the same reason: inherited by default, overrideable later.

`repeat_rule` should be considered legacy transport state and gradually replaced by structured recurrence fields. The API may temporarily populate both during migration.

### Completion Records

Add a new table for repeat and one-time completion history.

Recommended table:

- `id UUID PRIMARY KEY`
- `user_id BIGINT NOT NULL`
- `subject_type VARCHAR NOT NULL` with allowed values `task | appointment`
- `subject_id UUID NOT NULL`
- `completed_at TIMESTAMPTZ NOT NULL`
- `counted_period_start TIMESTAMPTZ NULL`
- `counted_period_end TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Notes:

- one-time items still create a completion record for history consistency
- repeating items use completion records as the source of truth for “completed this period”
- `counted_period_start/end` are stored denormalized to make audits and debugging easier

### Why Not a Separate Completion Policy Table

A separate `completion_policy` table would be cleaner in a vacuum, but it adds indirection without enough payoff at this scale. Tasks and appointments only need one policy each, and storing those fields directly on the parent rows keeps reads simpler.

## Completion Semantics

### One-Time Items

One-time tasks or appointments:

- can be completed once
- become permanently completed
- remain visible in history / completed sections

For one-time tasks, `status = done` can remain the externally visible permanent state after migration.

For one-time appointments, the permanent state remains a stored appointment status like `attended`.

### Repeating Items

Repeating items:

- do not become permanently complete after one action
- are considered complete only relative to the active period
- become actionable again when a new period begins

The active period equals the recurrence period.

Examples:

- `daily`, max `1`: complete once today, re-open tomorrow
- `weekly`, max `2`: complete at most twice this week, reset next week
- `custom_days = 7`, max `4`: complete at most four times in any rolling seven-day window

### Period Semantics

- `daily`: natural day
- `weekly`: natural week
- `monthly`: natural month
- `custom_days`: rolling window of N days
- `once`: one-time item, not repeating

### Weekday Restriction

`weekday_only = true` means:

- completion is only allowed on Monday through Friday
- the period still exists normally
- weekends do not consume completion count because the item is not completable then

## Derived Completion State

The backend should calculate and return repeat-completion state for both tasks and appointments.

Recommended response payload:

- `completion_state`
- `is_completable_now`
- `completed_count_in_period`
- `remaining_completions_in_period`
- `current_period_start`
- `current_period_end`
- `blocked_reason`
- `hidden_from_action_list`

Recommended blocked reasons:

- `period_limit_reached`
- `not_workday`
- `not_started`
- `already_completed_once`

The exact set can stay small in the first version. The important part is that the frontend should stop deriving these states itself.

## Event Binding Semantics

### Relationship Rules

- one task or appointment may bind to at most one event
- one event may have many tasks and many appointments

### Default Inheritance

When the user binds an event:

- task `due_date` defaults to event `due_at`
- appointment `ends_at` defaults to event `due_at`

### Manual Override

If the user edits the inherited time manually:

- the arrangement keeps its current bound `event_id`
- `time_overridden = true`
- future event deadline changes no longer overwrite the arrangement time

### Event Time Updates

When an event `due_at` changes:

- update all bound tasks where `time_inherits_from_event = true` and `time_overridden = false`
- update all bound appointments with the same condition
- do not overwrite arrangements that have manually diverged

### Event Deletion

If an event is deleted:

- bound `event_id` becomes `NULL`
- existing arrangement times stay as-is
- no arrangement should be deleted automatically

## API Direction

### Task Create / Update

Extend task create and update payloads with:

- `event_id`
- `is_recurring`
- `period_type`
- `custom_period_days`
- `max_completions_per_period`
- `weekday_only`
- `time_overridden`

The backend should normalize invalid combinations:

- `period_type = once` implies `is_recurring = false`
- `custom_period_days` is only valid for `period_type = custom_days`
- `max_completions_per_period >= 1`

### Appointment Create / Update

Extend appointment create and update payloads with the same shared rule fields.

The existing repeat appointment flow should move toward structured recurrence values instead of a free-form `repeat_rule` string. During migration, the backend may continue accepting `repeat_rule` and mapping it into structured fields.

### Completion Actions

Replace or supplement raw status patching with explicit completion actions:

- `POST /todo/tasks/{task_id}/complete`
- `POST /todo/appointments/{appointment_id}/complete`

Behavior:

- one-time task: set permanent completion state and create history record
- repeating task: create completion record only
- one-time appointment: set permanent completion state and create history record
- repeating appointment: create completion record for the current occurrence / period

The backend should reject completion when the item is not completable now.

### List Endpoints

Task and appointment list endpoints should begin returning derived completion state so views can render:

- actionable now
- hidden from actionable list
- permanently completed
- complete for current period

### Event Update Endpoint

The existing event update endpoint should own propagation logic. The frontend must not be responsible for issuing follow-up updates to every linked arrangement.

## Frontend Interaction Direction

### Task Form

The task create/edit form should gain an `Event and Completion Rules` section:

- event picker instead of loose text input
- inherited due time preview
- visible “manual override” state after editing inherited time
- one-time vs repeating choice
- period choice
- custom day count when needed
- max completions per period
- weekday-only toggle

### Appointment Form

The appointment form should gain the same `Event and Completion Rules` section:

- event picker
- inherited end time preview
- manual override state
- structured repeat controls instead of free text only
- max completions per period
- weekday-only toggle

### Arrangement Modal

The arrangement modal should eventually stop using a single “active vs done” split for everything.

Recommended sections:

- `可完成`
- `本周期已达上限`
- `已完成`

Meanings:

- `可完成`: items that can be completed now
- `本周期已达上限`: repeating items that are exhausted for the current period
- `已完成`: permanently completed one-time items

### Calendar / Detail Views

Calendar and detail UIs should show:

- bound event name
- whether the displayed deadline still inherits from the event
- current completion usage such as `1/3`
- next time the item becomes completable when relevant

## Migration Strategy

### Phase 1: Schema and Backend Foundations

- add formal event relations
- add completion-rule columns
- add completion records
- add backend derivation logic
- preserve existing frontend behavior where possible

### Phase 2: Completion Flow Migration

- add explicit completion endpoints
- switch task completion away from raw status toggling for repeating items
- expose derived completion state to the frontend

### Phase 3: Form Migration

- replace loose event text input with event selection
- add repeat-completion controls to task and appointment forms
- add inherited-time / overridden-time behavior

### Phase 4: Arrangement UI Refactor

- refactor the arrangement modal to consume derived arrangement state
- update summary, list, and calendar surfaces to reflect repeat completion semantics

## Testing Direction

Backend tests should cover:

- one-time completion permanence
- repeating daily / weekly / monthly / custom-day windows
- weekday-only gating
- max completions per period > 1
- event deadline inheritance on bind
- event deadline propagation on event edit
- no propagation after manual override
- event deletion nulling relation without deleting arrangements

Frontend tests should cover:

- event picker populates inherited time
- manual time edit flips into override mode
- repeating items disappear from actionable lists after limit is reached
- one-time items still appear under permanent completion
- arrangement modal sections reflect derived backend state instead of old raw-status assumptions

## Risks

- task `status` currently carries too much meaning; migration must avoid breaking existing task views
- appointment recurrence currently mixes template and occurrence semantics; the new completion model must avoid double-counting
- event propagation must be transactional to avoid partial updates when an event deadline changes
- the current large `PlaceholderCard.tsx` component will make frontend migration noisy until arrangement logic is split out

## Recommendation

Implement this as a shared completion-rule layer across separate `task` and `appointment` entities, with formal `event_id` relationships and backend-derived completion state. This delivers the requested behavior without forcing an unnecessary storage merge of tasks and appointments.
