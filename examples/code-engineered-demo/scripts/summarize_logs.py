#!/usr/bin/env python3
"""Summarize CSV application logs for the code-engineered-demo Skill."""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path


REQUIRED_COLUMNS = ("timestamp", "level", "message")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize CSV application logs.")
    parser.add_argument("--input", required=True, help="Path to the CSV log file.")
    parser.add_argument("--top", type=int, default=5, help="Number of top messages to show.")
    return parser.parse_args()


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("CSV file has no header row.")
        missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(missing)}")
        return [dict(row) for row in reader]


def summarize(rows: list[dict[str, str]], top_n: int) -> str:
    level_counts = Counter(row.get("level", "").strip().upper() or "UNKNOWN" for row in rows)
    message_counts = Counter(row.get("message", "").strip() for row in rows if row.get("message", "").strip())

    lines = [
        "## Log Summary",
        f"- Total rows: {len(rows)}",
        "- Levels: " + ", ".join(f"{level} {count}" for level, count in sorted(level_counts.items())),
        "",
        "## Top Messages",
    ]

    if not message_counts:
        lines.append("- No messages found.")
        return "\n".join(lines)

    for index, (message, count) in enumerate(message_counts.most_common(max(top_n, 1)), start=1):
        lines.append(f"{index}. [{count}] {message}")

    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    path = Path(args.input)
    if not path.is_file():
        raise SystemExit(f"Input file not found: {path}")

    rows = load_rows(path)
    print(summarize(rows, args.top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
