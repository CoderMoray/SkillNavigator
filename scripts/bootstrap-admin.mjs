#!/usr/bin/env node
/**
 * Production bootstrap helper (tsx): make sure the configured administrator
 * owns the official skillnav-skill in the registry — idempotently.
 *
 * CLI reads from the environment (setup.sh loads these from .env):
 *   ADMIN_USERNAME      — login username (required)
 *   ADMIN_EMAIL         — login email (required)
 *   ADMIN_DISPLAY_NAME  — display name (required, applied only on creation)
 *
 * Behaviour (never rebuilds or resets an existing account, never clears data):
 *   1. Resolve the account:
 *        - username already exists  -> reused as-is (password untouched)
 *        - missing & no admin yet   -> created (first user => admin, auto-verified,
 *          display name applied). A fresh strong password is generated here and
 *          returned in "password" so setup.sh can email it.
 *        - missing & admin exists   -> error (point ADMIN_* at the existing admin
 *          or remove ADMIN_* to skip).
 *   2. Link skillnav-skill to that account:
 *        - already owned by it      -> done, nothing to do
 *        - exists but owned by other-> conflict warning, left untouched
 *        - missing                  -> internal review + publish with owner set
 *          directly (no HTTP login needed).
 *
 * stdout is one JSON line consumed by scripts/setup.sh:
 *   {"action":"created-linked", password, username, email}
 *   {"action":"linked", ...} | {"action":"already-linked", ...}
 *   {"action":"owner-conflict", ...} | {"action":"error", code, message}
 *
 * The core logic is exported (runBootstrap) so it can be unit-tested with
 * injected store implementations.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillPackage } from "@skill-platform/skill-spec";
import { reviewSkillSnapshot } from "@skill-platform/review-engine";
import {
  createAuthStoreFromEnv,
  createRegistryStoreFromEnv,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const OFFICIAL_SKILL_DIR = path.join(repoRoot, "examples", "skillnav-skill");
export const OFFICIAL_SLUG = "skillnav-skill";

export function generatePassword() {
  const bytes = randomBytes(24);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export function parseAdminConfig(env) {
  const username = env.ADMIN_USERNAME?.trim();
  const email = env.ADMIN_EMAIL?.trim();
  const displayName = env.ADMIN_DISPLAY_NAME?.trim();
  if (!username || !email || !displayName) {
    return null;
  }
  return { username, email, displayName };
}

async function defaultReadPackage(skillDir) {
  return readSkillPackage(skillDir);
}

async function defaultReview(snapshot) {
  return reviewSkillSnapshot(snapshot);
}

/**
 * Run the bootstrap and return a report object (never writes to stdout).
 *
 * @param deps.authStore       AuthStore-like (getUserByUsername, listUsers,
 *                             register, login, updateProfile)
 * @param deps.registryStore   RegistryStore-like (getSkill, publishSnapshot)
 * @param deps.skillDir        official Skill directory (default repo example)
 * @param deps.readPackage     snapshot loader (default readSkillPackage)
 * @param deps.reviewSnapshot  review function (default reviewSkillSnapshot)
 */
export async function runBootstrap(
  { authStore, registryStore, skillDir = OFFICIAL_SKILL_DIR, readPackage = defaultReadPackage, reviewSnapshot = defaultReview },
  { username, email, displayName } = {}
) {
  const missing = [username, email, displayName].some((value) => !value?.trim());
  if (missing) {
    return {
      action: "error",
      code: "missing-input",
      message: "ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_DISPLAY_NAME must all be set.",
    };
  }

  const existing = await authStore.getUserByUsername(username);
  let target = existing;
  let createdPassword;

  if (!existing) {
    const users = await authStore.listUsers();
    const admins = users.filter((user) => user.role === "admin");
    if (admins.length > 0) {
      const names = admins.map((user) => user.username).join(", ");
      return {
        action: "error",
        code: "admin-exists",
        message: `An administrator already exists (${names}) but ADMIN_USERNAME "${username}" does not. Point ADMIN_* at the existing admin, or remove ADMIN_* to skip initialization.`,
      };
    }
    // Fresh registry: first user becomes admin. Auto-verify so the account can
    // log in even when verification is required in production.
    createdPassword = generatePassword();
    const created = await authStore.register(username, createdPassword, email, {
      autoVerifyEmail: true,
    });
    const session = await authStore.login(username, createdPassword);
    await authStore.updateProfile(session.token, { displayName });
    target = created;
  }

  const linkResult = await linkOfficialSkill(
    { registryStore, slug: OFFICIAL_SLUG, skillDir, readPackage, reviewSnapshot },
    target
  );
  const base = {
    username: target.username,
    email: target.email ?? email,
    displayName,
  };

  switch (linkResult.status) {
    case "already-linked":
      return {
        action: "already-linked",
        ...base,
        message: "Administrator account exists and already owns skillnav-skill; nothing to do.",
      };
    case "owner-conflict":
      return { action: "owner-conflict", ...base, message: linkResult.message };
    default:
      return createdPassword
        ? {
            action: "created-linked",
            ...base,
            password: createdPassword,
            version: linkResult.version,
          }
        : { action: "linked", ...base, version: linkResult.version };
  }
}

async function linkOfficialSkill({ registryStore, slug, skillDir, readPackage, reviewSnapshot }, target) {
  const skill = await registryStore.getSkill(slug);
  if (skill) {
    // publishSnapshot always records options.owner.userId as ownerUserId, so a
    // top-level match is the authoritative "owned by this account" signal.
    if (skill.ownerUserId === target.id) {
      return { status: "already-linked" };
    }
    return {
      status: "owner-conflict",
      message: `${slug} already exists in the registry but is owned by a different account; it was left untouched.`,
    };
  }

  const snapshot = await readPackage(skillDir);
  const review = await reviewSnapshot(snapshot);
  const version = await registryStore.publishSnapshot(snapshot, review, undefined, {
    owner: { userId: target.id, username: target.username },
  });
  return { status: "linked", version: version.version };
}

async function main() {
  loadDotEnvIfPresent(path.join(repoRoot, ".env"));

  // The seed review must run offline and deterministically.
  process.env.SKILLSPECTOR_ENABLED = "false";
  process.env.VIRUSTOTAL_ENABLED = "false";

  let authStore;
  let registryStore;
  try {
    authStore = createAuthStoreFromEnv();
    registryStore = createRegistryStoreFromEnv();
  } catch (error) {
    console.log(
      JSON.stringify({
        action: "error",
        code: "store-init",
        message: String(error instanceof Error ? error.message : error),
      })
    );
    return;
  }

  try {
    const admin = parseAdminConfig(process.env);
    const result = await runBootstrap({ authStore, registryStore }, admin ?? {});
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    console.log(
      JSON.stringify({
        action: "error",
        code: "bootstrap-failed",
        message: `Admin bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    );
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await main();
}
