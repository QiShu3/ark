"""Tools module."""

from .base import Tool, ToolResult

__all__ = [
    "Tool",
    "ToolResult",
    "ReadTool",
    "WriteTool",
    "EditTool",
    "BashTool",
    "SessionNoteTool",
    "RecallNoteTool",
]


def __getattr__(name: str):
    if name == "ReadTool":
        from .file_tools import ReadTool

        return ReadTool
    if name == "WriteTool":
        from .file_tools import WriteTool

        return WriteTool
    if name == "EditTool":
        from .file_tools import EditTool

        return EditTool
    if name == "BashTool":
        from .bash_tool import BashTool

        return BashTool
    if name == "SessionNoteTool":
        from .note_tool import SessionNoteTool

        return SessionNoteTool
    if name == "RecallNoteTool":
        from .note_tool import RecallNoteTool

        return RecallNoteTool
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
