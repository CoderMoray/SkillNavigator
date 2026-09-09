/**
 * Bootstrap logic exported for unit tests (no shebang; no heavy store imports).
 */
import { randomBytes } from "node:crypto";

export const OFFICIAL_SLUG = "skillnav-skill";
/** Dev-mode seed Skill (setup.sh ON_DEV=true) that must not survive production bootstrap. */
export const DEMO_SLUG = "demo-skill";
/** Demo deployment account (fixed credentials, mirrors the historical dev seed). */
export const DEMO_USERNAME = "alice";
export const DEMO_EMAIL = "alice@example.com";
export const DEMO_PASSWORD = "password123";

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

/**
 * Run the bootstrap and return a report object (never writes to stdout).
 *
 * @param deps.authStore       AuthStore-like (getUserByUsername, listUsers,
 *                             register, login, updateProfile)
 * @param deps.registryStore   RegistryStore-like (getSkill, publishSnapshot)
 * @param deps.skillDir        official Skill directory (default repo example)
 * @param deps.readPackage     snapshot loader
 * @param deps.inspectSnapshot inspection function
 * @param opts.refresh         purge the official Skill first so it is
 *                             re-published with the current seed artifact
 *                             (cascades: bookmarks, ratings, issues, files)
 */
export async function runBootstrap(
  { authStore, registryStore, skillDir, readPackage, inspectSnapshot },
  { username, email, displayName, refresh = false } = {}
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
    createdPassword = generatePassword();
    const created = await authStore.register(username, createdPassword, email, {
      autoVerifyEmail: true,
    });
    if (created.role !== "admin") {
      await authStore.promoteToAdmin(created.id);
    }
    const session = await authStore.login(username, createdPassword);
    await authStore.updateProfile(session.token, { displayName });
    target = created;
  }

  const demoRemoved = await removeSkillPermanently(registryStore, DEMO_SLUG);

  // --refresh: force a re-publish so the current seed artifact (frozen
  // SkillSpector/VT results) replaces whatever report the Skill carried
  // before. Cascades away community data on the official Skill (bookmarks,
  // ratings, issues) — a maintainer action, never part of plain `npm run setup`.
  if (refresh) {
    await removeSkillPermanently(registryStore, OFFICIAL_SLUG);
  }

  const official = await registryStore.getSkill(OFFICIAL_SLUG);
  if (official && official.ownerUserId === target.id) {
    const details = [];
    if (demoRemoved) {
      details.push(`dev-seed ${DEMO_SLUG} residue was removed`);
    }
    return {
      action: "already-linked",
      username: target.username,
      email: target.email ?? email,
      displayName,
      cleanedDemo: demoRemoved,
      message:
        details.length > 0
          ? `Administrator already owns ${OFFICIAL_SLUG}; ${details.join(" and ")}.`
          : `Administrator account exists and already owns ${OFFICIAL_SLUG}; nothing to do.`,
    };
  }

  const reassigned = official !== undefined;
  if (reassigned) {
    await removeSkillPermanently(registryStore, OFFICIAL_SLUG);
  }

  if (!readPackage || !inspectSnapshot) {
    throw new Error("readPackage and inspectSnapshot are required when publishing the official skill");
  }

  const snapshot = await readPackage(skillDir);
  const { inspection, evaluation } = await inspectSnapshot(snapshot);
  const version = await registryStore.publishSnapshot(snapshot, inspection, evaluation, {
    owner: { userId: target.id, username: target.username },
  });

  const details = [];
  if (reassigned) {
    details.push(`${OFFICIAL_SLUG} was owned by another account and has been re-assigned to this admin`);
  }
  if (demoRemoved) {
    details.push(`dev-seed ${DEMO_SLUG} residue was removed`);
  }

  const base = {
    username: target.username,
    email: target.email ?? email,
    displayName,
    version: version.version,
    cleanedDemo: demoRemoved,
    message: details.length > 0 ? `${details.join("; ")}.` : undefined,
  };
  return createdPassword
    ? { action: "created-linked", ...base, password: createdPassword }
    : { action: "linked", ...base };
}

/**
 * Demo seeding (setup.sh ON_DEV=false without ADMIN_*): make sure the shared
 * demo account owns the demo Skill — idempotently. The account is created
 * with fixed well-known credentials when missing; an existing 'alice' is
 * reused untouched (never resets passwords or profile).
 *
 * stdout actions: "demo-created-linked" | "demo-linked" | "demo-already-linked"
 */
export async function runDemoSeed(
  { authStore, registryStore, skillDir, readPackage, inspectSnapshot },
  { username = DEMO_USERNAME, email = DEMO_EMAIL, password = DEMO_PASSWORD } = {}
) {
  const existing = await authStore.getUserByUsername(username);
  let target;
  let created = false;
  if (!existing) {
    target = await authStore.register(username, password, email, {
      autoVerifyEmail: true,
    });
    created = true;
  } else {
    target = existing;
  }

  const demo = await registryStore.getSkill(DEMO_SLUG);
  if (demo && demo.ownerUserId === target.id) {
    return {
      action: "demo-already-linked",
      username,
      email: target.email ?? email,
      message: `Account '${username}' already owns ${DEMO_SLUG}; nothing to do.`,
    };
  }

  const reassigned = demo !== undefined;
  if (reassigned) {
    await removeSkillPermanently(registryStore, DEMO_SLUG);
  }

  if (!readPackage || !inspectSnapshot) {
    throw new Error("readPackage and inspectSnapshot are required when publishing the demo skill");
  }

  const snapshot = await readPackage(skillDir);
  const { inspection, evaluation } = await inspectSnapshot(snapshot);
  await registryStore.publishSnapshot(snapshot, inspection, evaluation, {
    owner: { userId: target.id, username: target.username },
  });

  const base = {
    username,
    email: target.email ?? email,
    message: reassigned
      ? `${DEMO_SLUG} was owned by another account and has been re-assigned to '${username}'.`
      : undefined,
  };
  return created ? { action: "demo-created-linked", ...base } : { action: "demo-linked", ...base };
}

async function removeSkillPermanently(registryStore, slug) {
  try {
    await registryStore.deleteSkill(slug);
  } catch {
    // Not present as an active Skill — fall through so recycle-bin residue is still purged.
  }
  try {
    await registryStore.purgeRecycleBinSkill(slug);
    return true;
  } catch {
    return false;
  }
}
