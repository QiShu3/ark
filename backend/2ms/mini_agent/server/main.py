"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from mini_agent.server.database import close_db, init_db
from mini_agent.server.routers import auth, mcp_servers, pages, profiles, sessions, skills


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db(app)
    try:
        yield
    finally:
        await close_db(app)


app = FastAPI(
    lifespan=lifespan,
    title="Mini Agent API",
    description="Multi-user Web Service for Mini Agent",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profiles.router, prefix="/api")
app.include_router(mcp_servers.router, prefix="/api")
app.include_router(skills.router, prefix="/api")
app.include_router(pages.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")

web_dir = Path(__file__).parent / "web"


def _asset_version(path: Path) -> str:
    """Return a stable cache-busting token for a static asset."""
    try:
        return str(int(path.stat().st_mtime))
    except FileNotFoundError:
        return "0"


if web_dir.exists():
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")

    @app.get("/web", response_class=HTMLResponse)
    async def serve_web():
        index_path = web_dir / "index.html"
        if index_path.exists():
            html = index_path.read_text(encoding="utf-8")
            app_js = f"/static/app.js?v={_asset_version(web_dir / 'app.js')}"
            styles_css = f"/static/styles.css?v={_asset_version(web_dir / 'styles.css')}"
            html = html.replace("/static/app.js", app_js)
            html = html.replace("/static/styles.css", styles_css)
            return html
        return "<h1>Web interface not found</h1>"
@app.get("/")
async def root():
    return {"message": "Mini Agent API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
