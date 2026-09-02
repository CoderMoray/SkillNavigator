import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface RegistrationEmailPayload {
  to: string;
  username: string;
  verifyUrl: string;
  mailType?: "verify" | "verify_resend" | "password_reset";
  mailKind?: "register" | "resend";
}

export interface PasswordResetEmailPayload {
  to: string;
  username: string;
  resetUrl: string;
  mailType: "password_reset";
}

export function isRegistrationEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.REPORT_MAIL_USERNAME?.trim() &&
      env.REPORT_MAIL_PASSWORD?.trim() &&
      env.REPORT_MAIL_SMTP_SERVER?.trim() &&
      env.REPORT_MAIL_SMTP_PORT?.trim()
  );
}

export function getRegistrationVerifyExpiresMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REGISTRATION_VERIFY_EXPIRES_MS?.trim();
  const ms = raw ? Number(raw) : 86_400_000;
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`REGISTRATION_VERIFY_EXPIRES_MS must be a positive number, got "${raw ?? ""}"`);
  }
  return Math.floor(ms);
}

export function getPasswordResetExpiresMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PASSWORD_RESET_EXPIRES_MS?.trim();
  const ms = raw ? Number(raw) : 3_600_000;
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`PASSWORD_RESET_EXPIRES_MS must be a positive number, got "${raw ?? ""}"`);
  }
  return Math.floor(ms);
}

export function getWebPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.WEB_PUBLIC_URL?.trim() || env.NEXT_PUBLIC_WEB_URL?.trim() || "http://127.0.0.1:3001";
  return value.replace(/\/+$/, "");
}

function resolveRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.INIT_CWD?.trim()) {
    return path.resolve(env.INIT_CWD);
  }
  return process.cwd();
}

function resolveSendScriptPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.REGISTRATION_EMAIL_SCRIPT?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(resolveRepoRoot(env), configured);
  }
  return path.join(resolveRepoRoot(env), "scripts", "send-registration-email.py");
}

function resolvePythonCommands(env: NodeJS.ProcessEnv = process.env): Array<{ command: string; prefixArgs: string[] }> {
  const configured = env.REGISTRATION_EMAIL_PYTHON?.trim() || env.REPORT_MAIL_PYTHON?.trim();
  if (configured) {
    return [{ command: configured, prefixArgs: [] }];
  }
  if (process.platform === "win32") {
    return [
      { command: "python", prefixArgs: [] },
      { command: "py", prefixArgs: ["-3"] }
    ];
  }
  return [
    { command: "python3", prefixArgs: [] },
    { command: "python", prefixArgs: [] }
  ];
}

function isCommandNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function parseScriptJsonOutput(stdout: string): { ok?: boolean; error?: string } {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line?.startsWith("{")) {
      return JSON.parse(line) as { ok?: boolean; error?: string };
    }
  }
  throw new Error("registration_email_send_failed");
}

export async function sendRegistrationVerificationEmail(
  payload: RegistrationEmailPayload,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await sendAuthEmail(payload, env);
}

export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await sendAuthEmail(payload, env);
}

async function sendAuthEmail(
  payload: RegistrationEmailPayload | PasswordResetEmailPayload,
  env: NodeJS.ProcessEnv
): Promise<void> {
  if (!isRegistrationEmailConfigured(env)) {
    throw new Error("registration_email_not_configured");
  }

  const scriptPath = resolveSendScriptPath(env);
  if (!existsSync(scriptPath)) {
    throw new Error(`registration_email_script_not_found: ${scriptPath}`);
  }

  const pythonCommands = resolvePythonCommands(env);
  let lastCommandError: unknown;

  for (const candidate of pythonCommands) {
    try {
      await runPythonMailScript(candidate.command, candidate.prefixArgs, scriptPath, payload, env);
      return;
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
        `No Python runtime was found for auth email delivery. Set REGISTRATION_EMAIL_PYTHON=python in .env. (${lastCommandError.message})`
      )
    : new Error("No Python runtime was found for auth email delivery.");
}

function runPythonMailScript(
  command: string,
  prefixArgs: string[],
  scriptPath: string,
  payload: RegistrationEmailPayload | PasswordResetEmailPayload,
  env: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefixArgs, scriptPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
        return;
      }

      try {
        const parsed = parseScriptJsonOutput(stdout);
        if (parsed.ok === true) {
          resolve();
          return;
        }
        reject(new Error(parsed.error ?? "registration_email_send_failed"));
      } catch {
        reject(new Error(stderr.trim() || stdout.trim() || "registration_email_send_failed"));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
