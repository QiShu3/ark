"""Persistent deliberate-workflow sub-application registry.

Sub-app definitions are deliberately kept separate from a user's workflow
configs.  A definition controls who can discover a sub-app; configs, presets
and records already use ``user_id`` for their own data isolation.
"""

from __future__ import annotations

from typing import Any


def row_to_declaration(row: Any) -> dict[str, Any]:
    """Convert a database row to the app-registry shape consumed by the UI."""
    slug = str(row["slug"])
    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "description": str(row["description"] or ""),
        "icon": str(row["icon"] or "workflow"),
        # Guest templates retain a friendly, stable URL while their IDs remain
        # per-user.  Other apps use their unique slug directly.
        "route": f"/{row['template_key'] or slug}",
        "admin_only": False,
        "guest_only": False,
        "type": "deliberate-workflow",
        "bank_ids": list(row["bank_ids"] or []),
        "sections": [],
        "focus_works": [],
        "owner_user_id": int(row["owner_user_id"]) if row["owner_user_id"] is not None else None,
        "created_by_user_id": int(row["created_by_user_id"]) if row["created_by_user_id"] is not None else None,
        "visibility": str(row["visibility"]),
        "template_key": row["template_key"],
        "event_id": str(row["event_id"]) if row["event_id"] is not None else None,
    }


async def list_visible(conn: Any, *, user_id: int, is_admin: bool, is_guest: bool = False) -> list[dict[str, Any]]:
    if is_admin:
        rows = await conn.fetch(
            """
            SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
                   created_by_user_id, visibility, template_key, event_id
            FROM deliberate_sub_apps
            ORDER BY created_at ASC
            """
        )
    elif is_guest:
        rows = await conn.fetch(
            """
            SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
                   created_by_user_id, visibility, template_key, event_id
            FROM deliberate_sub_apps
            WHERE visibility = 'system' OR owner_user_id = $1
            ORDER BY created_at ASC
            """,
            user_id,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
                   created_by_user_id, visibility, template_key, event_id
            FROM deliberate_sub_apps
            WHERE visibility IN ('system', 'public') OR owner_user_id = $1
            ORDER BY created_at ASC
            """,
            user_id,
        )
    return [row_to_declaration(row) for row in rows]


async def get_accessible(
    conn: Any, *, app_id: str, user_id: int, is_admin: bool, is_guest: bool = False
) -> dict[str, Any] | None:
    public_condition = "visibility = 'system'" if is_guest else "visibility IN ('system', 'public')"
    row = await conn.fetchrow(
        f"""
        SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
               created_by_user_id, visibility, template_key, event_id
        FROM deliberate_sub_apps
        WHERE id = $1
          AND ($3 OR {public_condition} OR owner_user_id = $2)
        """,
        app_id,
        user_id,
        is_admin,
    )
    return row_to_declaration(row) if row is not None else None


async def get_manageable(
    conn: Any, *, app_id: str, user_id: int, is_admin: bool
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
               created_by_user_id, visibility, template_key, event_id
        FROM deliberate_sub_apps
        WHERE id = $1 AND ($3 OR owner_user_id = $2)
        """,
        app_id,
        user_id,
        is_admin,
    )
    return row_to_declaration(row) if row is not None else None


async def list_manageable(conn: Any, *, user_id: int, is_admin: bool) -> list[dict[str, Any]]:
    if is_admin:
        rows = await conn.fetch(
            """
            SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
                   created_by_user_id, visibility, template_key, event_id
            FROM deliberate_sub_apps
            ORDER BY created_at ASC
            """
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, slug, name, description, icon, bank_ids, owner_user_id,
                   created_by_user_id, visibility, template_key, event_id
            FROM deliberate_sub_apps
            WHERE owner_user_id = $1
            ORDER BY created_at ASC
            """,
            user_id,
        )
    return [row_to_declaration(row) for row in rows]
