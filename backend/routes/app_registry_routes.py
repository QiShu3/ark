"""Public API for app registry — consumed by frontend."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from lib.app_registry import AppDeclaration, get_all_for_user
from lib.sub_apps import list_visible
from routes.auth_routes import _AuthUser, _pool_from_request, _user_from_token, get_current_user

router = APIRouter(prefix="/api", tags=["app-registry"])
_bearer = HTTPBearer(auto_error=False)


async def _optional_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> _AuthUser | None:
    """从 Bearer token 解析当前用户；未登录返回 None。"""
    if creds is None or not creds.credentials:
        return None
    pool = _pool_from_request(request)
    return await _user_from_token(pool, creds.credentials)


def _decl_to_dict(decl: AppDeclaration | dict) -> dict:
    if isinstance(decl, dict):
        return decl
    return {
        "id": decl.id,
        "name": decl.name,
        "description": decl.description,
        "icon": decl.icon,
        "admin_only": decl.admin_only,
        "guest_only": decl.guest_only,
        "route": decl.route,
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


@router.get("/app-registry")
async def get_app_registry(
    request: Request,
    user: Annotated[_AuthUser | None, Depends(_optional_user)],
):
    is_guest = bool(user and user.is_guest)
    is_admin = bool(user and user.is_admin)
    static_apps = get_all_for_user(is_guest=is_guest, is_admin=is_admin)
    if user is None:
        return [_decl_to_dict(d) for d in static_apps]
    pool = _pool_from_request(request)
    async with pool.acquire() as conn:
        sub_apps = await list_visible(conn, user_id=int(user.id), is_admin=is_admin, is_guest=is_guest)
    return [_decl_to_dict(d) for d in static_apps] + sub_apps


class SubAppCreateRequest(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    icon: str = Field(default="workflow", max_length=50)
    bank_ids: list[str] = Field(default_factory=list)
    event_id: str | None = None


class SubAppUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=50)
    bank_ids: list[str] | None = None
    event_id: str | None = None


@router.get("/sub-apps")
async def list_owned_sub_apps(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    """List the sub-apps the current user can manage."""
    from lib.sub_apps import list_manageable

    async with _pool_from_request(request).acquire() as conn:
        return await list_manageable(conn, user_id=int(user.id), is_admin=user.is_admin)


@router.post("/sub-apps", status_code=201)
async def create_owned_sub_app(
    payload: SubAppCreateRequest,
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    """Create a private sub-app owned by the current user."""
    if user.is_guest:
        raise HTTPException(status_code=403, detail="游客不能手动创建子应用")
    requested_id = payload.id.strip().lower()
    if not requested_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="应用 ID 只能包含字母、数字、连字符和下划线")
    # Private IDs are namespaced server-side, so identical client labels from
    # different users never collide or expose another user's route.
    app_id = f"{requested_id}-{int(user.id)}"
    from lib.sub_apps import row_to_declaration

    async with _pool_from_request(request).acquire() as conn:
        if payload.event_id is not None:
            event = await conn.fetchrow("SELECT id FROM events WHERE id = $1::uuid AND user_id = $2", payload.event_id, int(user.id))
            if event is None:
                raise HTTPException(status_code=404, detail="事件不存在或无权关联")
        row = await conn.fetchrow(
            """
            INSERT INTO deliberate_sub_apps(
                id, slug, name, description, icon, bank_ids,
                owner_user_id, created_by_user_id, visibility, event_id
            ) VALUES ($1, $1, $2, $3, $4, $5::TEXT[], $6, $6, 'private', $7::uuid)
            ON CONFLICT (id) DO NOTHING
            RETURNING id, slug, name, description, icon, bank_ids, owner_user_id,
                      created_by_user_id, visibility, template_key, event_id
            """,
            app_id, payload.name.strip(), payload.description, payload.icon,
            payload.bank_ids, int(user.id), payload.event_id,
        )
    if row is None:
        raise HTTPException(status_code=409, detail="你已经创建过相同 ID 的子应用")
    return row_to_declaration(row)


@router.patch("/sub-apps/{app_id}")
async def update_owned_sub_app(
    app_id: str,
    payload: SubAppUpdateRequest,
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    from lib.sub_apps import row_to_declaration

    async with _pool_from_request(request).acquire() as conn:
        if "event_id" in payload.model_fields_set and payload.event_id is not None:
            event = await conn.fetchrow("SELECT id FROM events WHERE id = $1::uuid AND user_id = $2", payload.event_id, int(user.id))
            if event is None:
                raise HTTPException(status_code=404, detail="事件不存在或无权关联")
        row = await conn.fetchrow(
            """
            UPDATE deliberate_sub_apps
            SET name = COALESCE($3, name), description = COALESCE($4, description),
                icon = COALESCE($5, icon), bank_ids = COALESCE($6::TEXT[], bank_ids),
                event_id = CASE WHEN $7 THEN $8::uuid ELSE event_id END,
                updated_at = NOW()
            WHERE id = $1 AND ($2 OR owner_user_id = $9)
            RETURNING id, slug, name, description, icon, bank_ids, owner_user_id,
                      created_by_user_id, visibility, template_key, event_id
            """,
            app_id, user.is_admin, payload.name, payload.description, payload.icon,
            payload.bank_ids, "event_id" in payload.model_fields_set, payload.event_id, int(user.id),
        )
    if row is None:
        raise HTTPException(status_code=404, detail="子应用不存在或无权管理")
    if "event_id" in payload.model_fields_set:
        await conn.execute(
            """
            UPDATE deliberate_workflow_configs
            SET event_id = $3::uuid, updated_at = NOW()
            WHERE user_id = $1 AND app_id = $2
            """,
            int(user.id),
            app_id,
            payload.event_id,
        )
        await conn.execute(
            """
            UPDATE focus_workflow_presets
            SET event_id = $3::uuid, updated_at = NOW()
            WHERE user_id = $1 AND app_id = $2
            """,
            int(user.id),
            app_id,
            payload.event_id,
        )
    return row_to_declaration(row)


@router.delete("/sub-apps/{app_id}")
async def delete_owned_sub_app(
    app_id: str,
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
):
    async with _pool_from_request(request).acquire() as conn:
        async with conn.transaction():
            deleted = await conn.fetchval(
                "DELETE FROM deliberate_sub_apps WHERE id = $1 AND ($2 OR owner_user_id = $3) RETURNING id",
                app_id, user.is_admin, int(user.id),
            )
            if deleted is None:
                raise HTTPException(status_code=404, detail="子应用不存在或无权管理")
            await conn.execute("DELETE FROM deliberate_workflow_runs WHERE app_id = $1", app_id)
            await conn.execute("DELETE FROM deliberate_workflow_configs WHERE app_id = $1", app_id)
            await conn.execute("DELETE FROM focus_workflow_presets WHERE app_id = $1", app_id)
    return {"detail": f"子应用 '{app_id}' 已删除"}
