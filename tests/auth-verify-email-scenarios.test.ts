import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileAuthStore, VerificationTokenError } from "@skill-platform/storage";

describe("verifyEmail 分类裁决（FileAuthStore）", () => {
  let dir: string;
  let store: FileAuthStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "skillnav-verify-scenarios-"));
    store = new FileAuthStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("① 未登录激活成功；激活后再次点击 → 归属判断 used_self/used_other", async () => {
    const bob = await store.register("bob", "password123", "bob@example.com");
    const alice = await store.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const rawToken = await store.createEmailVerificationToken(bob.id, 3_600_000);

    // 未登录 → 正常激活
    const session = await store.verifyEmail(rawToken);
    expect(session.user.username).toBe("bob");
    expect(session.user.emailVerified).toBe(true);

    // 再次点击：bob 本人（已登录）→ used_self
    await expect(store.verifyEmail(rawToken, bob.id)).rejects.toMatchObject({
      code: "used_self",
      username: "bob",
    });
    // 其他已登录 alice → used_other
    await expect(store.verifyEmail(rawToken, alice.id)).rejects.toMatchObject({
      code: "used_other",
      username: "bob",
    });
    // 无登录态点击已用链接 → invalid
    await expect(store.verifyEmail(rawToken)).rejects.toMatchObject({ code: "invalid" });
  });

  test("② 有效链接被其他已登录账号点击 → other_account 且链接被作废", async () => {
    const bob = await store.register("bob", "password123", "bob@example.com");
    const alice = await store.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const rawToken = await store.createEmailVerificationToken(bob.id, 3_600_000);

    await expect(store.verifyEmail(rawToken, alice.id)).rejects.toMatchObject({
      code: "other_account",
      username: "bob",
    });
    // token 已被作废：后续任何人再点击都 invalid
    await expect(store.verifyEmail(rawToken, bob.id)).rejects.toMatchObject({ code: "invalid" });
    await expect(store.verifyEmail(rawToken)).rejects.toMatchObject({ code: "invalid" });
  });

  test("③ 过期/未知 token → invalid", async () => {
    const bob = await store.register("bob", "password123", "bob@example.com");
    const expiredToken = await store.createEmailVerificationToken(bob.id, -1000);
    await expect(store.verifyEmail(expiredToken)).rejects.toMatchObject({ code: "invalid" });
    await expect(store.verifyEmail("ev_never-existed")).rejects.toMatchObject({ code: "invalid" });
  });

  test("VerificationTokenError instanceof 判定可用", () => {
    const err = new VerificationTokenError("used_self", "bob");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VerificationTokenError);
    expect(err.code).toBe("used_self");
    expect(err.username).toBe("bob");
  });
});
