# Home Right Panel Collapse Design

## Summary

Add a desktop-only collapse interaction to the home page right panel. The panel remains expanded by default, can be manually collapsed by the user, and leaves behind a slim edge handle on the right side so it can be reopened quickly. The collapsed or expanded state should persist across page reloads for the current user in the current browser.

## Current Context

The home page is composed of a two-column layout in [frontend/src/App.tsx](/Users/qishu/Project/ark/frontend/src/App.tsx), with:

- [frontend/src/components/LeftPanel.tsx](/Users/qishu/Project/ark/frontend/src/components/LeftPanel.tsx) rendering the main visual area at a fixed `65%` width.
- [frontend/src/components/RightPanel.tsx](/Users/qishu/Project/ark/frontend/src/components/RightPanel.tsx) rendering the utility cards at a fixed `35%` width.

The current layout is visually balanced but the right side competes with the large character-centric hero area. Because the user uses the right panel intermittently, a manual collapse affordance would improve focus while preserving quick access.

## Goals

- Keep the right panel expanded on first visit.
- Let the user manually collapse and expand the panel from the home page.
- Preserve a small visible handle after collapse so the control remains discoverable.
- Expand the left-side hero area when the right panel is collapsed.
- Persist the choice in local storage so reloads keep the user preference.
- Keep the implementation low-risk by building on the existing layout structure.

## Non-Goals

- No mobile drawer redesign in this task.
- No changes to the content hierarchy inside the cards.
- No global sidebar state shared with `/apps`, `/agent-console`, or other routes.
- No drag-resize behavior.

## Recommended Approach

Use the existing home page flex layout and add a lightweight collapsed state in the page container. When collapsed, the right panel should shrink to a narrow edge strip that visually reads as a slim pill handle attached to the screen edge. The panel content should remain mounted but clipped from view, so reopening is smooth and does not reset any internal UI state.

This approach is preferred over turning the panel into an overlay or floating drawer because:

- It minimizes layout risk in the current codebase.
- It keeps the user mental model simple: the panel is still the right column, just folded away.
- It fits the selected visual direction best: clean, quiet, and subordinate to the main hero area.

## Interaction Design

### Default State

- Desktop view loads with the right panel expanded.
- The right panel keeps its current approximate width and card structure.
- A subtle collapse control is visible at the right panel edge and collapses toward the screen's right side.

### Collapse Action

- Clicking the collapse button transitions the right panel from its normal width to a slim width of roughly `14px` to `18px`.
- The left panel expands to occupy the freed space.
- The right-side cards are hidden by clipping and opacity treatment rather than unmounting.
- The remaining handle stays vertically centered on the right edge.

### Collapsed State

- Only the slim handle remains visible.
- The handle uses a pill shape with subdued default styling and stronger hover and focus states.
- The icon direction should indicate the next action, not the current state.
- The control remains keyboard accessible.

### Expand Action

- Clicking or keyboard-activating the handle restores the right panel to its expanded desktop width.
- Re-expansion uses the same smooth timing and easing as collapse.

## Layout Behavior

### App Container

The state should live in the home page container component so both columns can react together. This keeps width transitions synchronized and avoids duplicated layout logic across the left and right panels.

### Left Panel

- Expanded mode keeps the current visual structure.
- Collapsed mode shifts the left panel to fill the available width.
- The transition should be smooth enough that the hero image and event card do not appear to jump abruptly.

### Right Panel

- The panel container remains present in the layout at all times.
- Expanded mode preserves the current card stack and spacing.
- Collapsed mode reduces the container width to the handle width, hides overflow, and retains a visible expand affordance.

## State Management

Use a dedicated local storage key for the home page right panel state, for example `ark-home-right-panel-collapsed`.

Behavior:

- If no saved value exists, default to expanded.
- Save `true` when the panel is manually collapsed.
- Save `false` when it is manually expanded.
- Read the value on initial render and apply it before the first meaningful paint where practical, so the UI does not flash between states.

The state should stay local to the home page and must not alter behavior on other routes.

## Accessibility

- The handle must be a semantic `button`.
- Provide an `aria-label` that reflects the next action, such as "Collapse right panel" or "Expand right panel".
- Ensure visible focus styles are present in both expanded and collapsed states.
- Support keyboard activation via Enter and Space automatically through the native button element.
- Do not reduce the hit area below a comfortably clickable target even if the visual line remains narrow.

## Animation

- Use a transition in the range of `240ms` to `320ms`.
- Prefer `ease-out` or a similarly soft curve.
- Animate width and any related opacity changes together.
- Avoid springy or bouncy motion because it conflicts with the calm home page aesthetic and makes the hero area feel unstable.

## Responsive Behavior

This work is desktop-only.

- On desktop breakpoints, enable the collapse interaction.
- On smaller breakpoints, preserve current behavior for now.
- The implementation should avoid making mobile behavior worse, but a mobile drawer pattern is explicitly out of scope for this change.

## Implementation Shape

### App Component

Update [frontend/src/App.tsx](/Users/qishu/Project/ark/frontend/src/App.tsx) to:

- own the collapsed state
- initialize it from local storage
- pass state and toggle callbacks into both panels

### Left Panel Component

Update [frontend/src/components/LeftPanel.tsx](/Users/qishu/Project/ark/frontend/src/components/LeftPanel.tsx) to:

- accept a `collapsed` prop
- derive width and border styling from the home page state
- preserve existing inner content composition

### Right Panel Component

Update [frontend/src/components/RightPanel.tsx](/Users/qishu/Project/ark/frontend/src/components/RightPanel.tsx) to:

- accept `collapsed` and `onToggle`
- manage the outer shell width transition
- render the edge handle
- keep existing card content mounted and clipped when collapsed

## Testing Strategy

### Manual Verification

- Home page opens with the right panel expanded by default.
- Clicking collapse hides the right panel and expands the left panel.
- The slim handle remains visible on the right edge.
- Clicking the handle restores the panel.
- Refreshing the page preserves the last chosen state.
- Keyboard focus can reach the handle and activate it.
- The hero area does not visibly jerk or misalign during transition.

### Automated Coverage

Add or update lightweight frontend tests for:

- default state when storage is empty
- persisted collapsed state from storage
- toggle interaction updating state
- local storage writes on collapse and expand

If component-level tests become too cumbersome because of layout-only class changes, prioritize coverage around state initialization and button interaction.

## Risks And Mitigations

### Risk: abrupt visual jump

Because the left side contains a large centered character visual, width changes can feel more dramatic than in a plain dashboard.

Mitigation:

- use a softened width transition
- avoid additional transforms on the hero content during collapse

### Risk: hidden handle discoverability

A very slim handle can become too subtle.

Mitigation:

- strengthen hover and focus treatments
- ensure the hit area exceeds the visible line width

### Risk: future right panel content regressions

The right panel includes multiple card types and at least one card with overlay positioning behavior.

Mitigation:

- keep panel children mounted
- apply clipping at the panel container boundary rather than conditional rendering individual cards

## Open Decisions Resolved In This Design

- Default behavior: expanded.
- Reopen affordance: slim visible handle remains on the right edge.
- Preferred visual direction: edge tab rather than preview strip or floating pill.
- Persistence: browser local storage on the home page only.
