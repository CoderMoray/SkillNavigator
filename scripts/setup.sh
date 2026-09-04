#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://127.0.0.1:3000}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env (root) so ON_DEV / ADMIN_* / REPORT_MAIL_* are available.
# Values already exported (e.g. by CI or an explicit ON_DEV=false) take
# precedence over .env entries, so set -a + source would be wrong here.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  while IFS= read -r _line; do
    case "$_line" in
      \#*|'') continue ;;
      *=*)
        _key="${_line%%=*}"
        if [ -z "${!_key:-}" ]; then
          export "$_line"
        fi
        ;;
    esac
  done < "$REPO_ROOT/.env"
  set +a
fi

ON_DEV="${ON_DEV:-true}"

echo "=== Skill Platform Setup (ON_DEV=$ON_DEV) ==="

# 0. SkillSpector (PyPI or GitHub fallback) — used by the HTTP review
#    pipeline; harmless when absent (built-in rules still apply).
echo "[0] Installing SkillSpector..."
if bash "$(dirname "$0")/install-skillspector.sh"; then
  echo "  ✅ SkillSpector install step finished"
else
  echo "  ⚠️  SkillSpector install failed — security scans may fall back to built-in rules"
fi

if [ "$ON_DEV" = "true" ]; then
  # ------------------------------------------------------------------ #
  # Development: publish the demo Skill as the seeded alice account.   #
  # Requires the API to be running (registration + publish go over HTTP).#
  # ------------------------------------------------------------------ #
  USERNAME="alice"
  EMAIL="alice@example.com"
  PASSWORD="password123"
  SKILL_PATH="examples/demo-skill"

  echo "[1/6] Checking API..."
  if ! curl -sf "$API/health" > /dev/null; then
    echo "  ❌ API not running at $API — start it first: npm run dev:api"
    exit 1
  fi
  echo "  ✅ API running"

  echo "[2/6] Registering user '$USERNAME'..."
  # Note: no -f here — on 4xx (e.g. duplicate user) curl would drop the JSON
  # body and we could not detect the error to fall back to login below.
  RESP=$(curl -s -X POST "$API/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"email\":\"$EMAIL\"}") || true

  if echo "$RESP" | grep -q '"error"'; then
    echo "  ⚠️  Registration failed (maybe user exists), trying login..."
    RESP=$(curl -s -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
  fi

  TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then
    echo "  ❌ Could not get token"
    exit 1
  fi
  echo "  ✅ Token obtained"

  echo "[3/6] Publishing demo skill..."
  export SKILL_AUTH_TOKEN="$TOKEN"
  npm run skill -- publish "$SKILL_PATH" 2>&1 | grep -E "Published|Verdict|Scores" || echo "  ⚠️  Publish reported no summary (skill may already exist)"
  echo "  ✅ Published (or already present)"

  echo "[4/6] Verifying search..."
  RESULT=$(curl -sf "$API/skills?query=demo" | cat)
  if echo "$RESULT" | grep -q '"name"'; then
    COUNT=$(echo "$RESULT" | grep -o '"name"' | wc -l | tr -d ' ')
    echo "  ✅ Found $COUNT skill(s)"
  else
    echo "  ⚠️  No skills found in search"
  fi

  echo "[6/6] Setup complete!"
  echo ""
  echo "Open $API (Web: http://127.0.0.1:3001) to see the skill in the UI"
  echo "Login: $USERNAME / $PASSWORD"
  exit 0
fi

# ------------------------------------------------------------------ #
# Production (ON_DEV=false): ensure the configured administrator owns  #
# the official skillnav-skill. Talks to PostgreSQL directly through the#
# bootstrap helper — no API / CLI / login required, and it never       #
# rebuilds an existing account or clears data.                         #
# ------------------------------------------------------------------ #
ADMIN_USERNAME="${ADMIN_USERNAME:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-}"

has_admin_config() {
  [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_EMAIL" ] || [ -n "$ADMIN_DISPLAY_NAME" ]
}

if ! has_admin_config; then
  echo "[1] Production: no ADMIN_DISPLAY_NAME / ADMIN_USERNAME / ADMIN_EMAIL configured."
  echo "    Skipping administrator bootstrap — the skill registry stays empty (no seed Skill)."
  echo "    To initialize, set the three ADMIN_* vars in .env and run npm run setup again."
  exit 0
fi

MISSING_FIELDS=()
[ -n "$ADMIN_DISPLAY_NAME" ] || MISSING_FIELDS+=("ADMIN_DISPLAY_NAME")
[ -n "$ADMIN_USERNAME" ] || MISSING_FIELDS+=("ADMIN_USERNAME")
[ -n "$ADMIN_EMAIL" ] || MISSING_FIELDS+=("ADMIN_EMAIL")

if [ "${#MISSING_FIELDS[@]}" -gt 0 ]; then
  echo "⚠️  WARNING: ADMIN_* configuration is incomplete."
  echo "    Missing field(s): ${MISSING_FIELDS[*]}"
  echo "    Provide every field in .env or remove all ADMIN_* entries to skip initialization."
  echo "    Nothing was created and no Skill was published."
  exit 0
fi

echo "[1] Production: ADMIN_* configured — ensuring administrator '$ADMIN_USERNAME' owns skillnav-skill..."
export ADMIN_USERNAME ADMIN_EMAIL ADMIN_DISPLAY_NAME

BOOTSTRAP_OUT="$REPO_ROOT/.setup-bootstrap.json"
if ! node_modules/.bin/tsx "$REPO_ROOT/scripts/bootstrap-admin.mjs" > "$BOOTSTRAP_OUT" 2>/tmp/bootstrap-admin.err; then
  echo "  ❌ Admin bootstrap helper failed:"
  cat /tmp/bootstrap-admin.err
  rm -f "$BOOTSTRAP_OUT" /tmp/bootstrap-admin.err
  exit 1
fi
rm -f /tmp/bootstrap-admin.err

ACTION=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.action||'')")
MESSAGE=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.message||'')")
echo "  bootstrap action: ${ACTION:-unknown}"

case "$ACTION" in
  created-linked)
    echo "  ✅ Administrator '$ADMIN_USERNAME' created (first user => admin) and skillnav-skill linked."
    ;;
  linked)
    echo "  ✅ Administrator '$ADMIN_USERNAME' already existed (reused as-is) and skillnav-skill linked."
    ;;
  already-linked)
    echo "  ✅ Administrator '$ADMIN_USERNAME' already exists and owns skillnav-skill — nothing to do."
    rm -f "$BOOTSTRAP_OUT"
    exit 0
    ;;
  owner-conflict)
    echo "⚠️  WARNING: skillnav-skill exists in the registry but is owned by a different account."
    echo "    It was left untouched. Release it or delete it first, then re-run npm run setup."
    rm -f "$BOOTSTRAP_OUT"
    exit 0
    ;;
  error)
    echo "  ❌ $MESSAGE"
    rm -f "$BOOTSTRAP_OUT"
    exit 1
    ;;
  *)
    echo "  ❌ Unexpected bootstrap result: $MESSAGE"
    rm -f "$BOOTSTRAP_OUT"
    exit 1
    ;;
esac

# created-linked: email the generated initial password (degrade to log when
# SMTP is off). linked: no new credentials were issued, nothing to email.
if [ "$ACTION" = "created-linked" ]; then
  echo "[2] Sending administrator credentials email..."
  PASSWORD=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.password||'')")
  if [ -n "${REPORT_MAIL_USERNAME:-}" ] && [ -n "${REPORT_MAIL_PASSWORD:-}" ] && [ -n "${REPORT_MAIL_SMTP_SERVER:-}" ]; then
    PAYLOAD=$(printf '{"to":"%s","username":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_USERNAME" "$PASSWORD")
    if printf '%s' "$PAYLOAD" | python3 "$REPO_ROOT/scripts/send-admin-credentials-email.py"; then
      echo "  ✅ Credentials email queued to $ADMIN_EMAIL"
    else
      echo "  ⚠️  Credentials email failed (SMTP error) — see above."
    fi
  else
    echo "  ⚠️  WARNING: REPORT_MAIL_* is not configured — the initial password could not be emailed."
    echo "     Initial password (visible only in this run): $PASSWORD"
    echo "     Change it after first login in Account Settings."
  fi
fi

echo "[3] Setup complete!"
echo "    Administrator: $ADMIN_USERNAME <$ADMIN_EMAIL>"
echo "    Seeded Skill: skillnav-skill (slug) — install with: skillnav install skillnav-skill --dir <skills dir>"
rm -f "$BOOTSTRAP_OUT"
