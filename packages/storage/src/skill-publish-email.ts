import { existsSync } from "node:fs";
import path from "node:path";
import type { AuthStore, PublicUser } from "./auth.js";
import { getWebPublicUrl, isRegistrationEmailConfigured } from "./registration-email.js";
import { runPythonMailScript } from "./run-python-mail-script.js";
import type { RegistrySkill } from "./types.js";

export type SkillPublishEmailOutcome = "published" | "interrupted" | "rejected";

export interface SkillPublishEmailPayload {
  to: string[];
  cc: string[];
  recipientName: string;
  outcome: SkillPublishEmailOutcome;
  skillName: string;
  slug: string;
  version: string;
  detailUrl: string;
  failureMessage?: string;
  publiclyListed: boolean;
}

export interface SkillPublishEmailRecipients {
  to: string[];
  recipientNames: string[];
  adminCc: string[];
}

export interface SendSkillPublishEmailOptions {
  authStore: AuthStore;
  skill: RegistrySkill;
  version: string;
  outcome: SkillPublishEmailOutcome;
  failureMessage?: string;
  publiclyListed: boolean;
  env?: NodeJS.ProcessEnv;
}

export type SendSkillPublishEmailResult =
  | { sent: true; recipients: SkillPublishEmailRecipients }
  | { sent: false; reason: "not_configured" | "no_recipients" };

function isDisabled(value: string | undefined): boolean {
  return ["false", "0", "no", "off"].includes(value?.trim().toLowerCase() ?? "");
}

/**
 * Publish notifications reuse REPORT_MAIL_* SMTP settings. They are opt-out so
 * deployments that already configured MailManager receive notifications without
 * another required setting.
 */
export function isSkillPublishEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isDisabled(env.SKILL_PUBLISH_EMAIL_NOTIFICATIONS_ENABLED) && isRegistrationEmailConfigured(env);
}

function resolveRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.INIT_CWD?.trim()) {
    return path.resolve(env.INIT_CWD);
  }
  return process.cwd();
}

function resolveSendScriptPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SKILL_PUBLISH_EMAIL_SCRIPT?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(resolveRepoRoot(env), configured);
  }
  return path.join(resolveRepoRoot(env), "scripts", "send-skill-publish-email.py");
}

function resolvePythonCommands(env: NodeJS.ProcessEnv = process.env): Array<{ command: string; prefixArgs: string[] }> {
  const configured =
    env.SKILL_PUBLISH_EMAIL_PYTHON?.trim() ||
    env.REGISTRATION_EMAIL_PYTHON?.trim() ||
    env.REPORT_MAIL_PYTHON?.trim();
  if (configured) {
    return [{ command: configured, prefixArgs: [] }];
  }
  if (process.platform === "win32") {
    return [
      { command: "python", prefixArgs: [] },
      { command: "py", prefixArgs: ["-3"] },
    ];
  }
  return [
    { command: "python3", prefixArgs: [] },
    { command: "python", prefixArgs: [] },
  ];
}

function isCommandNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function normalizeEmail(value: string | null | undefined): string | undefined {
  const email = value?.trim();
  return email ? email : undefined;
}

function uniqueEmails(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    const email = normalizeEmail(value);
    const key = email?.toLowerCase();
    if (!email || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function uniqueRecipientNames(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = value?.trim();
    const key = name?.toLowerCase();
    if (!name || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

function getRecipientName(user: PublicUser): string {
  return user.displayName?.trim() || user.username;
}

function userMatchesSkillMember(
  user: PublicUser,
  skill: Pick<RegistrySkill, "ownerUserId" | "contributors">
): boolean {
  if (skill.ownerUserId === user.id) {
    return true;
  }
  return skill.contributors.some(
    (contributor) =>
      contributor.userId === user.id ||
      (contributor.username?.trim().toLowerCase() === user.username.trim().toLowerCase()) ||
      (contributor.name.trim().toLowerCase() === user.username.trim().toLowerCase())
  );
}

export async function resolveSkillPublishEmailRecipients(
  skill: Pick<RegistrySkill, "ownerUserId" | "contributors">,
  authStore: AuthStore
): Promise<SkillPublishEmailRecipients> {
  const users = await authStore.listUsers();
  const directRecipients = users
    .filter((user) => userMatchesSkillMember(user, skill))
    .filter((user) => normalizeEmail(user.email) !== undefined);
  const to = uniqueEmails(
    directRecipients.map((user) => user.email)
  );
  const recipientNames = uniqueRecipientNames(directRecipients.map(getRecipientName));
  const directRecipientKeys = new Set(to.map((email) => email.toLowerCase()));
  const adminCc = uniqueEmails(
    users
      .filter((user) => user.role === "admin")
      .map((user) => user.email)
  ).filter((email) => !directRecipientKeys.has(email.toLowerCase()));

  return { to, recipientNames, adminCc };
}

export function getSkillPublishDetailUrl(slug: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${getWebPublicUrl(env)}/skills/${encodeURIComponent(slug)}`;
}

export function buildSkillPublishEmailPayload(
  options: Omit<SkillPublishEmailPayload, "cc" | "detailUrl"> & {
    adminCc: string[];
    env?: NodeJS.ProcessEnv;
  }
): SkillPublishEmailPayload {
  return {
    to: uniqueEmails(options.to),
    cc: options.outcome === "published" ? uniqueEmails(options.adminCc) : [],
    recipientName: options.recipientName.trim(),
    outcome: options.outcome,
    skillName: options.skillName,
    slug: options.slug,
    version: options.version,
    detailUrl: getSkillPublishDetailUrl(options.slug, options.env),
    failureMessage: options.failureMessage,
    publiclyListed: options.publiclyListed,
  };
}

export async function sendSkillPublishEmail(
  options: SendSkillPublishEmailOptions
): Promise<SendSkillPublishEmailResult> {
  const env = options.env ?? process.env;
  if (!isSkillPublishEmailConfigured(env)) {
    return { sent: false, reason: "not_configured" };
  }

  const recipients = await resolveSkillPublishEmailRecipients(options.skill, options.authStore);
  if (recipients.to.length === 0) {
    return { sent: false, reason: "no_recipients" };
  }

  const version = options.skill.versions[options.version];
  const payload = buildSkillPublishEmailPayload({
    to: recipients.to,
    adminCc: recipients.adminCc,
    recipientName: recipients.recipientNames.join("、"),
    outcome: options.outcome,
    skillName: options.skill.name,
    slug: options.skill.slug,
    version: options.version,
    failureMessage: options.failureMessage,
    publiclyListed: options.publiclyListed,
    env,
  });

  // A missing version is a caller bug, but preserve an actionable subject in
  // the email rather than silently dropping a terminal publish outcome.
  if (!version) {
    throw new Error(`skill_publish_email_version_not_found: ${options.skill.slug}@${options.version}`);
  }

  const scriptPath = resolveSendScriptPath(env);
  if (!existsSync(scriptPath)) {
    throw new Error(`skill_publish_email_script_not_found: ${scriptPath}`);
  }

  let lastCommandError: unknown;
  for (const candidate of resolvePythonCommands(env)) {
    try {
      await runPythonMailScript(
        candidate.command,
        candidate.prefixArgs,
        scriptPath,
        payload,
        env,
        "skill_publish_email_send_failed"
      );
      return { sent: true, recipients };
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastCommandError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastCommandError instanceof Error
    ? new Error(
        `No Python runtime was found for skill publish email delivery. Set SKILL_PUBLISH_EMAIL_PYTHON=python in .env. (${lastCommandError.message})`
      )
    : new Error("No Python runtime was found for skill publish email delivery.");
}
