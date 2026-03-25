"""
Agent 模块 HTTP 路由定义

本模块定义了 Agent 相关的所有 HTTP API 端点，包括：

1. Skill 管理
   - GET /api/agent/skills: 获取所有可用的 Skill 列表

2. Action 执行
   - POST /api/agent/actions/{action_name}: 直接执行指定的 Action

3. Agent Profile 管理
   - GET    /api/agent/profiles:           列出用户的所有 Profile
   - POST   /api/agent/profiles:           创建新的 Profile
   - PATCH  /api/agent/profiles/{id}:      更新 Profile
   - DELETE /api/agent/profiles/{id}:      删除 Profile
   - POST   /api/agent/profiles/{id}/default: 设置为默认 Profile
   - POST   /api/agent/profiles/{id}/avatar:   上传头像
   - DELETE /api/agent/profiles/{id}/avatar:   删除头像

路由前缀: /api/agent
标签: agent

所有端点都需要用户认证（通过 get_current_user 依赖注入）。
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Request, UploadFile

from routes.agents.executor import execute_action_with_context, pool_from_request
from routes.agents.models import (
    AgentActionRequest,
    AgentActionResponse,
    AgentProfileCreateRequest,
    AgentProfileOut,
    AgentProfileUpdateRequest,
    AgentSkillOut,
)
from routes.agents.policy import resolve_agent_context
from routes.agents.profiles import (
    create_profile,
    delete_profile,
    list_profiles,
    remove_profile_avatar,
    set_default_profile,
    update_profile,
    upload_profile_avatar,
)
from routes.agents.skills import list_agent_skills_registry
from routes.auth_routes import get_current_user

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/skills", response_model=list[AgentSkillOut])
async def list_agent_skills(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[AgentSkillOut]:
    """
    获取所有可用的 Agent Skill 列表。

    返回系统中注册的所有 Skill，包含名称、描述、参数定义等信息。
    这些信息用于前端展示可用的工具列表，或供 LLM 进行 function calling。

    请求示例:
        GET /api/agent/skills

    响应示例:
        [
            {
                "name": "task_list",
                "description": "列出任务...",
                "parameters": {"type": "object", "properties": {...}},
                "intent_scope": "task",
                "side_effect": "read"
            },
            ...
        ]

    Args:
        request: FastAPI 请求对象，用于获取请求头信息。
        user: 当前登录用户（通过 get_current_user 依赖注入获取）。

    Returns:
        所有注册的 Skill 列表。
    """
    _ = resolve_agent_context(request, int(user.id))
    return list_agent_skills_registry()


@router.post("/actions/{action_name}", response_model=AgentActionResponse)
async def execute_agent_action(
    action_name: str,
    request: Request,
    body: AgentActionRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentActionResponse:
    """
    直接执行指定的 Agent Action。

    该端点允许前端直接调用 Action，而不需要通过 LLM 对话。
    主要用于：
    - 前端直接触发某些操作（如用户点击按钮删除任务）
    - 审批确认后执行 commit action
    - 调试和测试

    请求示例:
        POST /api/agent/actions/task.list
        {
            "payload": {"status": "todo", "limit": 10}
        }

    响应示例（正常结果）:
        {
            "type": "result",
            "action_id": "task.list",
            "data": {"items": [...], "view": "full"}
        }

    响应示例（需要审批）:
        {
            "type": "approval_required",
            "action_id": "task.delete.prepare",
            "approval_id": "appr_xxx",
            "title": "删除任务",
            "message": "该操作将删除任务...",
            "commit_action": "task.delete.commit",
            "expires_at": "2024-01-01T12:10:00Z"
        }

    Args:
        action_name: 要执行的 Action 名称（如 "task.list"、"task.delete.commit"）。
        request: FastAPI 请求对象。
        body: Action 请求体，包含 payload 参数。
        user: 当前登录用户。

    Returns:
        AgentActionResponse: Action 执行结果。
    """
    ctx = resolve_agent_context(request, int(user.id))
    pool = pool_from_request(request)
    return await execute_action_with_context(pool, action_name=action_name, ctx=ctx, payload=body.payload)


@router.get("/profiles", response_model=list[AgentProfileOut])
async def list_agent_profiles(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[AgentProfileOut]:
    """
    获取当前用户的所有 Agent Profile 列表。

    返回用户创建的所有 Profile，按默认状态和更新时间排序。
    如果用户没有任何 Profile，会自动创建一个默认的 dashboard_agent Profile。

    请求示例:
        GET /api/agent/profiles

    响应示例:
        [
            {
                "id": "apf_xxx",
                "user_id": 1,
                "name": "Ark Agent",
                "description": "通用任务调度助手",
                "agent_type": "dashboard_agent",
                "allowed_skills": ["task_list", "task_update", ...],
                "temperature": 0.2,
                "max_tool_loops": 4,
                "is_default": true,
                ...
            }
        ]

    Args:
        request: FastAPI 请求对象。
        user: 当前登录用户。

    Returns:
        用户的所有 Agent Profile 列表。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        return await list_profiles(conn, user_id=int(user.id))


@router.post("/profiles", response_model=AgentProfileOut)
async def create_agent_profile(
    request: Request,
    body: AgentProfileCreateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    """
    创建新的 Agent Profile。

    用户可以创建多个 Profile，每个 Profile 可以有不同的配置：
    - 不同的 Agent 类型（dashboard_agent、app_agent:arxiv 等）
    - 不同的人设提示词
    - 不同的允许 Skill 列表
    - 不同的温度参数

    请求示例:
        POST /api/agent/profiles
        {
            "name": "论文助手",
            "description": "专注于论文检索和阅读",
            "agent_type": "app_agent:arxiv",
            "persona_prompt": "你是一位专业的论文研究助手...",
            "allowed_skills": ["arxiv_search", "arxiv_paper_details"],
            "temperature": 0.3,
            "is_default": false
        }

    Args:
        request: FastAPI 请求对象。
        body: Profile 创建请求体。
        user: 当前登录用户。

    Returns:
        新创建的 Agent Profile。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await create_profile(conn, user_id=int(user.id), payload=body)


@router.patch("/profiles/{profile_id}", response_model=AgentProfileOut)
async def update_agent_profile(
    profile_id: str,
    request: Request,
    body: AgentProfileUpdateRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    """
    更新指定的 Agent Profile。

    只更新请求体中提供的字段，未提供的字段保持不变。

    请求示例:
        PATCH /api/agent/profiles/apf_xxx
        {
            "name": "新名称",
            "temperature": 0.5
        }

    Args:
        profile_id: 要更新的 Profile ID。
        request: FastAPI 请求对象。
        body: Profile 更新请求体（所有字段可选）。
        user: 当前登录用户。

    Returns:
        更新后的 Agent Profile。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await update_profile(conn, user_id=int(user.id), profile_id=profile_id, payload=body)


@router.delete("/profiles/{profile_id}")
async def delete_agent_profile(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> dict[str, bool]:
    """
    删除指定的 Agent Profile。

    注意：
    - 删除默认 Profile 后，会自动将最近更新的 Profile 设为默认
    - 删除 Profile 会同时删除其头像文件

    请求示例:
        DELETE /api/agent/profiles/apf_xxx

    响应示例:
        {"ok": true}

    Args:
        profile_id: 要删除的 Profile ID。
        request: FastAPI 请求对象。
        user: 当前登录用户。

    Returns:
        删除结果。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await delete_profile(conn, user_id=int(user.id), profile_id=profile_id)


@router.post("/profiles/{profile_id}/default", response_model=AgentProfileOut)
async def set_agent_profile_default(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    """
    将指定的 Profile 设为默认。

    用户在进行对话时，如果没有指定 profile_id，会使用默认 Profile。
    每个用户只能有一个默认 Profile，设置新的默认会取消之前的默认。

    请求示例:
        POST /api/agent/profiles/apf_xxx/default

    Args:
        profile_id: 要设为默认的 Profile ID。
        request: FastAPI 请求对象。
        user: 当前登录用户。

    Returns:
        更新后的 Agent Profile。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await set_default_profile(conn, user_id=int(user.id), profile_id=profile_id)


@router.post("/profiles/{profile_id}/avatar", response_model=AgentProfileOut)
async def upload_agent_profile_avatar(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    avatar: UploadFile = File(...),
) -> AgentProfileOut:
    """
    上传 Profile 头像。

    支持的图片格式：PNG、JPEG、WebP
    最大文件大小：2MB

    头像文件存储在 backend/uploads/agent-avatars/ 目录，
    数据库中存储的是相对 URL 路径。

    请求示例:
        POST /api/agent/profiles/apf_xxx/avatar
        Content-Type: multipart/form-data
        avatar: <图片文件>

    Args:
        profile_id: Profile ID。
        request: FastAPI 请求对象。
        user: 当前登录用户。
        avatar: 上传的头像文件。

    Returns:
        更新后的 Agent Profile（包含新的 avatar_url）。
    """
    pool = pool_from_request(request)
    content = await avatar.read()
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await upload_profile_avatar(
                conn,
                user_id=int(user.id),
                profile_id=profile_id,
                content_type=avatar.content_type,
                content=content,
            )


@router.delete("/profiles/{profile_id}/avatar", response_model=AgentProfileOut)
async def delete_agent_profile_avatar(
    profile_id: str,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> AgentProfileOut:
    """
    删除 Profile 头像。

    会同时删除数据库中的 avatar_url 和文件系统中的头像文件。

    请求示例:
        DELETE /api/agent/profiles/apf_xxx/avatar

    Args:
        profile_id: Profile ID。
        request: FastAPI 请求对象。
        user: 当前登录用户。

    Returns:
        更新后的 Agent Profile（avatar_url 为 null）。
    """
    pool = pool_from_request(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            return await remove_profile_avatar(conn, user_id=int(user.id), profile_id=profile_id)
