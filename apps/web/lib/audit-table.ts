import { saveBlobAsFile } from "./api";
import { formatDateTime, verdictLabel } from "./format";
import { toSkillSpectorSafetyScore } from "./skillspector-summary";
import type { FunctionalEvaluationReport, RegistrySkill, InspectionVerdict } from "./types";

export interface AuditRow {
  slug: string;
  skillName: string;
  creatorLabel: string;
  creatorHandle?: string;
  version: string;
  status: InspectionVerdict;
  publishDate: string;
  skillSpectorSafetyScore: number | null;
  haluCatchScore: number | null;
}

export interface AuditExportRecord {
  rank: number;
  skill_name: string;
  creator: string;
  version: string;
  status: string;
  publish_date: string;
  skillspector_safety_score: number | "";
  halucatch_score: number | "";
}

const EXPORT_HEADERS: (keyof AuditExportRecord)[] = [
  "rank",
  "skill_name",
  "creator",
  "version",
  "status",
  "publish_date",
  "skillspector_safety_score",
  "halucatch_score"
];

export function buildAuditRows(skills: RegistrySkill[]): AuditRow[] {
  const rows: AuditRow[] = [];

  for (const skill of skills) {
    const latest = skill.versions[skill.latestVersion];
    if (!latest) {
      continue;
    }

    const owner =
      skill.contributors.find((contributor) => contributor.role === "owner") ?? skill.contributors[0];

    rows.push({
      slug: skill.slug,
      skillName: skill.name,
      creatorLabel: owner?.name ?? owner?.username ?? "—",
      creatorHandle: owner?.username,
      version: latest.version,
      status: latest.status,
      publishDate: latest.createdAt,
      skillSpectorSafetyScore: latest.inspection.skillSpector
        ? toSkillSpectorSafetyScore(latest.inspection.skillSpector.riskScore)
        : null,
      haluCatchScore: resolveHaluCatchScore(latest.evaluation)
    });
  }

  return rows;
}

export type AuditSortField = "publish_date" | "skillspector_safety_score" | "halucatch_score";
export type AuditSortDirection = "asc" | "desc";

export function sortAuditRows(
  rows: AuditRow[],
  field: AuditSortField,
  direction: AuditSortDirection
): AuditRow[] {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    switch (field) {
      case "publish_date":
        return comparePublishDate(left.publishDate, right.publishDate, direction);
      case "skillspector_safety_score":
        return compareNullableNumber(left.skillSpectorSafetyScore, right.skillSpectorSafetyScore, direction);
      case "halucatch_score":
        return compareNullableNumber(left.haluCatchScore, right.haluCatchScore, direction);
      default:
        return 0;
    }
  });
  return sorted;
}

function comparePublishDate(left: string, right: string, direction: AuditSortDirection): number {
  const diff = publishTime(left) - publishTime(right);
  return direction === "asc" ? diff : -diff;
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: AuditSortDirection
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  const diff = left - right;
  return direction === "asc" ? diff : -diff;
}

function publishTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function auditRowsToExportRecords(rows: AuditRow[]): AuditExportRecord[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    skill_name: row.skillName,
    creator: formatCreatorForExport(row),
    version: row.version,
    status: verdictLabel(row.status),
    publish_date: formatDateTime(row.publishDate),
    skillspector_safety_score: row.skillSpectorSafetyScore ?? "",
    halucatch_score: row.haluCatchScore ?? ""
  }));
}

export function downloadAuditCsv(rows: AuditRow[]): void {
  const records = auditRowsToExportRecords(rows);
  const lines = [
    EXPORT_HEADERS.join(","),
    ...records.map((record) => EXPORT_HEADERS.map((header) => escapeCsvCell(record[header])).join(","))
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  saveBlobAsFile(blob, buildAuditExportFileName("csv"));
}

export async function downloadAuditXlsx(rows: AuditRow[]): Promise<void> {
  const XLSX = await import("xlsx");
  const records = auditRowsToExportRecords(rows);
  const worksheet = XLSX.utils.json_to_sheet(records, { header: [...EXPORT_HEADERS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "audits");
  XLSX.writeFile(workbook, buildAuditExportFileName("xlsx"));
}

function resolveHaluCatchScore(evaluation: FunctionalEvaluationReport | undefined): number | null {
  if (!evaluation || evaluation.provider !== "halucatch-adapter") {
    return null;
  }
  return evaluation.score;
}

function formatCreatorForExport(row: AuditRow): string {
  if (row.creatorHandle) {
    return `${row.creatorLabel} (@${row.creatorHandle})`;
  }
  return row.creatorLabel;
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildAuditExportFileName(extension: "csv" | "xlsx"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `skill-audits-${stamp}.${extension}`;
}
