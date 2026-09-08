import { describe, expect, test, vi } from "vitest";
import {
  getPasswordResetExpiresMs,
  isLoginErrorStrict,
  isPublicRegistrationEnabled,
  loadDotEnvIfPresent,
} from "@skill-platform/storage";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("isLoginErrorStrict", () => {
  test("未设置时默认 true（严格模式）", () => {
    expect(isLoginErrorStrict({})).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "" })).toBe(true);
  });

  test("显式 true 值", () => {
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "true" })).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "1" })).toBe(true);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "yes" })).toBe(true);
  });

  test("显式 false 值（宽松模式）", () => {
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "false" })).toBe(false);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "0" })).toBe(false);
    expect(isLoginErrorStrict({ LOGIN_ERROR_STRICT: "no" })).toBe(false);
  });
});

describe("isPublicRegistrationEnabled", () => {
  test("未设置时默认 true（开放注册）", () => {
    expect(isPublicRegistrationEnabled({})).toBe(true);
  });

  test("显式 false 关闭注册", () => {
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "false" })).toBe(false);
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "0" })).toBe(false);
  });

  test("显式 true 开放注册", () => {
    expect(isPublicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "true" })).toBe(true);
  });
});

describe("getPasswordResetExpiresMs", () => {
  test("默认 1 小时", () => {
    expect(getPasswordResetExpiresMs({})).toBe(3_600_000);
  });

  test("自定义值", () => {
    expect(getPasswordResetExpiresMs({ PASSWORD_RESET_EXPIRES_MS: "60000" })).toBe(60_000);
  });

  test("非法值抛错", () => {
    expect(() => getPasswordResetExpiresMs({ PASSWORD_RESET_EXPIRES_MS: "abc" })).toThrow(
      "PASSWORD_RESET_EXPIRES_MS"
    );
  });
});

describe("loadDotEnvIfPresent 的 DOTENV_FILE", () => {
  test("DOTENV_FILE 显式指定的文件被加载", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skillnav-dotenv-"));
    const file = path.join(dir, "custom.env");
    writeFileSync(file, "DOTENV_PROBE=hello\n");
    vi.stubEnv("DOTENV_FILE", file);

    try {
      loadDotEnvIfPresent();
      expect(process.env.DOTENV_PROBE).toBe("hello");
    } finally {
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("无参调用：仅存在 .env.rapid 时回退读取它", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skillnav-dotenv-"));
    writeFileSync(path.join(dir, ".env.rapid"), "DOTENV_PROBE_RAPID=from-rapid\n");
    vi.stubEnv("INIT_CWD", dir);

    try {
      loadDotEnvIfPresent();
      expect(process.env.DOTENV_PROBE_RAPID).toBe("from-rapid");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.DOTENV_PROBE_RAPID;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("DOTENV_FILE 优先于已存在的 .env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skillnav-dotenv-"));
    writeFileSync(path.join(dir, ".env"), "DOTENV_PROBE_FALLBACK=from-dot-env\n");
    const custom = path.join(dir, "custom.env");
    writeFileSync(custom, "DOTENV_PROBE_FALLBACK=from-custom\n");
    vi.stubEnv("DOTENV_FILE", custom);
    vi.stubEnv("INIT_CWD", dir);

    try {
      loadDotEnvIfPresent();
      expect(process.env.DOTENV_PROBE_FALLBACK).toBe("from-custom");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.DOTENV_PROBE_FALLBACK;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("进程已设置的变量不被 dotenv 文件覆盖", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "skillnav-dotenv-"));
    writeFileSync(path.join(dir, ".env"), "DOTENV_PROBE_OVERRIDE=from-file\n");
    vi.stubEnv("INIT_CWD", dir);
    vi.stubEnv("DOTENV_PROBE_OVERRIDE", "from-process");

    try {
      loadDotEnvIfPresent();
      expect(process.env.DOTENV_PROBE_OVERRIDE).toBe("from-process");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.DOTENV_PROBE_OVERRIDE;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
