import importlib
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from lib.sub_app_registry import get_all
from routes.admin_routes import router as admin_router
from routes.app_registry_routes import router as app_registry_router
from routes.auth_routes import close_auth, init_auth
from routes.auth_routes import router as auth_router
from routes.chat_routes import router as chat_router
from routes.checkin_routes import init_checkin
from routes.checkin_routes import router as checkin_router
from routes.choice import init_choice
from routes.choice import router as choice_router
from routes.content_bank import init_content_bank
from routes.deliberate import init_deliberate
from routes.deliberate import router as deliberate_router
from routes.todo_routes import init_todo
from routes.todo_routes import router as todo_router
from routes.vocab import init_vocab
from routes.vocab import router as vocab_router

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    await init_auth(app)
    await init_checkin(app)
    await init_todo(app)
    await init_vocab(app)
    await init_choice(app)
    await init_content_bank(app)
    await init_deliberate(app)
    try:
        yield
    finally:
        await close_auth(app)


app = FastAPI(lifespan=_lifespan, title="Ark Backend", version="0.1.0")

# 确保本地静态上传目录存在并挂载
uploads_dir = Path(__file__).resolve().parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Admin panel static files
admin_dir = Path(__file__).resolve().parent / "web" / "admin"
if admin_dir.is_dir():
    app.mount("/admin", StaticFiles(directory=str(admin_dir), html=True), name="admin")

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
app.include_router(vocab_router)
app.include_router(app_registry_router)
app.include_router(admin_router)
app.include_router(deliberate_router)
app.include_router(choice_router)

# Auto-discover and register dynamic sub-app routers
for _decl in get_all():
    if _decl.id in ("vocab", "erc"):
        continue
    _py_id = _decl.id.replace("-", "_")
    try:
        _mod = importlib.import_module(f"routes.{_py_id}")
        app.include_router(_mod.router)
    except (ImportError, AttributeError):
        pass


@app.get("/health")
async def health() -> dict:
    """健康检查。"""
    return {"ok": True}
