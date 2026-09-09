---
slug: code-engineered-demo
name: Code Engineered Demo
description: Summarize structured application logs from a CSV file and return severity counts plus top recurring messages. Use when the user provides a local CSV log export and wants a quick reliability snapshot.
version: 0.1.0
categories:
  - Developer Tools
release-tags:
  - latest
author: skill-platform
license: MIT
tags:
  - logs
  - csv
  - analysis
supportedAgents:
  - cursor
allowed-tools:
  - Read
  - Shell
---

# Code Engineered Demo

This example Skill is intentionally **code-engineered**: it ships a Python helper under `scripts/` and sample CSV data so HaluCatch classifies it as `code-engineered` and the platform applies the code/engineering total-score weight profile.

## Workflow

1. Confirm the user supplied a local CSV log file path (columns: `timestamp`, `level`, `message`).
2. Run the bundled helper to aggregate counts by severity level and surface the top repeated messages.
3. Return a concise markdown summary the user can paste into an incident note.

## Helper script

Use the repository script instead of ad-hoc shell one-liners:

```bash
python scripts/summarize_logs.py --input path/to/logs.csv --top 5
```

The script reads only the provided CSV path, prints markdown to stdout, and exits non-zero when required columns are missing.

## Output format

```markdown
## Log Summary
- Total rows: N
- Levels: ERROR x, WARN y, INFO z

## Top Messages
1. [count] message text
2. ...
```

## Boundaries

- Do not fetch remote logs, call external APIs, or read files outside the user-provided CSV path.
- Do not modify the source CSV; analysis is read-only.
- If the CSV schema differs, stop and ask the user to map columns before running the helper.

## Acceptance criteria

- Output includes total row count and per-level counts.
- Output lists at least the top 3 recurring messages when duplicates exist.
- No network access and no writes to disk beyond stdout.
