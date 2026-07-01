"""Choice focus-work route entrypoint."""

from .repository import init_choice
from .routes import router

__all__ = ["init_choice", "router"]
