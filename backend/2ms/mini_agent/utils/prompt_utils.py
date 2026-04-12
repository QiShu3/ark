"""Prompt utilities for saving and managing system prompts."""

from pathlib import Path


def save_prompt_to_markdown(content: str, filename: str, caller_file: str = __file__) -> Path:
    """Save prompt content to a markdown file in the prompts directory.

    Args:
        content: The prompt content to save
        filename: The name of the markdown file (e.g., "system_prompt.md")
        caller_file: Path to the caller's file (defaults to this module)

    Returns:
        Path to the saved file
    """
    prompts_dir = Path(caller_file).parent / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    file_path = prompts_dir / filename
    file_path.write_text(content, encoding="utf-8")
    return file_path
