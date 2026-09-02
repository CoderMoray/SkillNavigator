import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FileAuthStore, type PublicUser } from "@skill-platform/storage";

describe("登录：用户名或邮箱（FileAuthStore）", () => {
  let dir: string;
  let store: FileAuthStore;
  let alice: PublicUser;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "skillnav-auth-"));
    store = new FileAuthStore(dir);
    alice = await store.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    expect(alice.email).toBe("alice@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("登录标识识别", () => {
    test("用户名可登录", async () => {
      const session = await store.login("alice", "password123");
      expect(session.user.username).toBe("alice");
    });

    test("邮箱可登录", async () => {
      const session = await store.login("alice@example.com", "password123");
      expect(session.user.username).toBe("alice");
    });

    test("邮箱大小写不敏感", async () => {
      const session = await store.login("ALICE@EXAMPLE.COM", "password123");
      expect(session.user.username).toBe("alice");
    });

    test("用户名大小写不敏感", async () => {
      const session = await store.login("Alice", "password123");
      expect(session.user.username).toBe("alice");
    });

    test("用户名前后空白被 trim", async () => {
      const session = await store.login("  alice  ", "password123");
      expect(session.user.username).toBe("alice");
    });
  });

  describe("严格模式（默认 LOGIN_ERROR_STRICT=true）", () => {
    test("账号不存在返回统一文案", async () => {
      await expect(store.login("ghost@nowhere.com", "password123")).rejects.toThrow(
        "Invalid username or password"
      );
    });

    test("密码错误返回统一文案", async () => {
      await expect(store.login("alice", "wrongpassword")).rejects.toThrow(
        "Invalid username or password"
      );
    });

    test("非法邮箱格式返回统一文案", async () => {
      await expect(store.login("not-an-email", "password123")).rejects.toThrow(
        "Invalid username or password"
      );
    });

    test("非法用户名格式（含非法字符）返回统一文案", async () => {
      await expect(store.login("bad user!", "password123")).rejects.toThrow(
        "Invalid username or password"
      );
    });
  });

  describe("宽松模式（LOGIN_ERROR_STRICT=false）", () => {
    beforeEach(() => {
      vi.stubEnv("LOGIN_ERROR_STRICT", "false");
    });

    test("账号不存在提示 Invalid username", async () => {
      await expect(store.login("ghost@nowhere.com", "password123")).rejects.toThrow("Invalid username");
    });

    test("密码错误提示 Invalid password", async () => {
      await expect(store.login("alice", "wrongpassword")).rejects.toThrow("Invalid password");
    });

    test("非法邮箱格式提示 Invalid username", async () => {
      await expect(store.login("not-an-email", "password123")).rejects.toThrow("Invalid username");
    });
  });

  describe("邮箱验证", () => {
    beforeEach(async () => {
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(path.join(tmpdir(), "skillnav-auth-"));
      store = new FileAuthStore(dir);
      vi.stubEnv("REGISTRATION_EMAIL_VERIFICATION_REQUIRED", "true");
      alice = await store.register("alice", "password123", "alice@example.com");
    });

    test("未验证邮箱无法登录", async () => {
      await expect(store.login("alice", "password123")).rejects.toThrow("Email not verified");
      await expect(store.login("alice@example.com", "password123")).rejects.toThrow("Email not verified");
    });

    test("validateUnverifiedUserForVerification 支持邮箱", async () => {
      const user = await store.validateUnverifiedUserForVerification("alice@example.com", "password123");
      expect(user.username).toBe("alice");
      expect(user.email).toBe("alice@example.com");
    });

    test("verifyEmail 验证成功后自动创建登录会话", async () => {
      const rawToken = await store.createEmailVerificationToken(alice.id, 3_600_000);
      const session = await store.verifyEmail(rawToken);
      expect(session.user.emailVerified).toBe(true);
      expect(session.token.startsWith("skp_")).toBe(true);

      const currentUser = await store.getUserByToken(session.token);
      expect(currentUser?.username).toBe("alice");
    });
  });

  describe("重置密码", () => {
    test("用邮箱请求重置 -> 旧密码失效 -> 新密码可登录", async () => {
      // 宽松模式便于断言旧密码已失效（严格模式下统一返回 Invalid username or password）
      vi.stubEnv("LOGIN_ERROR_STRICT", "false");
      const { user, token } = await store.requestPasswordReset("alice@example.com", 3_600_000);
      expect(user.username).toBe("alice");
      expect(token.startsWith("pr_")).toBe(true);

      const resetUser = await store.resetPassword(token, "newpassword123");
      expect(resetUser.username).toBe("alice");

      await expect(store.login("alice", "password123")).rejects.toThrow("Invalid password");
      const session = await store.login("alice", "newpassword123");
      expect(session.user.username).toBe("alice");
    });

    test("用用户名请求重置", async () => {
      const { user, token } = await store.requestPasswordReset("alice", 3_600_000);
      expect(user.username).toBe("alice");
      expect(token.startsWith("pr_")).toBe(true);
    });

    test("不存在的标识返回 Invalid username（宽松模式）", async () => {
      vi.stubEnv("LOGIN_ERROR_STRICT", "false");
      await expect(store.requestPasswordReset("ghost@nowhere.com", 3_600_000)).rejects.toThrow(
        "Invalid username"
      );
    });

    test("无效 token 被拒绝", async () => {
      await expect(store.resetPassword("pr_unknown", "newpassword123")).rejects.toThrow(
        "Invalid or expired reset token"
      );
    });

    test("过期 token 被拒绝", async () => {
      const { token } = await store.requestPasswordReset("alice@example.com", -1);
      await expect(store.resetPassword(token, "newpassword123")).rejects.toThrow(
        "Invalid or expired reset token"
      );
    });

    test("新密码过短被拒绝", async () => {
      const { token } = await store.requestPasswordReset("alice@example.com", 3_600_000);
      await expect(store.resetPassword(token, "short")).rejects.toThrow(
        "Password must be at least 8 characters"
      );
    });

    test("重置后 token 一次性使用", async () => {
      const { token } = await store.requestPasswordReset("alice@example.com", 3_600_000);
      await store.resetPassword(token, "newpassword123");
      await expect(store.resetPassword(token, "anotherpassword")).rejects.toThrow(
        "Invalid or expired reset token"
      );
    });
  });
});
