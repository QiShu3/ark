"""Public API for sub-app registry — consumed by frontend."""
from fastapi import APIRouter

from lib.sub_app_registry import SubAppDeclaration, get_all

router = APIRouter(prefix="/api", tags=["app-registry"])


def _decl_to_dict(decl: SubAppDeclaration) -> dict:
    return {
        "id": decl.id,
        "name": decl.name,
        "description": decl.description,
        "icon": decl.icon,
        "route": decl.route,
        "focus_works": [
            {
                "type": fw.type,
                "label": fw.label,
                "template": fw.template,
                "content_bank_type": fw.content_bank_type,
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
async def get_app_registry():
    return [_decl_to_dict(d) for d in get_all()]
