"""Content selector abstraction for focus works.

每个专注工作从题库提取内容时有不同的筛选 + 排序策略。
ContentSelector 将策略标准化为 filter + algorithm 接口，让新入口
生成直接复用 selector 逻辑，而非硬编码 LIMIT 1。

策略:
  真题策略 (sequential)      — SQL WHERE + ORDER BY，零算法
  错题策略 (weighted_mistake) — 错题标记过滤 + 权重公式 + 加权随机，无 FSRS
  闪卡策略 (fsrs_mixed)       — FSRS 调度 + 新词配额（暂为占位，Vocab 已有完整逻辑）
"""

import random as _random
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

import asyncpg

from lib.focus_work_types import normalize_focus_work_type


class ContentSelector(ABC):
    """专注工作的内容提取策略。

    构造函数接收 table_prefix（Python 安全标识），推导各数据表名。
    子类实现 select_next() 定义具体策略。
    """

    def __init__(self, table_prefix: str) -> None:
        self._prefix = table_prefix
        self._questions = f"{table_prefix}_questions"
        self._cards = f"{table_prefix}_user_question_cards"
        self._logs = f"{table_prefix}_review_logs"
        self._mistakes = f"{table_prefix}_mistake_bucket"

    @abstractmethod
    async def select_next(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        set_id: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict | None:
        """返回下一条内容的标准化字典，无可选内容时返回 None。

        返回字典键:
          due_at, question_id, stem, options_json, answer, meta_json
        """
        ...


# ---- Sequential（真题策略） ----

class SequentialSelector(ContentSelector):
    """按 due_at 顺序取一条，零算法，SQL 搞定。"""

    async def select_next(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        set_id: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict | None:
        where = "WHERE c.user_id = $1 AND c.due_at IS NOT NULL AND c.due_at <= NOW()"
        params: list[Any] = [user_id]
        idx = 2
        if set_id:
            where += f" AND q.set_id = ${idx}::uuid"
            params.append(set_id)
            idx += 1

        row = await conn.fetchrow(
            f"""
            SELECT c.due_at, q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, q.meta_json
            FROM {self._cards} c
            JOIN {self._questions} q ON q.id = c.question_pk
            {where}
            ORDER BY c.due_at ASC
            LIMIT 1
            """,
            *params,
        )
        if not row:
            return None
        return dict(row)


# ---- Weighted Mistake（错题策略） ----

def _mistake_weight(row: dict, *, now: datetime) -> float:
    """错题权重公式——错题加成 + 犯错次数 + 逾期因子。

    不依赖 FSRS，纯错题标记 + 时间维度。
    """
    due_at = row.get("due_at")
    overdue_hours = 0.0
    if isinstance(due_at, datetime) and due_at < now:
        overdue_hours = min((now - due_at).total_seconds() / 3600, 72)
    is_mistake = bool(row.get("is_mistake"))
    wrong_count = max(int(row.get("wrong_count") or 0), 0)
    return 1.0 + (4.0 if is_mistake else 0.0) + min(wrong_count, 6) * 1.5 + overdue_hours / 24


def _weighted_pick(rows: list[dict], *, now: datetime) -> dict | None:
    """加权随机抽选（轮盘赌选择）。"""
    if not rows:
        return None
    weighted = [(r, _mistake_weight(r, now=now)) for r in rows]
    total = sum(w for _, w in weighted)
    threshold = _random.random() * total
    running = 0.0
    for row, weight in weighted:
        running += weight
        if threshold <= running:
            return row
    return weighted[-1][0]


class WeightedMistakeSelector(ContentSelector):
    """错题标记过滤 + 权重公式 + 加权随机抽选。

    config 可选项:
      daily_target: 候选池大小（默认 50）
      cooldown_hours: 冷却期（默认 24），同一题目冷却期内不重复出现
    """

    async def select_next(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        set_id: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict | None:
        cfg = config or {}
        limit = int(cfg.get("daily_target", 50))
        cooldown_hours = float(cfg.get("cooldown_hours", 24))

        # 1. 查到期错题候选
        where = "WHERE c.user_id = $1 AND c.due_at IS NOT NULL AND c.due_at <= NOW() AND m.is_active = TRUE"
        params: list[Any] = [user_id]
        idx = 2
        if set_id:
            where += f" AND q.set_id = ${idx}::uuid"
            params.append(set_id)
            idx += 1

        rows = await conn.fetch(
            f"""
            SELECT c.question_pk::text, c.due_at, c.wrong_count,
                   q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, q.meta_json,
                   COALESCE(m.is_active, FALSE) AS is_mistake
            FROM {self._cards} c
            JOIN {self._questions} q ON q.id = c.question_pk
            JOIN {self._mistakes} m ON m.user_id = c.user_id AND m.question_pk = c.question_pk
            {where}
            ORDER BY c.wrong_count DESC, c.due_at ASC
            LIMIT ${idx}
            """,
            *params,
            limit,
        )

        if not rows:
            return None

        candidates = [dict(r) for r in rows]
        now = datetime.now(UTC)

        # 2. 冷却期过滤——跳过近期做过的同一题目
        if cooldown_hours > 0:
            # 简化：查近 N 小时内的日志
            recent_logs = await conn.fetch(
                f"""
                SELECT question_pk::text
                FROM {self._logs}
                WHERE user_id = $1
                  AND created_at >= $2
                  AND question_pk = ANY($3::uuid[])
                """,
                user_id,
                now.replace(tzinfo=None) - __import__("datetime").timedelta(hours=cooldown_hours),
                [r["question_pk"] for r in candidates],
            )
            skip_ids = {str(r["question_pk"]) for r in recent_logs}
            filtered = [c for c in candidates if c["question_pk"] not in skip_ids]
            if filtered:
                candidates = filtered

        # 3. 加权随机抽选
        return _weighted_pick(candidates, now=now)


# ---- FSRS Mixed（闪卡策略） ----

class FrsMixedSelector(ContentSelector):
    """FSRS 调度 + 新词配额 + 混合排序。

    完整策略:
      - 按比例分配（学习 30% / 复习 10% / 新词 60%）
      - 学习/复习池用 FSRS 调度到期卡片
      - 新词池从未开始的内容中按 sort_order 取
      - 混合推送：复习优先 → 新词随后

    当前为占位实现，回退到 SequentialSelector。
    Vocab 的今日学习已有完整实现，暂无新 flash-card 策略需要。
    """

    async def select_next(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        set_id: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> dict | None:
        return await SequentialSelector(self._prefix).select_next(
            conn, user_id=user_id, set_id=set_id, config=config,
        )


# ---- Registry ----

_SELECTOR_MAP: dict[str, type[ContentSelector]] = {
    "sequential": SequentialSelector,
    "weighted_mistake": WeightedMistakeSelector,
    "fsrs_mixed": FrsMixedSelector,
}

_VALID_SELECTORS = frozenset(_SELECTOR_MAP.keys())


def get_selector(name: str, table_prefix: str) -> ContentSelector:
    """根据策略名和表前缀创建 ContentSelector 实例。"""
    cls = _SELECTOR_MAP.get(name)
    if cls is None:
        raise ValueError(f"Unknown content_selector '{name}'. Valid: {sorted(_VALID_SELECTORS)}")
    return cls(table_prefix)


def derive_content_selector(template: str, fw_type: str) -> str:
    """从 template 和 fw_type 推导默认 content_selector。

    旧的 review / practice 仅作兼容，新的默认逻辑看 canonical 类型。
    """
    normalized_fw_type = normalize_focus_work_type(fw_type)
    raw_fw_type = str(fw_type or "").strip().lower()
    if template in ("flash_card", "flashcard"):
        return "fsrs_mixed"
    if template in ("choice", "choice_question"):
        if raw_fw_type in {"review", "practice", "erc_review", "erc_practice"}:
            return "weighted_mistake"
        if normalized_fw_type == "choice":
            return "sequential"
        return "sequential"
    # 未知 template 回退 sequential
    return "sequential"


def is_valid_selector(name: str) -> bool:
    return name in _VALID_SELECTORS
