# Repository Guidelines

## Project Structure & Module Organization
This repository is split into `frontend/` and `backend/`.

- `frontend/src/` contains the React + TypeScript app.
- `frontend/src/components/`, `pages/`, `routes/`, `hooks/`, and `lib/` hold UI, route screens, routing guards, reusable hooks, and client utilities.
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
- After each code commit, update [开发日志.md](/Users/qishu/Project/ark/docs/开发日志.md) by adding a new commit entry under the matching branch section, including the user request wording, commit hash, completed work, and verification notes.
- PRs should include a short problem statement, implementation summary, test evidence, and screenshots for visible UI changes.

## Configuration & Security Tips
- Do not commit secrets. Use `backend/.env.example` as the template for local configuration.
- Ignore generated artifacts such as `.venv/`, build output, caches, and local screenshots.
