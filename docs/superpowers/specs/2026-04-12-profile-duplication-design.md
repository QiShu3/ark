# Profile Duplication and Parameter Simplification Design

## Context

The `/web` page is used by developers rather than end users. The current profile creation form exposes many configuration fields directly, which is flexible but creates a repetitive workflow when creating similar profiles. In practice, the main pain point is repeated entry of the same values across profiles rather than lack of power.

The goal of this change is to reduce repetitive input while preserving developer control. The chosen direction is to add profile duplication, remove `workspace_dir` from profile configuration, and improve TTS field ergonomics without redesigning the entire configuration model.

## Goals

- Reduce repeated manual input when creating similar profiles
- Preserve the ability to customize all existing advanced parameters
- Keep the current backend profile API contract intact where possible
- Move `workspace_dir` responsibility out of profile creation
- Make TTS `voice` and `model` fields safer by using selects instead of free-form text inputs

## Non-Goals

- Redesigning the full profile data model
- Introducing profile templates or preset libraries
- Changing tools or MCP configuration behavior in this iteration
- Building a complete provider-sourced catalog of all TTS voices/models
- Removing advanced developer-only parameters entirely

## Recommended Approach

Implement profile duplication on top of the existing modal workflow and simplify the form through information architecture rather than aggressive field removal.

This includes:

- Adding a `复制` action to each profile row
- Reusing the existing profile modal for create, edit, and duplicate flows
- Removing `workspace_dir` from the profile form
- Moving less frequently changed fields into a default-collapsed `更多` section instead of deleting them
- Converting TTS `voice` and `model` fields from text inputs into provider-linked select fields

This approach directly addresses the repetitive-input problem with minimal backend risk and minimal change to established developer workflows.

## Alternatives Considered

### 1. Provider-driven auto-fill

Selecting an LLM or TTS provider would auto-fill dependent fields such as `model`, `api_base`, and `voice`.

Trade-offs:

- Good for reducing repeated entry
- Still requires repeated form entry for every new profile
- Requires product decisions about default values that are not yet stable
- Does not solve cloning an existing customized profile

### 2. Profile templates

Users would create profiles from named templates or presets.

Trade-offs:

- Very fast once established
- Adds management overhead and a second abstraction layer
- Overlaps with duplication for the current use case
- Higher scope than necessary

### 3. Direct duplication

Use an existing profile as the starting point for a new one.

Trade-offs:

- Best fit for developer workflows with repeated similar configs
- Minimal conceptual overhead
- Works immediately with current stored data

This option is the recommended approach.

## UX Design

### Profile List Actions

Each profile item in the sidebar/list will expose three row-level actions:

- `编辑`
- `复制`
- `删除`

`复制` will appear alongside the existing actions and will be discoverable without introducing a separate workflow entry point.

### Modal Modes

The existing profile modal will support three modes:

- Create mode
- Edit mode
- Duplicate mode

Expected labels:

- Create: title `新建 Profile`, submit button `创建 Profile`
- Edit: title `编辑 Profile`, submit button `保存 Profile`
- Duplicate: title `复制 Profile`, submit button `创建副本`

### Duplicate Flow

When the user clicks `复制`:

- The system opens the profile modal
- All editable values are prefilled from the source profile
- The new profile does not inherit persistent record metadata
- `is_default` is reset to unchecked
- `name` is prefilled as the original name with a copy suffix

Recommended initial suffix:

- `原名称 Copy`

If the user keeps the default duplicate name and the backend rejects it due to uniqueness rules in the future, the UI should surface the error and let the user rename manually. No special auto-increment naming logic is required in this iteration unless the backend already enforces uniqueness.

### Form Structure

The modal will be split into:

- Core fields shown by default
- A `更多` section that is collapsed by default

#### Core fields

- `Profile 名称`
- `System Prompt`
- LLM provider/model/api fields that are already part of the main workflow
- TTS provider
- TTS voice
- TTS model
- `设为默认 Profile`

#### 更多 section

The following fields remain available but move out of the default scan path:

- `max_steps`
- `api_base`
- `api_key`
- `tts auto_play`
- `tts sentence_buffer_chars`
- `skills_dir`
- `MCP JSON`
- tool enable toggles

Exact placement can be adjusted during implementation to preserve layout clarity, but the core rule is that advanced parameters remain available without dominating the initial form.

## Data and Responsibility Boundaries

### Removing `workspace_dir` from Profile

`workspace_dir` will be removed from the profile form because it does not belong to profile-level reusable configuration in the intended workflow.

New rule:

- Profile stores reusable runtime preferences
- Session creation is responsible for workspace generation or assignment

Implications:

- The frontend no longer reads or writes `config_json.agent.workspace_dir` through the profile modal
- Existing stored profiles that already contain `workspace_dir` can continue to exist in persisted data
- Runtime behavior for legacy profiles remains backward compatible unless explicitly changed later

This keeps the change safe while correcting the UI boundary.

### Preserving Existing Advanced Config

The backend create/update API stays unchanged in this iteration. The frontend continues to submit `config_json` and `mcp_config_json` in the current shape. The change is primarily about modal structure and which fields are surfaced prominently.

## TTS Select Design

### Current Constraint

The repository does not currently define a complete provider-backed catalog of all TTS voices and models. It only defines a small set of known defaults.

Known current values in code:

- MiniMax voice: `female-shaonv`
- MiniMax model: `speech-02-hd`
- Edge voice: `zh-CN-XiaoxiaoNeural`
- Edge model: not meaningfully used today

### First Iteration Behavior

TTS `voice` and `model` will become select controls linked to the chosen TTS provider.

Initial options will be intentionally conservative:

- For `minimax`
  - Voice options: `female-shaonv`
  - Model options: `speech-02-hd`
- For `edge`
  - Voice options: `zh-CN-XiaoxiaoNeural`
  - Model options: a disabled or single fixed placeholder because the current implementation does not use a meaningful Edge model catalog

This satisfies the UX requirement of using selects instead of text inputs without expanding scope into third-party capability discovery.

### Future Extension Path

If needed later, the provider option tables can be extended with more known-safe values or replaced with data fetched from provider APIs. That is explicitly out of scope for this change.

## Error Handling

- Invalid JSON in `MCP JSON` continues to block submit with a clear error
- Duplicate mode must never overwrite an existing profile because it always submits through `POST /profiles`
- If duplication fails, the user remains in the modal and sees the error
- If advanced fields are hidden in `更多`, validation messages must still clearly indicate the failing field

## Testing Strategy

### Frontend behavior

- Opening duplicate mode pre-fills fields from the source profile
- Duplicate mode resets `is_default`
- Duplicate mode changes title and submit button text
- `workspace_dir` is no longer present in the profile form
- `更多` toggles advanced fields without losing entered values
- TTS provider changes update the available voice/model selects

### API interaction

- Duplicate submit calls `POST /profiles`
- Edit submit still calls `PUT /profiles/{id}`
- Payloads no longer include `config_json.agent.workspace_dir` from the form flow

### Regression coverage

- Existing profile edit behavior still works
- Existing profile creation still works with advanced fields collapsed by default
- Profiles with legacy stored `workspace_dir` can still be edited without UI breakage

## Implementation Notes

- The frontend should introduce an explicit duplication state distinct from edit state
- Reusing the existing modal logic is preferred over creating a second modal
- The UI should centralize profile form serialization so create, edit, and duplicate all use the same payload builder with small mode-specific differences
- The profile detail panel may continue to display legacy stored `workspace_dir` for old records if present, but the modal should not expose it for editing

## Open Decisions Resolved

- Duplication is the primary solution for repetitive entry
- `workspace_dir` is removed from the profile form
- `max_steps` and other advanced parameters are retained under `更多`
- TTS `voice` and `model` are converted to select controls
- The first iteration uses a small built-in option table rather than a full provider catalog

## Scope Check

This scope is appropriate for a single implementation plan. It affects one main surface area, reuses existing APIs, and does not require a backend contract redesign.
