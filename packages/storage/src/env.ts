import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import type { ArtifactStore, MinioArtifactStoreOptions, RegistryStore } from "./types";
import { MinioArtifactStore } from "./store/minio";
import { PostgresRegistryStore } from "./store/postgres";

const DEFAULT_API_BODY_LIMIT_MB = 50;

export function isOnDev(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ON_DEV?.trim().toLowerCase() === "true";
}

/**
 * Login error strictness. Strict mode (default) returns a unified
 * "Invalid username or password" so account existence is never disclosed;
 * lenient mode returns "Invalid username" / "Invalid password" separately,
 * which is useful for internal account migration debugging.
 */
export function isLoginErrorStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.LOGIN_ERROR_STRICT?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  return true;
}

export function isRegistrationEmailVerificationRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.REGISTRATION_EMAIL_VERIFICATION_REQUIRED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  return true;
}

/**
 * Whether public self-registration is allowed. Default true (current behavior).
 * Set PUBLIC_REGISTRATION_ENABLED=false to disable /auth/register for
 * environments that manage accounts via scripts/direct DB writes instead.
 */
export function isPublicRegistrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PUBLIC_REGISTRATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  return true;
}

const DEFAULT_REGISTRATION_UNVERIFIED_RETENTION_DAYS = 3;

export function getRegistrationUnverifiedRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REGISTRATION_UNVERIFIED_RETENTION_DAYS?.trim();
  const days = raw ? Number(raw) : DEFAULT_REGISTRATION_UNVERIFIED_RETENTION_DAYS;
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(
      `REGISTRATION_UNVERIFIED_RETENTION_DAYS must be a non-negative number, got "${raw ?? ""}"`
    );
  }
  return Math.floor(days);
}

export function getApiBodyLimitBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.API_BODY_LIMIT_MB ?? String(DEFAULT_API_BODY_LIMIT_MB);
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error(`API_BODY_LIMIT_MB must be a positive number, got "${raw}"`);
  }
  return Math.floor(mb * 1024 * 1024);
}

export function createRegistryStoreFromEnv(env: NodeJS.ProcessEnv = process.env): RegistryStore {
  const artifactStore = createArtifactStoreFromEnv(env);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  return new PostgresRegistryStore(env.DATABASE_URL, { artifactStore });
}

/**
 * Load a dotenv file if present. Resolution order:
 * 1. If `DOTENV_FILE` env var is set, load exactly that file (no fallback).
 * 2. Otherwise try `.env`; if missing, fall back to `.env.rapid`.
 *
 * This lets a server ship `.env.rapid` alongside the repo (no external
 * config-preservation flow) while local dev keeps using the gitignored `.env`.
 * Note: NEXT_PUBLIC_* variables are build-time (injected at `next build`),
 * so runtime dotenv files never affect them.
 */
/**
 * Path of the dotenv file loadDotEnvIfPresent() would load, or null when none
 * of the candidates exists. Same resolution order: DOTENV_FILE (exact) >
 * .env > .env.rapid, searched from INIT_CWD then upward from cwd.
 */
export function findDotEnvFilePath(): string | null {
  const explicit = process.env.DOTENV_FILE?.trim() || "";
  const candidates = explicit ? [explicit] : [".env", ".env.rapid"];

  const findIn = (baseDir: string): string | null => {
    for (const name of candidates) {
      const absolutePath = path.resolve(baseDir, name);
      if (existsSync(absolutePath)) {
        return absolutePath;
      }
    }
    return null;
  };

  if (process.env.INIT_CWD) {
    const found = findIn(process.env.INIT_CWD);
    if (found) {
      return found;
    }
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const found = findIn(dir);
    if (found) {
      return found;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

export function loadDotEnvIfPresent(filePath = ""): void {
  const seen = new Set<string>();

  const tryLoad = (baseDir: string, name: string): boolean => {
    const absolutePath = path.resolve(baseDir, name);
    if (seen.has(absolutePath) || !existsSync(absolutePath)) {
      return false;
    }
    seen.add(absolutePath);
    loadEnvFile(absolutePath);
    return true;
  };

  const explicit = filePath || process.env.DOTENV_FILE?.trim() || "";
  const candidates = explicit ? [explicit] : [".env", ".env.rapid"];

  const findIn = (baseDir: string): boolean => {
    for (const name of candidates) {
      if (tryLoad(baseDir, name)) {
        return true;
      }
    }
    return false;
  };

  if (process.env.INIT_CWD && findIn(process.env.INIT_CWD)) {
    return;
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (findIn(dir)) {
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

export function createArtifactStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ArtifactStore | undefined {
  if (env.MINIO_ENABLED !== "true") {
    return undefined;
  }

  return new MinioArtifactStore({
    endPoint: env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(env.MINIO_PORT ?? 9000),
    useSSL: env.MINIO_USE_SSL === "true",
    accessKey: env.MINIO_ACCESS_KEY ?? "skill_platform",
    secretKey: env.MINIO_SECRET_KEY ?? "skill_platform_secret",
    bucket: env.MINIO_BUCKET ?? "skill-artifacts",
    region: env.MINIO_REGION,
  } satisfies MinioArtifactStoreOptions);
}
