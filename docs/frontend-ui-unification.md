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
| `CalendarWidget` | `frontend/src/components/CalendarWidget.tsx` | Compact home calendar entry. | Copying calendar grid styling into unrelated components. |

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

## Work Record

| Date | Scope | Completed | Follow-up |
| --- | --- | --- | --- |
| 2026-06-04 | Workflow phase chips | Registered `WorkflowPhaseChips` in the admin UI library and reused it for the home dashboard active workflow chain. | Consider moving remaining hardcoded chip colors into semantic workflow tokens. |
| 2026-06-03 | Home timer entry | Polished the timer card toward the prototype, kept original height, and reduced odd bottom shadow. | Move remaining hardcoded hero colors into home hero tokens. |
| 2026-06-03 | UI governance | Added this document and the first admin-only React UI component library plan. | Keep this file updated when adding reusable UI primitives. |
