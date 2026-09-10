import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  parseEngineResults,
  parseThreatVerdict,
  inspectAndEvaluateSkillSnapshot,
  inspectSkillSnapshot,
  runVirusTotalScan
} from "@skill-platform/inspection-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { readSkillPackage, type SkillSnapshot } from "@skill-platform/skill-spec";

const configuredVariables = [
  "SKILLSPECTOR_ENABLED",
  "VIRUSTOTAL_ENABLED",
  "VIRUSTOTAL_API_KEY",
  "VIRUSTOTAL_UPLOAD_ON_MISS",
  "VIRUSTOTAL_TIMEOUT_MS",
  "VIRUSTOTAL_ANALYSIS_TIMEOUT_MS",
  "VIRUSTOTAL_POLL_INTERVAL_MS",
  "HALUCATCH_ENABLED"
] as const;
const originalEnvironment = new Map(
  configuredVariables.map((name) => [name, process.env[name]])
);

let snapshot: SkillSnapshot;

function evaluation(): FunctionalEvaluationReport {
  return {
    id: "evaluation-80",
    provider: "static-taskset",
    status: "passed",
    score: 80,
    tasksTotal: 1,
    tasksPassed: 1,
    taskResults: [],
    findings: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function configureVirusTotal(): void {
  process.env.SKILLSPECTOR_ENABLED = "false";
  process.env.HALUCATCH_ENABLED = "false";
  process.env.VIRUSTOTAL_ENABLED = "true";
  process.env.VIRUSTOTAL_API_KEY = "test-api-key";
  process.env.VIRUSTOTAL_UPLOAD_ON_MISS = "false";
  process.env.VIRUSTOTAL_TIMEOUT_MS = "1000";
  process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS = "1000";
  process.env.VIRUSTOTAL_POLL_INTERVAL_MS = "1";
}

beforeAll(async () => {
  snapshot = await readSkillPackage(resolve("examples/demo-skill"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("VirusTotal engine result parsing", () => {
  test("extracts malicious and suspicious engine detections only", () => {
    const results = parseEngineResults({
      Kaspersky: {
        category: "malicious",
        result: "Trojan.Generic",
        method: "blacklist",
        engine_update: "20260101"
      },
      Avast: {
        category: "harmless",
        result: "Clean"
      },
      Elastic: {
        category: "suspicious",
        result: "Suspicious archive"
      }
    });

    expect(results).toEqual([
      expect.objectContaining({
        engine: "Kaspersky",
        category: "malicious",
        result: "Trojan.Generic"
      }),
      expect.objectContaining({
        engine: "Elastic",
        category: "suspicious",
        result: "Suspicious archive"
      })
    ]);
  });

  test("parses supported threat verdict values", () => {
    expect(parseThreatVerdict("VERDICT_MALICIOUS")).toBe("VERDICT_MALICIOUS");
    expect(parseThreatVerdict("verdict_suspicious")).toBe("VERDICT_SUSPICIOUS");
    expect(parseThreatVerdict("unsupported")).toBeUndefined();
  });
});

describe("VirusTotal package review adapter", () => {
  test("adds grouped findings by category from an existing VirusTotal report", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 2,
              suspicious: 1,
              harmless: 5,
              undetected: 61
            },
            last_analysis_results: {
              Kaspersky: {
                category: "malicious",
                result: "Trojan.Generic",
                method: "blacklist"
              },
              "Microsoft Defender": {
                category: "malicious",
                result: "Trojan:Script/Wacatac",
                method: "blacklist"
              },
              Elastic: {
                category: "suspicious",
                result: "Suspicious archive"
              },
              Avast: {
                category: "harmless",
                result: "Clean"
              }
            },
            threat_verdict: "VERDICT_MALICIOUS"
          }
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await inspectSkillSnapshot(snapshot, undefined, evaluation());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/files\/[a-f0-9]{64}$/);
    expect(report.virusTotal).toMatchObject({
      provider: "virustotal",
      status: "completed",
      malicious: 2,
      suspicious: 1,
      totalEngines: 69,
      threatVerdict: "VERDICT_MALICIOUS"
    });
    expect(report.virusTotal?.engineResults).toHaveLength(3);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-[a-f0-9]{16}$/),
        severity: "high",
        title: "VirusTotal (malicious)",
        message: "Kaspersky, Microsoft Defender classified this package as malicious.",
        evidence: expect.stringMatching(
          /Total engines: 69[\s\S]*Result:\n\tKaspersky: Trojan\.Generic\n\tMicrosoft Defender: Trojan:Script\/Wacatac/
        ),
        recommendation:
          "Do not publish this package until the flagged content is removed or the VirusTotal detection is reviewed and cleared."
      })
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-suspicious-[a-f0-9]{16}$/),
        severity: "medium",
        title: "VirusTotal (suspicious)",
        message: "Elastic classified this package as suspicious."
      })
    );
    const virusTotalFindings = report.findings.filter((finding) => finding.id.startsWith("virustotal-"));
    expect(virusTotalFindings).toHaveLength(2);
    for (const finding of virusTotalFindings) {
      expect(finding.evidence).not.toMatch(/^Engine:/m);
    }
  });

  test("does not upload an unknown archive unless explicitly enabled", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scan.summary).toMatchObject({
      provider: "virustotal",
      status: "not_found",
      malicious: 0,
      suspicious: 0
    });
    expect(scan.findings).toEqual([]);
  });

  test("waits for a pending hash report instead of accepting zero engine results", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 0,
                harmless: 0,
                undetected: 0
              },
              last_analysis_results: {}
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 1,
                suspicious: 0,
                harmless: 2,
                undetected: 60
              },
              last_analysis_results: {
                "Microsoft Defender": {
                  category: "malicious",
                  result: "Virus:EICAR-Test-File"
                }
              },
              threat_verdict: "VERDICT_MALICIOUS"
            }
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(scan.summary).toMatchObject({
      status: "completed",
      malicious: 1,
      suspicious: 0,
      totalEngines: 63,
      threatVerdict: "VERDICT_MALICIOUS"
    });
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-[a-f0-9]{16}$/),
        severity: "high",
        title: "VirusTotal (malicious)"
      })
    );
  });

  test("reports an unresolved zero-engine hash report as an incomplete review stage", async () => {
    configureVirusTotal();
    process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS = "10";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 0,
              suspicious: 0,
              harmless: 0,
              undetected: 0
            },
            last_analysis_results: {}
          }
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { inspection, stageStatuses, stageFailureMessages } = await inspectAndEvaluateSkillSnapshot(snapshot, undefined, evaluation());

    // A scan that never produced a report is an environment/integration failure:
    // no fabricated summary, no finding, only a retryable stage failure.
    expect(inspection.virusTotal).toBeUndefined();
    expect(inspection.findings.some((finding) => finding.id === "virustotal-scan-failed")).toBe(false);
    expect(stageStatuses.virustotal).toBe("interrupted");
    expect(stageFailureMessages.virustotal).toMatch(/analysis did not complete/i);
  });

  test("uploads an unknown archive and waits for its analysis when enabled", async () => {
    configureVirusTotal();
    process.env.VIRUSTOTAL_UPLOAD_ON_MISS = "true";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "analysis-id" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              status: "completed",
              stats: {
                malicious: 0,
                suspicious: 1,
                harmless: 4,
                undetected: 60
              },
              results: {
                "Cynet Security": {
                  category: "suspicious",
                  result: "Suspicious.Zip",
                  method: "blacklist"
                }
              }
            }
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 1,
                harmless: 4,
                undetected: 60
              },
              last_analysis_results: {
                "Cynet Security": {
                  category: "suspicious",
                  result: "Suspicious.Zip",
                  method: "blacklist"
                }
              },
              threat_verdict: "VERDICT_SUSPICIOUS"
            }
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(String(fetchMock.mock.calls[3]?.[0])).toMatch(/\/files\/[a-f0-9]{64}$/);
    expect(scan.summary).toMatchObject({
      status: "completed",
      malicious: 0,
      suspicious: 1,
      threatVerdict: "VERDICT_SUSPICIOUS"
    });
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-suspicious-[a-f0-9]{16}$/),
        severity: "medium",
        title: "VirusTotal (suspicious)",
        message: "Cynet Security classified this package as suspicious."
      })
    );
  });

  test("falls back to aggregate findings when engine details are missing", async () => {
    configureVirusTotal();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          attributes: {
            last_analysis_stats: {
              malicious: 1,
              suspicious: 0,
              harmless: 0,
              undetected: 0
            }
          }
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^virustotal-malicious-/),
        severity: "high",
        title: "VirusTotal detected malicious content"
      })
    );
  });

  test("reports a failed scan as an incomplete review stage", async () => {
    configureVirusTotal();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const { inspection: report, stageStatuses, stageFailureMessages } = await inspectAndEvaluateSkillSnapshot(snapshot, undefined, evaluation());

    // Integration errors surface as retryable stage failures, not as a fake
    // scan summary or a review finding.
    expect(report.virusTotal).toBeUndefined();
    expect(report.findings.some((finding) => finding.id === "virustotal-scan-failed")).toBe(false);
    expect(stageStatuses.virustotal).toBe("interrupted");
    expect(stageFailureMessages.virustotal).toMatch(/network|fetch failed/i);
  });

  test("retries file lookup once after a timeout", async () => {
    configureVirusTotal();
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error("VirusTotal file_lookup timed out after 1000ms."));
      }
      return Promise.resolve(
        jsonResponse({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 0,
                harmless: 1,
                undetected: 1
              }
            }
          }
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runVirusTotalScan(snapshot);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(scan.summary.status).toBe("completed");
  });

  test("surfaces step diagnosis for HTTP 401 without retrying", async () => {
    configureVirusTotal();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Wrong API key" } }, 401)));

    await expect(runVirusTotalScan(snapshot)).rejects.toMatchObject({
      message: expect.stringMatching(/file lookup failed at step file_lookup \(auth\)/i)
    });
  });
});
