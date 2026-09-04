import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FileAuthStore } from "@skill-platform/storage";
import { generatePassword, parseAdminConfig, runBootstrap } from "../scripts/bootstrap-admin.mjs";

/**
 * A minimal RegistryStore fake: keeps one skill, records publishes and the
 * owner each publish was attributed to.
 */
class FakeRegistryStore {
  constructor(skill) {
    this.skill = skill ?? undefined;
    this.publishes = [];
  }

  async getSkill(_slug) {
    return this.skill;
  }

  async publishSnapshot(snapshot, review, _evaluation, options) {
    this.publishes.push({ owner: options.owner, version: review.version });
    this.skill = {
      slug: snapshot.manifest.slug,
      ownerUserId: options.owner.userId,
      latestVersion: review.version,
    };
    return { version: review.version };
  }
}

const fakeSnapshot = () => ({
  manifest: { slug: "skillnav-skill", name: "skillnav CLI", version: "1.0.0" },
  contentHash: "fake-content-hash",
  files: [],
});

const fakeReview = () => ({ version: "1.0.0", verdict: "approved", findings: [] });

async function emptyAuthStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "skillnav-bootstrap-"));
  const store = new FileAuthStore(dir);
  return { store, dir };
}

describe("bootstrap-admin parseAdminConfig", () => {
  test("accepts a fully populated config", () => {
    expect(
      parseAdminConfig({ ADMIN_USERNAME: "root", ADMIN_EMAIL: "a@b.c", ADMIN_DISPLAY_NAME: "Root" })
    ).toEqual({ username: "root", email: "a@b.c", displayName: "Root" });
  });

  test("returns null when any field is missing/blank", () => {
    expect(parseAdminConfig({ ADMIN_USERNAME: "", ADMIN_EMAIL: "a@b.c", ADMIN_DISPLAY_NAME: "R" })).toBeNull();
    expect(parseAdminConfig({})).toBeNull();
  });
});

describe("bootstrap-admin generatePassword", () => {
  test("produces a 24-char alphanumeric password", () => {
    for (let i = 0; i < 5; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/^[A-Za-z0-9]{24}$/);
    }
  });
});

describe("runBootstrap (auth store = FileAuthStore)", () => {
  let auth;
  let dir;

  beforeEach(async () => {
    ({ store: auth, dir } = await emptyAuthStore());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const deps = (registry) => ({
    authStore: auth,
    registryStore: registry,
    readPackage: async () => fakeSnapshot(),
    reviewSnapshot: async () => fakeReview(),
  });

  test("missing input -> error missing-input", async () => {
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(deps(registry), { username: "", email: "", displayName: "" });
    expect(result.action).toBe("error");
    expect(result.code).toBe("missing-input");
  });

  test("existing account without the Skill -> linked (publish under that account, account untouched)", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore();
    const before = (await auth.listUsers()).length;

    const result = await runBootstrap(
      deps(registry),
      { username: "alice", email: "alice@example.com", displayName: "Alice Admin" }
    );

    expect(result.action).toBe("linked");
    expect(result.username).toBe("alice");
    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner).toEqual({ userId: alice.id, username: "alice" });
    // The existing account must not have been rebuilt.
    expect((await auth.listUsers()).length).toBe(before);
  });

  test("existing account that already owns the Skill -> already-linked, no publish", async () => {
    const alice = await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({ slug: "skillnav-skill", ownerUserId: alice.id });

    const result = await runBootstrap(
      deps(registry),
      { username: "alice", email: "alice@example.com", displayName: "Alice Admin" }
    );

    expect(result.action).toBe("already-linked");
    expect(registry.publishes).toHaveLength(0);
  });

  test("Skill owned by someone else -> owner-conflict, nothing touched", async () => {
    await auth.register("alice", "password123", "alice@example.com", {
      autoVerifyEmail: true,
    });
    await auth.register("stranger", "password123", "stranger@example.com", {
      autoVerifyEmail: true,
    });
    const registry = new FakeRegistryStore({ slug: "skillnav-skill", ownerUserId: "other-user" });

    const result = await runBootstrap(
      deps(registry),
      { username: "alice", email: "alice@example.com", displayName: "Alice Admin" }
    );

    expect(result.action).toBe("owner-conflict");
    expect(registry.publishes).toHaveLength(0);
    // Neither the target account nor unrelated accounts were touched.
    const users = await auth.listUsers();
    expect(users).toHaveLength(2);
    expect(users.some((user) => user.username === "stranger")).toBe(true);
  });

  test("no account, no admin -> created-linked (first user admin, verified, display name applied)", async () => {
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(
      deps(registry),
      { username: "root", email: "root@example.com", displayName: "Root Admin" }
    );

    expect(result.action).toBe("created-linked");
    expect(typeof result.password).toBe("string");
    expect(result.password).toHaveLength(24);

    const users = await auth.listUsers();
    expect(users).toHaveLength(1);
    const root = users[0];
    expect(root.username).toBe("root");
    expect(root.role).toBe("admin");
    expect(root.emailVerified).toBe(true);
    expect(root.displayName).toBe("Root Admin");

    expect(registry.publishes).toHaveLength(1);
    expect(registry.publishes[0].owner.userId).toBe(root.id);

    // The generated password must actually log the account in.
    const session = await auth.login("root", result.password);
    expect(session.user.username).toBe("root");
  });

  test("no account but another admin exists -> error admin-exists", async () => {
    await auth.register("root", "password123", "root@example.com", { autoVerifyEmail: true });
    const registry = new FakeRegistryStore();
    const result = await runBootstrap(
      deps(registry),
      { username: "newbie", email: "newbie@example.com", displayName: "Newbie" }
    );

    expect(result.action).toBe("error");
    expect(result.code).toBe("admin-exists");
    expect(registry.publishes).toHaveLength(0);
    expect((await auth.listUsers()).some((user) => user.username === "newbie")).toBe(false);
  });

  test("idempotent: running again after a successful link reports already-linked", async () => {
    const registry = new FakeRegistryStore();
    const admin = { username: "root", email: "root@example.com", displayName: "Root Admin" };
    const first = await runBootstrap(deps(registry), admin);
    expect(first.action).toBe("created-linked");

    const second = await runBootstrap(deps(registry), admin);
    expect(second.action).toBe("already-linked");
    expect(registry.publishes).toHaveLength(1);
    expect((await auth.listUsers())).toHaveLength(1);
  });
});
