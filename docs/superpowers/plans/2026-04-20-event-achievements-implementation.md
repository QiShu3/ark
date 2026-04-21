# Event Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the right-panel achievements feature with a compact card state, a detailed modal state, event-scoped achievements, and always-visible global achievements.

**Architecture:** Add one backend summary endpoint in `todo_routes.py` that derives event achievements and global achievements from existing `events`, `tasks`, `appointments`, `completion_records`, and `focus_logs`. On the frontend, keep `PlaceholderCard.tsx` thin by mounting a new `AchievementCard` entry component that opens an `AchievementModal`; the modal switches event context for the top half only while rendering a fixed global-achievements section underneath.

**Tech Stack:** FastAPI, asyncpg, pytest, React, TypeScript, Vitest, Testing Library

---

## File Map

- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
  - Add response models, derivation helpers, and `GET /todo/achievements/summary`
- Modify: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`
  - Extend the existing fake pool/conn based route tests with achievement summary coverage
- Create: `/Users/qishu/Project/ark/frontend/src/components/achievementTypes.ts`
  - Shared frontend types for the summary payload
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementBadgeCard.tsx`
  - Small display-only achievement tile
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementModal.tsx`
  - Event tabs, current event section, fixed global section
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementCard.tsx`
  - Card-state fetch, compact summary UI, modal open/close
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementCard.test.tsx`
  - Card-state rendering, empty/error handling, modal open
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementModal.test.tsx`
  - Event switching and global section persistence
- Modify: `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`
  - Replace the static `成就` span with `<AchievementCard />`
- Optionally modify: `/Users/qishu/Project/ark/docs/开发日志.md`
  - Add entries for implementation commits to satisfy repo policy

### Task 1: Backend Summary Contract

**Files:**
- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
- Modify: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`

- [ ] **Step 1: Write the failing backend contract tests**

Add focused route tests near the existing event tests in `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`:

```python
def test_achievement_summary_without_primary_event_still_returns_global(monkeypatch) -> None:
    conn = _FakeTodoConn()
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/achievements/summary")

    assert resp.status_code == 200
    data = resp.json()
    assert data["active_event"] is None
    assert data["event_achievements"] is None
    assert data["global_achievements"]["title"] == "全局成就"


def test_achievement_summary_defaults_to_primary_event(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "论文投稿",
            "due_at": datetime(2026, 4, 25, 12, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        }
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get("/todo/achievements/summary")

    assert resp.status_code == 200
    data = resp.json()
    assert data["active_event"]["id"] == str(event_id)
    assert data["event_achievements"]["title"] == "事件成就"
    assert data["global_achievements"]["title"] == "全局成就"
```

- [ ] **Step 2: Run the focused backend tests and verify they fail**

Run:

```bash
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -k "achievement_summary_without_primary_event or achievement_summary_defaults_to_primary_event" -v
```

Expected: `FAIL` with `404 Not Found` because `/todo/achievements/summary` does not exist yet.

- [ ] **Step 3: Add the response models and a minimal summary route**

In `/Users/qishu/Project/ark/backend/routes/todo_routes.py`, add the response models near the other `BaseModel` definitions:

```python
AchievementStatus = Literal["unlocked", "in_progress", "locked"]


class AchievementItemOut(BaseModel):
    id: str
    title: str
    description: str
    status: AchievementStatus
    current_value: int | None = None
    target_value: int | None = None
    progress_text: str | None = None


class AchievementSectionStatsOut(BaseModel):
    unlocked_count: int
    in_progress_count: int
    primary_metric_value: int | None = None
    primary_metric_label: str | None = None


class AchievementSectionOut(BaseModel):
    title: str
    summary_text: str | None = None
    stats: AchievementSectionStatsOut
    latest_unlocked: list[AchievementItemOut]
    upcoming: list[AchievementItemOut]


class AchievementSummaryOut(BaseModel):
    active_event: EventOut | None
    event_achievements: AchievementSectionOut | None
    global_achievements: AchievementSectionOut
```

Then add a minimal endpoint near the event routes:

```python
def _empty_achievement_section(title: str) -> AchievementSectionOut:
    return AchievementSectionOut(
        title=title,
        summary_text=None,
        stats=AchievementSectionStatsOut(
            unlocked_count=0,
            in_progress_count=0,
            primary_metric_value=0,
            primary_metric_label=None,
        ),
        latest_unlocked=[],
        upcoming=[],
    )


@router.get("/achievements/summary", response_model=AchievementSummaryOut)
async def get_achievement_summary(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    event_id: UUID | None = Query(default=None),
) -> AchievementSummaryOut:
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        event_row = await _get_event_for_user(conn, user_id=int(user.id), event_id=event_id)
        if event_row is None:
            event_row = await conn.fetchrow(
                """
                SELECT id, user_id, name, due_at, is_primary, created_at, updated_at
                FROM events
                WHERE user_id = $1 AND is_primary = TRUE
                """,
                int(user.id),
            )
    return AchievementSummaryOut(
        active_event=_row_to_event(event_row) if event_row is not None else None,
        event_achievements=_empty_achievement_section("事件成就") if event_row is not None else None,
        global_achievements=_empty_achievement_section("全局成就"),
    )
```

- [ ] **Step 4: Re-run the focused backend tests and verify they pass**

Run:

```bash
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -k "achievement_summary_without_primary_event or achievement_summary_defaults_to_primary_event" -v
```

Expected: `PASS` for both new tests.

- [ ] **Step 5: Commit the backend contract scaffold**

```bash
git -C /Users/qishu/Project/ark add \
  /Users/qishu/Project/ark/backend/routes/todo_routes.py \
  /Users/qishu/Project/ark/backend/tests/test_todo_routes.py
git -C /Users/qishu/Project/ark commit -m "feat(todo): add achievement summary contract"
```

### Task 2: Backend Event And Global Aggregation Rules

**Files:**
- Modify: `/Users/qishu/Project/ark/backend/routes/todo_routes.py`
- Modify: `/Users/qishu/Project/ark/backend/tests/test_todo_routes.py`

- [ ] **Step 1: Add failing aggregation tests for event filtering and global always-on behavior**

Append tests that prove:

- event achievements only use rows bound to the selected event
- global achievements still count everything
- focus logs must resolve through `task_id -> event_id`

```python
def test_achievement_summary_filters_event_completions_and_focus(monkeypatch) -> None:
    conn = _FakeTodoConn()
    now = datetime.now(UTC)
    event_id = uuid4()
    other_event_id = uuid4()
    task_id = uuid4()
    other_task_id = uuid4()
    appointment_id = uuid4()
    conn.events = [
        {
            "id": event_id,
            "user_id": 7,
            "name": "论文投稿",
            "due_at": datetime(2026, 4, 25, 12, tzinfo=UTC),
            "is_primary": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": other_event_id,
            "user_id": 7,
            "name": "期末考试",
            "due_at": datetime(2026, 4, 30, 12, tzinfo=UTC),
            "is_primary": False,
            "created_at": now,
            "updated_at": now,
        },
    ]
    conn.tasks = [
        {**_task_row(title="Draft"), "id": task_id, "event_id": event_id},
        {**_task_row(title="Review"), "id": other_task_id, "event_id": other_event_id},
    ]
    conn.appointments = [
        {**_appointment_row(title="Advisor check"), "id": appointment_id, "event_id": event_id},
    ]
    conn.completion_records = [
        {"user_id": 7, "subject_type": "task", "subject_id": task_id, "completed_at": now},
        {"user_id": 7, "subject_type": "task", "subject_id": other_task_id, "completed_at": now},
        {"user_id": 7, "subject_type": "appointment", "subject_id": appointment_id, "completed_at": now},
    ]
    conn.focus_logs = [
        {
            "id": uuid4(),
            "user_id": 7,
            "task_id": task_id,
            "duration": 7200,
            "start_time": now - timedelta(hours=2),
            "end_at": now,
            "created_at": now,
        },
        {
            "id": uuid4(),
            "user_id": 7,
            "task_id": other_task_id,
            "duration": 1800,
            "start_time": now - timedelta(minutes=30),
            "end_at": now,
            "created_at": now,
        },
    ]
    pool = _FakePool(conn)
    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _: pool)

    app = _build_app()
    client = TestClient(app)

    resp = client.get(f"/todo/achievements/summary?event_id={event_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["event_achievements"]["stats"]["primary_metric_value"] == 7200
    assert data["global_achievements"]["stats"]["primary_metric_value"] == 9000
    assert any(item["title"] == "首次推进" for item in data["event_achievements"]["latest_unlocked"])
```

- [ ] **Step 2: Run the focused backend aggregation test and verify it fails**

Run:

```bash
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -k "filters_event_completions_and_focus" -v
```

Expected: `FAIL` because the endpoint still returns empty sections.

- [ ] **Step 3: Add small helper functions for event-scoped and global metrics**

In `/Users/qishu/Project/ark/backend/routes/todo_routes.py`, add focused helpers rather than one giant route body:

```python
async def _completed_subject_ids(
    conn: Any,
    *,
    user_id: int,
    subject_type: Literal["task", "appointment"],
) -> set[UUID]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT subject_id
        FROM completion_records
        WHERE user_id = $1 AND subject_type = $2
        """,
        user_id,
        subject_type,
    )
    return {row["subject_id"] for row in rows}


async def _event_focus_seconds(conn: Any, *, user_id: int, event_id: UUID) -> int:
    row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(fl.duration), 0)::BIGINT AS seconds
        FROM focus_logs fl
        JOIN tasks t ON t.id = fl.task_id
        WHERE fl.user_id = $1
          AND t.user_id = $1
          AND t.event_id = $2
          AND t.is_deleted = FALSE
        """,
        user_id,
        event_id,
    )
    return int((row or {}).get("seconds") or 0)


async def _global_focus_seconds(conn: Any, *, user_id: int) -> int:
    row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(duration), 0)::BIGINT AS seconds
        FROM focus_logs
        WHERE user_id = $1
        """,
        user_id,
    )
    return int((row or {}).get("seconds") or 0)
```

Then add two section builders with explicit first-version rules:

```python
def _achievement_item(
    *,
    item_id: str,
    title: str,
    description: str,
    current_value: int,
    target_value: int,
) -> AchievementItemOut:
    if current_value >= target_value:
        status: AchievementStatus = "unlocked"
    elif current_value > 0:
        status = "in_progress"
    else:
        status = "locked"
    progress_text = None if status == "unlocked" else f"{current_value} / {target_value}"
    return AchievementItemOut(
        id=item_id,
        title=title,
        description=description,
        status=status,
        current_value=current_value,
        target_value=target_value,
        progress_text=progress_text,
    )


def _section_from_items(
    *,
    title: str,
    summary_text: str | None,
    primary_metric_value: int,
    primary_metric_label: str,
    items: list[AchievementItemOut],
) -> AchievementSectionOut:
    unlocked = [item for item in items if item.status == "unlocked"]
    upcoming = [item for item in items if item.status != "unlocked"]
    return AchievementSectionOut(
        title=title,
        summary_text=summary_text,
        stats=AchievementSectionStatsOut(
            unlocked_count=len(unlocked),
            in_progress_count=len([item for item in items if item.status == "in_progress"]),
            primary_metric_value=primary_metric_value,
            primary_metric_label=primary_metric_label,
        ),
        latest_unlocked=unlocked[:3],
        upcoming=upcoming[:3],
    )
```

- [ ] **Step 4: Wire the route to return real event and global sections**

Replace the empty return in `get_achievement_summary()` with concrete derivation:

```python
        selected_event = _row_to_event(event_row) if event_row is not None else None
        completed_task_ids = await _completed_subject_ids(conn, user_id=int(user.id), subject_type="task")
        completed_appointment_ids = await _completed_subject_ids(conn, user_id=int(user.id), subject_type="appointment")
        global_focus_seconds = await _global_focus_seconds(conn, user_id=int(user.id))

        event_section: AchievementSectionOut | None = None
        if event_row is not None:
            event_task_ids = {
                row["id"]
                for row in await conn.fetch(
                    "SELECT id FROM tasks WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE",
                    int(user.id),
                    event_row["id"],
                )
            }
            event_appointment_ids = {
                row["id"]
                for row in await conn.fetch(
                    "SELECT id FROM appointments WHERE user_id = $1 AND event_id = $2 AND is_deleted = FALSE",
                    int(user.id),
                    event_row["id"],
                )
            }
            event_completed_count = len(event_task_ids & completed_task_ids) + len(event_appointment_ids & completed_appointment_ids)
            event_focus_seconds = await _event_focus_seconds(conn, user_id=int(user.id), event_id=event_row["id"])
            event_items = [
                _achievement_item(
                    item_id="event-first-push",
                    title="首次推进",
                    description="第一次完成绑定到该事件的任务或日程。",
                    current_value=1 if event_completed_count > 0 else 0,
                    target_value=1,
                ),
                _achievement_item(
                    item_id="event-focus-2h",
                    title="进入状态",
                    description="围绕该事件累计专注 2 小时。",
                    current_value=event_focus_seconds,
                    target_value=2 * 60 * 60,
                ),
                _achievement_item(
                    item_id="event-complete-5",
                    title="推进不停",
                    description="完成 5 个绑定安排。",
                    current_value=event_completed_count,
                    target_value=5,
                ),
            ]
            event_section = _section_from_items(
                title="事件成就",
                summary_text=f"{event_row['name']} 的当前进展",
                primary_metric_value=event_focus_seconds,
                primary_metric_label="事件专注秒数",
                items=event_items,
            )

        global_items = [
            _achievement_item(
                item_id="global-focus-10h",
                title="总专注 10 小时",
                description="跨所有事件累计专注 10 小时。",
                current_value=global_focus_seconds,
                target_value=10 * 60 * 60,
            ),
            _achievement_item(
                item_id="global-focus-50h",
                title="总专注 50 小时",
                description="跨所有事件累计专注 50 小时。",
                current_value=global_focus_seconds,
                target_value=50 * 60 * 60,
            ),
        ]
    return AchievementSummaryOut(
        active_event=selected_event,
        event_achievements=event_section,
        global_achievements=_section_from_items(
            title="全局成就",
            summary_text="始终显示的长期累计进度",
            primary_metric_value=global_focus_seconds,
            primary_metric_label="总专注秒数",
            items=global_items,
        ),
    )
```

- [ ] **Step 5: Re-run the focused backend aggregation test and then the broader todo route suite**

Run:

```bash
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -k "achievement_summary or filters_event_completions_and_focus" -v
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -v
```

Expected:

- The focused achievement tests pass.
- The full todo route suite stays green.

- [ ] **Step 6: Commit the backend aggregation implementation**

```bash
git -C /Users/qishu/Project/ark add \
  /Users/qishu/Project/ark/backend/routes/todo_routes.py \
  /Users/qishu/Project/ark/backend/tests/test_todo_routes.py
git -C /Users/qishu/Project/ark commit -m "feat(todo): derive event achievements summary"
```

### Task 3: Frontend Achievement Components

**Files:**
- Create: `/Users/qishu/Project/ark/frontend/src/components/achievementTypes.ts`
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementBadgeCard.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementModal.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/AchievementCard.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementCard.test.tsx`
- Create: `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementModal.test.tsx`

- [ ] **Step 1: Write the failing frontend tests for card state and modal state**

Create `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementCard.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementCard from '../AchievementCard';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event and global summaries together in card state', async () => {
    (apiJson as Mock).mockResolvedValue({
      active_event: { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '2026-04-20T00:00:00Z', updated_at: '2026-04-20T00:00:00Z' },
      event_achievements: {
        title: '事件成就',
        summary_text: '论文投稿 的当前进展',
        stats: { unlocked_count: 3, in_progress_count: 1, primary_metric_value: 7200, primary_metric_label: '事件专注秒数' },
        latest_unlocked: [{ id: 'a', title: '连续推进 3 天', description: '...', status: 'unlocked', current_value: 3, target_value: 3, progress_text: null }],
        upcoming: [{ id: 'b', title: '收尾干净', description: '...', status: 'in_progress', current_value: 4, target_value: 5, progress_text: '4 / 5' }],
      },
      global_achievements: {
        title: '全局成就',
        summary_text: '始终显示的长期累计进度',
        stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 151200, primary_metric_label: '总专注秒数' },
        latest_unlocked: [],
        upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 151200, target_value: 180000, progress_text: '151200 / 180000' }],
      },
    });

    render(<AchievementCard />);

    expect(await screen.findByText('论文投稿')).toBeInTheDocument();
    expect(screen.getByText(/事件已解锁 3 项/)).toBeInTheDocument();
    expect(screen.getByText(/全局/)).toBeInTheDocument();
  });

  it('opens the modal when the card is clicked', async () => {
    const user = userEvent.setup();
    (apiJson as Mock)
      .mockResolvedValueOnce({
        active_event: null,
        event_achievements: null,
        global_achievements: { title: '全局成就', summary_text: null, stats: { unlocked_count: 0, in_progress_count: 0, primary_metric_value: 0, primary_metric_label: '总专注秒数' }, latest_unlocked: [], upcoming: [] },
      })
      .mockResolvedValueOnce([]);

    render(<AchievementCard />);

    await user.click(await screen.findByRole('button', { name: /成就/i }));

    expect(await screen.findByText(/全局成就/)).toBeInTheDocument();
  });
});
```

Create `/Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementModal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import AchievementModal from '../AchievementModal';
import { apiJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiJson: vi.fn(),
}));

describe('AchievementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps global achievements visible while switching events', async () => {
    const user = userEvent.setup();
    (apiJson as Mock).mockImplementation(async (url: string) => {
      if (url === '/todo/events') {
        return [
          { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '', updated_at: '' },
          { id: 'event-2', name: '期末考试', due_at: '2026-05-01T12:00:00Z', is_primary: false, user_id: 7, created_at: '', updated_at: '' },
        ];
      }
      if (url === '/todo/achievements/summary?event_id=event-2') {
        return {
          active_event: { id: 'event-2', name: '期末考试', due_at: '2026-05-01T12:00:00Z', is_primary: false, user_id: 7, created_at: '', updated_at: '' },
          event_achievements: { title: '事件成就', summary_text: null, stats: { unlocked_count: 1, in_progress_count: 1, primary_metric_value: 3600, primary_metric_label: '事件专注秒数' }, latest_unlocked: [{ id: 'x', title: '首次推进', description: '...', status: 'unlocked', current_value: 1, target_value: 1, progress_text: null }], upcoming: [] },
          global_achievements: { title: '全局成就', summary_text: null, stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 20000, primary_metric_label: '总专注秒数' }, latest_unlocked: [], upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 20000, target_value: 180000, progress_text: '20000 / 180000' }] },
        };
      }
      return {
        active_event: { id: 'event-1', name: '论文投稿', due_at: '2026-04-25T12:00:00Z', is_primary: true, user_id: 7, created_at: '', updated_at: '' },
        event_achievements: { title: '事件成就', summary_text: null, stats: { unlocked_count: 3, in_progress_count: 1, primary_metric_value: 7200, primary_metric_label: '事件专注秒数' }, latest_unlocked: [{ id: 'a', title: '连续推进 3 天', description: '...', status: 'unlocked', current_value: 3, target_value: 3, progress_text: null }], upcoming: [] },
        global_achievements: { title: '全局成就', summary_text: null, stats: { unlocked_count: 2, in_progress_count: 1, primary_metric_value: 20000, primary_metric_label: '总专注秒数' }, latest_unlocked: [], upcoming: [{ id: 'g', title: '总专注 50 小时', description: '...', status: 'in_progress', current_value: 20000, target_value: 180000, progress_text: '20000 / 180000' }] },
      };
    });

    render(<AchievementModal isOpen={true} onClose={() => {}} initialSummary={null} />);

    await user.click(await screen.findByRole('button', { name: '期末考试' }));

    expect(await screen.findByText('首次推进')).toBeInTheDocument();
    expect(screen.getByText('总专注 50 小时')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new frontend tests and verify they fail**

Run:

```bash
cd /Users/qishu/Project/ark/frontend && pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx
```

Expected: `FAIL` because the new components do not exist.

- [ ] **Step 3: Add the shared frontend types**

Create `/Users/qishu/Project/ark/frontend/src/components/achievementTypes.ts`:

```ts
export type AchievementStatus = 'unlocked' | 'in_progress' | 'locked';

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  status: AchievementStatus;
  current_value: number | null;
  target_value: number | null;
  progress_text: string | null;
}

export interface AchievementSection {
  title: string;
  summary_text: string | null;
  stats: {
    unlocked_count: number;
    in_progress_count: number;
    primary_metric_value: number | null;
    primary_metric_label: string | null;
  };
  latest_unlocked: AchievementItem[];
  upcoming: AchievementItem[];
}

export interface AchievementSummary {
  active_event: {
    id: string;
    name: string;
    due_at: string;
    is_primary: boolean;
    user_id: number;
    created_at: string;
    updated_at: string;
  } | null;
  event_achievements: AchievementSection | null;
  global_achievements: AchievementSection;
}

export interface AchievementEventItem {
  id: string;
  name: string;
  due_at: string;
  is_primary: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Build the display-only badge tile and the modal**

Create `/Users/qishu/Project/ark/frontend/src/components/AchievementBadgeCard.tsx`:

```tsx
import type { AchievementItem } from './achievementTypes';

type AchievementBadgeCardProps = {
  item: AchievementItem;
  tone?: 'event' | 'global';
};

export default function AchievementBadgeCard({ item, tone = 'event' }: AchievementBadgeCardProps) {
  const baseTone = tone === 'global'
    ? 'border-sky-400/20 bg-sky-400/10'
    : 'border-amber-300/20 bg-amber-200/10';
  const lockedTone = item.status === 'locked' ? 'opacity-60 grayscale-[0.25]' : '';

  return (
    <div className={`rounded-2xl border p-3 ${baseTone} ${lockedTone}`}>
      <div className="text-sm font-semibold text-white">{item.title}</div>
      <div className="mt-2 text-xs leading-5 text-white/60">{item.description}</div>
      {item.progress_text ? (
        <div className="mt-3 text-xs text-white/70">{item.progress_text}</div>
      ) : null}
    </div>
  );
}
```

Create `/Users/qishu/Project/ark/frontend/src/components/AchievementModal.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import AchievementBadgeCard from './AchievementBadgeCard';
import type { AchievementEventItem, AchievementSummary } from './achievementTypes';

type AchievementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialSummary: AchievementSummary | null;
};

export default function AchievementModal({ isOpen, onClose, initialSummary }: AchievementModalProps) {
  const [events, setEvents] = useState<AchievementEventItem[]>([]);
  const [summary, setSummary] = useState<AchievementSummary | null>(initialSummary);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const [nextEvents, nextSummary] = await Promise.all([
        apiJson<AchievementEventItem[]>('/todo/events'),
        initialSummary ? Promise.resolve(initialSummary) : apiJson<AchievementSummary>('/todo/achievements/summary'),
      ]);
      setEvents(nextEvents);
      setSummary(nextSummary);
    })();
  }, [initialSummary, isOpen]);

  async function handleSelectEvent(eventId: string): Promise<void> {
    const nextSummary = await apiJson<AchievementSummary>(`/todo/achievements/summary?event_id=${eventId}`);
    setSummary(nextSummary);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[920px] max-w-[94vw] max-h-[84vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0f16] p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white">
              {summary?.active_event ? `成就 · ${summary.active_event.name}` : '成就'}
            </h3>
            <p className="mt-2 text-sm text-white/55">上半部分跟随事件切换，下半部分的全局成就始终显示。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white">
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {events.map((eventItem) => (
            <button
              key={eventItem.id}
              type="button"
              onClick={() => void handleSelectEvent(eventItem.id)}
              className={`rounded-full px-3 py-2 text-sm ${
                summary?.active_event?.id === eventItem.id
                  ? 'bg-amber-300 text-black'
                  : 'border border-white/10 bg-white/5 text-white/70'
              }`}
            >
              {eventItem.name}
            </button>
          ))}
        </div>

        {summary?.event_achievements ? (
          <section className="mt-6">
            <h4 className="text-sm font-semibold text-white/90">当前事件成就</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {summary.event_achievements.latest_unlocked.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
              {summary.event_achievements.upcoming.map((item) => (
                <AchievementBadgeCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            暂无主事件成就，设置主事件后这里会显示当前事件的进展。
          </section>
        )}

        <section className="mt-6 border-t border-white/10 pt-6">
          <h4 className="text-sm font-semibold text-white/90">全局成就</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {summary?.global_achievements.latest_unlocked.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
            {summary?.global_achievements.upcoming.map((item) => (
              <AchievementBadgeCard key={item.id} item={item} tone="global" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build the compact card-state component**

Create `/Users/qishu/Project/ark/frontend/src/components/AchievementCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import AchievementModal from './AchievementModal';
import type { AchievementSummary } from './achievementTypes';

export default function AchievementCard() {
  const [summary, setSummary] = useState<AchievementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const nextSummary = await apiJson<AchievementSummary>('/todo/achievements/summary');
        setSummary(nextSummary);
      } catch (err) {
        setError(err instanceof Error ? err.message : '成就加载失败');
      }
    })();
  }, []);

  const latestEventItem = summary?.event_achievements?.latest_unlocked[0] ?? null;
  const nextEventItem = summary?.event_achievements?.upcoming[0] ?? null;
  const nextGlobalItem = summary?.global_achievements?.upcoming[0] ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="成就"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-full flex-col justify-between rounded-lg border border-white/20 bg-white/10 p-3 text-left transition-colors hover:bg-white/15"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-white/50">成就</div>
          <div className="mt-2 text-base font-semibold text-white">
            {summary?.active_event?.name ?? '暂无主事件成就'}
          </div>
          <div className="mt-2 text-sm text-amber-200">
            {latestEventItem
              ? `事件已解锁 ${summary?.event_achievements?.stats.unlocked_count ?? 0} 项 · 最近「${latestEventItem.title}」`
              : error
                ? '成就加载失败，可稍后重试'
                : '设置主事件后可查看事件成就'}
          </div>
          <div className="mt-2 text-xs leading-5 text-white/60">
            {nextEventItem ? `再推进一点：${nextEventItem.title}` : '先完成一个绑定安排，解锁首个事件徽章。'}
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-sky-200">
          {nextGlobalItem ? `全局：${nextGlobalItem.title} · ${nextGlobalItem.progress_text ?? '已解锁'}` : '全局成就持续累计中'}
        </div>
      </button>

      <AchievementModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSummary={summary}
      />
    </>
  );
}
```

- [ ] **Step 6: Re-run the focused frontend tests and make them pass**

Run:

```bash
cd /Users/qishu/Project/ark/frontend && pnpm test -- --run src/components/__tests__/AchievementCard.test.tsx src/components/__tests__/AchievementModal.test.tsx
```

Expected: `PASS` for the two new component tests.

- [ ] **Step 7: Commit the new frontend achievement components**

```bash
git -C /Users/qishu/Project/ark add \
  /Users/qishu/Project/ark/frontend/src/components/achievementTypes.ts \
  /Users/qishu/Project/ark/frontend/src/components/AchievementBadgeCard.tsx \
  /Users/qishu/Project/ark/frontend/src/components/AchievementModal.tsx \
  /Users/qishu/Project/ark/frontend/src/components/AchievementCard.tsx \
  /Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementCard.test.tsx \
  /Users/qishu/Project/ark/frontend/src/components/__tests__/AchievementModal.test.tsx
git -C /Users/qishu/Project/ark commit -m "feat(frontend): add achievement card and modal"
```

### Task 4: Mount The Entry And Run Full Verification

**Files:**
- Modify: `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/RightPanel.test.tsx`
- Modify: `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx`
- Optional Modify: `/Users/qishu/Project/ark/docs/开发日志.md`

- [ ] **Step 1: Add a failing integration test for the right-panel achievement slot**

Extend `/Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx` or create a new focused assertion block:

```tsx
vi.mock('../AchievementCard', () => ({
  default: () => <div data-testid="achievement-card">Achievement Card</div>,
}));

it('renders AchievementCard in the right-panel achievement slot', () => {
  render(
    <MemoryRouter>
      <PlaceholderCard index={3} split={3} />
    </MemoryRouter>,
  );

  expect(screen.getByTestId('achievement-card')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused integration test and verify it fails**

Run:

```bash
cd /Users/qishu/Project/ark/frontend && pnpm test -- --run src/components/__tests__/PlaceholderCard.workflow.test.tsx
```

Expected: `FAIL` because `PlaceholderCard` still renders a static `成就` span.

- [ ] **Step 3: Replace the static achievement placeholder with the new entry component**

Update the imports at the top of `/Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx`:

```tsx
import AchievementCard from './AchievementCard';
```

Replace the `index === 3 && subIndex === 0` branch:

```tsx
              ) : index === 3 && subIndex === 0 ? (
                <AchievementCard />
              ) : mergePlaceholders ? (
```

This keeps all current right-panel splitting logic intact while moving achievement behavior into its own unit.

- [ ] **Step 4: Re-run focused frontend tests, then full targeted verification**

Run:

```bash
cd /Users/qishu/Project/ark/frontend && pnpm test -- --run \
  src/components/__tests__/AchievementCard.test.tsx \
  src/components/__tests__/AchievementModal.test.tsx \
  src/components/__tests__/PlaceholderCard.workflow.test.tsx \
  src/components/__tests__/RightPanel.test.tsx

cd /Users/qishu/Project/ark/frontend && pnpm check
cd /Users/qishu/Project/ark/backend && uv run pytest tests/test_todo_routes.py -k "achievement_summary" -v
```

Expected:

- Achievement component tests pass
- Placeholder / right-panel regression tests pass
- TypeScript check passes
- Backend achievement route tests pass

- [ ] **Step 5: Commit the integration wiring**

```bash
git -C /Users/qishu/Project/ark add \
  /Users/qishu/Project/ark/frontend/src/components/PlaceholderCard.tsx \
  /Users/qishu/Project/ark/frontend/src/components/__tests__/PlaceholderCard.workflow.test.tsx \
  /Users/qishu/Project/ark/frontend/src/components/__tests__/RightPanel.test.tsx
git -C /Users/qishu/Project/ark commit -m "feat(frontend): mount achievement entry in right panel"
```

## Self-Review

### Spec coverage

- `卡片状态` is covered by Task 3 (`AchievementCard`)
- `弹窗状态` is covered by Task 3 (`AchievementModal`)
- event-scoped filtering is covered by Task 2 backend aggregation
- always-visible global achievements are covered by Task 2 backend payload and Task 3/4 frontend rendering
- mounting in the existing right-panel slot is covered by Task 4

### Placeholder scan

- No `TBD` / `TODO`
- Each task includes exact file paths, code blocks, and commands
- Route name, component names, and payload field names match the spec

### Type consistency

- Backend response names use `active_event`, `event_achievements`, `global_achievements`
- Frontend `achievementTypes.ts` mirrors the same payload keys
- `AchievementModal` uses `/todo/achievements/summary?event_id=...` consistently

## Execution Handoff

Plan complete and saved to `/Users/qishu/Project/ark/docs/superpowers/plans/2026-04-20-event-achievements-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
