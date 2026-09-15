/**
 * Deferred VirusTotal support in the registry store.
 *
 * Two behaviours have to hold together: the store must list the versions whose
 * VirusTotal stage is still "processing" (so the sweep can resume them with the
 * stored hash), and the stale-inspecting recovery must leave exactly those
 * versions alone — otherwise the 30-minute recovery would kill the very
 * versions the sweep is about to finish.
 */
import { describe, expect, test } from "vitest";
import { JsonRegistryStore, type RegistryData } from "@skill-platform/storage";

const SHA256 = "b".repeat(64);
const ANALYSIS_ID = "analysis-1";

/** Minimal in-memory registry: load/save are the only abstract methods. */
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

  async snapshot(): Promise<RegistryData> {
    return this.data;
  }
}

function inspection(sha256: string | undefined, analysisId?: string) {
  return {
    id: "inspection-1",
    skillSlug: "demo-skill",
    skillName: "Demo",
    version: "1.0.0",
    contentHash: "content-hash",
    verdict: "published",
    scores: { qualityScore: 80, securityScore: 90, reliabilityScore: 80 },
    findings: [],
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...(sha256
      ? {
          virusTotal: {
            provider: "virustotal",
            sha256,
            ...(analysisId ? { analysisId } : {}),
            status: "pending",
            malicious: 0,
            suspicious: 0,
            harmless: 0,
            undetected: 0,
            totalEngines: 0,
          },
        }
      : {}),
  };
}

/**
 * `updatedAt` is deliberately an hour old so the stale check (olderThanMs: 0)
 * treats the version as stale without depending on timing luck.
 */
function versionEntry(overrides: Record<string, unknown> = {}) {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  return {
    version: "1.0.0",
    contentHash: "content-hash",
    status: "published",
    releaseTags: ["latest"],
    inspectionStatus: "inspecting",
    inspectionStageStatuses: { virustotal: "processing", halucatch: "done" },
    inspection: inspection(SHA256, ANALYSIS_ID),
    createdAt: hourAgo,
    updatedAt: hourAgo,
    ...overrides,
  };
}

function registryData(version: object): RegistryData {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  return {
    skills: {
      "demo-skill": {
        slug: "demo-skill",
        name: "Demo",
        description: "",
        latestVersion: "1.0.0",
        inspectionStatus: "inspecting",
        versions: { "1.0.0": version },
        contributors: [],
        issues: [],
        ratings: [],
        averageRating: 0,
        ratingCount: 0,
        createdAt: hourAgo,
        updatedAt: hourAgo,
      },
    },
  } as unknown as RegistryData;
}

describe("deferred VirusTotal store support", () => {
  test("lists versions waiting for a report, with the hash and analysis id to resume from", async () => {
    const store = new InMemoryRegistryStore(registryData(versionEntry()));
    const saved = await store.snapshot();
    const reportCreatedAt = saved.skills["demo-skill"].versions["1.0.0"].inspection?.createdAt;

    await expect(store.listPendingVirusTotalInspections()).resolves.toEqual([
      {
        slug: "demo-skill",
        version: "1.0.0",
        sha256: SHA256,
        analysisId: ANALYSIS_ID,
        // Without a version-level start time the report timestamp is the clock.
        startedAt: reportCreatedAt,
      },
    ]);
  });

  test("prefers the version's own inspection start time as the clock", async () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const store = new InMemoryRegistryStore(
      registryData(versionEntry({ inspectionStartedAt: startedAt }))
    );

    await expect(store.listPendingVirusTotalInspections()).resolves.toEqual([
      {
        slug: "demo-skill",
        version: "1.0.0",
        sha256: SHA256,
        analysisId: ANALYSIS_ID,
        startedAt,
      },
    ]);
  });

  test("still lists a pending version that predates analysis-id tracking", async () => {
    // Rows written before the analysis id existed carry a hash only: the sweep
    // has to keep working for them (it falls back to the hash lookup).
    const legacy = new InMemoryRegistryStore(
      registryData(versionEntry({ inspection: inspection(SHA256) }))
    );

    await expect(legacy.listPendingVirusTotalInspections()).resolves.toEqual([
      // No analysis id (it did not exist yet), but the clock is still reported
      // so the sweep can time the wait out.
      { slug: "demo-skill", version: "1.0.0", sha256: SHA256, startedAt: expect.any(String) },
    ]);
  });

  test("ignores versions whose VT stage finished or that have no stored hash", async () => {
    const finished = new InMemoryRegistryStore(
      registryData(
        versionEntry({
          inspectionStageStatuses: { virustotal: "passed", halucatch: "done" },
        })
      )
    );
    await expect(finished.listPendingVirusTotalInspections()).resolves.toEqual([]);

    // Nothing to resume from: without a hash the sweep cannot fetch anything.
    const withoutHash = new InMemoryRegistryStore(
      registryData(versionEntry({ inspection: inspection(undefined) }))
    );
    await expect(withoutHash.listPendingVirusTotalInspections()).resolves.toEqual([]);
  });

  test("stale recovery leaves a version waiting for its report alone", async () => {
    const store = new InMemoryRegistryStore(registryData(versionEntry()));

    // olderThanMs: 0 makes every inspecting version stale by definition.
    await expect(store.recoverStaleInspectingSkills({ olderThanMs: 0 })).resolves.toBe(0);

    // Still queued for the sweep, not marked interrupted.
    await expect(store.listPendingVirusTotalInspections()).resolves.toHaveLength(1);
    const saved = await store.snapshot();
    expect(saved.skills["demo-skill"].versions["1.0.0"].inspectionStatus).toBe("inspecting");
  });

  test("stale recovery still fails an inspecting version that is not waiting for VT", async () => {
    const store = new InMemoryRegistryStore(
      registryData(
        versionEntry({
          inspectionStageStatuses: { virustotal: "passed", halucatch: "done" },
        })
      )
    );

    await expect(store.recoverStaleInspectingSkills({ olderThanMs: 0 })).resolves.toBe(1);

    const saved = await store.snapshot();
    expect(saved.skills["demo-skill"].versions["1.0.0"].inspectionStatus).toBe("interrupted");
  });
});
