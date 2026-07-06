"""封装 fsrs Python 库,提供调度层供 study_ledger 调用。

fsrs v6+ API 摘要(实际版本以 backend/.venv 中安装的为准):
- ``Scheduler(desired_retention=0.9, maximum_interval=36500, learning_steps=(60s, 600s), ...)``
- ``Scheduler.review_card(card, rating, review_datetime=None) -> tuple[Card, ReviewLog]``
- ``Card`` 字段: ``card_id`` / ``state`` / ``step`` / ``stability`` / ``difficulty`` / ``due`` / ``last_review``
- ``Card.to_dict()`` / ``Card.from_dict(d)`` / ``Card.to_json()`` / ``Card.from_json(s)``
- ``Rating``: ``Again=1`` / ``Hard=2`` / ``Good=3`` / ``Easy=4``
- ``State``: ``Learning=1`` / ``Review=2`` / ``Relearning=3``
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from fsrs import Card, Rating, Scheduler

from routes.deliberate.schemas import FsrsConfig

RatingStr = Literal["again", "hard", "good", "easy"]

_RATING_MAP: dict[str, Rating] = {
    "again": Rating.Again,
    "hard": Rating.Hard,
    "good": Rating.Good,
    "easy": Rating.Easy,
}


def _normalize_config(fsrs_config: FsrsConfig | dict[str, Any] | None) -> FsrsConfig:
    if fsrs_config is None:
        return FsrsConfig()
    if isinstance(fsrs_config, FsrsConfig):
        return fsrs_config
    return FsrsConfig(**fsrs_config)


def make_scheduler(fsrs_config: FsrsConfig | dict[str, Any] | None = None) -> Scheduler:
    """按 FsrsConfig 构造 fsrs.Scheduler。learning_steps 暂不暴露,沿用库默认 (60s, 600s)。"""
    cfg = _normalize_config(fsrs_config)
    return Scheduler(
        desired_retention=cfg.desired_retention,
        maximum_interval=cfg.max_interval_days,
    )


def card_from_json(card_json: str | dict[str, Any] | None) -> Card | None:
    """从 JSON 字符串/dict 反序列化 fsrs.Card;输入为空返回 None。"""
    if not card_json:
        return None
    data = json.loads(card_json) if isinstance(card_json, str) else dict(card_json)
    # Card.from_dict 对 state 字段容忍 int / str,且忽略多余 key(兼容历史数据)
    return Card.from_dict(data)


def card_to_json(card: Card) -> str:
    """序列化 fsrs.Card 为 JSON 字符串(便于写入 JSONB 列)。"""
    return card.to_json()


@dataclass
class ReviewResult:
    """fsrs review 调用结果。"""

    new_card: Card
    new_card_json: str
    new_due_at: datetime
    interval_days: float
    should_repeat_today: bool


def review(
    card: Card | None,
    rating: RatingStr,
    fsrs_config: FsrsConfig | dict[str, Any] | None = None,
    now: datetime | None = None,
) -> ReviewResult:
    """对一张卡评分,返回新状态。

    - ``card`` 为 None 时视为新卡(Card())。
    - ``rating`` 必须是 ``again`` / ``hard`` / ``good`` / ``easy``。
    - ``now`` 用于覆盖评分时间(测试或回放)。

    ``should_repeat_today`` 语义:
      - ``again``:始终 True(FSRS 将卡置入短期 learning steps,应在当前题单内重出)
      - 其他评分:仅当新 ``due_at <= now`` 时 True(learning steps 仍到期)
    """
    now = now or datetime.now(UTC)
    scheduler = make_scheduler(fsrs_config)
    fsrs_card = card or Card()
    fsrs_rating = _RATING_MAP[rating]
    new_card, _review_log = scheduler.review_card(fsrs_card, fsrs_rating, review_datetime=now)
    new_due_at = new_card.due or now
    interval_days = max((new_due_at - now).total_seconds() / 86400, 0.0)
    should_repeat_today = (rating == "again") or (new_due_at <= now)
    return ReviewResult(
        new_card=new_card,
        new_card_json=card_to_json(new_card),
        new_due_at=new_due_at,
        interval_days=interval_days,
        should_repeat_today=should_repeat_today,
    )
