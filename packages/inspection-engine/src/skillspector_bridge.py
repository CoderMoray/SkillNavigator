"""Machine-readable bridge for the vendored SkillSpector security scanner.

Runs static-only analysis (use_llm=False) against a materialized Skill snapshot
and returns risk score plus normalized findings on stdout as JSON.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import traceback
import types


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill-dir", required=True)
    parser.add_argument(
        "--skillspector-dir",
        default="",
        help="SkillSpector source checkout (with src/). Optional when skillspector is pip-installed.",
    )
    return parser.parse_args()


def _ensure_yara_stub() -> None:
    try:
        import yara  # noqa: F401
        return
    except ModuleNotFoundError:
        pass

    class YaraSyntaxError(Exception):
        pass

    class YaraError(Exception):
        pass

    class Rules:
        def match(self, data: bytes) -> list[object]:
            return []

    yara_mod = types.ModuleType("yara")
    yara_mod.SyntaxError = YaraSyntaxError
    yara_mod.Error = YaraError
    yara_mod.Rules = Rules
    yara_mod.compile = lambda *args, **kwargs: None
    sys.modules["yara"] = yara_mod


def _bootstrap_skillspector(skillspector_dir: str) -> None:
    _ensure_yara_stub()

    src_dir = os.path.join(skillspector_dir, "src") if skillspector_dir else ""
    if skillspector_dir and os.path.isdir(src_dir):
        if src_dir not in sys.path:
            sys.path.insert(0, src_dir)

        if "skillspector" not in sys.modules:
            package = types.ModuleType("skillspector")
            package.__path__ = [os.path.join(src_dir, "skillspector")]  # type: ignore[attr-defined]
            package.__version__ = _read_skillspector_version(skillspector_dir)
            sys.modules["skillspector"] = package
        return

    try:
        import skillspector.graph  # noqa: F401
    except ModuleNotFoundError as error:
        raise ValueError(
            "SkillSpector is not installed. Run `npm run setup` or "
            "`pip install skillspector` / clone https://github.com/nvidia/skillspector."
        ) from error


def _read_skillspector_version(skillspector_dir: str) -> str:
    pyproject_path = os.path.join(skillspector_dir, "pyproject.toml")
    if not os.path.isfile(pyproject_path):
        return "0.0.0"

    with open(pyproject_path, encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped.startswith("version ="):
                return stripped.split("=", 1)[1].strip().strip('"').strip("'")
    return "0.0.0"


def scan(skill_dir: str, skillspector_dir: str) -> dict:
    _bootstrap_skillspector(skillspector_dir)

    from skillspector.cleanup import cleanup_result
    from skillspector.graph import graph

    result = None
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = graph.invoke(
                {
                    "input_path": skill_dir,
                    "output_format": "json",
                    "use_llm": False,
                }
            )

        findings = result.get("filtered_findings") or result.get("findings") or []
        serialized_findings = [
            finding.to_dict() if hasattr(finding, "to_dict") else finding for finding in findings
        ]

        return {
            "ok": True,
            "riskScore": int(result.get("risk_score") or 0),
            "riskSeverity": str(result.get("risk_severity") or "LOW"),
            "recommendation": str(result.get("risk_recommendation") or "SAFE"),
            "scanMode": "static-only",
            "findings": serialized_findings,
        }
    finally:
        if result is not None:
            cleanup_result(result)


def main() -> None:
    args = parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        print(json.dumps(scan(args.skill_dir, args.skillspector_dir), ensure_ascii=False))
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                    "traceback": traceback.format_exc(limit=3),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
