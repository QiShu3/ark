from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from routes.todo.helpers import (
    _build_workflow_settlement,
    _create_workflow_with_focus_phase,
    _row_to_focus_workflow,
)
from routes.todo.schemas import FocusWorkflowOut, FocusWorkflowPhase, FocusWorkRunSummaryOut
from routes.todo_routes import (
    _deliberate_config_snapshot_payload,
    _build_run_metadata,
    _content_bank_article_seed,
    _content_bank_word_seed,
    _resolve_erc_app_set_id,
    _resolve_vocab_app_deck_id,
    complete_focus_workflow_run_task_and_end_phase,
)


class Row(dict):
    def __getattr__(self, name: str):
        return self[name]


class FakeWorkflowConn:
    def __init__(self):
        self.execute_calls: list[tuple[str, tuple[object, ...]]] = []
        self.fetchrow_calls: list[tuple[str, tuple[object, ...]]] = []
        self.workflow_id = uuid4()

    async def execute(self, query: str, *args: object):
        self.execute_calls.append((query, args))
        return "INSERT 0 1"

    async def fetchrow(self, query: str, *args: object):
        self.fetchrow_calls.append((query, args))
        if "INSERT INTO focus_workflows" in query:
            return Row(id=self.workflow_id)
        if "INSERT INTO focus_logs" in query:
            return Row(
                id=uuid4(),
                user_id=args[0],
                task_id=args[1],
                duration=0,
                start_time=datetime.now(UTC),
                end_at=None,
                created_at=datetime.now(UTC),
            )
        raise AssertionError(f"Unexpected fetchrow query: {query}")


class FakeAcquireCtx:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeTransactionCtx:
    async def __aenter__(self):
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return FakeAcquireCtx(self.conn)


class TransactionalConn:
    def transaction(self):
        return FakeTransactionCtx()


class FakeSettlementConn:
    def __init__(self, rows: list[Row]):
        self.rows = rows
        self.fetch_calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetch(self, query: str, *args: object):
        self.fetch_calls.append((query, args))
        if "id = ANY" not in query:
            return self.rows
        allowed = set(args[2])
        return [row for row in self.rows if row["id"] in allowed]


def test_focus_workflow_phase_accepts_task_focus_type():
    phase = FocusWorkflowPhase(
        phase_type="focus",
        duration=1500,
        timer_mode="countdown",
        focus_work_type="task_focus",
    )

    assert phase.focus_work_type == "task_focus"


def test_focus_workflow_out_exposes_focus_work_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        active_focus_work_type="choice",
        focus_work_display_state="fullscreen",
        next_focus_work_type=None,
        has_minimized_work=False,
        phase_runtime_state="running_run",
    )

    assert payload.active_focus_work_type == "choice"
    assert payload.focus_work_display_state == "fullscreen"
    assert payload.phase_runtime_state == "running_run"


def test_focus_workflow_out_exposes_paused_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        active_focus_work_type="task_focus",
        focus_work_display_state="fullscreen",
        next_focus_work_type=None,
        has_minimized_work=False,
        is_paused=True,
    )

    assert payload.active_focus_work_type == "task_focus"
    assert payload.is_paused is True


def test_focus_workflow_out_exposes_run_runtime_fields():
    payload = FocusWorkflowOut(
        state="focus",
        phase_runtime_state="running_run",
        active_run_id="00000000-0000-0000-0000-000000000001",
        active_run={
            "id": "00000000-0000-0000-0000-000000000001",
            "workflow_id": "00000000-0000-0000-0000-000000000002",
            "phase_index": 0,
            "focus_work_type": "flash_card",
            "counts_for_task_completion": True,
            "status": "running",
            "progress_snapshot": None,
        },
    )

    assert payload.phase_runtime_state == "running_run"
    assert str(payload.active_run_id) == "00000000-0000-0000-0000-000000000001"
    assert payload.active_run is not None
    assert payload.active_run.status == "running"


def test_row_to_focus_workflow_reads_phase_runtime_state_and_active_run_id():
    row = Row(
        id="00000000-0000-0000-0000-000000000001",
        user_id=1,
        task_id=None,
        runtime_task_id=None,
        workflow_name="Vocabulary Loop",
        phases=[{"phase_type": "focus", "duration": 900, "timer_mode": "countdown"}],
        current_phase_index=0,
        focus_duration=900,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=900,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type=None,
        focus_work_display_state=None,
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        phase_runtime_state="running_run",
        phase_runtime_state_before_timeout_prompt=None,
        active_run_id="00000000-0000-0000-0000-000000000101",
        is_paused=False,
        paused_at=None,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row)

    assert out.phase_runtime_state == "running_run"
    assert str(out.active_run_id) == "00000000-0000-0000-0000-000000000101"


@pytest.mark.asyncio
async def test_build_workflow_settlement_filters_to_record_run_ids():
    workflow_id = uuid4()
    included_run_id = uuid4()
    other_run_id = uuid4()
    conn = FakeSettlementConn([
        Row(
            id=included_run_id,
            focus_work_type="choice",
            config_snapshot={"deliberate_name": "本次记录"},
            progress_snapshot={
                "run_summary": {
                    "answered_count": 3,
                    "correct_count": 2,
                    "accuracy": 67,
                    "duration_seconds": 180,
                },
                "mastery_check": {"enabled": True, "passed": False, "accuracy": 67},
            },
            phase_index=0,
            completion_reason="task_confirmed",
            source_run_id=None,
            created_at=datetime.now(UTC),
        ),
        Row(
            id=other_run_id,
            focus_work_type="choice",
            config_snapshot={"deliberate_name": "其他记录"},
            progress_snapshot={
                "run_summary": {
                    "answered_count": 20,
                    "correct_count": 20,
                    "accuracy": 100,
                    "duration_seconds": 1200,
                },
                "mastery_check": {"enabled": True, "passed": True, "accuracy": 100},
            },
            phase_index=0,
            completion_reason="task_confirmed",
            source_run_id=None,
            created_at=datetime.now(UTC),
        ),
    ])

    settlement = await _build_workflow_settlement(
        conn,
        workflow_id,
        "历史记录",
        1,
        run_ids=[str(included_run_id)],
    )

    assert settlement.total_answered == 3
    assert settlement.total_correct == 2
    assert settlement.best_accuracy == 67
    assert len(settlement.nodes) == 1
    assert settlement.nodes[0].name == "A 本次记录"
    assert "id = ANY" in conn.fetch_calls[0][0]


@pytest.mark.asyncio
async def test_complete_task_and_end_phase_allows_unbound_deliberate_run(monkeypatch):
    workflow_id = uuid4()
    run_id = uuid4()
    calls: list[str] = []

    workflow_row = Row(id=workflow_id)
    run = Row(
        id=run_id,
        workflow_id=workflow_id,
        task_id=None,
        counts_for_task_completion=True,
        status="content_completed",
        progress_snapshot={"answered": 1},
    )
    completed_run = Row(
        id=run_id,
        workflow_id=workflow_id,
        task_id=None,
        counts_for_task_completion=True,
        status="completed",
        progress_snapshot={"answered": 1},
        config_snapshot={},
    )
    expected = FocusWorkflowOut(state="normal")

    async def fake_fetch_active_workflow_row(_conn, user_id):
        assert user_id == 1
        calls.append("fetch_workflow")
        return workflow_row

    async def fake_fetch_run_summary(_conn, *, user_id, run_id: UUID):
        assert user_id == 1
        assert run_id == run["id"]
        calls.append("fetch_run")
        return run

    async def fake_record_task_completion(*_args, **_kwargs):
        raise AssertionError("unbound deliberate runs must not record task completion")

    async def fake_complete_run(_conn, *, user_id, run_id: UUID, completion_reason: str):
        assert user_id == 1
        assert run_id == run["id"]
        assert completion_reason == "task_confirmed"
        calls.append("complete_run")
        return completed_run

    async def fake_close_focus_log(_conn, user_id):
        assert user_id == 1
        calls.append("close_focus_log")

    async def fake_close_app_log(_conn, user_id, *, result, progress_snapshot):
        assert user_id == 1
        assert result == "completed"
        assert progress_snapshot == {"answered": 1}
        calls.append("close_app_log")

    async def fake_snapshot(_conn, user_id, snapshot_run):
        assert user_id == 1
        assert snapshot_run is completed_run
        calls.append("snapshot")
        return None

    async def fake_mark_deliberate_completed(_conn, user_id, snapshot_run, snapshot_info):
        assert user_id == 1
        assert snapshot_run is completed_run
        assert snapshot_info is None
        calls.append("mark_deliberate_completed")

    async def fake_record_node(_conn, user_id, snapshot_run):
        assert user_id == 1
        assert snapshot_run is completed_run
        calls.append("record_node")

    async def fake_advance(_conn, row, user_id, *, skip_breaks, completion_status="completed"):
        assert row is workflow_row
        assert user_id == 1
        assert skip_breaks is False
        assert completion_status == "completed"
        calls.append("advance")
        return expected

    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _request: FakePool(TransactionalConn()))
    monkeypatch.setattr("routes.todo_routes._fetch_active_workflow_row", fake_fetch_active_workflow_row)
    monkeypatch.setattr("routes.todo_routes._fetch_focus_work_run_summary", fake_fetch_run_summary)
    monkeypatch.setattr("routes.todo_routes._record_task_completion_from_run", fake_record_task_completion)
    monkeypatch.setattr("routes.todo_routes._complete_focus_work_run", fake_complete_run)
    monkeypatch.setattr("routes.todo_routes._close_open_focus_log", fake_close_focus_log)
    monkeypatch.setattr("routes.todo_routes._close_open_focus_app_work_log", fake_close_app_log)
    monkeypatch.setattr("routes.todo_routes._maybe_snapshot_focus_run", fake_snapshot)
    monkeypatch.setattr("routes.todo_routes._mark_deliberate_completed", fake_mark_deliberate_completed)
    monkeypatch.setattr("routes.todo_routes._record_completed_focus_work_node", fake_record_node)
    monkeypatch.setattr("routes.todo_routes._advance_focus_workflow_to_next_phase", fake_advance)

    result = await complete_focus_workflow_run_task_and_end_phase(
        request=object(),
        run_id=run_id,
        user=Row(id=1),
    )

    assert result is expected
    assert calls == [
        "fetch_workflow",
        "fetch_run",
        "complete_run",
        "record_node",
        "close_focus_log",
        "close_app_log",
        "snapshot",
        "mark_deliberate_completed",
        "advance",
    ]


@pytest.mark.asyncio
async def test_complete_task_and_end_phase_accepts_model_run_summary(monkeypatch):
    workflow_id = uuid4()
    run_id = uuid4()
    calls: list[str] = []

    workflow_row = Row(id=workflow_id)
    run = FocusWorkRunSummaryOut(
        id=run_id,
        workflow_id=workflow_id,
        phase_index=0,
        task_id=uuid4(),
        focus_work_type="flash_card",
        app_id=None,
        app_task_type=None,
        counts_for_task_completion=True,
        status="content_completed",
        progress_snapshot={"answered": 1, "run_summary": {"accuracy": 0.75}},
        config_snapshot={"deliberate_name": "今日单词"},
        completion_reason=None,
        source_run_id=None,
    )
    completed_run = run.model_copy(update={"status": "completed", "completion_reason": "task_confirmed"})
    expected = FocusWorkflowOut(state="normal")

    async def fake_fetch_active_workflow_row(_conn, user_id):
        assert user_id == 1
        calls.append("fetch_workflow")
        return workflow_row

    async def fake_fetch_run_summary(_conn, *, user_id, run_id: UUID):
        assert user_id == 1
        assert run_id == run.id
        calls.append("fetch_run")
        return run

    async def fake_record_task_completion(_conn, *, user_id, task_id, completed_at):
        assert user_id == 1
        assert task_id == run.task_id
        assert isinstance(completed_at, datetime)
        calls.append("record_task_completion")

    async def fake_complete_run(_conn, *, user_id, run_id: UUID, completion_reason: str):
        assert user_id == 1
        assert run_id == run.id
        assert completion_reason == "task_confirmed"
        calls.append("complete_run")
        return completed_run

    async def fake_close_focus_log(_conn, user_id):
        assert user_id == 1
        calls.append("close_focus_log")

    async def fake_close_app_log(_conn, user_id, *, result, progress_snapshot):
        assert user_id == 1
        assert result == "completed"
        assert progress_snapshot == {"answered": 1, "run_summary": {"accuracy": 0.75}}
        calls.append("close_app_log")

    async def fake_snapshot(_conn, user_id, snapshot_run):
        assert user_id == 1
        assert snapshot_run is completed_run
        calls.append("snapshot")
        return None

    async def fake_mark_deliberate_completed(_conn, user_id, snapshot_run, snapshot_info):
        assert user_id == 1
        assert snapshot_run is completed_run
        assert snapshot_info is None
        calls.append("mark_deliberate_completed")

    async def fake_record_node(_conn, user_id, snapshot_run):
        assert user_id == 1
        assert snapshot_run is completed_run
        calls.append("record_node")

    async def fake_advance(_conn, row, user_id, *, skip_breaks, completion_status="completed"):
        assert row is workflow_row
        assert user_id == 1
        assert skip_breaks is False
        assert completion_status == "completed"
        calls.append("advance")
        return expected

    monkeypatch.setattr("routes.todo_routes._pool_from_request", lambda _request: FakePool(TransactionalConn()))
    monkeypatch.setattr("routes.todo_routes._fetch_active_workflow_row", fake_fetch_active_workflow_row)
    monkeypatch.setattr("routes.todo_routes._fetch_focus_work_run_summary", fake_fetch_run_summary)
    monkeypatch.setattr("routes.todo_routes._record_task_completion_from_run", fake_record_task_completion)
    monkeypatch.setattr("routes.todo_routes._complete_focus_work_run", fake_complete_run)
    monkeypatch.setattr("routes.todo_routes._close_open_focus_log", fake_close_focus_log)
    monkeypatch.setattr("routes.todo_routes._close_open_focus_app_work_log", fake_close_app_log)
    monkeypatch.setattr("routes.todo_routes._maybe_snapshot_focus_run", fake_snapshot)
    monkeypatch.setattr("routes.todo_routes._mark_deliberate_completed", fake_mark_deliberate_completed)
    monkeypatch.setattr("routes.todo_routes._record_completed_focus_work_node", fake_record_node)
    monkeypatch.setattr("routes.todo_routes._advance_focus_workflow_to_next_phase", fake_advance)

    result = await complete_focus_workflow_run_task_and_end_phase(
        request=object(),
        run_id=run_id,
        user=Row(id=1),
    )

    assert result is expected
    assert calls == [
        "fetch_workflow",
        "fetch_run",
        "record_task_completion",
        "complete_run",
        "record_node",
        "close_focus_log",
        "close_app_log",
        "snapshot",
        "mark_deliberate_completed",
        "advance",
    ]


@pytest.mark.asyncio
async def test_build_run_metadata_uses_test_choice_phase_config():
    class NoTaskConn:
        async def fetchrow(self, query: str, *args: object):
            raise AssertionError(f"Unexpected fetchrow query: {query}")

    choice_scope = {
        "bank_id": "bank-1",
        "years": [2025],
        "subjects": ["计算机组成原理"],
        "status": "all",
        "mode": "sequential",
    }
    choice_completion = {"mode": "question_count", "question_count": 3}
    workflow_row = Row(
        focus_duration=3600,
        break_duration=60,
        phases=[
            {
                "phase_type": "focus",
                "duration": 3600,
                "timer_mode": "countup",
                "focus_work_type": "choice",
                "is_temporary": True,
                "set_id": "bank-1",
                "article_set_id": "bank-1",
                "target_article_count": 3,
                "daily_article_target": 3,
                "task_title": "选择练习",
                "choice_scope": choice_scope,
                "choice_completion": choice_completion,
            }
        ],
        current_phase_index=0,
        runtime_task_id=None,
        task_id=None,
        active_focus_work_type="choice",
    )

    task_id, focus_work_type, app_id, app_task_type, config_snapshot = await _build_run_metadata(
        NoTaskConn(),
        user_id=1,
        workflow_row=workflow_row,
    )

    assert task_id is None
    assert focus_work_type == "choice"
    assert app_id is None
    assert app_task_type is None
    assert config_snapshot["choice_scope"] == choice_scope
    assert config_snapshot["choice_completion"] == choice_completion
    assert config_snapshot["task_title"] == "选择练习"


def test_deliberate_config_snapshot_payload_includes_unified_bank_fields():
    payload = _deliberate_config_snapshot_payload(
        config_id="cfg-1",
        name="408",
        kind="choice",
        focus_work_type="choice",
        bank_id="bank-1",
        target_count=10,
        scope={"bank_id": "bank-1", "years": [2025]},
        completion={"mode": "question_count", "question_count": 10},
        primary_filter="mistake",
        sort_order="random",
        use_fsrs=True,
        backflow_rule="wrong_to_end",
    )

    assert payload["config_id"] == "cfg-1"
    assert payload["deliberate_config_id"] == "cfg-1"
    assert payload["name"] == "408"
    assert payload["deliberate_name"] == "408"
    assert payload["kind"] == "choice"
    assert payload["deliberate_kind"] == "choice"
    assert payload["bank_id"] == "bank-1"
    assert payload["primary_filter"] == "mistake"
    assert payload["sort_order"] == "random"
    assert payload["use_fsrs"] is True
    assert payload["backflow_rule"] == "wrong_to_end"


@pytest.mark.asyncio
async def test_resolve_vocab_app_deck_id_maps_legacy_content_bank_id():
    bank_id = uuid4()
    deck_id = uuid4()

    class LegacyBankConn:
        async def fetchrow(self, query: str, *args: object):
            if "FROM vocab_decks WHERE id = $1" in query:
                assert args[0] == bank_id
                return None
            if "FROM content_banks" in query:
                assert args[0] == bank_id
                return Row(name="考研英语单词")
            if "FROM vocab_decks" in query and "WHERE key = $1 OR name = $2" in query:
                assert args[0] == f"content-bank-{bank_id}"
                assert args[1] == "考研英语单词"
                return Row(id=deck_id)
            raise AssertionError(f"Unexpected fetchrow query: {query}")

    resolved = await _resolve_vocab_app_deck_id(LegacyBankConn(), str(bank_id))

    assert resolved == str(deck_id)


@pytest.mark.asyncio
async def test_resolve_vocab_app_deck_id_syncs_unsynced_content_bank(monkeypatch):
    bank_id = uuid4()
    synced_deck_id = uuid4()
    imported: dict[str, object] = {}

    async def fake_import_deck(_conn: object, deck: object) -> str:
        imported["deck"] = deck
        return str(synced_deck_id)

    monkeypatch.setattr("routes.todo_routes.import_deck", fake_import_deck)

    class UnsyncedBankConn:
        async def fetchrow(self, query: str, *args: object):
            if "FROM vocab_decks WHERE id = $1" in query:
                return None
            if "FROM content_banks" in query:
                return Row(name="考研英语单词")
            if "FROM vocab_decks" in query and "WHERE key = $1 OR name = $2" in query:
                return None
            raise AssertionError(f"Unexpected fetchrow query: {query}")

        async def fetch(self, query: str, *args: object):
            assert "FROM content_items" in query
            assert args[0] == bank_id
            return [
                Row(
                    title="abandon",
                    sort_order=1,
                    body={
                        "word": "abandon",
                        "pos": "n",
                        "translation": "放任；狂热",
                        "pronunciation": "US: ə'bændən / UK: ə'bænd(ə)n",
                        "example": "He approached life with reckless abandon.",
                        "example_translation": "他以不计后果的放纵态度对待生活。",
                    },
                )
            ]

    resolved = await _resolve_vocab_app_deck_id(UnsyncedBankConn(), str(bank_id))

    assert resolved == str(synced_deck_id)
    deck = imported["deck"]
    assert deck.key == f"content-bank-{bank_id}"
    assert deck.name == "考研英语单词"
    assert deck.words[0].word == "abandon"
    assert deck.words[0].translations[0].translation == "放任；狂热"
    assert deck.words[0].sentences[0].sentence == "He approached life with reckless abandon."


def test_content_bank_word_seed_parses_pronunciation_and_example():
    seed = _content_bank_word_seed(
        Row(
            title="abandon",
            sort_order=1,
            body={
                "translation": "放任；狂热",
                "pronunciation": "US: ə'bændən / UK: ə'bænd(ə)n",
                "example": "He approached life with reckless abandon.",
                "example_translation": "他以不计后果的放纵态度对待生活。",
            },
        )
    )

    assert seed is not None
    assert seed.word == "abandon"
    assert seed.us_pronunciation == "ə'bændən"
    assert seed.uk_pronunciation == "ə'bænd(ə)n"
    assert seed.sentences[0].translation == "他以不计后果的放纵态度对待生活。"


def test_content_bank_article_seed_converts_choice_item_to_erc_article():
    bank_id = uuid4()
    item_id = uuid4()
    question_id = uuid4()

    seed = _content_bank_article_seed(
        bank_id,
        "408选择题",
        Row(
            id=str(item_id),
            title="2009年 数据结构 第1题",
            sort_order=0,
            body={"tags": ["408", "数据结构", "2009"], "passage": "", "examination": ""},
        ),
        [
            Row(
                id=str(question_id),
                sort_order=0,
                question_text="该缓冲区的逻辑结构应该是____。",
                options={"A": "栈", "B": "队列", "C": "树", "D": "图"},
                correct_answer="B",
                analysis="缓冲区先进先出。",
            )
        ],
    )

    assert seed is not None
    assert seed.article_id == f"content-bank-{bank_id}-{item_id}"
    assert seed.exam == "408"
    assert seed.year == 2009
    assert seed.text_no == 1
    assert seed.paragraphs[0].text == "2009年 数据结构 第1题"
    assert seed.questions[0].question_id == f"content-bank-{bank_id}-{item_id}-{question_id}"
    assert seed.questions[0].answer == "B"
    assert seed.questions[0].options["B"] == "队列"


@pytest.mark.asyncio
async def test_resolve_erc_app_set_id_rejects_unknown_uuid():
    bank_id = uuid4()

    class UnknownConn:
        async def fetchrow(self, query: str, *args: object):
            if "FROM choice_sets WHERE id = $1" in query:
                return None
            raise AssertionError(f"Unexpected fetchrow query: {query}")

    with pytest.raises(HTTPException, match="题库不存在"):
        await _resolve_erc_app_set_id(UnknownConn(), str(bank_id))


@pytest.mark.asyncio
async def test_resolve_erc_app_set_id_finds_existing_choice_set():
    set_id = uuid4()

    class ExistingSetConn:
        async def fetchrow(self, query: str, *args: object):
            if "FROM choice_sets WHERE id = $1" in query:
                return Row(id=set_id)
            raise AssertionError(f"Unexpected fetchrow query: {query}")

    resolved = await _resolve_erc_app_set_id(ExistingSetConn(), str(set_id))
    assert resolved == str(set_id)


@pytest.mark.asyncio
async def test_resolve_vocab_app_deck_id_keeps_existing_vocab_deck_id():
    deck_id = uuid4()

    class VocabDeckConn:
        async def fetchrow(self, query: str, *args: object):
            if "FROM vocab_decks WHERE id = $1" in query:
                assert args[0] == deck_id
                return Row(id=deck_id)
            raise AssertionError(f"Unexpected fetchrow query: {query}")

    resolved = await _resolve_vocab_app_deck_id(VocabDeckConn(), str(deck_id))

    assert resolved == str(deck_id)


@pytest.mark.asyncio
async def test_create_workflow_activates_first_bound_focus_work_without_starting_run_log():
    conn = FakeWorkflowConn()
    task_id = uuid4()
    phases = [
        {
            "phase_type": "focus",
            "duration": 60,
            "timer_mode": "countdown",
            "task_id": None,
            "focus_work_type": "choice",
            "record_focus": True,
        },
        {"phase_type": "break", "duration": 60, "timer_mode": None, "task_id": None, "focus_work_type": None},
    ]

    await _create_workflow_with_focus_phase(
        conn,
        user_id=1,
        task_id=task_id,
        workflow_name="Bound App Work",
        phases=phases,
        focus_duration=60,
        break_duration=60,
    )

    workflow_insert_query, workflow_insert_args = conn.fetchrow_calls[0]
    assert "active_focus_work_type" in workflow_insert_query
    assert "focus_work_display_state" in workflow_insert_query
    assert "choice" in workflow_insert_args
    assert "fullscreen" in workflow_insert_args
    assert not any("focus_app_work_logs" in query for query, _args in conn.execute_calls)


def test_row_to_focus_workflow_reports_next_same_focus_work_type_for_minimize():
    row = Row(
        id="00000000-0000-0000-0000-000000000001",
        user_id=1,
        task_id=None,
        runtime_task_id=None,
        workflow_name="Vocabulary Loop",
        phases=[
            {"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "flash_card"},
            {"phase_type": "break", "duration": 300},
            {"phase_type": "focus", "duration": 900, "timer_mode": "countdown", "focus_work_type": "flash_card"},
        ],
        current_phase_index=1,
        focus_duration=900,
        break_duration=300,
        current_phase="break",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=300,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type="flash_card",
        focus_work_display_state="minimized",
        focus_work_result="interrupted",
        focus_work_progress_snapshot={"memorized": 4},
        record_focus=True,
    )

    out = _row_to_focus_workflow(row)

    assert out.state == "break"
    assert out.has_minimized_work is True
    assert out.next_focus_work_type == "flash_card"


def test_row_to_focus_workflow_marks_task_bound_focus_phase_as_task_focus():
    row = Row(
        id="00000000-0000-0000-0000-000000000002",
        user_id=1,
        task_id="00000000-0000-0000-0000-000000000101",
        runtime_task_id="00000000-0000-0000-0000-000000000101",
        workflow_name="Task Focus",
        phases=[
            {
                "phase_type": "focus",
                "duration": 1500,
                "timer_mode": "countdown",
                "task_id": "00000000-0000-0000-0000-000000000101",
            }
        ],
        current_phase_index=0,
        focus_duration=1500,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=1500,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type=None,
        focus_work_display_state=None,
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        is_paused=False,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row, task_title="撰写周报")

    assert out.active_focus_work_type == "task_focus"
    assert out.focus_work_display_state == "fullscreen"


def test_row_to_focus_workflow_exposes_app_task_adapter_metadata():
    config_id = uuid4()
    row = Row(
        id="00000000-0000-0000-0000-000000000004",
        user_id=1,
        task_id="00000000-0000-0000-0000-000000000201",
        runtime_task_id="00000000-0000-0000-0000-000000000201",
        workflow_name="App Focus",
        phases=[
            {
                "phase_type": "focus",
                "duration": 1500,
                "timer_mode": "countdown",
                "task_id": "00000000-0000-0000-0000-000000000201",
            }
        ],
        current_phase_index=0,
        focus_duration=1500,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=1500,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type="flash_card",
        focus_work_display_state="fullscreen",
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        is_paused=False,
        record_focus=True,
    )

    out = _row_to_focus_workflow(
        row,
        task_title="今日单词",
        task_source_type="app",
        task_app_id="flash",
        task_app_task_type="flash_card",
        task_app_config_id=config_id,
    )

    assert out.active_focus_work_type == "flash_card"
    assert out.active_task_source_type == "app"
    assert out.active_task_app_id == "flash"
    assert out.active_task_app_task_type == "flash_card"
    assert out.active_task_app_config_id == config_id


def test_row_to_focus_workflow_exposes_paused_task_focus():
    row = Row(
        id="00000000-0000-0000-0000-000000000003",
        user_id=1,
        task_id="00000000-0000-0000-0000-000000000102",
        runtime_task_id="00000000-0000-0000-0000-000000000102",
        workflow_name="Task Focus",
        phases=[
            {
                "phase_type": "focus",
                "duration": 1500,
                "timer_mode": "countdown",
                "task_id": "00000000-0000-0000-0000-000000000102",
            }
        ],
        current_phase_index=0,
        focus_duration=1500,
        break_duration=300,
        current_phase="focus",
        phase_started_at=datetime.now(UTC),
        phase_planned_duration=1500,
        pending_confirmation=False,
        pending_task_selection=False,
        active_focus_work_type="task_focus",
        focus_work_display_state="fullscreen",
        focus_work_result=None,
        focus_work_progress_snapshot=None,
        is_paused=True,
        record_focus=True,
    )

    out = _row_to_focus_workflow(row, task_title="撰写周报")

    assert out.active_focus_work_type == "task_focus"
    assert out.is_paused is True
