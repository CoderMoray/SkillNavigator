#!/usr/bin/env node
/**
 * VirusTotal Public API lookup rate-limit probe.
 *
 * Usage:
 *   node scripts/vt-lookup-stress.mjs [--phase same|distinct|zip-vs-inner] [--delay-ms 0]
 *
 * Measures when HTTP 429 appears and whether lookups are per HTTP request
 * (one SHA-256 id) vs per file inside a ZIP archive.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const apiKey = process.env.VIRUSTOTAL_API_KEY?.trim();
if (!apiKey) {
  console.error("VIRUSTOTAL_API_KEY is required in .env");
  process.exit(1);
}

const BASE = "https://www.virustotal.com/api/v3";
const args = process.argv.slice(2);
const phase = readArgValue(args, "--phase") ?? "same";
const delayMs = Number(readArgValue(args, "--delay-ms") ?? "0");
const burstCount = Number(readArgValue(args, "--count") ?? "8");

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function sleep(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function buildMinimalZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(0, 36);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBytes, data);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, central, end]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

async function lookupHash(hash, label) {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}/files/${hash}`, {
      headers: { "x-apikey": apiKey }
    });
    const elapsed = Date.now() - started;
    let bodyPreview = "";
    try {
      const text = await response.text();
      bodyPreview = text.slice(0, 160);
    } catch {
      bodyPreview = "<unreadable>";
    }

    const rateHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      if (/rate|quota|retry/i.test(key)) {
        rateHeaders[key] = value;
      }
    }

    return {
      label,
      hash: hash.slice(0, 16),
      status: response.status,
      elapsed,
      rateHeaders,
      bodyPreview
    };
  } catch (error) {
    return {
      label,
      hash: hash.slice(0, 16),
      status: "ERR",
      elapsed: Date.now() - started,
      rateHeaders: {},
      bodyPreview: error instanceof Error ? error.message : String(error)
    };
  }
}

async function burstLookups(items) {
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    results.push(await lookupHash(items[index].hash, items[index].label));
  }
  return results;
}

function printResults(title, results) {
  console.log(`\n=== ${title} ===`);
  for (const result of results) {
    console.log(
      `[${result.label}] hash=${result.hash}… status=${result.status} elapsed=${result.elapsed}ms`
    );
    if (Object.keys(result.rateHeaders).length > 0) {
      console.log("  rate headers:", result.rateHeaders);
    }
    if (result.status === 429 || result.status >= 400) {
      console.log("  body:", result.bodyPreview);
    }
  }
  const ok = results.filter((result) => result.status === 200).length;
  const missing = results.filter((result) => result.status === 404).length;
  const throttled = results.filter((result) => result.status === 429).length;
  console.log(`Summary: 200=${ok}, 404=${missing}, 429=${throttled}, total=${results.length}`);
}

async function loadPlatformZipHash() {
  const { readSkillPackage, skillSnapshotToZipBuffer } = await import("@skill-platform/skill-spec");
  const snapshot = await readSkillPackage(resolve("examples/demo-skill"));
  const archive = skillSnapshotToZipBuffer(snapshot);
  return { archive, hash: sha256(archive) };
}

async function phaseSameHash() {
  const { hash } = await loadPlatformZipHash();
  const items = Array.from({ length: burstCount }, (_, index) => ({
    label: `same-${index + 1}`,
    hash
  }));
  printResults(
    `Repeat GET /files/{hash} on SAME Skill ZIP hash (${burstCount} requests, delay=${delayMs}ms)`,
    await burstLookups(items)
  );
}

async function phaseDistinctHashes() {
  const items = Array.from({ length: burstCount }, (_, index) => ({
    label: `distinct-${index + 1}`,
    hash: sha256(Buffer.from(`vt-stress-${Date.now()}-${index}-${Math.random()}`))
  }));
  printResults(
    `GET /files/{hash} on DISTINCT random hashes (${burstCount} requests, delay=${delayMs}ms)`,
    await burstLookups(items)
  );
}

async function phaseZipVsInner() {
  const a = Buffer.from("alpha-inner-file-content-v1\n");
  const b = Buffer.from("beta-inner-file-content-v1\n");
  const zipOne = buildMinimalZip([
    { name: "SKILL.md", data: a },
    { name: "README.md", data: b }
  ]);
  const zipTwo = buildMinimalZip([
    { name: "SKILL.md", data: Buffer.from("alpha-inner-file-content-v2\n") },
    { name: "README.md", data: b }
  ]);

  const zipOneHash = sha256(zipOne);
  const zipTwoHash = sha256(zipTwo);
  const skillMdHash = sha256(a);
  const readmeHash = sha256(b);

  console.log("\n=== Hash model (platform vs inner files) ===");
  console.log("ZIP #1 hash (2 inner files):", zipOneHash);
  console.log("ZIP #2 hash (changed SKILL.md):", zipTwoHash);
  console.log("Inner SKILL.md hash alone:", skillMdHash);
  console.log("Inner README.md hash alone:", readmeHash);
  console.log(
    "Platform publish uses ONE lookup for SHA-256(entire ZIP bytes), not per inner path."
  );

  const items = [
    { label: "zip#1", hash: zipOneHash },
    { label: "zip#2", hash: zipTwoHash },
    { label: "inner-SKILL.md", hash: skillMdHash },
    { label: "inner-README.md", hash: readmeHash },
    { label: "zip#1-again", hash: zipOneHash }
  ];

  printResults(
    "Lookup ZIP hashes vs standalone inner-file content hashes (5 requests)",
    await burstLookups(items)
  );
}

async function phasePlatformFlow() {
  const { archive, hash } = await loadPlatformZipHash();
  console.log("\n=== Platform publish API call pattern (one Skill ZIP) ===");
  console.log("archive bytes:", archive.length);
  console.log("lookup hash:", hash);
  console.log("Typical publish with cache hit: 1x GET /files/{zipSha256}");
  console.log("Typical publish with upload-on-miss: 1x GET + 1x POST + Nx GET /analyses + 0-5x GET /files");
  console.log("Each line above is a separate HTTP request against the 4 req/min key quota.");

  printResults(
    "Simulated cache-hit publish (1 lookup)",
    await burstLookups([{ label: "platform-lookup", hash }])
  );
}

console.log("VirusTotal lookup stress probe");
console.log("Public API documented cap: 4 requests/minute, 500/day (per API key)");
console.log("phase:", phase, "burst:", burstCount, "delayMs:", delayMs);

switch (phase) {
  case "same":
    await phaseSameHash();
    break;
  case "distinct":
    await phaseDistinctHashes();
    break;
  case "zip-vs-inner":
    await phaseZipVsInner();
    break;
  case "platform":
    await phasePlatformFlow();
    break;
  case "all":
    await phasePlatformFlow();
    await phaseZipVsInner();
    await phaseSameHash();
    printConclusions();
    break;
  default:
    console.error(`Unknown phase: ${phase}`);
    process.exit(1);
}

function printConclusions() {
  console.log(`
=== Conclusions ===
1) This platform treats each Skill publish ZIP as ONE file object:
   SHA-256(skillSnapshotToZipBuffer(snapshot)) → single GET /files/{hash}.
   Inner paths (SKILL.md, scripts/, etc.) are NOT looked up separately.

2) VirusTotal API quota is consumed per HTTP request (any endpoint), not per
   engine and not per file inside a ZIP. A 404 lookup still counts as a request.

3) Upload-on-miss adds more requests: GET /files + POST /files + GET /analyses*
   (+ optional GET /files for threat_verdict). Each counts toward rate limits.

4) Public docs: 4 req/min & 500/day per key. If your key never returns 429 in
   stress tests, it may be above Public tier—still throttle clients in production.
`);
}
