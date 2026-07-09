"""App registry - single source of truth for app declarations.

Mirrors the frontend app registry. New apps are registered here and
automatically appear in admin panel, frontend AppCenter, and route config.
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
    options: list[dict] | None = None
    min_val: int | None = None
    max_val: int | None = None


@dataclass
class FocusWorkDeclaration:
    type: str
    label: str
    template: str
    content_bank_type: str
    content_selector: str = "sequential"
    content_fields: list[ContentConfigField] = field(default_factory=list)


@dataclass
class AppDeclaration:
    id: str
    name: str
    description: str
    icon: str
    route: str
    admin_only: bool = False
    type: str = "template"  # "template" | "deliberate-workflow"
    bank_ids: list[str] = field(default_factory=list)  # for deliberate-workflow type
    focus_works: list[FocusWorkDeclaration] = field(default_factory=list)
    sections: list[str] = field(default_factory=lambda: ["hero", "asset", "arrangements"])


VOCAB_APP = AppDeclaration(
    id="flash",
    name="背单词",
    description="切换词书并开始今日学习",
    icon="book-open",
    route="/flash",
    sections=["hero", "asset", "arrangements", "feedback", "modals"],
    focus_works=[
        FocusWorkDeclaration(
            type="flash_card",
            label="今日单词",
            template="flash_card",
            content_bank_type="word_deck",
            content_selector="fsrs_mixed",
            content_fields=[
                ContentConfigField(key="deck_id", label="词书", type="deck_switcher"),
                ContentConfigField(key="daily_target_count", label="每日目标", type="number", default_value=20, min_val=1, max_val=500),
            ],
        ),
    ],
)

ERC_APP = AppDeclaration(
    id="erc",
    name="阅读训练",
    description="整篇练习并进入 FSRS 复习池",
    icon="scroll-text",
    route="/erc",
    sections=["hero", "asset", "arrangements", "feedback", "modals"],
    focus_works=[
        FocusWorkDeclaration(
            type="choice",
            label="选择练习",
            template="choice",
            content_bank_type="article_set",
            content_selector="sequential",
            content_fields=[
                ContentConfigField(key="set_id", label="题库", type="set_switcher"),
                ContentConfigField(key="daily_article_target", label="每日目标", type="number", default_value=1, min_val=1, max_val=50),
            ],
        ),
    ],
)

_REGISTRY_FILE = _os.path.join(_os.path.dirname(__file__), "app_registry.json")

_registry: dict[str, AppDeclaration] = {
    "flash": VOCAB_APP,
    "erc": ERC_APP,
}


def _load_persisted() -> dict[str, AppDeclaration]:
    """Load dynamically registered apps from JSON file."""
    if not _os.path.exists(_REGISTRY_FILE):
        return {}
    try:
        with open(_REGISTRY_FILE) as f:
            raw = _json.load(f)
        result: dict[str, AppDeclaration] = {}
        for item in raw:
            fws = []
            for fw_data in item.get("focus_works", []):
                cfs = []
                for cf in fw_data.get("content_fields", []):
                    cfs.append(
                        ContentConfigField(
                            key=cf["key"],
                            label=cf["label"],
                            type=cf["type"],
                            default_value=cf.get("default_value"),
                            options=cf.get("options"),
                            min_val=cf.get("min_val"),
                            max_val=cf.get("max_val"),
                        )
                    )
                fws.append(
                    FocusWorkDeclaration(
                        type=fw_data["type"],
                        label=fw_data["label"],
                        template=fw_data["template"],
                        content_bank_type=fw_data["content_bank_type"],
                        content_selector=fw_data.get("content_selector", "sequential"),
                        content_fields=cfs,
                    )
                )
            result[item["id"]] = AppDeclaration(
                id=item["id"],
                name=item["name"],
                description=item["description"],
                icon=item["icon"],
                route=item["route"],
                admin_only=item.get("admin_only", False),
                type=item.get("type", "template"),
                bank_ids=item.get("bank_ids", []),
                focus_works=fws,
                sections=item.get("sections", ["hero", "asset", "arrangements"]),
            )
        return result
    except Exception:
        return {}


def _persist() -> None:
    """Save dynamically registered apps to JSON file."""
    dynamic = {k: v for k, v in _registry.items() if k not in ("flash", "erc")}
    if not dynamic:
        return
    items = []
    for decl in dynamic.values():
        items.append(
            {
                "id": decl.id,
                "name": decl.name,
                "description": decl.description,
                "icon": decl.icon,
                "route": decl.route,
                "admin_only": decl.admin_only,
                "type": decl.type,
                "bank_ids": decl.bank_ids,
                "sections": decl.sections,
                "focus_works": [
                    {
                        "type": fw.type,
                        "label": fw.label,
                        "template": fw.template,
                        "content_bank_type": fw.content_bank_type,
                        "content_selector": fw.content_selector,
                        "content_fields": [
                            {
                                "key": cf.key,
                                "label": cf.label,
                                "type": cf.type,
                                "default_value": cf.default_value,
                                "options": cf.options,
                                "min_val": cf.min_val,
                                "max_val": cf.max_val,
                            }
                            for cf in fw.content_fields
                        ],
                    }
                    for fw in decl.focus_works
                ],
            }
        )
    with open(_REGISTRY_FILE, "w") as f:
        _json.dump(items, f, ensure_ascii=False, indent=2)


_registry.update(_load_persisted())


def get_all() -> list[AppDeclaration]:
    """Return all registered apps."""
    return list(_registry.values())


def get_by_id(app_id: str) -> AppDeclaration | None:
    """Return a single app by id."""
    return _registry.get(app_id)


def register(app: AppDeclaration) -> None:
    """Register a new app declaration and persist."""
    _registry[app.id] = app
    _persist()

