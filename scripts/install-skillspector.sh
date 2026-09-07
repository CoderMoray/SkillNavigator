#!/usr/bin/env bash
# Install SkillSpector **from the vendored source tree** into a local Python
# interpreter. There is no PyPI lookup and no git clone: the only network
# traffic possible is pip fetching SkillSpector's third-party dependencies
# (typer, rich, pydantic, openai, langgraph, ...) from the configured index
# (PIP_INDEX_URL or pip's default). In an offline environment, point
# PIP_INDEX_URL at an internal mirror or pre-install the dependencies.
#
# The "already ready" check uses the exact same mechanism as the review
# runtime (sys.path injection of the vendored tree), so "ready here" means
# "ready at review time" for this interpreter.
#
# Usage: npm run setup:skillspector   (or: bash scripts/install-skillspector.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLSPECTOR_DIR="${SKILLSPECTOR_DIR:-$ROOT/packages/SkillSpector-main}"
SRC_DIR="$SKILLSPECTOR_DIR/src"

if [ ! -d "$SRC_DIR/skillspector" ]; then
  echo "❌ Vendored SkillSpector source not found at $SRC_DIR/skillspector"
  echo "   Set SKILLSPECTOR_DIR to the vendored tree, or restore packages/SkillSpector-main."
  exit 1
fi

detect_python() {
  local candidates=()
  if [ -n "${SKILLSPECTOR_PYTHON:-}" ]; then
    candidates+=("$SKILLSPECTOR_PYTHON")
  fi
  if [ "${OS:-}" = "Windows_NT" ]; then
    candidates+=(python python3)
  else
    candidates+=(python3 python)
  fi

  local cmd
  for cmd in "${candidates[@]}"; do
    if command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd"
      return
    fi
  done

  echo "❌ No Python interpreter found. Install Python 3.12+ or set SKILLSPECTOR_PYTHON." >&2
  exit 1
}

# Ready check: sys.path-inject the vendored tree and import the package —
# identical to verify-review-deps.mjs and skillspector_bridge.py.
ready_check() {
  local py="$1"
  SKILLSPECTOR_READY_SRC="$SRC_DIR" "$py" -c '
import os, sys
sys.path.insert(0, os.environ["SKILLSPECTOR_READY_SRC"])
import skillspector.graph  # noqa: F401
' >/dev/null 2>&1
}

install_into() {
  local py="$1"
  echo "  Running: $py -m pip install --timeout 15 --retries 1 -e \"$SKILLSPECTOR_DIR\""
  if ! "$py" -m pip install --timeout 15 --retries 1 -e "$SKILLSPECTOR_DIR"; then
    echo "  ❌ pip install failed." >&2
    echo "     Common causes:" >&2
    echo "     • Externally managed Python (PEP 668, e.g. Homebrew): create a venv instead —" >&2
    echo "         $py -m venv \"$ROOT/.skillspector-venv\"" >&2
    echo "         \"$ROOT/.skillspector-venv/bin/pip\" install -e \"$SKILLSPECTOR_DIR\"" >&2
    echo "         export SKILLSPECTOR_PYTHON=\"$ROOT/.skillspector-venv/bin/python\"" >&2
    echo "     • Offline environment: set PIP_INDEX_URL to an internal mirror," >&2
    echo "       or pre-install SkillSpector's dependencies from local wheels." >&2
    return 1
  fi
}

main() {
  local py
  py="$(detect_python)"
  local py_version
  py_version="$("$py" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  echo "Using interpreter: $py (Python $py_version)"

  if ready_check "$py"; then
    echo "✅ SkillSpector already importable from the vendored source — nothing to install."
    exit 0
  fi

  echo "SkillSpector not importable yet — installing from the vendored source..."
  install_into "$py"

  if ready_check "$py"; then
    echo "✅ SkillSpector ready ($py, vendored at $SKILLSPECTOR_DIR)"
  else
    echo "❌ SkillSpector still not importable after install — see messages above." >&2
    exit 1
  fi
}

main "$@"
