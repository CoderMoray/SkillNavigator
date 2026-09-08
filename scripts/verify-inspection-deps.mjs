#!/usr/bin/env node
/**
 * Preflight check for the review providers (SkillSpector / HaluCatch /
 * VirusTotal) plus the Python runtimes they depend on.
 *
 * Run via `npm run verify:inspection-deps`. setup.sh runs this before seeding in
 * production (ON_DEV=false) and fails fast when a required provider is not
 * ready; a provider explicitly disabled with `*_ENABLED=false` is skipped and
 * reported as OK. Pass `--strict` (or set REVIEW_DEPS_STRICT=true) to treat
 * missing VirusTotal configuration as an error instead of a warning.
 *
 * Exit code: 0 when all *enabled* providers are ready (warnings allowed);
 * 1 when a required provider is missing/broken.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const strictMode =
  process.argv.includes("--strict") ||
  process.env.REVIEW_DEPS_STRICT?.trim().toLowerCase() === "true";

const statuses = []; // { level: "ok" | "warn" | "error", line: string }

function record(level, line) {
  statuses.push({ level, line });
  const icon = level === "ok" ? "  ✅" : level === "warn" ? "  ⚠️ " : "  ❌ ";
  console.log(`${icon} ${line}`);
}

function isDisabled(value) {
  return value?.trim().toLowerCase() === "false";
}

function pythonCandidates(configured) {
  if (configured?.trim()) {
    return [configured.trim()];
  }
  return process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
}

function probePython(candidates, script) {
  let lastError = null;
  for (const command of candidates) {
    const result = spawnSync(command, ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      timeout: 30_000,
    });
    if (result.status === 0) {
      return { ok: true, command, stdout: (result.stdout ?? "").trim() };
    }
    lastError = (result.stderr ?? result.stdout ?? "unknown error").trim();
  }
  return { ok: false, error: lastError };
}

function pythonVersionScript() {
  return "import sys; print('.'.join(map(str, sys.version_info[:3])))";
}

function compareVersion(minor) {
  return (
    minor.length === 3 &&
    minor.every((part) => Number.isInteger(part))
  );
}

function versionAtLeast(current, minimum) {
  for (let i = 0; i < minimum.length; i += 1) {
    if (current[i] > minimum[i]) return true;
    if (current[i] < minimum[i]) return false;
  }
  return true;
}

// ------------------------------------------------------------------ //
// SkillSpector
// ------------------------------------------------------------------ //
function checkSkillSpector() {
  const enabled = isDisabled(process.env.SKILLSPECTOR_ENABLED) ? false : true;
  if (!enabled) {
    record("ok", "SkillSpector: disabled via SKILLSPECTOR_ENABLED=false (skipped)");
    return;
  }

  const probes = probePython(
    pythonCandidates(process.env.SKILLSPECTOR_PYTHON),
    pythonVersionScript()
  );
  if (!probes.ok) {
    record(
      "error",
      `SkillSpector: no Python with pip found${process.env.SKILLSPECTOR_PYTHON ? " (SKILLSPECTOR_PYTHON set)" : ""}. ${probes.error}`
    );
    record(
      "error",
      "SkillSpector fix: set SKILLSPECTOR_PYTHON to a Python 3.12+ interpreter, then run `npm run setup:skillspector` (installs from the vendored source; no PyPI needed for SkillSpector itself)."
    );
    return;
  }
  const version = probes.stdout.split(".").map(Number);
  const versionOk = compareVersion(version) && versionAtLeast(version, [3, 12, 0]);
  if (!versionOk) {
    record(
      "error",
      `SkillSpector: Python ${probes.command} is ${probes.stdout}; SkillSpector requires 3.12+.`
    );
    record("error", "SkillSpector fix: point SKILLSPECTOR_PYTHON at a Python 3.12+ interpreter, then run `npm run setup:skillspector`.");
    return;
  }

  const skillspectorDir = process.env.SKILLSPECTOR_DIR?.trim();
  const sourcePaths = [];
  if (skillspectorDir) {
    sourcePaths.push(path.join(skillspectorDir, "src"), skillspectorDir);
  } else {
    sourcePaths.push(path.join(repoRoot, "packages", "SkillSpector-main", "src"));
  }
  const importProbe = probePython([probes.command], [
    "import sys",
    ...sourcePaths.map((p) => `sys.path.insert(0, ${JSON.stringify(p)})`),
    "import skillspector.graph",
  ].join("; "));
  if (!importProbe.ok) {
    record("error", `SkillSpector: 'import skillspector.graph' failed under ${probes.command}. ${importProbe.error}`);
    record("error", "SkillSpector fix: run `npm run setup:skillspector` (installs from the vendored source into the local interpreter) or set SKILLSPECTOR_DIR/SKILLSPECTOR_PYTHON.");
    return;
  }
  record("ok", `SkillSpector: ready (${probes.command}, Python ${probes.stdout})`);
}

// ------------------------------------------------------------------ //
// HaluCatch
// ------------------------------------------------------------------ //
function checkHaluCatch() {
  const enabled = isDisabled(process.env.HALUCATCH_ENABLED) ? false : true;
  if (!enabled) {
    record("ok", "HaluCatch: disabled via HALUCATCH_ENABLED=false (static taskset evaluator is used)");
    return;
  }

  const haluCatchDir =
    process.env.HALUCATCH_DIR?.trim() || path.join(repoRoot, "packages", "halucatch-1.8.8");
  const probes = probePython(
    pythonCandidates(process.env.HALUCATCH_PYTHON),
    pythonVersionScript()
  );
  if (!probes.ok) {
    record("error", `HaluCatch: no Python found. ${probes.error}`);
    record("error", "HaluCatch fix: set HALUCATCH_PYTHON to a Python 3.8+ interpreter.");
    return;
  }
  const version = probes.stdout.split(".").map(Number);
  if (compareVersion(version) && !versionAtLeast(version, [3, 8, 0])) {
    record("error", `HaluCatch: Python ${probes.command} is ${probes.stdout}; HaluCatch requires 3.8+.`);
    record("error", "HaluCatch fix: point HALUCATCH_PYTHON at a Python 3.8+ interpreter.");
    return;
  }

  const modules = [
    "halucatch.classifier",
    "halucatch.config",
    "halucatch.evaluators",
    "halucatch.reporter",
    "halucatch.scanner",
  ];
  const importProbe = probePython([probes.command], [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(haluCatchDir)})`,
    ...modules.map((m) => `import ${m}`),
  ].join("; "));
  if (!importProbe.ok) {
    record("error", `HaluCatch: vendored modules are not importable from ${haluCatchDir}. ${importProbe.error}`);
    record("error", "HaluCatch fix: keep packages/halucatch-1.8.8 intact (or set HALUCATCH_DIR), then re-run this check.");
    return;
  }
  record("ok", `HaluCatch: ready (${probes.command}, Python ${probes.stdout || "3.8+"}, ${haluCatchDir})`);
}

// ------------------------------------------------------------------ //
// VirusTotal
// ------------------------------------------------------------------ //
function checkVirusTotal() {
  const enabled = isDisabled(process.env.VIRUSTOTAL_ENABLED) ? false : true;
  const apiKey = process.env.VIRUSTOTAL_API_KEY?.trim();
  if (!enabled) {
    record("ok", "VirusTotal: disabled via VIRUSTOTAL_ENABLED=false (skipped)");
    return;
  }
  if (!apiKey) {
    const line =
      "VirusTotal: VIRUSTOTAL_API_KEY is not set — the provider stays disabled (this is a valid config, not an error).";
    if (strictMode) {
      record("error", `${line} Set VIRUSTOTAL_API_KEY and VIRUSTOTAL_ENABLED=true to enable hash lookups.`);
    } else {
      record("warn", `${line} Enable it by setting VIRUSTOTAL_API_KEY (VIRUSTOTAL_ENABLED=true).`);
    }
    return;
  }
  const uploadOnMiss = process.env.VIRUSTOTAL_UPLOAD_ON_MISS?.trim().toLowerCase() === "true";
  record("ok", "VirusTotal: API key present, provider enabled.");
  record(
    "warn",
    uploadOnMiss
      ? "VirusTotal: VIRUSTOTAL_UPLOAD_ON_MISS=true — unknown archives may be uploaded to VirusTotal (third-party disclosure)."
      : "VirusTotal: VIRUSTOTAL_UPLOAD_ON_MISS=false — only known-hash lookups run; set true for full analysis if you accept upload disclosure."
  );
}

function run() {
  console.log("=== Review provider dependency preflight ===");
  checkSkillSpector();
  checkHaluCatch();
  checkVirusTotal();

  const errors = statuses.filter((item) => item.level === "error").length;
  if (errors > 0) {
    console.log("");
    console.log(`Preflight FAILED: ${errors} required provider(s) are not ready.`);
    console.log("Fix the issues above (or disable the provider with *_ENABLED=false) and re-run `npm run verify:inspection-deps`.");
    process.exit(1);
  }
  console.log("");
  console.log("Preflight OK.");
  process.exit(0);
}

run();
