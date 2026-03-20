import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from MCP.assistant_runner import (
    chat_with_tools as mcp_chat_with_tools,
)
from MCP.assistant_runner import (
    chat_with_tools_stream as mcp_chat_with_tools_stream,
)
from MCP.assistant_runner import (
    get_tools_overview as mcp_get_tools_overview,
)
from MCP.mcp_registry import MCPRegistry
from routes.arxiv_routes import close_arxiv, init_arxiv
from routes.arxiv_routes import router as arxiv_router
from routes.auth_routes import close_auth, init_auth
from routes.auth_routes import router as auth_router
from routes.todo_routes import init_todo
from routes.todo_routes import router as todo_router

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)
    scope: Literal["general", "daily"] = "general"


class ChatResponse(BaseModel):
    reply: str
    actions: list[dict[str, Any]] = Field(default_factory=list)


_mcp_registry = (
    MCPRegistry.from_env()
    if os.getenv("MCP_SERVERS", "").strip()
    else MCPRegistry.from_config_dir(Path(__file__).resolve().parent / "MCP")
)

_DEFAULT_SYSTEM_PROMPT = (
    "你是一个可以使用工具的 AI 助手。你无法直接访问外部系统，但你可以通过可用的 tools 来执行操作并获取结果。"
    "当用户要求查看/查询数据库、时间、文件等信息时，优先选择合适的 tool 调用；"
    "拿到 tool 结果后，再用简洁中文总结给用户。不要声称“无法访问”，除非确实没有任何可用工具。"
)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    await _mcp_registry.start()
    await init_auth(app)
    await init_todo(app)
    await init_arxiv(app)
    try:
        yield
    finally:
        await close_arxiv(app)
        await close_auth(app)
        await _mcp_registry.close()


app = FastAPI(lifespan=_lifespan, title="Ark Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(todo_router)
app.include_router(arxiv_router)


@app.get("/health")
async def health() -> dict:
    """健康检查。"""
    return {"ok": True}


@app.get("/api/tools")
async def list_available_tools() -> dict[str, Any]:
    return await mcp_get_tools_overview(_mcp_registry)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request) -> ChatResponse:
    """接收用户消息与历史对话，调用 DeepSeek 并返回回复。"""
    messages = [m.model_dump() for m in req.history]
    messages.insert(0, {"role": "system", "content": _DEFAULT_SYSTEM_PROMPT})
    messages.append({"role": "user", "content": req.message})
    reply, actions = await mcp_chat_with_tools(messages, request, _mcp_registry, scope=req.scope)
    if not reply:
        raise HTTPException(status_code=502, detail="DeepSeek 返回空回复")
    return ChatResponse(reply=reply, actions=actions)


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """流式聊天接口，通过 SSE 实时推送模型回复与工具调用进度。"""
    messages = [m.model_dump() for m in req.history]
    messages.insert(0, {"role": "system", "content": _DEFAULT_SYSTEM_PROMPT})
    messages.append({"role": "user", "content": req.message})

    async def event_generator():
        async for event in mcp_chat_with_tools_stream(messages, request, _mcp_registry, scope=req.scope):
            yield {"data": json.dumps(event, ensure_ascii=False)}

    return EventSourceResponse(event_generator())
