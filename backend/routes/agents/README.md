# Agents Module Notes

## Current Implementation

This folder now contains the Ark agent backend entrypoints and shared infrastructure.

### Implemented architecture

- `models.py`
  - Shared Pydantic models and dataclasses for agent actions, skills, chat payloads, policy rules, and agent context.
- `skills.py`
  - Skill registry exposed to the LLM.
  - Skill-to-action mapping used by the chat tool-calling flow.
- `policy.py`
  - Subject, capability, and scope evaluation.
  - Current supported subjects:
    - `dashboard_agent`
    - `app_agent:arxiv`
    - `app_agent:vocab`
- `executor.py`
  - Action execution and approval-ticket handling.
  - Creates and consumes approval records in `agent_approvals`.
  - Executes the current domain actions:
    - `task.list`
    - `task.update`
    - `task.delete.prepare`
    - `task.delete.commit`
    - `arxiv.daily_tasks.prepare`
    - `arxiv.daily_tasks.commit`
- `routes.py`
  - HTTP routes for `/api/agent/skills` and `/api/agent/actions/{action_name}`.
- `chat.py`
  - `/api/chat` route.
  - DeepSeek chat-completions integration.
  - Converts skill registry into LLM function-calling tools.
  - Reuses the same executor/policy path as the direct action API.

## Product Features Added

### 1. Unified agent action gateway

Added a structured action layer for agent-triggered operations:

- direct result actions
- approval-required actions
- forbidden responses

This gives frontend, agent chat, and future MCP integration a shared execution contract.

### 2. Approval flow for sensitive actions

Sensitive actions no longer execute directly.

Current supported approval-backed actions:

- task deletion
- arXiv daily candidate batch task creation

Approval flow:

1. prepare action creates an approval ticket
2. frontend receives structured approval payload
3. frontend confirms with `approval_id`
4. commit action revalidates ticket and executes once

### 3. Policy and scope control

Current policy layer supports:

- agent identity checks
- capability checks
- scope checks
- sensitive-action confirmation rules

Current behavior:

- `dashboard_agent` can operate on global tasks
- `app_agent:arxiv` can prepare arXiv daily task actions
- cross-app task reads require `cross_app.read.summary`

### 4. Agent chat integration

Added `/api/chat` backed by DeepSeek using:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`

The chat route:

- builds tool definitions from `skills.py`
- lets the model call functions
- routes all execution through the shared action executor
- surfaces approval-required results back to the frontend

## Frontend Features Added

These backend changes are already used by the frontend:

- new `#/agent` page as the dashboard agent console
- left-side skill list loaded from `/api/agent/skills`
- right-side chat area backed by `/api/chat`
- approval card for sensitive actions
- task deletion in dashboard migrated to approval-backed action flow
- arXiv daily batch create migrated to the same action contract

## Tests Added

Covered behavior includes:

- skill listing
- forbidden action checks
- cross-app summary permission behavior
- approval prepare/commit flow
- expired approval rejection
- chat plain-reply path
- chat approval surfacing path

## Recommended Next Steps

### 1. Replace hardcoded executor branching with action registration

Current executor still uses explicit `if action_name == ...`.

Recommended next refactor:

- define an action registry object
- register action metadata and handler functions in one place
- resolve handlers dynamically

This will make adding new actions safer and reduce branching complexity.

### 2. Separate skills from action exposure more explicitly

Today `skills.py` contains:

- skill definitions
- skill-to-action mapping

Recommended split:

- `skills.py` for LLM-facing function definitions only
- `skill_bindings.py` for skill-to-action mapping

This will make future MCP exposure cleaner.

### 3. Add more granular capability definitions

Current capability model is enough for v1, but should evolve into a more explicit matrix, for example:

- `tasks.read.global`
- `tasks.read.summary`
- `tasks.write.global`
- `task.delete`
- `cross_app.read.summary`
- `cross_app.read.details`
- `cross_app.write.linked_resource`

### 4. Move action-specific business logic closer to each domain

Current executor contains task and arXiv action logic together.

Recommended future split:

- `actions/task_actions.py`
- `actions/arxiv_actions.py`
- `actions/approval_actions.py`

Then the executor can become orchestration-only.

### 5. Add persistent tool-execution traces

For debugging and UX transparency, add an agent run log table storing:

- session id
- agent type
- user message
- selected tool calls
- tool results
- approval ids
- final assistant reply

This will help explain agent behavior in the UI.

### 6. Add streaming chat support

Current `/api/chat` returns a final response only.

Recommended follow-up:

- add SSE streaming reply support
- stream assistant text and tool status events separately
- stream approval-required events as structured payloads

### 7. Prepare for external MCP integration

If Ark later introduces MCP tool exposure, keep this rule:

- MCP tools should call into this agent action layer
- MCP must not bypass policy or approval logic

The current `skills -> action executor -> policy -> domain logic` path should remain the single trusted backend path.
