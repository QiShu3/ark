"""Flash focus-work route entrypoint."""

from .repository import init_flash
from .routes import router

__all__ = ["init_flash", "router"]
