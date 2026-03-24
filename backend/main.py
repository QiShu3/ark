from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.agent_routes import init_agent
from routes.agent_routes import router as agent_router
from routes.arxiv import close_arxiv, init_arxiv
from routes.arxiv import router as arxiv_router
from routes.auth_routes import close_auth, init_auth
from routes.auth_routes import router as auth_router
from routes.chat_routes import router as chat_router
from routes.checkin_routes import init_checkin
from routes.checkin_routes import router as checkin_router
from routes.todo_routes import init_todo
from routes.todo_routes import router as todo_router

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    await init_auth(app)
    await init_checkin(app)
    await init_todo(app)
    await init_arxiv(app)
    await init_agent(app)
    try:
        yield
    finally:
        await close_arxiv(app)
        await close_auth(app)


app = FastAPI(lifespan=_lifespan, title="Ark Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(checkin_router)
app.include_router(chat_router)
app.include_router(todo_router)
app.include_router(arxiv_router)
app.include_router(agent_router)


@app.get("/health")
async def health() -> dict:
    """健康检查。"""
    return {"ok": True}
