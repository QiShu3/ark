# Repository Guidelines

## Project Structure & Module Organization
This repository is split into `frontend/` and `backend/`.

- `frontend/src/` contains the React + TypeScript app.
- `frontend/src/components/`, `pages/`, `routes/`, `hooks/`, and `lib/` hold UI, route screens, routing guards, reusable hooks, and client utilities.
- For larger frontend sub-apps or domain modules, group related files under a dedicated namespace folder instead of scattering them across shared directories. Example: place vocab pages under `frontend/src/pages/Vocab/`, vocab components under `frontend/src/components/Vocab/`, vocab hooks under `frontend/src/hooks/vocab/`, and vocab utilities/types under `frontend/src/lib/vocab/`.
- `frontend/src/pages/__tests__/` contains frontend tests.
- `backend/main.py` is the FastAPI entrypoint.
- `backend/routes/` contains API route modules such as auth, todo, and arXiv.
- `backend/tests/` contains backend pytest suites.
- `backend/scripts/` contains lightweight self-test scripts.
- Static screenshots in `pictures/` are local-only and ignored by Git.

## Build, Test, and Development Commands
Frontend commands run from `frontend/`:

- `pnpm install` installs dependencies.
- `pnpm dev` starts the Vite dev server on `localhost:5173`.
- `pnpm build` runs TypeScript build checks and outputs a production bundle.
- `pnpm check` runs TypeScript without emitting files.
- `pnpm lint` runs ESLint.
- `pnpm test` runs Vitest.

Backend commands run from `backend/`:

- `uv sync` installs Python dependencies from `pyproject.toml`.
- `uv run uvicorn main:app --reload` starts the FastAPI server locally.
- `uv run pytest` runs backend tests.
- `uv run ruff check .` runs Python lint checks.

## Coding Style & Naming Conventions
- Follow existing file-local style before introducing new patterns.
- Frontend uses TypeScript, React function components, and PascalCase component filenames such as `AppCenter.tsx`.
- Hooks should use `useX` naming; helpers in `lib/` should use clear noun/verb names.
- **UI unification workflow**: Before adding new frontend UI, check [docs/frontend-ui-unification.md](/Users/qishu/Project/ark/docs/frontend-ui-unification.md) and the admin-only React component library at `/#/admin/ui`. Prefer existing components and variants before adding one-off styles.
- **Reusable UI components**: Reuse shared primitives such as `Button`, `AppModalFrame`, `HomeCard`, and `HomeSectionHeader` where they fit. If a new component or visual pattern is introduced, update the UI unification document with usage guidance and source entry.
- **Frontend CSS/Theme**: Components must use semantic Tailwind classes from the `@theme` block in `index.css` — never hardcode `text-white`, `border-white/10`, `bg-white/5`, `bg-black/30`, or hex dark colors. Use `text-ark-text`, `text-ark-text-muted`, `text-ark-text-faint`, `bg-ark-surface-subtle`, `border-ark-border`, `bg-ark-overlay`, etc. Exception: CTA buttons with `bg-white` (solid) + `text-slate-950` are intentionally theme-independent.
- **Focus-work components** (`components/focus-work/`, `ERC/ERC*FocusWork.tsx`, `Vocab/VocabTodayFocusWork.tsx`): Use bracket syntax for component-scoped variables — `text-[var(--focus-work-text)]`, `border-[var(--focus-work-border)]`, `bg-[var(--focus-work-surface-soft)]`, etc.
- **Adding a new theme**: Add a `:root[data-theme="xxx"]` block in `index.css` with values for all `--ark-*` variables. No component changes needed.
- Backend uses snake_case for modules, functions, and variables.
- Python formatting and import sorting are enforced with Ruff; line length is 120.
- Keep route modules focused by domain rather than adding large mixed-purpose files.

## Testing Guidelines
- Frontend tests use Vitest and Testing Library. Place tests beside pages in `frontend/src/pages/__tests__/` and prefer `*.test.tsx`.
- Backend tests use pytest. Name files `test_*.py` and keep fixtures in `backend/tests/conftest.py`.
- Add or update tests for new route behavior, auth flows, and non-trivial UI state changes.

## Commit & Pull Request Guidelines
- Follow the existing commit style: `feat: ...`, `fix: ...`, `chore: ...`, `refactor: ...`, with optional scopes like `feat(frontend): ...`.
- Keep commits focused and avoid mixing frontend and backend refactors unless required by one feature.
- After each code commit, update the development log without loading the full history:
  - Add the full commit entry to the current branch shard in [docs/devlogs/](/Users/qishu/Project/ark/docs/devlogs/), creating the shard if needed; use the branch name with `/` and other non-`a-z0-9._-` characters replaced by `-`.
  - Refresh the compact [开发日志.md](/Users/qishu/Project/ark/docs/开发日志.md) only for its recent-record summary and shard index.
  - Include the user request wording, commit hash, completed work, and verification notes in the branch shard.
- PRs should include a short problem statement, implementation summary, test evidence, and screenshots for visible UI changes.

## Configuration & Security Tips
- Do not commit secrets. Use `backend/.env.example` as the template for local configuration.
- Ignore generated artifacts such as `.venv/`, build output, caches, and local screenshots.
