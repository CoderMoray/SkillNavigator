import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import yaml from "js-yaml";
import { z } from "zod";
import {
  findSkillEntryFile,
  findSkillEntryPath,
  isValidSkillIdentifierName,
  isValidSkillSlug,
  releaseTagSchema,
  semverSchema,
  skillPublishMetadataSchema,
  skillSlugSchema,
  SKILL_ENTRY_BASENAMES,
  parseSkillFrontmatterHints,
  type SkillPublishMetadata,
  type SkillValidationIssue,
  type SkillFrontmatterHints
} from "./skill-format.js";

export {
  findSkillEntryFile,
  findSkillEntryPath,
  compareSemver,
  formatPublishMetadataError,
  isSemverGreaterThan,
  buildSkillDownloadFileName,
  parseSkillDownloadVersion,
  sanitizeSkillDownloadBaseName,
  isSkillEntryBasename,
  isSkillEntryPath,
  isValidSkillIdentifierName,
  isValidSkillSlug,
  releaseTagSchema,
  semverSchema,
  skillIdentifierNameSchema,
  skillPublishMetadataSchema,
  skillSlugSchema,
  SKILL_ENTRY_BASENAMES,
  validatePublishMetadataInput,
  parseSkillFrontmatterHints,
  resolveZipRootPrefix,
  resolveZipSkillEntryPath,
  type SkillFrontmatterHints,
  type SkillPublishMetadata,
  type SkillValidationIssue
} from "./skill-format.js";

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const STABLE_ZIP_ENTRY_TIMESTAMP = Date.UTC(1980, 0, 1, 0, 0, 0);

export const skillManifestSchema = z
  .object({
    slug: skillSlugSchema.optional(),
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(1024),
    version: semverSchema.optional(),
    categories: z.array(z.string().trim().min(1).max(64)).optional(),
    topics: z.array(z.string().trim().min(1).max(64)).optional(),
    "release-tags": z.array(releaseTagSchema).optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    tags: z.array(z.string()).optional(),
    supportedAgents: z.array(z.string()).optional(),
    "allowed-tools": z.union([z.array(z.string()), z.string()]).optional(),
    "disallowed-tools": z.union([z.array(z.string()), z.string()]).optional()
  })
  .passthrough();

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export interface SkillFile {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface SkillSnapshot {
  manifest: SkillManifest;
  readme: string;
  files: SkillFile[];
  contentHash: string;
  createdAt: string;
  entryPath?: string;
}

export interface ParsedSkillMarkdown {
  manifest: SkillManifest;
  body: string;
  rawFrontmatter: Record<string, unknown>;
}

export function splitSkillEntryMarkdown(markdown: string): {
  rawFrontmatter: Record<string, unknown>;
  body: string;
} {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    return { rawFrontmatter: {}, body: markdown };
  }

  let rawFrontmatter: Record<string, unknown> = {};
  try {
    const loaded = yaml.load(match[1] ?? "");
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      rawFrontmatter = loaded as Record<string, unknown>;
    }
  } catch {
    rawFrontmatter = {};
  }

  return {
    rawFrontmatter,
    body: match[2] ?? ""
  };
}

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const match = frontmatterPattern.exec(markdown);
  if (!match) {
    throw new Error("Skill entry file must start with YAML frontmatter delimited by ---");
  }

  const rawFrontmatter = yaml.load(match[1] ?? "") as Record<string, unknown>;
  const parsed = skillManifestSchema.parse(rawFrontmatter ?? {});

  return {
    manifest: {
      ...parsed,
      slug: getSkillSlug(parsed)
    },
    body: match[2] ?? "",
    rawFrontmatter: rawFrontmatter ?? {}
  };
}

export function getSkillSlug(manifest: Pick<SkillManifest, "name" | "slug">): string {
  if (manifest.slug !== undefined) {
    if (isValidSkillSlug(manifest.slug)) {
      return manifest.slug;
    }
    throw new Error("slug must be npm-safe lowercase, for example demo-plugin or @scope/demo-plugin");
  }

  if (isValidSkillSlug(manifest.name)) {
    return manifest.name;
  }

  if (isValidSkillIdentifierName(manifest.name)) {
    return manifest.name;
  }

  throw new Error(
    "slug is required when name is not a portable lowercase identifier; add slug or rename name to match ClawHub format"
  );
}

export function applySkillPublishMetadata(
  snapshot: SkillSnapshot,
  input: SkillPublishMetadata
): SkillSnapshot {
  const metadata = normalizePublishMetadata(input);
  const skillEntry = findSkillEntryFile(snapshot.files);
  if (!skillEntry) {
    throw new Error(`Skill package must include one of: ${SKILL_ENTRY_BASENAMES.join(", ")}`);
  }

  const { rawFrontmatter, body } = splitSkillEntryMarkdown(skillEntry.content);
  const frontmatter = {
    ...rawFrontmatter,
    slug: metadata.slug,
    name: metadata.displayName,
    description: metadata.summary,
    version: metadata.version,
    categories: metadata.categories,
    topics: metadata.topics,
    "release-tags": metadata.releaseTags
  };
  const manifest = skillManifestSchema.parse(frontmatter);
  const content = `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true })}---\n${body}`;
  const files = snapshot.files.map((file) =>
    file.path === skillEntry.path
      ? {
          ...file,
          content,
          size: Buffer.byteLength(content, "utf8"),
          sha256: sha256(content)
        }
      : file
  );

  return {
    manifest: {
      ...manifest,
      slug: getSkillSlug(manifest)
    },
    readme: body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: snapshot.createdAt,
    entryPath: skillEntry.path
  };
}

export function applySkillAuthor(snapshot: SkillSnapshot, author: string): SkillSnapshot {
  const trimmedAuthor = author.trim();
  if (!trimmedAuthor) {
    throw new Error("author is required");
  }

  const skillEntry = findSkillEntryFile(snapshot.files);
  if (!skillEntry) {
    throw new Error(`Skill package must include one of: ${SKILL_ENTRY_BASENAMES.join(", ")}`);
  }

  const { rawFrontmatter, body } = splitSkillEntryMarkdown(skillEntry.content);
  const frontmatter = {
    ...rawFrontmatter,
    author: trimmedAuthor
  };
  const manifest = skillManifestSchema.parse(frontmatter);
  const content = `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true })}---\n${body}`;
  const files = snapshot.files.map((file) =>
    file.path === skillEntry.path
      ? {
          ...file,
          content,
          size: Buffer.byteLength(content, "utf8"),
          sha256: sha256(content)
        }
      : file
  );

  return {
    manifest: {
      ...manifest,
      slug: getSkillSlug(manifest)
    },
    readme: body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: snapshot.createdAt,
    entryPath: skillEntry.path
  };
}

export async function readSkillDirectory(rootDir: string): Promise<SkillSnapshot> {
  const absoluteRoot = path.resolve(rootDir);
  const skillEntry = await resolveSkillEntryOnDisk(absoluteRoot);
  const parsed = parseSkillMarkdown(skillEntry.content);
  const files = await readTextFiles(absoluteRoot);
  const contentHash = hashSnapshotFiles(files);

  return {
    manifest: parsed.manifest,
    readme: parsed.body,
    files,
    contentHash,
    createdAt: new Date().toISOString(),
    entryPath: skillEntry.path
  };
}

export async function readSkillPackage(inputPath: string): Promise<SkillSnapshot> {
  const absolutePath = path.resolve(inputPath);
  const stats = await stat(absolutePath);

  if (stats.isDirectory()) {
    return readSkillDirectory(absolutePath);
  }

  if (stats.isFile() && absolutePath.toLowerCase().endsWith(".zip")) {
    return readSkillZip(absolutePath);
  }

  throw new Error("Skill package must be a directory or .zip file");
}

export async function readSkillZip(zipPath: string): Promise<SkillSnapshot> {
  return readSkillZipBuffer(await readFile(zipPath));
}

export async function readSkillPackageZipBuffer(inputPath: string): Promise<Buffer> {
  const absolutePath = path.resolve(inputPath);
  const stats = await stat(absolutePath);

  if (stats.isFile() && absolutePath.toLowerCase().endsWith(".zip")) {
    return readFile(absolutePath);
  }

  const snapshot = await readSkillPackage(absolutePath);
  return skillSnapshotToZipBuffer(snapshot);
}

export async function writeSkillZip(snapshot: SkillSnapshot, outputPath: string): Promise<void> {
  const absoluteOutput = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  const zip = createZipFromSnapshot(snapshot);
  zip.writeZip(absoluteOutput);
}

export function readSkillZipBuffer(buffer: Buffer): SkillSnapshot {
  const zip = new AdmZip(buffer);
  const files = readZipTextFiles(zip);
  const skillEntry = findSkillEntryFile(files);
  if (!skillEntry) {
    throw new Error(
      `Skill zip must include one of ${SKILL_ENTRY_BASENAMES.join(", ")} at the root, or inside a single top-level folder`
    );
  }

  const parsed = parseSkillMarkdown(skillEntry.content);
  return {
    manifest: parsed.manifest,
    readme: parsed.body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: new Date().toISOString(),
    entryPath: skillEntry.path
  };
}

export function readSkillZipBufferLoose(buffer: Buffer): SkillSnapshot {
  const zip = new AdmZip(buffer);
  const files = readZipTextFiles(zip);
  const skillEntry = findSkillEntryFile(files);
  if (!skillEntry) {
    throw new Error(
      `Skill zip must include one of ${SKILL_ENTRY_BASENAMES.join(", ")} at the root, or inside a single top-level folder`
    );
  }

  const { rawFrontmatter, body } = splitSkillEntryMarkdown(skillEntry.content);
  return {
    manifest: buildLooseManifest(rawFrontmatter),
    readme: body,
    files,
    contentHash: hashSnapshotFiles(files),
    createdAt: new Date().toISOString(),
    entryPath: skillEntry.path
  };
}

export function readSkillZipFrontmatterHints(buffer: Buffer): {
  entryPath: string;
  frontmatter: SkillFrontmatterHints | null;
} {
  const zip = new AdmZip(buffer);
  const files = readZipTextFiles(zip);
  const skillEntry = findSkillEntryFile(files);
  if (!skillEntry) {
    throw new Error(
      `Skill zip must include one of ${SKILL_ENTRY_BASENAMES.join(", ")} at the root, or inside a single top-level folder`
    );
  }

  return {
    entryPath: skillEntry.path,
    frontmatter: parseSkillFrontmatterHints(skillEntry.content)
  };
}

export function skillSnapshotToZipBuffer(snapshot: SkillSnapshot): Buffer {
  return createZipFromSnapshot(snapshot).toBuffer();
}

export function validateSkillSnapshot(snapshot: SkillSnapshot): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
  const skillEntry = findSkillEntryFile(snapshot.files);

  if (!skillEntry) {
    issues.push({
      code: "missing-skill-entry",
      message: `Skill package must include one of: ${SKILL_ENTRY_BASENAMES.join(", ")}`,
      path: SKILL_ENTRY_BASENAMES[0]
    });
  }

  const parsed = skillManifestSchema.safeParse(snapshot.manifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "invalid-frontmatter",
        message: issue.message,
        path: issue.path.join(".")
      });
    }
  } else {
    try {
      getSkillSlug(parsed.data);
    } catch (error) {
      issues.push({
        code: "invalid-slug",
        message: error instanceof Error ? error.message : "Invalid slug",
        path: "slug"
      });
    }

    if (!parsed.data.version) {
      issues.push({
        code: "version-missing",
        message: "Frontmatter must declare a SemVer version",
        path: "version"
      });
    }
  }

  for (const file of snapshot.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      issues.push({
        code: "unsafe-path",
        message: "Skill file path must stay inside the skill directory",
        path: file.path
      });
    }
  }

  return issues;
}

export async function writeSkillSnapshot(snapshot: SkillSnapshot, targetDir: string): Promise<void> {
  const absoluteTarget = path.resolve(targetDir);
  await mkdir(absoluteTarget, { recursive: true });

  for (const file of snapshot.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      throw new Error(`Refusing to write unsafe file path: ${file.path}`);
    }

    const outputPath = path.join(absoluteTarget, file.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, file.content, "utf8");
  }
}

export function normalizeTools(value: SkillManifest["allowed-tools"]): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value
    .split(/[,\s]+/)
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function normalizePublishMetadata(input: SkillPublishMetadata): SkillPublishMetadata {
  const metadata = skillPublishMetadataSchema.parse(input);
  return {
    ...metadata,
    categories: uniqueStrings(metadata.categories),
    topics: uniqueStrings(metadata.topics),
    releaseTags: uniqueStrings(metadata.releaseTags)
  };
}

function buildLooseManifest(rawFrontmatter: Record<string, unknown>): SkillManifest {
  const name =
    typeof rawFrontmatter.name === "string" && rawFrontmatter.name.trim()
      ? rawFrontmatter.name.trim()
      : "pending";
  const description =
    typeof rawFrontmatter.description === "string" && rawFrontmatter.description.trim()
      ? rawFrontmatter.description.trim()
      : "pending";

  return {
    name,
    description
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function resolveSkillEntryOnDisk(rootDir: string): Promise<{ path: string; content: string }> {
  for (const basename of SKILL_ENTRY_BASENAMES) {
    const candidate = path.join(rootDir, basename);
    try {
      const content = await readFile(candidate, "utf8");
      return { path: basename, content };
    } catch {
      continue;
    }
  }

  const entries = await readdir(rootDir);
  for (const basename of SKILL_ENTRY_BASENAMES) {
    const match = entries.find((entry) => entry.toLowerCase() === basename.toLowerCase());
    if (!match) {
      continue;
    }
    const content = await readFile(path.join(rootDir, match), "utf8");
    return { path: match, content };
  }

  throw new Error(`Skill package must include one of: ${SKILL_ENTRY_BASENAMES.join(", ")}`);
}

async function readTextFiles(rootDir: string, currentDir = rootDir): Promise<SkillFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: SkillFile[] = [];

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const stats = await stat(absolutePath);
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));

    if (entry.isDirectory()) {
      files.push(...(await readTextFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (stats.size > 50 * 1024 * 1024) {
      throw new Error(`File exceeds the 50MB bundle limit: ${relativePath}`);
    }

    if (stats.size > 1024 * 1024) {
      throw new Error(`File is too large for text inspection: ${relativePath}`);
    }

    const content = await readFile(absolutePath, "utf8");
    files.push({
      path: relativePath,
      content,
      size: stats.size,
      sha256: sha256(content)
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function shouldSkipEntry(name: string): boolean {
  if (name === ".git" || name === "node_modules" || name === ".data" || name === "dist") {
    return true;
  }

  if (name === ".clawhub" || name === ".clawdhub") {
    return true;
  }

  return false;
}

function readZipTextFiles(zip: AdmZip): SkillFile[] {
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      entry,
      path: normalizeZipEntryPath(entry.entryName)
    }))
    .filter((item) => item.path && !shouldSkipZipPath(item.path));

  const prefix = resolveZipRootPrefix(entries.map((item) => item.path));
  const files: SkillFile[] = [];
  let totalBytes = 0;

  for (const item of entries) {
    const relativePath = stripZipPrefix(item.path, prefix);
    if (!relativePath || shouldSkipZipPath(relativePath)) {
      continue;
    }

    const buffer = item.entry.getData();
    totalBytes += buffer.byteLength;
    if (totalBytes > 50 * 1024 * 1024) {
      throw new Error("Skill zip exceeds the 50MB bundle limit");
    }

    if (buffer.byteLength > 1024 * 1024) {
      throw new Error(`File is too large for text inspection: ${relativePath}`);
    }

    const content = buffer.toString("utf8");
    files.push({
      path: relativePath,
      content,
      size: buffer.byteLength,
      sha256: sha256(content)
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function createZipFromSnapshot(snapshot: SkillSnapshot): AdmZip {
  const zip = new AdmZip();
  for (const file of [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (file.path.includes("..") || path.isAbsolute(file.path)) {
      throw new Error(`Refusing to zip unsafe file path: ${file.path}`);
    }
    const entry = zip.addFile(file.path, Buffer.from(file.content, "utf8"));
    entry.header.time = new Date(STABLE_ZIP_ENTRY_TIMESTAMP);
  }
  return zip;
}

function normalizeZipEntryPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function shouldSkipZipPath(value: string): boolean {
  if (value.includes("..") || path.isAbsolute(value)) {
    throw new Error(`Unsafe zip entry path: ${value}`);
  }

  const segments = value.split("/");
  if (segments.some((segment) => shouldSkipEntry(segment))) {
    return true;
  }

  if (segments.some((segment) => segment.startsWith(".") && !isClawHubIgnoreFile(segment))) {
    return true;
  }

  return false;
}

function isClawHubIgnoreFile(segment: string): boolean {
  return segment === ".clawhubignore" || segment === ".clawdhubignore" || segment === ".gitignore";
}

function resolveZipRootPrefix(paths: string[]): string {
  if (findSkillEntryPath(paths.filter((item) => !item.includes("/")))) {
    return "";
  }

  const firstSegments = new Set(paths.map((item) => item.split("/")[0]).filter(Boolean));
  if (firstSegments.size !== 1) {
    return "";
  }

  const [prefix] = [...firstSegments];
  if (!prefix) {
    return "";
  }
  const prefixedPaths = paths.filter((item) => item.startsWith(`${prefix}/`));
  return findSkillEntryPath(prefixedPaths.map((item) => item.slice(prefix.length + 1))) ? `${prefix}/` : "";
}

function stripZipPrefix(value: string, prefix: string): string {
  return prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function hashSnapshotFiles(files: SkillFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
