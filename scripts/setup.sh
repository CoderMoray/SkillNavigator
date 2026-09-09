#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://127.0.0.1:3000}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load dotenv (root) so ON_DEV / ADMIN_* / REPORT_MAIL_* are available.
# Same resolution as packages/storage/src/env.ts loadDotEnvIfPresent():
#   1. $DOTENV_FILE exactly (absolute, or relative to the repo root)
#   2. otherwise .env, falling back to .env.rapid
# Values already exported (e.g. by CI or an explicit ON_DEV=false) take
# precedence over file entries, so set -a + source would be wrong here.
# Note: this bash loader handles plain KEY=VALUE lines only (no quoted
# values / export prefixes) — the Node helper is the reference implementation.
DOTENV_TARGET=""
if [ -n "${DOTENV_FILE:-}" ]; then
  if [ -f "$DOTENV_FILE" ]; then
    DOTENV_TARGET="$DOTENV_FILE"
  elif [ -f "$REPO_ROOT/$DOTENV_FILE" ]; then
    DOTENV_TARGET="$REPO_ROOT/$DOTENV_FILE"
  fi
elif [ -f "$REPO_ROOT/.env" ]; then
  DOTENV_TARGET="$REPO_ROOT/.env"
elif [ -f "$REPO_ROOT/.env.rapid" ]; then
  DOTENV_TARGET="$REPO_ROOT/.env.rapid"
fi

if [ -n "$DOTENV_TARGET" ]; then
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
  done < "$DOTENV_TARGET"
  set +a
fi
unset DOTENV_TARGET

ON_DEV="${ON_DEV:-true}"

echo "=== Skill Platform Setup (ON_DEV=$ON_DEV) ==="

# 0. Review provider preflight (SkillSpector / HaluCatch python+imports, VT key).
#    SkillSpector & HaluCatch are vendored source trees, imported via sys.path
#    injection at review time — this step is fully offline (no PyPI/GitHub).
#    If the preflight reports a gap, install locally: `npm run setup:skillspector`.
#    Production (ON_DEV=false) fails fast; dev warns unless REVIEW_DEPS_STRICT=true.
echo "[0] Verifying review providers..."
if node_modules/.bin/tsx "$REPO_ROOT/scripts/verify-review-deps.mjs"; then
  echo "  ✅ Review providers ready"
else
  if [ "$ON_DEV" = "true" ] && [ "${REVIEW_DEPS_STRICT:-false}" != "true" ]; then
    echo "  ⚠️  Review providers are not fully ready — dev mode continues."
    echo "      Fix or disable providers before publishing (npm run verify:review-deps)."
  else
    echo "  ❌ Review providers are required here (ON_DEV=false or REVIEW_DEPS_STRICT=true). Aborting."
    exit 1
  fi
fi

# ------------------------------------------------------------------ #
# Skill seeding — both paths talk to PostgreSQL directly through the #
# bootstrap helper (no API / CLI / login required):                  #
#   ADMIN_* configured         -> admin owns skillnav-skill          #
#   no ADMIN_* & ON_DEV=true   -> nothing is initialized (dev)       #
#   no ADMIN_* & ON_DEV=false  -> alice owns demo-skill (demo boot)  #
# Seed reviews run offline: SkillSpector / VirusTotal are disabled   #
# inside the helper; HaluCatch runs from the vendored source.        #
# ------------------------------------------------------------------ #
ADMIN_USERNAME="${ADMIN_USERNAME:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-}"

has_admin_config() {
  [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_EMAIL" ] || [ -n "$ADMIN_DISPLAY_NAME" ]
}

BOOTSTRAP_OUT="$REPO_ROOT/.setup-bootstrap.json"
run_bootstrap() {
  node_modules/.bin/tsx "$REPO_ROOT/scripts/bootstrap-admin.mjs" "$@" > "$BOOTSTRAP_OUT" 2>/tmp/bootstrap-admin.err
}

if has_admin_config; then
  MISSING_FIELDS=()
  [ -n "$ADMIN_DISPLAY_NAME" ] || MISSING_FIELDS+=("ADMIN_DISPLAY_NAME")
  [ -n "$ADMIN_USERNAME" ] || MISSING_FIELDS+=("ADMIN_USERNAME")
  [ -n "$ADMIN_EMAIL" ] || MISSING_FIELDS+=("ADMIN_EMAIL")
  if [ "${#MISSING_FIELDS[@]}" -gt 0 ]; then
    echo "⚠️  WARNING: ADMIN_* configuration is incomplete."
    echo "    Missing field(s): ${MISSING_FIELDS[*]}"
    echo "    Provide every field in the dotenv file (.env / DOTENV_FILE) or remove all ADMIN_* entries to skip initialization."
    echo "    Nothing was created and no Skill was published."
    exit 0
  fi

  echo "[1] ADMIN_* configured — ensuring administrator '$ADMIN_USERNAME' owns skillnav-skill..."
  export ADMIN_USERNAME ADMIN_EMAIL ADMIN_DISPLAY_NAME
  if ! run_bootstrap; then
    echo "  ❌ Admin bootstrap helper failed:"
    cat /tmp/bootstrap-admin.err
    rm -f "$BOOTSTRAP_OUT" /tmp/bootstrap-admin.err
    exit 1
  fi
  rm -f /tmp/bootstrap-admin.err

  ACTION=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.action||'')")
  MESSAGE=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.message||'')")
  echo "  bootstrap action: ${ACTION:-unknown}"

  if [ -n "$MESSAGE" ]; then
    echo "  ℹ️  $MESSAGE"
  fi

  case "$ACTION" in
    created-linked)
      echo "  ✅ Administrator '$ADMIN_USERNAME' created (first user => admin) and skillnav-skill linked."
      ;;
    linked)
      echo "  ✅ skillnav-skill is now linked to administrator '$ADMIN_USERNAME'."
      ;;
    already-linked)
      echo "  ✅ Administrator '$ADMIN_USERNAME' already exists and owns skillnav-skill — nothing to do."
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
  exit 0
fi

if [ "$ON_DEV" = "true" ]; then
  echo "[1] Development mode without ADMIN_* — no Skill is initialized."
  echo "    To seed skillnav-skill for an administrator, set ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_DISPLAY_NAME"
  echo "    in the dotenv file (.env / DOTENV_FILE) and run npm run setup again."
  exit 0
fi

echo "[1] No ADMIN_* configured — seeding demo Skill under 'alice' (demo deployment)..."
if ! run_bootstrap --demo; then
  echo "  ❌ Demo bootstrap helper failed:"
  cat /tmp/bootstrap-admin.err
  rm -f "$BOOTSTRAP_OUT" /tmp/bootstrap-admin.err
  exit 1
fi
rm -f /tmp/bootstrap-admin.err

ACTION=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.action||'')")
MESSAGE=$(node -e "const d=require('$BOOTSTRAP_OUT'); process.stdout.write(d.message||'')")
echo "  bootstrap action: ${ACTION:-unknown}"

if [ -n "$MESSAGE" ]; then
  echo "  ℹ️  $MESSAGE"
fi

case "$ACTION" in
  demo-created-linked|demo-linked)
    echo "  ✅ demo-skill is published under 'alice'."
    ;;
  demo-already-linked)
    echo "  ✅ 'alice' already owns demo-skill — nothing to do."
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

echo "[2] Setup complete!"
echo "    Login: alice / password123 (Web: http://127.0.0.1:3001)"
rm -f "$BOOTSTRAP_OUT"
