# Frontend UI Unification

This document is the long-running record for frontend UI unification work. Its job is to keep new UI work aligned with existing components, theme tokens, and reusable patterns before one-off styling is added.

## Goals

- Prefer existing components before creating new UI primitives.
- Keep theme-specific values in CSS variables, not scattered through component markup.
- Make future themes additive: adding `:root[data-theme="..."]` should not require component rewrites.
- Keep special surfaces, such as the home timer hero card, as explicit variants rather than hidden one-off rules.

## New UI Checklist

- Check whether an existing component already covers the need.
- Check whether the required color, surface, border, radius, shadow, or typography token already exists.
- Prefer adding a variant to an existing component over creating a parallel component.
- Use one-off styling only when the component is truly unique, and record that decision here.
- For visible UI changes, verify light and dark themes in the browser.

## Component Assets

| Component or pattern | Current source | Recommended use | Avoid |
| --- | --- | --- | --- |
| `Button` | `frontend/src/components/Button.tsx` | Standard text, icon, loading, and form actions. | Recreating ordinary buttons with raw `<button>` styles. |
| `AppModalFrame` | `frontend/src/components/AppModalFrame.tsx` | Business modal shell, backdrop, safe area, and dialog semantics. | Hand-rolling modal backdrops for ordinary business dialogs. |
| `HomeCard` | `frontend/src/components/HomeCard.tsx` | Home dashboard card shells and home-specific card variants. | Mixing `ark-home-card` with ad hoc radius/padding decisions in new home panels. |
| `HomeSectionHeader` | `frontend/src/components/HomeSectionHeader.tsx` | Home dashboard section titles with optional right action. | Repeating section title markup with drifting typography. |
| `WorkflowPhaseChips` | `frontend/src/components/WorkflowPhaseChips.tsx` | Workflow phase previews, active workflow phase chains, and event workflow draft cards. | Rebuilding blue/green phase capsules, arrows, task labels, or truncation rules per page. |
| `SubAppHomeTemplate` | `frontend/src/components/SubAppHomeTemplate.tsx` | Sub-application landing pages with shared hero/metrics structure. | Designing each sub-app home as a separate bespoke layout. |
| `ChoiceQuestionFocusTemplate` | `frontend/src/components/focus-work/templates/ChoiceQuestionFocusTemplate.tsx` | Sub-application focus-work surfaces that need a reading/material area plus one current choice question with submit/feedback/next flow. | Rebuilding option state, submit locking, or focus-work question card styling inside each sub-app. |
| `FlashcardFocusTemplate` | `frontend/src/components/focus-work/templates/FlashcardFocusTemplate.tsx` | Focus-work surfaces using FSRS-style flashcard with reveal/rate/next flow, currently for vocab study flows. | Reimplementing flashcard reveal, rating buttons (again/hard/good/easy), or keyboard shortcuts per sub-app. |
| `WorkflowSettlementModal` | `frontend/src/components/focus-work/WorkflowSettlementModal.tsx` | Focus-work workflow completion review with path timeline, status badges, and compact summary metrics. | Rendering workflow completion as a plain text run list or introducing fork/补练 wording in user-facing copy. |
| `CalendarWidget` | `frontend/src/components/CalendarWidget.tsx` | Compact home calendar entry. | Copying calendar grid styling into unrelated components. |
| `SubAppPageShell` | `frontend/src/components/SubAppPageShell.tsx` | Outer container for every non-home sub-app page (fixed positioning, clip-path, scroll, max-width). | Repeating the `fixed inset-x-1 bottom-1 top-[7.5rem]` + `clipPath` + `mx-auto max-w-*` shell in each page. |
| `SubAppPageHeader` | `frontend/src/components/SubAppPageHeader.tsx` | Page header with breadcrumb, title, optional description, and back link. | Hand-rolling title/description/back-link markup per sub-app page. |
| `SubAppConfigModal` | `frontend/src/components/SubAppConfigModal.tsx` | Unified sub-app config dialog (binding info, focus-work list, content-config slots, task config). Replaces per-app inline or bespoke config modals. | Building separate config dialogs per sub-app with duplicated save/close/loading/event-info patterns. |

## Token Rules

- Use semantic tokens such as `--ark-text`, `--ark-surface`, `--ark-border`, `--ark-accent`, and `--ark-glass-*`.
- New themeable home UI values should use `--home-*` tokens before hardcoded colors.
- Hardcoded colors are acceptable only for stable brand-neutral exceptions, such as the existing white CTA exception, or for temporary migration steps recorded below.
- Component-scoped theme overrides should live near the component family in `index.css` and be named after the surface they control.

## Current Home Dashboard Direction

- The right dashboard uses a shared glass surface language.
- The timer card is a `hero` variant: it may be visually richer than other cards, but should still consume tokens for text, accent, shadows, and decorative opacity.
- Standard cards should share radius, border, background, title typography, and spacing decisions through `HomeCard` and `HomeSectionHeader`.
- Shortcut cards should remain action-oriented but reuse the same home card foundation.

## Experimental Desktop Home

- `/#/test` is an isolated desktop-only layout prototype in `frontend/src/pages/TestHomeDesign.tsx`.
- It explores a compact application shell, one dominant focus stage, denser task rows, and a secondary assistant panel.
- Treat it as a review surface rather than a shared component source. Promote approved patterns into shared primitives before reusing them elsewhere.

## Work Record

| Date | Scope | Completed | Follow-up |
| --- | --- | --- | --- |
| 2026-07-05 | Focus-work workflow settlement visual refresh | Reworked `WorkflowSettlementModal` into a visual level-clear completion review with a dedicated hero background asset, floating metric cards, path timeline, and summary card while continuing to use the existing `WorkflowSettlement` DTO and focus-work tokens. | Add backend start/end timestamps per node only if the timeline needs exact clock ranges instead of duration-based review. |
| 2026-06-30 | Focus-work workflow settlement | Upgraded `WorkflowSettlementModal` into a path-oriented completion review using focus-work tokens, status badges, and compact metric cells; aligned visible copy with the learning-path wording. | Revisit the backend DTO when run path IDs and parent/source IDs need to be exposed directly for richer graph rendering. |
| 2026-06-22 | Deliberate workflow admin sub-app | Added the admin-only `DeliberateWorkflow` page using `SubAppPageShell`, `SubAppPageHeader`, and `Button`; kept form/card styling on semantic Ark tokens without adding a new shared primitive. | If more admin workflow pages appear, extract a compact admin form section component. |
| 2026-06-14 | Sub-app page shell & header templates | Created `SubAppPageShell` (10 pages migrated: ERC Library/Mistakes/Practice/PracticeResult/Review, Vocab Study/Review/Mistakes/Today/WordDetail) and `SubAppPageHeader` (7 pages with breadcrumb/title/back-link patterns). Eliminated ~90 lines of replicated outer-container + header JSX. | Apply to any new sub-app pages; consider `AsyncContent` wrapper for loading/error/empty states next. |
| 2026-06-14 | Focus-work templates & type cleanup | Registered `FlashcardFocusTemplate`. Removed the unused multi-phase `FocusWorkPhaseTemplate` after ERC practice became a single-stage flow. Removed 11 unused fields from `FocusWorkSnapshot` and `WorkflowSnapshot` types. | Continue pruning stale fields once backend stops populating legacy columns. |
| 2026-06-14 | Sub-app config modal | Created `SubAppConfigModal` — unified config dialog with binding info, focus-work list, content-config slots, and shared task config. Refactored Vocab (1 focus work, no enable/sync toggles) and ERC (2 focus works with toggles) to use it. Replaced `TodayPlanModal` inline usage. | Migrate any future sub-app config to this modal; add new optional fields as sub-apps need them. |
| 2026-06-13 | Focus-work choice template | Registered `ChoiceQuestionFocusTemplate` as the shared option-question focus-work surface after migrating ERC review. | Reuse this template before adding fill-in or solution templates with separate interaction contracts. |
| 2026-06-04 | Workflow phase chips | Registered `WorkflowPhaseChips` in the admin UI library and reused it for the home dashboard active workflow chain. | Consider moving remaining hardcoded chip colors into semantic workflow tokens. |
| 2026-06-03 | Home timer entry | Polished the timer card toward the prototype, kept original height, and reduced odd bottom shadow. | Move remaining hardcoded hero colors into home hero tokens. |
| 2026-06-03 | UI governance | Added this document and the first admin-only React UI component library plan. | Keep this file updated when adding reusable UI primitives. |
