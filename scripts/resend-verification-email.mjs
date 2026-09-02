#!/usr/bin/env node
/**
 * Resend a registration verification email for an existing unverified user.
 * Usage: node scripts/resend-verification-email.mjs <username>
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAuthStoreFromEnv,
  getRegistrationVerifyExpiresMs,
  getWebPublicUrl,
  isRegistrationEmailConfigured,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadDotEnvIfPresent(path.join(repoRoot, ".env"));

const username = process.argv[2]?.trim();
if (!username) {
  console.error("Usage: node scripts/resend-verification-email.mjs <username>");
  process.exit(1);
}

if (!isRegistrationEmailConfigured()) {
  console.error("REPORT_MAIL_* is not configured.");
  process.exit(1);
}

const authStore = createAuthStoreFromEnv();

const user = await authStore.getUserByUsername(username);
if (!user) {
  console.error(`User not found: ${username}`);
  process.exit(1);
}

if (user.emailVerified) {
  console.error(`User ${username} is already verified (${user.email}).`);
  process.exit(1);
}

if (!user.email) {
  console.error(`User ${username} has no email on file.`);
  process.exit(1);
}

const expiresMs = getRegistrationVerifyExpiresMs();
const token = await authStore.createEmailVerificationToken(user.id, expiresMs);
const verifyUrl = `${getWebPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
const payload = JSON.stringify({
  to: user.email,
  username: user.username,
  verifyUrl,
  mailKind: "resend",
  mailType: "verify_resend",
});

const scriptPath = path.join(repoRoot, "scripts", "send-registration-email.py");
const child = spawn(process.env.REGISTRATION_EMAIL_PYTHON?.trim() || "python", [scriptPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) => {
    if (code !== 0) {
      reject(new Error(stderr.trim() || stdout.trim() || `python exited ${code}`));
      return;
    }
    resolve(undefined);
  });
  child.stdin.write(payload);
  child.stdin.end();
});

const parsed = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}");
if (parsed.ok !== true) {
  console.error(parsed.error ?? "registration_email_send_failed");
  process.exit(1);
}

console.log(`Verification email sent to ${user.email} for user ${user.username}.`);
