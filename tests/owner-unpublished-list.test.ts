import { describe, expect, it } from "vitest";
import { JsonRegistryStore } from "../packages/storage/src/store/base.js";
import { resolveSkillPublishedFlag } from "../packages/storage/src/utils.js";
import type { RegistryData, RegistrySkill, RegistryVersion } from "../packages/storage/src/types.js";

class InMemoryRegistryStore extends JsonRegistryStore {
  constructor(private data: RegistryData) {
    super();
  }

  protected async load(): Promise<RegistryData> {
    return this.data;
  }

  protected async save(data: RegistryData): Promise<void> {
    this.data = data;
  }
}

function version(overrides: Partial<RegistryVersion> & Pick<RegistryVersion, "version">): RegistryVersion {
  return {
    manifest: { slug: "demo-skill-improved6", name: "Demo", description: "Demo" },
    contentHash: "hash",
    status: "published",
    releaseTags: ["latest"],
    downloads: 0,
    published: true,
    inspectionStatus: "completed",
    inspection: {
      id: "inspection_1",
      version: overrides.version,
      contentHash: "hash",
      verdict: "published",
      scores: { qualityScore: 1, securityScore: 1, reliabilityScore: 1 },
      findings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("listUnpublishedSkillsForOwner", () => {
  it("does not treat stale skills.published=false as owner-unlisted when a version is public", async () => {
    const ownerUserId = "owner-1";
    const registry: RegistrySkill = {
      slug: "demo-skill-improved6",
      name: "Demo Skill Improved 6",
      description: "Demo",
      ownerUserId,
      latestVersion: "0.1.2",
      inspectionStatus: "completed",
      published: false,
      ownerUnlisted: false,
      versions: {
        "0.1.2": version({ version: "0.1.2" }),
      },
      contributors: [],
      issues: [],
      ratings: [],
      averageRating: 0,
      ratingCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const store = new InMemoryRegistryStore({ skills: { [registry.slug]: registry } });

    expect(resolveSkillPublishedFlag(registry)).toBe(true);

    const unpublished = await store.listUnpublishedSkillsForOwner(ownerUserId);
    expect(unpublished.some((item) => item.slug === registry.slug)).toBe(false);

    const search = await store.search("");
    expect(search.some((item) => item.slug === registry.slug)).toBe(true);
    expect(search.find((item) => item.slug === registry.slug)?.published).toBe(true);
  });

  it("still lists owner-delisted skills for the owner profile supplement", async () => {
    const ownerUserId = "owner-2";
    const registry: RegistrySkill = {
      slug: "delisted-skill",
      name: "Delisted",
      description: "Demo",
      ownerUserId,
      latestVersion: "1.0.0",
      inspectionStatus: "completed",
      published: false,
      ownerUnlisted: true,
      versions: {
        "1.0.0": version({ version: "1.0.0" }),
      },
      contributors: [],
      issues: [],
      ratings: [],
      averageRating: 0,
      ratingCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const store = new InMemoryRegistryStore({ skills: { [registry.slug]: registry } });

    const unpublished = await store.listUnpublishedSkillsForOwner(ownerUserId);
    expect(unpublished.map((item) => item.slug)).toContain(registry.slug);
    expect(unpublished.find((item) => item.slug === registry.slug)?.published).toBe(false);
  });
});
