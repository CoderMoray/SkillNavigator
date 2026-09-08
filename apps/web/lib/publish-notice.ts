import type { InspectionVerdict } from "./types";

const STORAGE_KEY = "skill-platform-publish-notice";

export interface PublishNotice {
  slug: string;
  name: string;
  version: string;
  verdict: InspectionVerdict;
  isNewVersion: boolean;
}

/** In-memory copy after sessionStorage is cleared; survives React Strict Mode remounts until dismissed. */
let activePublishNotice: PublishNotice | null = null;

export function savePublishNotice(notice: PublishNotice): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
}

export function readPublishNotice(): PublishNotice | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PublishNotice;
  } catch {
    return null;
  }
}

/** Claim a pending publish notice for display (sessionStorage is cleared on first claim). */
export function claimPublishNotice(): PublishNotice | null {
  if (activePublishNotice) {
    return activePublishNotice;
  }

  const notice = readPublishNotice();
  if (!notice) {
    return null;
  }

  clearPublishNotice();
  activePublishNotice = notice;
  return notice;
}

/** @deprecated Use claimPublishNotice */
export function consumePublishNotice(): PublishNotice | null {
  return claimPublishNotice();
}

export function releasePublishNotice(): void {
  activePublishNotice = null;
}

export function clearPublishNotice(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
  activePublishNotice = null;
}

export function publishNoticeTitle(notice: PublishNotice): string {
  if (notice.verdict === "published") {
    return notice.isNewVersion ? "新版本发布成功" : "Skill 发布成功";
  }
  if (notice.verdict === "needs-inspection") {
    return notice.isNewVersion ? "新版本发布成功（需复核）" : "Skill 发布成功（需复核）";
  }
  return notice.isNewVersion ? "新版本发布被拒绝" : "Skill 发布被拒绝";
}

export function publishNoticeDescription(notice: PublishNotice): string {
  const label = `${notice.name} v${notice.version}`;

  if (notice.verdict === "published") {
    return `${label} 已通过审查并发布到平台。`;
  }
  if (notice.verdict === "needs-inspection") {
    return `${label} 已发布到平台。审查存在需关注的 finding，建议在详情页「审查与评估」查看后再推广。`;
  }
  return `${label} 未通过审查，请查看详情页了解原因并修改后重新发布。`;
}
