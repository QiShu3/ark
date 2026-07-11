"""Public API for app registry — consumed by frontend."""
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from lib.app_registry import AppDeclaration, get_all_for_user
from routes.auth_routes import _AuthUser, _pool_from_request, _user_from_token

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


def _decl_to_dict(decl: AppDeclaration) -> dict:
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
    user: Annotated[_AuthUser | None, Depends(_optional_user)],
):
    is_guest = bool(user and user.is_guest)
    is_admin = bool(user and user.is_admin)
    apps = get_all_for_user(is_guest=is_guest, is_admin=is_admin)
    return [_decl_to_dict(d) for d in apps]
