"""Discovery and installation helpers for built-in and uploaded skills."""

from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from mini_agent.config import Config
from mini_agent.tools.skill_loader import SkillLoader


@dataclass(frozen=True)
class SkillSummary:
    name: str
    description: str
    source: str
    path: str


class SkillInstallError(ValueError):
    """Raised when an uploaded skill archive cannot be installed."""


def get_uploaded_skills_dir(*, create: bool = False) -> Path:
    """Return the runtime directory that stores uploaded skills."""
    install_dir = Config.get_app_state_dir(create=create) / "skills"
    if create:
        install_dir.mkdir(parents=True, exist_ok=True)
    return install_dir


def get_builtin_skill_dirs(skills_dir: str | Sequence[str] | None = None) -> list[Path]:
    """Resolve the built-in skill directories to scan."""
    if skills_dir is None:
        candidates: list[str] = ["./skills"]
    elif isinstance(skills_dir, (str, Path)):
        candidates = [str(skills_dir)]
    else:
        candidates = [str(item) for item in skills_dir]

    resolved: list[Path] = []
    for candidate in candidates:
        skill_path = Path(candidate).expanduser()
        search_paths = [
            skill_path,
            Path("mini_agent") / skill_path,
            Config.get_package_dir() / skill_path,
        ]
        for path in search_paths:
            if path.exists():
                candidate_path = path.resolve()
                if candidate_path not in resolved:
                    resolved.append(candidate_path)
                break
    return resolved


def _normalize_search_dirs(paths: Iterable[str | Path]) -> list[Path]:
    normalized: list[Path] = []
    for path in paths:
        resolved = Path(path).expanduser().resolve()
        if resolved not in normalized:
            normalized.append(resolved)
    return normalized


def build_skill_loader(
    *,
    builtin_dirs: Iterable[str | Path] | None = None,
    install_root: str | Path | None = None,
    allowed_skills: Sequence[str] | None = None,
) -> SkillLoader:
    """Build a loader over built-in and uploaded skill directories."""
    search_dirs = list(builtin_dirs or [])
    if install_root is not None:
        search_dirs.append(install_root)

    loader = SkillLoader(
        [str(path) for path in _normalize_search_dirs(search_dirs)],
        allowed_skills=list(allowed_skills) if allowed_skills is not None else None,
    )
    loader.discover_skills()
    return loader


def list_available_skills(
    builtin_dirs: Iterable[str | Path] | None = None,
    *,
    install_root: str | Path | None = None,
    allowed_skills: Sequence[str] | None = None,
) -> list[SkillSummary]:
    """List all available skills across built-in and uploaded directories."""
    uploaded_root = Path(install_root).expanduser().resolve() if install_root is not None else None
    builtin_roots = _normalize_search_dirs(builtin_dirs or [])
    loader = build_skill_loader(
        builtin_dirs=builtin_roots,
        install_root=uploaded_root,
        allowed_skills=allowed_skills,
    )

    summaries: list[SkillSummary] = []
    for skill in loader.loaded_skills.values():
        skill_dir = skill.skill_path.parent.resolve() if skill.skill_path else None
        source = "builtin"
        if uploaded_root is not None and skill_dir is not None and skill_dir.is_relative_to(uploaded_root):
            source = "uploaded"
        summaries.append(
            SkillSummary(
                name=skill.name,
                description=skill.description,
                source=source,
                path=str(skill_dir or ""),
            )
        )
    return sorted(summaries, key=lambda item: item.name)


def _validate_archive_paths(archive: zipfile.ZipFile) -> str:
    names = [info.filename for info in archive.infolist() if info.filename]
    if not names:
        raise SkillInstallError("Empty ZIP archive.")

    top_levels: set[str] = set()
    for name in names:
        rel_path = PurePosixPath(name)
        if rel_path.is_absolute() or ".." in rel_path.parts:
            raise SkillInstallError("Archive contains unsafe paths.")
        if not rel_path.parts:
            continue
        top_levels.add(rel_path.parts[0])

    if len(top_levels) != 1:
        raise SkillInstallError("ZIP archive must contain exactly one top-level skill directory.")

    return next(iter(top_levels))


def install_skill_archive(
    archive_bytes: bytes,
    *,
    install_root: str | Path,
    builtin_dirs: Iterable[str | Path] | None = None,
) -> SkillSummary:
    """Install a skill archive into the runtime skill directory."""
    install_path = Path(install_root).expanduser().resolve()
    install_path.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            top_level_dir = _validate_archive_paths(archive)

            with tempfile.TemporaryDirectory() as temp_dir:
                archive.extractall(temp_dir)
                extracted_dir = Path(temp_dir) / top_level_dir
                if not extracted_dir.is_dir():
                    raise SkillInstallError("ZIP archive must contain a top-level skill directory.")

                skill_file = extracted_dir / "SKILL.md"
                if not skill_file.exists():
                    raise SkillInstallError("Uploaded skill is missing SKILL.md.")

                loader = SkillLoader(str(extracted_dir.parent))
                skill = loader.load_skill(skill_file)
                if skill is None:
                    raise SkillInstallError("Uploaded skill has an invalid SKILL.md file.")
                if skill.name != top_level_dir:
                    raise SkillInstallError("Skill directory name does not match SKILL.md frontmatter name.")

                existing_names = {item.name for item in list_available_skills(builtin_dirs, install_root=install_path)}
                if skill.name in existing_names:
                    raise SkillInstallError(f"Skill '{skill.name}' already exists.")

                target_dir = install_path / skill.name
                shutil.copytree(extracted_dir, target_dir)
                return SkillSummary(
                    name=skill.name,
                    description=skill.description,
                    source="uploaded",
                    path=str(target_dir),
                )
    except zipfile.BadZipFile as exc:
        raise SkillInstallError("Uploaded file is not a valid ZIP archive.") from exc
