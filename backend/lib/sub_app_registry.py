"""Sub-application registry — single source of truth for sub-app declarations.

Mirrors frontend/src/lib/subAppRegistry.ts.  New sub-apps are registered here
and automatically appear in admin panel, frontend AppCenter, and route config.
"""

import json as _json
import os as _os
from dataclasses import dataclass, field


@dataclass
class ContentConfigField:
    key: str
    label: str
    type: str  # "number" | "select" | "deck_switcher" | "set_switcher"
    default_value: object = None
    options: list[dict] | None = None  # [{"value": "...", "label": "..."}]
    min_val: int | None = None
    max_val: int | None = None


@dataclass
class FocusWorkDeclaration:
    type: str             # "vocab_today" / "erc_review"
    label: str            # "今日单词" / "错题复习"
    template: str         # "flashcard" / "choice_question"
    content_bank_type: str  # "word_deck" / "article_set"
    content_fields: list[ContentConfigField] = field(default_factory=list)


@dataclass
class SubAppDeclaration:
    id: str
    name: str
    description: str
    icon: str             # lucide icon name, e.g. "book-open"
    route: str            # "/vocab" / "/erc"
    focus_works: list[FocusWorkDeclaration] = field(default_factory=list)


# ---- Built-in declarations ----

VOCAB = SubAppDeclaration(
    id="vocab",
    name="背单词",
    description="切换词书并开始今日学习",
    icon="book-open",
    route="/vocab",
    focus_works=[
        FocusWorkDeclaration(
            type="vocab_today",
            label="今日单词",
            template="flashcard",
            content_bank_type="word_deck",
            content_fields=[
                ContentConfigField(key="deck_id", label="词书", type="deck_switcher"),
                ContentConfigField(key="daily_target_count", label="每日目标", type="number", default_value=20, min_val=1, max_val=500),
            ],
        ),
    ],
)

ERC = SubAppDeclaration(
    id="erc",
    name="阅读训练",
    description="整篇练习并进入 FSRS 复习池",
    icon="scroll-text",
    route="/erc",
    focus_works=[
        FocusWorkDeclaration(
            type="erc_practice",
            label="真题练习",
            template="choice_question",
            content_bank_type="article_set",
            content_fields=[
                ContentConfigField(key="set_id", label="题库", type="set_switcher"),
                ContentConfigField(key="daily_article_target", label="每日目标", type="number", default_value=1, min_val=1, max_val=50),
            ],
        ),
        FocusWorkDeclaration(
            type="erc_review",
            label="错题复习",
            template="choice_question",
            content_bank_type="article_set",
            content_fields=[
                ContentConfigField(key="daily_question_target", label="每日目标", type="number", default_value=10, min_val=1, max_val=200),
                ContentConfigField(
                    key="review_scope", label="复习范围", type="select", default_value="due",
                    options=[
                        {"value": "due", "label": "仅到期错题"},
                        {"value": "mistakes", "label": "未掌握错题"},
                        {"value": "all", "label": "全部错题"},
                    ],
                ),
            ],
        ),
    ],
)

# ---- Registry ----

_REGISTRY_FILE = _os.path.join(_os.path.dirname(__file__), "sub_app_registry.json")

_registry: dict[str, SubAppDeclaration] = {
    "vocab": VOCAB,
    "erc": ERC,
}


def _load_persisted() -> dict[str, SubAppDeclaration]:
    """Load dynamically registered apps from JSON file."""
    if not _os.path.exists(_REGISTRY_FILE):
        return {}
    try:
        with open(_REGISTRY_FILE) as f:
            raw = _json.load(f)
        result = {}
        for item in raw:
            fws = []
            for fw_data in item.get("focus_works", []):
                cfs = []
                for cf in fw_data.get("content_fields", []):
                    cfs.append(ContentConfigField(
                        key=cf["key"], label=cf["label"], type=cf["type"],
                        default_value=cf.get("default_value"),
                        options=cf.get("options"),
                        min_val=cf.get("min_val"), max_val=cf.get("max_val"),
                    ))
                fws.append(FocusWorkDeclaration(
                    type=fw_data["type"], label=fw_data["label"],
                    template=fw_data["template"], content_bank_type=fw_data["content_bank_type"],
                    content_fields=cfs,
                ))
            result[item["id"]] = SubAppDeclaration(
                id=item["id"], name=item["name"], description=item["description"],
                icon=item["icon"], route=item["route"], focus_works=fws,
            )
        return result
    except Exception:
        return {}


def _persist() -> None:
    """Save dynamically registered apps to JSON file."""
    dynamic = {k: v for k, v in _registry.items() if k not in ("vocab", "erc")}
    if not dynamic:
        return
    items = []
    for decl in dynamic.values():
        items.append({
            "id": decl.id, "name": decl.name, "description": decl.description,
            "icon": decl.icon, "route": decl.route,
            "focus_works": [
                {
                    "type": fw.type, "label": fw.label,
                    "template": fw.template, "content_bank_type": fw.content_bank_type,
                    "content_fields": [
                        {"key": cf.key, "label": cf.label, "type": cf.type,
                         "default_value": cf.default_value, "options": cf.options,
                         "min_val": cf.min_val, "max_val": cf.max_val}
                        for cf in fw.content_fields
                    ],
                }
                for fw in decl.focus_works
            ],
        })
    with open(_REGISTRY_FILE, "w") as f:
        _json.dump(items, f, ensure_ascii=False, indent=2)


# Load persisted on startup
_registry.update(_load_persisted())


def get_all() -> list[SubAppDeclaration]:
    """Return all registered sub-apps."""
    return list(_registry.values())


def get_by_id(app_id: str) -> SubAppDeclaration | None:
    """Return a single sub-app by id."""
    return _registry.get(app_id)


def register(app: SubAppDeclaration) -> None:
    """Register a new sub-app declaration and persist."""
    _registry[app.id] = app
    _persist()
