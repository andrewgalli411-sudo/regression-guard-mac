"""Artifact + test-case-cache persistence.

Atomic writes so a crash never leaves a half-written JSON file. ``evaluations``
are keyed by ``case_id`` and appended incrementally, so a resumed run skips the
cases already recorded.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

from .models import RunArtifact, TestCase, ToolRecord


def tool_set_hash(tools: list[ToolRecord]) -> str:
    """Stable content hash of the tool set, used as the test-case cache key.

    Normalizes on (name, description, input_schema) sorted by name so cosmetic
    reordering by a server doesn't invalidate the cache, but any change to a
    tool's contract does.
    """
    normalized = sorted(
        (
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.input_schema or {},
            }
            for t in tools
        ),
        key=lambda d: d["name"],
    )
    blob = json.dumps(normalized, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def save_artifact(artifact: RunArtifact, path: Path) -> None:
    _atomic_write(path, artifact.model_dump_json(indent=2))


def load_artifact(path: Path) -> RunArtifact:
    return RunArtifact.model_validate_json(path.read_text(encoding="utf-8"))


def evaluated_case_ids(artifact: RunArtifact) -> set[str]:
    """Case ids that already have a successful (non-errored) evaluation."""
    return {e.case_id for e in artifact.evaluations if e.error is None}


# --- test-case cache (keyed by tool-set hash) ---------------------------------


def cache_path(cache_dir: Path, hash_: str) -> Path:
    return cache_dir / f"{hash_}.json"


def load_cached_cases(cache_dir: Path, hash_: str) -> list[TestCase] | None:
    p = cache_path(cache_dir, hash_)
    if not p.exists():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        return [TestCase.model_validate(c) for c in raw]
    except (json.JSONDecodeError, ValueError):
        return None  # corrupt cache => regenerate


def save_cached_cases(cache_dir: Path, hash_: str, cases: list[TestCase]) -> None:
    payload = json.dumps([c.model_dump() for c in cases], indent=2, ensure_ascii=False)
    _atomic_write(cache_path(cache_dir, hash_), payload)
