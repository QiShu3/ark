---
description: Guides GitHub Flow from branch creation to PR merge. Invoke when user asks to implement features/fixes with proper branching, commits, PR, and review workflow.
---

# GitHub Flow

Use this skill to execute a standard GitHub Flow process for feature or bugfix delivery.

## When to Invoke

- User asks to implement a feature and submit via pull request
- User asks to fix a bug following branch + PR workflow
- User asks for a safe release path without long-lived release branches
- User asks how to work collaboratively with review gates

## Core Principles

- Keep `main` always deployable
- Use short-lived branches from latest `main`
- Make small, reviewable commits
- Open pull request early and update continuously
- Merge only after checks pass and review is approved

## Standard Workflow

1. Sync local `main` with remote
2. Create a branch using clear naming:
   - `feature/<short-description>`
   - `fix/<short-description>`
   - `chore/<short-description>`
3. Implement in small increments
4. Commit with clear intent (Conventional Commits preferred)
5. Push branch and open PR against `main`
6. Ensure CI passes and address review feedback
7. Squash or rebase-merge according to repo policy
8. Delete merged branch

## Branch Naming Convention

- Lowercase words joined by hyphens
- Include scope when useful
- Examples:
  - `feature/arxiv-search-filters`
  - `fix/login-timeout-retry`
  - `chore/update-lint-rules`

## Commit Convention

Prefer Conventional Commits:

- `feat: add arxiv scope switch`
- `fix: handle empty response in paper list`
- `chore: align eslint config`
- `refactor: simplify focus state sync`
- `test: add api chat error coverage`

## Pull Request Checklist

- PR title clearly describes change
- Description includes context, change summary, and risk
- Linked issue/task if available
- Tests added/updated for behavior changes
- CI checks are green
- Review comments resolved

## Review and Merge Policy

- At least one meaningful approval
- No unresolved conversations
- No failing required checks
- Merge strategy follows repository rules

## Safety Guardrails

- Do not force-push shared branches unless coordinated
- Do not merge with failing required status checks
- Do not bypass review policy for non-emergency changes
- Keep PR focused; split large changes when needed

## Output Template

When asked to run GitHub Flow, structure output as:

1. Branch plan
2. Change summary
3. Commit plan or commit list
4. PR draft (title + description)
5. Validation status (tests/CI)
6. Merge readiness decision

## Example PR Title

- `feat(arxiv): add search scope selector`
- `fix(todo): correct focus switch behavior`

## Example PR Description Template

```md
## Why
<problem statement>

## What
- <change 1>
- <change 2>

## Validation
- <tests run>
- <results>

## Risks
- <known risk or "low">
```