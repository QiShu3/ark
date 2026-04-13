"""Tests for uploaded skill installation and discovery."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from mini_agent.tools.skill_loader import SkillLoader


def _make_skill_zip(
    *,
    folder_name: str = "demo-skill",
    skill_name: str = "demo-skill",
    description: str = "Demo skill",
    extra_files: dict[str, str] | None = None,
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            f"{folder_name}/SKILL.md",
            f"---\nname: {skill_name}\ndescription: {description}\n---\n\nUse this skill.\n",
        )
        for rel_path, content in (extra_files or {}).items():
            archive.writestr(f"{folder_name}/{rel_path}", content)
    return buffer.getvalue()


def _make_empty_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED):
        pass
    return buffer.getvalue()


def _write_skill(root: Path, name: str, description: str = "Skill description") -> None:
    skill_dir = root / name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n\n{name} content.\n",
        encoding="utf-8",
    )


def test_skill_loader_discovers_across_multiple_directories(tmp_path):
    builtin_root = tmp_path / "builtin"
    uploaded_root = tmp_path / "uploaded"
    _write_skill(builtin_root, "builtin-skill", "Built in")
    _write_skill(uploaded_root, "uploaded-skill", "Uploaded")

    loader = SkillLoader([str(builtin_root), str(uploaded_root)])
    skills = loader.discover_skills()

    assert {skill.name for skill in skills} == {"builtin-skill", "uploaded-skill"}


def test_skill_loader_can_filter_to_allowed_skills(tmp_path):
    builtin_root = tmp_path / "builtin"
    uploaded_root = tmp_path / "uploaded"
    _write_skill(builtin_root, "builtin-skill", "Built in")
    _write_skill(uploaded_root, "uploaded-skill", "Uploaded")

    loader = SkillLoader([str(builtin_root), str(uploaded_root)], allowed_skills=["uploaded-skill"])
    loader.discover_skills()

    assert loader.list_skills() == ["uploaded-skill"]
    assert loader.get_skill("builtin-skill") is None


def test_install_uploaded_skill_accepts_valid_zip(tmp_path):
    from mini_agent.server.skill_registry import install_skill_archive, list_available_skills

    install_root = tmp_path / "installed-skills"
    archive_bytes = _make_skill_zip(
        extra_files={"scripts/helper.py": "print('ok')\n"},
    )

    installed = install_skill_archive(archive_bytes, install_root=install_root)
    listed = list_available_skills([], install_root=install_root)

    assert installed.name == "demo-skill"
    assert installed.source == "uploaded"
    assert (install_root / "demo-skill" / "SKILL.md").exists()
    assert [item.name for item in listed] == ["demo-skill"]


@pytest.mark.parametrize(
    "archive_bytes,error_fragment",
    [
        (
            _make_empty_zip(),
            "empty zip archive",
        ),
        (
            _make_skill_zip(folder_name="wrong-dir", skill_name="demo-skill"),
            "does not match",
        ),
    ],
)
def test_install_uploaded_skill_rejects_invalid_archive(tmp_path, archive_bytes, error_fragment):
    from mini_agent.server.skill_registry import SkillInstallError, install_skill_archive

    with pytest.raises(SkillInstallError) as excinfo:
        install_skill_archive(archive_bytes, install_root=tmp_path / "installed-skills")

    assert error_fragment in str(excinfo.value).lower()
