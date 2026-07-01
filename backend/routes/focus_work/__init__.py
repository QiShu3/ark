"""Focus-work route namespace."""

from .choice import init_choice, router as choice_router
from .flash import init_flash, router as flash_router
from .input import init_input, router as input_router
from .unified import router as unified_router

__all__ = [
    "choice_router",
    "flash_router",
    "input_router",
    "unified_router",
    "init_choice",
    "init_flash",
    "init_input",
]
