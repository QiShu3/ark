"""
Agent 模块数据模型定义

本模块定义了 Agent 系统的核心数据结构，包括：
- 类型别名定义（AgentType、ActionEffect 等）
- API 请求/响应模型
- Agent 配置（Profile）相关模型
- 权限策略相关数据结构
- Action 执行相关数据结构

架构概述：
┌─────────────────────────────────────────────────────────────────┐
│  用户请求 → ChatRequest → AgentProfile → Skills → Actions       │
│                              ↓                                   │
│                         PolicyRule 校验                          │
│                              ↓                                   │
│                       AgentContext 执行上下文                    │
│                              ↓                                   │
│                       AgentActionResponse 响应                   │
└─────────────────────────────────────────────────────────────────┘
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

ActionEffect = Literal["read", "write", "destructive"]
ResponseType = Literal["result", "approval_required", "forbidden"]
MessageRole = Literal["system", "user", "assistant", "tool"]


class AgentAppOut(BaseModel):
    app_id: str
    display_name: str
    description: str
    default_profile_name: str
    default_profile_description: str
    default_context_prompt: str
    default_skills: list[str]
    allowed_skill_apps: list[str]


class AgentActionRequest(BaseModel):
    """
    Agent Action 执行请求模型。

    用于直接调用 Agent Action 的 API 端点（POST /api/agent/actions/{action_name}）。

    Attributes:
        payload: Action 执行所需的参数，具体结构由各 Action 定义决定。
                 例如：task_list 的 payload 可包含 status、q、limit、offset 等。
    """
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentSkillOut(BaseModel):
    """
    Agent Skill 输出模型。

    描述一个可供 LLM 调用的技能（工具）。这些信息会被转换为 OpenAI/DeepSeek
    兼容的 function calling 格式，供 LLM 决策使用。

    Attributes:
        name: Skill 名称，用于 LLM 调用时的标识符（如 "arxiv_search"、"task_list"）。
        description: Skill 描述，LLM 根据此描述判断何时调用该 Skill。
        parameters: JSON Schema 格式的参数定义，描述 Skill 接受的参数结构。
        intent_scope: 意图范围标识（如 "arxiv"、"task"），用于权限校验。
        side_effect: 操作副作用类型，影响权限策略和审批流程。
            - "read": 只读操作，无副作用
            - "write": 写入操作，会修改数据
            - "destructive": 破坏性操作，如删除，通常需要审批
    """
    name: str
    app_id: str
    description: str
    parameters: dict[str, Any]
    intent_scope: str
    side_effect: ActionEffect


class AgentActionResponse(BaseModel):
    """
    Agent Action 执行响应模型。

    统一的 Action 执行结果格式，支持三种响应类型：
    1. result: 正常执行结果
    2. approval_required: 需要用户审批（敏感操作）
    3. forbidden: 权限拒绝

    Attributes:
        type: 响应类型，决定前端如何处理该响应。
        action_id: Action 标识符，用于追踪和日志。
        data: 正常执行结果数据（type="result" 时使用）。
        data: 当 type="approval_required" 时，可作为用户确认后提交到 commit_action 的 payload。
        title: 审批弹窗标题（type="approval_required" 时使用）。
        message: 审批弹窗提示信息（type="approval_required" 时使用）。
        impact: 操作影响描述，包含资源类型、ID 列表、数量等。
        commit_action: 确认后需要执行的 commit action 名称。
        reason: 拒绝原因（type="forbidden" 时使用）。

    示例 - 正常结果:
        {
            "type": "result",
            "action_id": "task.list",
            "data": {"items": [...], "view": "full"}
        }

    示例 - 需要审批:
        {
            "type": "approval_required",
            "action_id": "task.delete.prepare",
            "data": {"task_id": "uuid"},
            "title": "删除任务",
            "message": "该操作将删除任务《XXX》。确认后不可自动恢复。",
            "impact": {"resource_type": "task", "resource_ids": ["uuid"], "count": 1},
            "commit_action": "task.delete.commit"
        }
    """
    type: ResponseType
    action_id: str
    data: dict[str, Any] | None = None
    title: str | None = None
    message: str | None = None
    impact: dict[str, Any] | None = None
    commit_action: str | None = None
    reason: str | None = None


class ChatMessage(BaseModel):
    """
    聊天消息模型。

    用于构建对话历史，遵循 OpenAI Chat API 格式。

    Attributes:
        role: 消息角色
            - "system": 系统提示词（通常由后端构建，不来自前端）
            - "user": 用户消息
            - "assistant": AI 助手回复
            - "tool": 工具调用结果
        content: 消息文本内容。
    """
    role: MessageRole
    content: str = ""


class ChatRequest(BaseModel):
    """
    聊天请求模型。

    用户发起对话时的请求数据，包含当前消息和历史对话。

    Attributes:
        message: 用户当前输入的消息，长度限制 1-8000 字符。
        history: 对话历史，最多保留最近 12 条（在 chat.py 中截断）。
        scope: 可选的作用域标识，用于限定 Agent 的操作范围。
        profile_id: 指定使用的 Agent Profile ID，不指定则使用默认 Profile。
        allowed_skills: 可选的 Skill 白名单，覆盖 Profile 中的配置。

    示例:
        {
            "message": "帮我查看今天的待办任务",
            "history": [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好！有什么可以帮你的？"}
            ],
            "profile_id": "apf_xxx"
        }
    """
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list)
    scope: str | None = Field(default=None, max_length=64)
    profile_id: str | None = Field(default=None, max_length=64)
    allowed_skills: list[str] | None = None


class ChatResponse(BaseModel):
    """
    聊天响应模型。

    对话处理完成后的响应数据。

    Attributes:
        reply: AI 助手的文本回复。
        approval: 如果执行了需要审批的操作，返回确认信息供前端展示确认弹窗。
                  用户确认后，前端需将 approval.data 作为 payload 提交到 approval.commit_action。
    """
    reply: str
    approval: AgentActionResponse | None = None


class AgentProfileOut(BaseModel):
    """
    Agent Profile 输出模型。

    完整的 Agent 配置信息，用于 API 响应和运行时配置加载。

    Attributes:
        id: Profile 唯一标识符，格式为 "apf_" + 随机字符串。
        user_id: 所属用户 ID。
        name: Profile 显示名称。
        description: Profile 描述。
        primary_app_id: 主应用/主工作区标识，由 app registry 定义。
        avatar_url: 头像图片 URL。
        context_prompt: 自然语言上下文，用于描述 Agent 的职责、服务对象与工作方式。
        allowed_skills: 允许使用的 Skill 列表，限制 Agent 可调用的工具。
        temperature: LLM 温度参数，控制回复的随机性（0.0-1.2）。
        max_tool_loops: 最大工具调用循环次数，防止无限循环（1-8）。
        is_default: 是否为用户的默认 Profile。
        created_at: 创建时间。
        updated_at: 最后更新时间。
    """
    id: str
    user_id: int
    name: str
    description: str
    primary_app_id: str
    avatar_url: str | None
    context_prompt: str
    allowed_skills: list[str]
    temperature: float
    max_tool_loops: int
    is_default: bool
    created_at: datetime
    updated_at: datetime


class AgentProfileCreateRequest(BaseModel):
    """
    Agent Profile 创建请求模型。

    用于创建新的 Agent Profile 配置。

    Attributes:
        name: Profile 名称，1-60 字符。
        description: Profile 描述，最多 300 字符。
        primary_app_id: 主应用/工作区，默认为 "dashboard"。
        context_prompt: 自然语言上下文，最多 4000 字符。
        allowed_skills: 允许的 Skill 列表，为空则使用所有可用 Skill。
        temperature: 温度参数，默认 0.2，范围 0.0-1.2。
        max_tool_loops: 最大工具循环次数，默认 4，范围 1-8。
        is_default: 是否设为默认 Profile，默认 False。
    """
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    primary_app_id: str = Field(default="dashboard", max_length=64)
    context_prompt: str = Field(default="", max_length=4000)
    allowed_skills: list[str] = Field(default_factory=list)
    temperature: float = Field(default=0.2, ge=0.0, le=1.2)
    max_tool_loops: int | None = Field(default=None, ge=1, le=8)
    is_default: bool = False


class AgentProfileUpdateRequest(BaseModel):
    """
    Agent Profile 更新请求模型。

    用于更新现有的 Agent Profile 配置。所有字段均为可选，只更新提供的字段。

    Attributes:
        name: 新的 Profile 名称。
        description: 新的描述。
        primary_app_id: 新的主应用。
        context_prompt: 新的自然语言上下文。
        allowed_skills: 新的允许 Skill 列表。
        temperature: 新的温度参数。
        max_tool_loops: 新的最大工具循环次数。
        is_default: 是否设为默认 Profile。
    """
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    primary_app_id: str | None = Field(default=None, max_length=64)
    context_prompt: str | None = Field(default=None, max_length=4000)
    allowed_skills: list[str] | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=1.2)
    max_tool_loops: int | None = Field(default=None, ge=1, le=8)
    is_default: bool | None = None


@dataclass(frozen=True)
class AgentContext:
    """
    Agent 运行时上下文。

    在 Action 执行过程中传递的上下文信息，包含用户身份、Agent 类型和权限能力。
    该对象是不可变的（frozen=True），确保执行过程中上下文不被篡改。

    Attributes:
        user_id: 当前用户 ID。
        primary_app_id: 当前 Agent 的主应用/工作区。
        session_id: 会话 ID，用于审批票据的会话绑定。
        capabilities: 当前 Agent 具备的能力集合，来自 Profile 默认能力和请求头扩展。

    构建流程:
        1. 从请求头获取 X-Ark-Agent-Type、X-Ark-App-Id、X-Ark-Session-Id
        2. 合并默认能力和请求头中的 X-Ark-Capabilities
        3. 创建不可变的 AgentContext 实例
    """
    user_id: int
    primary_app_id: str
    session_id: str | None
    capabilities: frozenset[str]


@dataclass(frozen=True)
class PolicyRule:
    """
    权限策略规则。

    定义一个 Action 的访问控制规则，用于在执行前进行权限校验。

    Attributes:
        action_id: 规则对应的 Action ID（如 "task.delete"、"arxiv.search"）。
        allowed_apps: 允许执行该 Action 的主应用列表。
        allowed_scopes: 允许执行的作用域列表（如 "global_tasks"、"app:arxiv"）。
        required_capabilities: 执行该 Action 需要的能力列表，Agent 必须具备所有能力。
        requires_confirmation: 是否需要用户确认（用于敏感操作）。
        effect: 操作影响类型，用于审计和日志记录。
            - "read": 只读
            - "write": 写入
            - "destructive": 破坏性操作

    示例:
        PolicyRule(
            action_id="task.delete",
            allowed_apps=("dashboard",),
            allowed_scopes=("global_tasks",),
            required_capabilities=("task.delete",),
            requires_confirmation=True,
            effect="destructive",
        )

    校验流程:
        1. 检查 ctx.primary_app_id 是否在 allowed_apps 中
        2. 检查 ctx.capabilities 是否包含所有 required_capabilities
        3. 计算作用域并检查是否在 allowed_scopes 中
    """
    action_id: str
    allowed_apps: tuple[str, ...]
    allowed_scopes: tuple[str, ...]
    required_capabilities: tuple[str, ...] = ()
    requires_confirmation: bool = False
    effect: ActionEffect = "read"


ActionHandler = Callable[..., Awaitable[dict[str, Any] | AgentActionResponse]]
"""
Action 处理函数类型别名。

定义了 Action Handler 的函数签名：
- 接收参数：conn（数据库连接）、ctx（上下文）、payload（参数）、resource_scope（作用域）、
           approval_payload（审批负载，仅 commit action 使用）
- 返回：执行结果字典或 AgentActionResponse（用于返回审批请求）

示例:
    async def _handle_task_list(
        conn: Any,
        *,
        ctx: AgentContext,
        payload: dict[str, Any],
        resource_scope: str,
        approval_payload: dict[str, Any] | None
    ) -> dict[str, Any]:
        return await list_tasks_action(conn, user_id=ctx.user_id, payload=payload)
"""


@dataclass(frozen=True)
class ActionDefinition:
    """
    Action 定义。

    描述一个可执行的 Action，包括其标识符、权限策略映射和处理函数。

    Attributes:
        action_id: Action 唯一标识符（如 "task.list"、"task.delete.commit"）。
        policy_action_id: 对应的策略规则 ID，用于权限校验。
            有些 Action 可能共用同一个策略（如 prepare 和 commit）。
        handler: Action 处理函数，执行实际的业务逻辑。
    示例 - 普通操作:
        ActionDefinition(
            action_id="task.list",
            policy_action_id="task.list",
            handler=_handle_task_list,
        )

    """
    action_id: str
    policy_action_id: str
    handler: ActionHandler
