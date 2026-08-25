"""Read local skill directories / zip files for upload."""

from __future__ import annotations

import base64
import io
import zipfile
from pathlib import Path


def resolve_user_path(value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def package_to_base64(path: Path) -> str:
    if not path.exists():
        raise ValueError(f"Path not found: {path}")
    if path.is_file() and path.suffix.lower() == ".zip":
        return base64.b64encode(path.read_bytes()).decode("ascii")
    if path.is_dir():
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for file_path in sorted(path.rglob("*")):
                if file_path.is_file():
                    arcname = file_path.relative_to(path).as_posix()
                    archive.write(file_path, arcname)
        return base64.b64encode(buffer.getvalue()).decode("ascii")
    raise ValueError(f"Expected a skill directory or .zip file: {path}")


def extract_zip_to_directory(data: bytes, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        archive.extractall(target)
