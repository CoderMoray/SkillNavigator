"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { MarkdownContent } from "../../../components/MarkdownContent";
import type { LucideIcon } from "lucide-react";
import { compareSemver, isSkillEntryPath } from "@skill-platform/skill-spec/skill-format";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  ExternalLink,
  FileCode2,
  FileText,
  Files,
  History,
  MessageSquare,
  Package,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  Users,
  X
} from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { ConfirmToast } from "../../../components/ConfirmToast";
import { ErrorToast } from "../../../components/ErrorToast";
import { SuccessToast } from "../../../components/SuccessToast";
import { UsernameSuggestInput } from "../../../components/UsernameSuggestInput";
import { HaluCatchRadar } from "../../../components/HaluCatchRadar";
import { FindingConfidenceBadge } from "../../../components/FindingConfidenceBadge";
import { SkillCategoryLabel } from "../../../components/SkillCategoryIcon";
import { EvaluationBadge, SeverityBadge, VerdictBadge } from "../../../components/StatusBadge";
import { findSkillContributorByHandle, isSkillContributor, isSkillOwner } from "../../../lib/skill-contributors";
import { buildSkillInstallPrompt } from "../../../lib/skill-install-prompt";
import { skillnavInstallExample } from "../../../lib/cli-examples";
import { copyTextToClipboard } from "../../../lib/copy-text";
import {
  addSkillContributor,
  addSkillRating,
  bookmarkSkill,
  createSkillIssue,
  deleteSkill,
  downloadSkillVersion,
  resolveDownloadedSkillVersion,
  getCurrentUser,
  getSkill,
  getSkills,
  republishSkill,
  republishSkillVersion,
  removeSkillContributor,
  saveBlobAsFile,
  unpublishSkill,
  unpublishSkillVersion,
  unbookmarkSkill
} from "../../../lib/api";
import { getAuthToken } from "../../../lib/auth-token";
import { creatorProfilePath } from "../../../lib/creators";
import { formatDateTime, formatFileSize, formatNumber } from "../../../lib/format";
import { buildHaluCatchReportPath, extractHaluCatchSummary } from "../../../lib/halucatch-report";
import { localizeSkillSpectorFinding } from "@skill-platform/review-engine/skillspector-i18n";
import {
  formatSkillSpectorRecommendation,
  formatSkillSpectorRiskSeverity,
  formatSkillSpectorScanMode,
  formatSkillSpectorSummaryLine,
  toSkillSpectorSafetyScore
} from "../../../lib/skillspector-summary";
import { averageHaluCatchRadarScores, type HaluCatchRadarScores } from "../../../lib/halucatch-scores";
import { formatVirusTotalThreatVerdict, resolveVirusTotalEngineTotal } from "../../../lib/virustotal-summary";
import type { PublicUser, RegistryContributor, RegistryIssue, RegistrySkill } from "../../../lib/types";

type DetailPanel =
  | "skill-md"
  | "skill-card"
  | "files"
  | "versions"
  | "quality"
  | "community";

interface DetailCard {
  id: DetailPanel;
  title: string;
  icon: LucideIcon;
  meta: string;
}

function asList(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function formatRatingError(message: string): string {
  if (message === "rating_already_submitted") {
    return "你已对该版本提交过评分，每个版本每位用户仅可评分一次。";
  }
  return message;
}

function formatContributorError(message: string): string {
  if (message === "user_not_found") {
    return "未找到该用户名，请确认对方已在平台注册。";
  }
  if (message === "contributor_username_required") {
    return "请输入 contributor 用户名。";
  }
  if (message === "invalid_contributor_role") {
    return "仅可添加 contributor 角色，不能指定 owner。";
  }
  if (message === "cannot_modify_owner_contributor") {
    return "不能修改 Skill 所有者的 contributor 记录。";
  }
  if (message === "contributor_already_exists") {
    return "已经添加该用户。";
  }
  if (message === "only_owner_can_add_contributors") {
    return "仅 Skill Owner 可添加 contributor。";
  }
  if (message === "only_owner_can_remove_contributors") {
    return "仅 Skill Owner 可移除 contributor。";
  }
  if (message === "contributor_not_found") {
    return "未找到该 contributor。";
  }
  if (message === "Unauthorized") {
    return "请先登录后再管理 contributor。";
  }
  if (message === "skill_not_found") {
    return "Skill 不存在或已被删除。";
  }
  return message;
}

function formatVersionManageError(message: string): string {
  if (message === "cannot_unpublish_latest_version") {
    return "最新版本不能下架，请先发布更新的版本后再下架旧版本。";
  }
  if (message === "version_already_unpublished") {
    return "该版本已下架。";
  }
  if (message === "version_already_published") {
    return "该版本已在上架状态。";
  }
  if (message === "version_unpublished") {
    return "该版本已下架，无法下载。";
  }
  return message;
}

function extractVirusTotalLegacyError(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }
  const prefix = "VirusTotal package scan could not run: ";
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

export default function SkillDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const skillSlug = decodeURIComponent(params.name);
  const [skill, setSkill] = useState<RegistrySkill | null>(null);
  const [viewer, setViewer] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<DetailPanel>("skill-md");
  const [selectedVersionName, setSelectedVersionName] = useState<string | null>(null);
  const [expandedVersionNames, setExpandedVersionNames] = useState<Set<string>>(() => new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState("");
  const [addingContributor, setAddingContributor] = useState(false);
  const [removeContributorConfirm, setRemoveContributorConfirm] = useState<{ id: string; name: string } | null>(null);
  const [removingContributorId, setRemovingContributorId] = useState<string | null>(null);
  const [issueType, setIssueType] = useState<RegistryIssue["type"]>("bug");
  const [issueSeverity, setIssueSeverity] = useState<RegistryIssue["severity"]>("medium");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueError, setIssueError] = useState<string | null>(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [republishModalOpen, setRepublishModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [unpublishingSkill, setUnpublishingSkill] = useState(false);
  const [republishingSkill, setRepublishingSkill] = useState(false);
  const [deletingSkill, setDeletingSkill] = useState(false);
  const [versionManageModal, setVersionManageModal] = useState<{ action: "unpublish" | "republish"; version: string } | null>(null);
  const [managingVersion, setManagingVersion] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [platformAverageHaluCatch, setPlatformAverageHaluCatch] = useState<HaluCatchRadarScores | undefined>();
  const [platformHaluCatchSampleSize, setPlatformHaluCatchSampleSize] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPlatformHaluCatchAverages() {
      try {
        const summaries = await getSkills();
        const details = await Promise.all(summaries.map((item) => getSkill(item.slug)));
        if (cancelled) {
          return;
        }
        const evaluations = details
          .map((item) => item.versions[item.latestVersion]?.evaluation)
          .filter((evaluation): evaluation is NonNullable<typeof evaluation> => Boolean(evaluation));
        setPlatformAverageHaluCatch(averageHaluCatchRadarScores(evaluations));
        setPlatformHaluCatchSampleSize(
          evaluations.filter((evaluation) => evaluation.provider === "halucatch-adapter").length
        );
      } catch {
        if (!cancelled) {
          setPlatformAverageHaluCatch(undefined);
          setPlatformHaluCatchSampleSize(0);
        }
      }
    }

    void loadPlatformHaluCatchAverages();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const [data, currentUser] = await Promise.all([
          getSkill(skillSlug, token ?? undefined),
          token ? getCurrentUser(token).catch(() => null) : Promise.resolve(null)
        ]);
        if (!cancelled) {
          setSkill(data);
          setViewer(currentUser);
          setBookmarked(Boolean(data.bookmarkedByViewer));
          setSelectedVersionName(data.latestVersion);
          setExpandedVersionNames(new Set());
          setSelectedFilePath(null);
          setActivePanel("skill-md");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [skillSlug]);

  useEffect(() => {
    if (!issueModalOpen && !ratingModalOpen && !unpublishModalOpen && !republishModalOpen && !deleteModalOpen && !versionManageModal) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIssueModalOpen(false);
        setRatingModalOpen(false);
        setUnpublishModalOpen(false);
        setRepublishModalOpen(false);
        setDeleteModalOpen(false);
        setVersionManageModal(null);
        setIssueError(null);
        setRatingError(null);
        setManageError(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [issueModalOpen, ratingModalOpen, unpublishModalOpen, republishModalOpen, deleteModalOpen, versionManageModal]);

  const currentVersion = useMemo(() => {
    if (!skill) {
      return undefined;
    }
    return (selectedVersionName ? skill.versions[selectedVersionName] : undefined) ?? skill.versions[skill.latestVersion];
  }, [selectedVersionName, skill]);

  const viewerExistingRating = useMemo(() => {
    if (!viewer || !skill || !currentVersion) {
      return undefined;
    }
    const handle = viewer.username.trim().toLowerCase();
    return skill.ratings.find(
      (rating) =>
        rating.user.trim().toLowerCase() === handle && rating.version === currentVersion.version
    );
  }, [currentVersion, skill, viewer]);

  const versions = useMemo(
    () =>
      skill
        ? Object.values(skill.versions).sort((a, b) => {
            const compared = compareSemver(b.version, a.version);
            if (compared !== null && compared !== 0) {
              return compared;
            }
            return b.createdAt.localeCompare(a.createdAt);
          })
        : [],
    [skill]
  );

  const contributorExcludeHandles = useMemo(
    () =>
      skill?.contributors.flatMap((contributor) => [
        contributor.username ?? "",
        contributor.name,
      ]) ?? [],
    [skill?.contributors]
  );

  if (loading) {
    return (
      <AppShell title={skillSlug}>
        <div className="loading-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !skill || !currentVersion) {
    return (
      <AppShell title={skillSlug}>
        <div className="error">{error ?? "Skill 不存在"}</div>
      </AppShell>
    );
  }

  const snapshot = currentVersion.snapshot;
  const files = snapshot?.files ?? [];
  const skillMdFile = files.find((file) => isSkillEntryPath(file.path));
  const skillEntryLabel = skillMdFile?.path ?? "SKILL.md";
  const markdownContent = skillMdFile
    ? stripFrontmatter(skillMdFile.content).trim()
    : (snapshot?.readme?.trim() ?? "");
  const selectedFile = files.find((file) => file.path === selectedFilePath) ?? files[0];
  const isOwner = Boolean(viewer && skill && isSkillOwner(skill, viewer));
  const isContributor = Boolean(viewer && skill && isSkillContributor(skill, viewer));
  const categories = currentVersion.manifest.categories ?? [];
  const openIssues = skill.issues.filter((issue) => issue.status !== "closed");
  const reviewFindings = currentVersion.review?.findings ?? [];
  const virusTotalLegacyUnavailableFinding = reviewFindings.find((finding) => finding.id === "virustotal-unavailable");
  const securityFindings = reviewFindings.filter(
    (finding) =>
      finding.id !== "virustotal-unavailable" &&
      (finding.id === "skillspector-unavailable" ||
        finding.id.startsWith("skillspector-") ||
        finding.id.startsWith("virustotal-") ||
        finding.category === "security" ||
        finding.category === "privacy" ||
        finding.category === "leakage")
  );
  const skillSpectorScan = currentVersion.review?.skillSpector;
  const virusTotalScan = currentVersion.review?.virusTotal;
  const virusTotalScanFailed =
    virusTotalScan?.status === "failed" || Boolean(virusTotalLegacyUnavailableFinding);
  const virusTotalScanError =
    virusTotalScan?.error ?? extractVirusTotalLegacyError(virusTotalLegacyUnavailableFinding?.message);
  const showVirusTotalSection = Boolean(virusTotalScan || virusTotalLegacyUnavailableFinding);
  const virusTotalDetections = virusTotalScan
    ? virusTotalScan.malicious + virusTotalScan.suspicious
    : 0;
  const virusTotalEngineTotal = virusTotalScan ? resolveVirusTotalEngineTotal(virusTotalScan) : 0;
  const hiddenPlatformFindingCount = reviewFindings.length - securityFindings.length;
  const isHaluCatchEvaluation = currentVersion.evaluation?.provider === "halucatch-adapter";
  const haluCatchReport = currentVersion.evaluation?.haluCatchReport;
  const haluCatchReportSummary = haluCatchReport ? extractHaluCatchSummary(haluCatchReport.simple) : "";
  const haluCatchReportHref = haluCatchReport
    ? buildHaluCatchReportPath(skill.slug, currentVersion.version)
    : null;
  const requirementGroups = [
    {
      title: "支持的 Agent",
      values: asList(currentVersion.manifest.supportedAgents),
      empty: "未声明支持的 Agent。"
    },
    {
      title: "允许的工具",
      values: asList(currentVersion.manifest["allowed-tools"]),
      empty: "未声明工具白名单。"
    },
    {
      title: "禁用的工具",
      values: asList(currentVersion.manifest["disallowed-tools"]),
      empty: "未声明工具限制。"
    }
  ];
  const detailCards: DetailCard[] = [
    {
      id: "skill-md",
      title: skillEntryLabel,
      icon: BookOpen,
      meta: markdownContent ? `${markdownContent.split(/\r?\n/).length} 行` : "暂无内容"
    },
    {
      id: "skill-card",
      title: "Skill Card",
      icon: Package,
      meta: `v${currentVersion.version}`
    },
    {
      id: "files",
      title: "Files",
      icon: Files,
      meta: `${files.length} 个文件`
    },
    {
      id: "versions",
      title: "Versions",
      icon: History,
      meta: `${versions.length} 个版本`
    },
    {
      id: "quality",
      title: "审查与评估",
      icon: ShieldCheck,
      meta: currentVersion.evaluation
        ? `${securityFindings.length} 项安全 finding · 已评估`
        : `${securityFindings.length} 项安全 finding · 未评估`
    },
    {
      id: "community",
      title: "Issue 与评分",
      icon: MessageSquare,
      meta: `${openIssues.length} 个开放 Issue`
    }
  ];
  const isUnpublished = skill.published === false;
  const installCommand = skillnavInstallExample(skill.slug);

  function openIssueModal() {
    setIssueError(null);
    setIssueModalOpen(true);
  }

  function closeIssueModal() {
    setIssueModalOpen(false);
    setIssueError(null);
  }

  function openRatingModal() {
    if (viewerExistingRating) {
      setSuccessToast(
        `你已对该版本评分（v${viewerExistingRating.version} · ${viewerExistingRating.score}/5），切换版本后可对其它版本再评。`
      );
      return;
    }
    setRatingError(null);
    setRatingModalOpen(true);
  }

  function closeRatingModal() {
    setRatingModalOpen(false);
    setRatingError(null);
  }

  async function handleAddContributor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getAuthToken();
    if (!token) {
      setErrorToast("请先登录后再添加 contributor。");
      return;
    }
    if (!skill) {
      setErrorToast("Skill 数据尚未加载完成。");
      return;
    }
    if (!viewer || !isSkillOwner(skill, viewer)) {
      setErrorToast("仅 Skill Owner 可添加 contributor。");
      return;
    }

    const name = contributorName.trim();
    if (!name) {
      setErrorToast("请输入 contributor 用户名。");
      return;
    }

    const existingContributor = findSkillContributorByHandle(skill, name);
    if (existingContributor) {
      if (existingContributor.role === "owner") {
        setErrorToast(formatContributorError("cannot_modify_owner_contributor"));
      } else {
        setErrorToast(formatContributorError("contributor_already_exists"));
      }
      return;
    }

    setAddingContributor(true);
    try {
      const contributor = await addSkillContributor(token, skill.slug, name);
      setSkill((current) => {
        if (!current) {
          return current;
        }

        const contributors = current.contributors.some((item) => item.id === contributor.id)
          ? current.contributors.map((item) => (item.id === contributor.id ? contributor : item))
          : [...current.contributors, contributor];

        return {
          ...current,
          contributors
        };
      });
      setContributorName("");
      setSuccessToast(`已添加 ${contributor.name} 为 contributor`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "添加 contributor 失败";
      setErrorToast(formatContributorError(message));
    } finally {
      setAddingContributor(false);
    }
  }

  async function handleConfirmRemoveContributor() {
    if (!removeContributorConfirm) {
      return;
    }

    const { id: contributorId, name: contributorDisplayName } = removeContributorConfirm;
    const token = getAuthToken();
    if (!token) {
      setErrorToast("请先登录后再管理 contributor。");
      return;
    }
    if (!skill) {
      setErrorToast("Skill 数据尚未加载完成。");
      return;
    }
    if (!viewer || !isSkillOwner(skill, viewer)) {
      setErrorToast("仅 Skill Owner 可移除 contributor。");
      return;
    }

    setRemovingContributorId(contributorId);
    try {
      await removeSkillContributor(token, skill.slug, contributorId);
      setSkill((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          contributors: current.contributors.filter((item) => item.id !== contributorId)
        };
      });
      setSuccessToast(`已移除 contributor ${contributorDisplayName}`);
      setRemoveContributorConfirm(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "移除 contributor 失败";
      setErrorToast(formatContributorError(message));
    } finally {
      setRemovingContributorId(null);
    }
  }

  async function handleSubmitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssueError(null);

    const token = getAuthToken();
    if (!token) {
      setIssueError("请先登录后再提交 Issue。");
      return;
    }
    if (!skill) {
      setIssueError("Skill 数据尚未加载完成。");
      return;
    }

    const title = issueTitle.trim();
    if (!title) {
      setIssueError("请填写 Issue 标题。");
      return;
    }

    setSubmittingIssue(true);
    try {
      const issue = await createSkillIssue(token, skill.slug, {
        type: issueType,
        severity: issueSeverity,
        title,
        body: issueBody.trim() || undefined
      });
      setSkill((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          issues: [issue, ...current.issues]
        };
      });
      setIssueTitle("");
      setIssueBody("");
      setIssueType("bug");
      setIssueSeverity("medium");
      setIssueModalOpen(false);
      setSuccessToast("Issue 已提交。");
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "提交 Issue 失败");
    } finally {
      setSubmittingIssue(false);
    }
  }

  async function handleSubmitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingError(null);

    const token = getAuthToken();
    if (!token) {
      setRatingError("请先登录后再评分。");
      return;
    }
    if (!skill || !currentVersion) {
      setRatingError("Skill 数据尚未加载完成。");
      return;
    }
    if (ratingScore < 1 || ratingScore > 5) {
      setRatingError("请选择 1 到 5 星的评分。");
      return;
    }

    setSubmittingRating(true);
    try {
      const result = await addSkillRating(token, skill.slug, {
        score: ratingScore,
        version: currentVersion.version,
        comment: ratingComment.trim() || undefined
      });
      setSkill((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          ratings: [result.rating, ...current.ratings],
          averageRating: result.averageRating,
          ratingCount: result.ratingCount
        };
      });
      setRatingScore(0);
      setRatingComment("");
      setRatingModalOpen(false);
      setSuccessToast("评分已提交。");
    } catch (err) {
      setRatingError(formatRatingError(err instanceof Error ? err.message : "提交评分失败"));
    } finally {
      setSubmittingRating(false);
    }
  }

  async function handleDownload(version: string) {
    setDownloadError(null);

    const token = getAuthToken();
    if (!token) {
      setDownloadError("请先登录后再下载 Skill。");
      return;
    }
    if (!skill) {
      setDownloadError("Skill 数据尚未加载完成。");
      return;
    }

    setDownloadingVersion(version);
    try {
      const { blob, fileName } = await downloadSkillVersion(token, skill.slug, version, skill.name);
      saveBlobAsFile(blob, fileName);
      const updated = await getSkill(skill.slug, token);
      setSkill(updated);
      const downloadedVersion = resolveDownloadedSkillVersion(fileName, skill.name, version);
      setSuccessToast(`已下载 v${downloadedVersion}（${fileName}）`);
    } catch (err) {
      setDownloadError(formatVersionManageError(err instanceof Error ? err.message : "下载失败"));
    } finally {
      setDownloadingVersion(null);
    }
  }

  async function handleCopyInstallCommand() {
    try {
      await copyTextToClipboard(installCommand);
      setSuccessToast("已复制安装命令");
    } catch {
      setErrorToast("复制失败，请手动复制");
    }
  }

  async function handleCopyInstallPrompt() {
    if (!skill || !currentVersion) {
      setErrorToast("Skill 数据尚未加载完成。");
      return;
    }

    const pageUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/skills/${encodeURIComponent(skill.slug)}`
        : `/skills/${encodeURIComponent(skill.slug)}`;
    const prompt = buildSkillInstallPrompt({
      skill,
      version: currentVersion.version,
      pageUrl
    });

    try {
      await navigator.clipboard.writeText(prompt);
      setSuccessToast("已复制安装 prompt");
    } catch {
      setErrorToast("复制失败，请手动复制");
    }
  }

  async function handleToggleBookmark() {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!skill) {
      setManageError("Skill 数据尚未加载完成。");
      return;
    }

    setBookmarkLoading(true);
    try {
      if (bookmarked) {
        await unbookmarkSkill(token, skill.slug);
        setBookmarked(false);
        setSkill((current) => (current ? { ...current, bookmarkedByViewer: false } : current));
      } else {
        await bookmarkSkill(token, skill.slug);
        setBookmarked(true);
        setSkill((current) => (current ? { ...current, bookmarkedByViewer: true } : current));
      }
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "收藏操作失败");
    } finally {
      setBookmarkLoading(false);
    }
  }

  async function handleUnpublish() {
    setManageError(null);

    const token = getAuthToken();
    if (!token) {
      setManageError("请先登录后再操作。");
      return;
    }
    if (!skill) {
      setManageError("Skill 数据尚未加载完成。");
      return;
    }

    setUnpublishingSkill(true);
    try {
      const updated = await unpublishSkill(token, skill.slug);
      setSkill(updated);
      setUnpublishModalOpen(false);
      setSuccessToast("Skill 已下架，将不再出现在 Skill 广场与排行榜。");
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "下架失败");
    } finally {
      setUnpublishingSkill(false);
    }
  }

  async function handleRepublish() {
    setManageError(null);

    const token = getAuthToken();
    if (!token) {
      setManageError("请先登录后再操作。");
      return;
    }
    if (!skill) {
      setManageError("Skill 数据尚未加载完成。");
      return;
    }

    setRepublishingSkill(true);
    try {
      const updated = await republishSkill(token, skill.slug);
      setSkill(updated);
      setRepublishModalOpen(false);
      setSuccessToast("Skill 已重新上架，将出现在 Skill 广场与排行榜。");
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "上架失败");
    } finally {
      setRepublishingSkill(false);
    }
  }

  async function handleVersionManageConfirm() {
    if (!skill || !versionManageModal) {
      return;
    }

    setManageError(null);
    const token = getAuthToken();
    if (!token) {
      setManageError("请先登录后再操作。");
      return;
    }

    setManagingVersion(true);
    const { action, version } = versionManageModal;
    try {
      const updated =
        action === "unpublish"
          ? await unpublishSkillVersion(token, skill.slug, version)
          : await republishSkillVersion(token, skill.slug, version);
      setSkill(updated);
      setVersionManageModal(null);
      setSuccessToast(action === "unpublish" ? `v${version} 已下架。` : `v${version} 已恢复上架。`);
    } catch (err) {
      setManageError(formatVersionManageError(err instanceof Error ? err.message : "操作失败"));
    } finally {
      setManagingVersion(false);
    }
  }

  async function handleDelete() {
    setManageError(null);

    const token = getAuthToken();
    if (!token) {
      setManageError("请先登录后再操作。");
      return;
    }
    if (!skill) {
      setManageError("Skill 数据尚未加载完成。");
      return;
    }

    setDeletingSkill(true);
    try {
      await deleteSkill(token, skill.slug);
      setDeleteModalOpen(false);
      router.push(viewer ? `${creatorProfilePath(viewer.username)}?tab=recycle` : "/creators");
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingSkill(false);
    }
  }

  return (
    <AppShell title={skill.name}>
      {removeContributorConfirm ? (
        <ConfirmToast
          confirmClassName="button secondary compact danger"
          confirmLabel="移除"
          confirming={removingContributorId === removeContributorConfirm.id}
          confirmingLabel="移除中…"
          message={`确定将 ${removeContributorConfirm.name} 从该 Skill 的 contributor 中移除吗？移除后对方将无法再发布新版本。`}
          onCancel={() => {
            if (removingContributorId === null) {
              setRemoveContributorConfirm(null);
            }
          }}
          onConfirm={() => void handleConfirmRemoveContributor()}
          title="确认移除 contributor"
        />
      ) : null}
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      {successToast ? <SuccessToast message={successToast} onClose={() => setSuccessToast(null)} /> : null}
      <div className="page-stack">
        <Link className="button secondary" href="/skills" style={{ width: "fit-content" }}>
          <ArrowLeft size={16} /> 返回 Skill 广场
        </Link>

        <section className="hero skill-detail-hero">
          <div className="hero-card">
            <div className="card-head">
              <span className="eyebrow">Skill Detail</span>
              <VerdictBadge verdict={currentVersion.status} />
            </div>
            <h1>{skill.name}</h1>
            <p>{skill.description}</p>
            <div className="tag-row">
              {isUnpublished ? (
                <span className="badge badge-unpublished">
                  <EyeOff size={13} /> 已下架
                </span>
              ) : null}
              <span className="badge mono">{skill.slug}</span>
              <span className="badge">v{currentVersion.version}</span>
              <span className="badge">
                <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"}
              </span>
              <span className="badge">
                <Download size={13} /> {formatNumber(currentVersion.downloads)} downloads
              </span>
              <span className="badge">
                <MessageSquare size={13} /> {openIssues.length} open
              </span>
            </div>
            {categories.length > 0 ? (
              <div className="tag-row">
                {categories.map((category) => (
                  <span className="badge" key={category}>
                    <SkillCategoryLabel category={category} iconSize={13} />
                  </span>
                ))}
              </div>
            ) : null}
            <div className="hero-actions">
              {viewer ? (
                <button
                  className={`button secondary${bookmarked ? " bookmark-active" : ""}`}
                  disabled={bookmarkLoading}
                  onClick={() => void handleToggleBookmark()}
                  type="button"
                >
                  <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
                  {bookmarkLoading ? "处理中…" : bookmarked ? "已收藏" : "收藏"}
                </button>
              ) : (
                <Link className="button secondary" href="/login">
                  <Bookmark size={16} /> 登录后收藏
                </Link>
              )}
              {viewer ? (
                <button
                  className={isOwner ? "button secondary" : "button primary"}
                  disabled={downloadingVersion === "latest"}
                  onClick={() => void handleDownload("latest")}
                  type="button"
                >
                  <Download size={16} />
                  {downloadingVersion === "latest" ? "下载中…" : "下载 Skill"}
                </button>
              ) : (
                <Link className={isOwner ? "button secondary" : "button primary"} href="/login">
                  <Download size={16} /> 登录后下载
                </Link>
              )}
              <button className="button secondary" onClick={() => void handleCopyInstallPrompt()} type="button">
                <Copy size={16} /> 复制 prompt
              </button>
            </div>
            {downloadError ? <div className="error">{downloadError}</div> : null}
            {manageError ? <div className="error">{manageError}</div> : null}
            {isOwner && isUnpublished ? (
              <div className="skill-unpublished-notice" role="status">
                <span className="skill-unpublished-notice-icon" aria-hidden="true">
                  <EyeOff size={18} />
                </span>
                <div className="skill-unpublished-notice-body">
                  <strong>此 Skill 已下架</strong>
                  <p>仅你可见，不会出现在 Skill 广场与搜索页。可直接上架恢复公开，或发布新版本后再上架。</p>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="hero-card detail-summary-card">
            <span className="eyebrow">当前查看版本</span>
            <strong className="detail-version-value">v{currentVersion.version}</strong>
            <p className="description">发布于 {formatDateTime(currentVersion.createdAt)}</p>
            <div className="stat-grid">
              <div className="stat">
                <p className="stat-value">{files.length}</p>
                <p className="stat-label">Files</p>
              </div>
              <div className="stat">
                <p className="stat-value">{versions.length}</p>
                <p className="stat-label">Versions</p>
              </div>
              <div className="stat">
                <p className="stat-value">{openIssues.length}</p>
                <p className="stat-label">Open issues</p>
              </div>
              <div className="stat">
                <p className="stat-value">{skill.ratingCount}</p>
                <p className="stat-label">Ratings</p>
              </div>
            </div>
            {isOwner ? (
              <div className="detail-summary-actions">
                <Link className="button primary" href={`/skills/publish?skill=${encodeURIComponent(skill.slug)}`}>
                  <Plus size={16} /> 发布新版本
                </Link>
                {!isUnpublished ? (
                  <button className="button secondary" onClick={() => setUnpublishModalOpen(true)} type="button">
                    <EyeOff size={16} /> 下架
                  </button>
                ) : (
                  <button className="button secondary" onClick={() => setRepublishModalOpen(true)} type="button">
                    <Upload size={16} /> 上架
                  </button>
                )}
                <button className="button secondary danger" onClick={() => setDeleteModalOpen(true)} type="button">
                  <Trash2 size={16} /> 删除
                </button>
              </div>
            ) : null}
          </aside>
        </section>

        <section className="skill-detail-navigation" aria-label="Skill 内容">
          <div className="section-head">
            <div>
              <h2>Skill 内容</h2>
              <p>在横栏中切换文档、版本与审查信息。</p>
            </div>
          </div>
          <div className="detail-tab-bar" role="tablist" aria-label="Skill 详情">
            {detailCards.map((detailCard) => {
              const Icon = detailCard.icon;
              const isActive = activePanel === detailCard.id;

              return (
                <button
                  aria-controls="skill-detail-panel"
                  aria-selected={isActive}
                  className={`detail-tab ${isActive ? "active" : ""}`}
                  id={`detail-tab-${detailCard.id}`}
                  key={detailCard.id}
                  onClick={() => setActivePanel(detailCard.id)}
                  role="tab"
                  type="button"
                >
                  <Icon size={16} />
                  <span>{detailCard.title}</span>
                  <small>{detailCard.meta}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby={`detail-tab-${activePanel}`}
          className="card detail-panel"
          id="skill-detail-panel"
          role="tabpanel"
        >
          {activePanel === "skill-md" ? (
            markdownContent ? (
              <MarkdownContent>{markdownContent}</MarkdownContent>
            ) : (
              <div className="empty detail-empty">当前版本没有可渲染的 Skill 入口文件内容。</div>
            )
          ) : null}

          {activePanel === "skill-card" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Overview</span>
                  <h2>Skill Card</h2>
                  <p className="description">汇总发布元信息、安装方式和贡献者。</p>
                </div>
                <VerdictBadge verdict={currentVersion.status} />
              </div>
              <div className="two-column detail-split">
                <div className="detail-section">
                  <div className="detail-meta-grid">
                    <div>
                      <span>Slug</span>
                      <strong className="mono">{skill.slug}</strong>
                    </div>
                    <div>
                      <span>Version</span>
                      <strong>v{currentVersion.version}</strong>
                    </div>
                    <div>
                      <span>Author</span>
                      <strong>{currentVersion.manifest.author ?? "未声明"}</strong>
                    </div>
                    <div>
                      <span>License</span>
                      <strong>{currentVersion.manifest.license ?? "未声明"}</strong>
                    </div>
                  </div>

                  <div className="detail-subsection">
                    <h3>安装</h3>
                    <p className="description">
                      在 Web 创建 API 密钥并执行 <code className="inline-code">skillnav login --api-key sk_…</code> 后，可通过 CLI 安装最新版本。
                    </p>
                    <pre className="pre">{installCommand}</pre>
                    <div className="tag-row">
                      <button
                        className="button secondary compact"
                        onClick={() => void handleCopyInstallCommand()}
                        type="button"
                      >
                        <Copy size={13} /> 复制命令
                      </button>
                      {currentVersion.releaseTags.map((releaseTag) => (
                        <span className="badge" key={releaseTag}>
                          {releaseTag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="detail-side-section">
                  <div className="card-head">
                    <h3>贡献者</h3>
                    <span className="badge">{skill.contributors.length}</span>
                  </div>
                  {isOwner ? (
                    <form className="contributor-form" onSubmit={handleAddContributor}>
                      <label className="field">
                        <span>用户名</span>
                        <UsernameSuggestInput
                          disabled={addingContributor}
                          excludeHandles={contributorExcludeHandles}
                          onChange={setContributorName}
                          placeholder="输入已注册用户名，例如 bob"
                          value={contributorName}
                        />
                        <small>输入时会检索平台用户名，点击建议即可填入。新成员角色固定为 contributor。</small>
                      </label>
                      <button className="button primary" disabled={addingContributor} type="submit">
                        <Plus size={15} />
                        {addingContributor ? "添加中..." : "添加 contributor"}
                      </button>
                    </form>
                  ) : isContributor && viewer ? (
                    <p className="description" style={{ marginBottom: 12 }}>
                      仅 Skill Owner 可添加或移除 contributor。
                    </p>
                  ) : null}
                  {skill.contributors.length === 0 ? (
                    <div className="empty detail-empty">暂无贡献者信息。</div>
                  ) : (
                    <ul className="list">
                      {skill.contributors.map((contributor) => (
                        <li className="list-item" key={contributor.id}>
                          <div className="card-head" style={{ marginBottom: 0 }}>
                            <div>
                              <Users size={15} /> <strong>{contributor.name}</strong>
                              <p className="description">
                                {contributor.role} · {formatDateTime(contributor.addedAt)}
                              </p>
                            </div>
                            {isOwner && contributor.role === "contributor" ? (
                              <button
                                className="button secondary compact contributor-remove-button"
                                disabled={removingContributorId === contributor.id}
                                onClick={() =>
                                  setRemoveContributorConfirm({ id: contributor.id, name: contributor.name })
                                }
                                type="button"
                              >
                                <Trash2 size={14} />
                                {removingContributorId === contributor.id ? "移除中..." : "移除"}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
              <div className="detail-subsection skill-card-requirements">
                <div className="card-head">
                  <div>
                    <h3>Requirements</h3>
                    <p className="description">此版本在 Skill 入口文件 frontmatter 中声明的运行边界。</p>
                  </div>
                  <span className="badge">
                    {requirementGroups.filter((group) => group.values.length > 0).length}/{requirementGroups.length} 已声明
                  </span>
                </div>
                <div className="requirements-grid">
                  {requirementGroups.map((group) => (
                    <section className="requirement-card" key={group.title}>
                      <h3>{group.title}</h3>
                      {group.values.length > 0 ? (
                        <div className="tag-row">
                          {group.values.map((value) => (
                            <span className="badge" key={value}>
                              {value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="description">{group.empty}</p>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {activePanel === "files" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Package</span>
                  <h2>Files</h2>
                  <p className="description">选择文件即可预览当前版本归档中的文本内容。</p>
                </div>
                <span className="badge">{files.length} 个文件</span>
              </div>
              {files.length === 0 ? (
                <div className="empty detail-empty">当前版本没有可浏览的文件。</div>
              ) : (
                <div className="file-browser">
                  <div className="file-list" aria-label="文件列表">
                    {files.map((file) => {
                      const isSelected = file.path === selectedFile?.path;
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`file-row ${isSelected ? "active" : ""}`}
                          key={file.path}
                          onClick={() => setSelectedFilePath(file.path)}
                          type="button"
                        >
                          <FileText size={16} />
                          <span>
                            <strong>{file.path}</strong>
                            <small>{formatFileSize(file.size)}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="file-preview">
                    {selectedFile ? (
                      <>
                        <div className="file-preview-head">
                          <div>
                            <div className="file-preview-title">
                              <FileCode2 size={17} />
                              <strong>{selectedFile.path}</strong>
                            </div>
                            <span className="mono">sha256 {selectedFile.sha256.slice(0, 16)}...</span>
                          </div>
                          <span className="badge">{formatFileSize(selectedFile.size)}</span>
                        </div>
                        <pre className="pre">{selectedFile.content}</pre>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {activePanel === "versions" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Release history</span>
                  <h2>Versions</h2>
                  <p className="description">点击版本可独立展开或收起 Changelog，并同步更新其他卡片。</p>
                </div>
                <span className="badge">{versions.length} 个版本</span>
              </div>
              <div className="version-list">
                <div aria-hidden="true" className="version-table-header">
                  <span>Version</span>
                  <span>Release</span>
                  <span>Download</span>
                  <span className="version-table-header-spacer" />
                </div>
                {versions.map((version) => {
                  const isExpanded = expandedVersionNames.has(version.version);
                  const isLatest = version.version === skill.latestVersion;
                  const isVersionUnpublished = version.published === false;

                  function handleVersionRowClick() {
                    setSelectedVersionName(version.version);
                    setSelectedFilePath(null);
                    setExpandedVersionNames((expanded) => {
                      const next = new Set(expanded);
                      if (next.has(version.version)) {
                        next.delete(version.version);
                      } else {
                        next.add(version.version);
                      }
                      return next;
                    });
                  }

                  return (
                    <div className={`version-entry ${isExpanded ? "active" : ""}`} key={version.version}>
                      <div
                        aria-expanded={isExpanded}
                        className="version-entry-head"
                        onClick={handleVersionRowClick}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleVersionRowClick();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="version-row-main">
                          <strong>v{version.version}</strong>
                          <span>{formatDateTime(version.createdAt)}</span>
                        </div>
                        <div className="version-col-release">
                          <span className="version-release-latest">
                            {isLatest ? <span className="badge">Latest</span> : null}
                          </span>
                          <span className="version-release-status">
                            <VerdictBadge verdict={version.status} />
                          </span>
                        </div>
                        <div
                          className="version-col-download"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <div className="version-action-leading">
                            {isVersionUnpublished ? (
                              isOwner ? (
                                <button
                                  className="button secondary compact version-restore-button"
                                  onClick={() => {
                                    setManageError(null);
                                    setVersionManageModal({ action: "republish", version: version.version });
                                  }}
                                  type="button"
                                >
                                  恢复上架
                                </button>
                              ) : null
                            ) : isOwner && !isLatest && viewer ? (
                              <button
                                className="button secondary compact danger version-unpublish-button"
                                onClick={() => {
                                  setManageError(null);
                                  setVersionManageModal({ action: "unpublish", version: version.version });
                                }}
                                type="button"
                              >
                                下架
                              </button>
                            ) : null}
                          </div>
                          {!isVersionUnpublished ? (
                            viewer ? (
                              <button
                                className="button secondary compact version-download-button"
                                disabled={downloadingVersion === version.version}
                                onClick={() => void handleDownload(version.version)}
                                type="button"
                              >
                                <Download size={14} />
                                {downloadingVersion === version.version ? "Downloading…" : "Download version"}
                              </button>
                            ) : (
                              <Link className="button secondary compact version-download-button" href="/login">
                                <Download size={14} />
                                Download version
                              </Link>
                            )
                          ) : null}
                        </div>
                        <span aria-hidden="true" className="version-expand-icon">
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </span>
                      </div>
                      {isExpanded ? (
                        <div className="version-changelog">
                          <div className="changelog-content">{version.changelog?.trim() || "未提供 Changelog"}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {activePanel === "quality" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Quality assurance</span>
                  <h2>审查与评估</h2>
                  <p className="description">
                    静态审查于 {currentVersion.review?.createdAt ? formatDateTime(currentVersion.review.createdAt) : "未知时间"} 完成，
                    内容 hash 为 <span className="mono">{currentVersion.contentHash.slice(0, 16)}...</span>
                  </p>
                </div>
                <div className="card-head-actions">
                  <VerdictBadge verdict={currentVersion.status} />
                  {currentVersion.evaluation ? <EvaluationBadge status={currentVersion.evaluation.status} /> : null}
                </div>
              </div>

              {isHaluCatchEvaluation && currentVersion.evaluation ? (
                <div className="detail-subsection halucatch-evaluation-block">
                  <div className="section-head">
                    <div>
                      <h3>HaluCatch 质量评估</h3>
                      <p className="description">五维静态质量检查：地基、代码、规则、护栏与复杂度。</p>
                    </div>
                    {haluCatchReportHref ? (
                      <Link className="button secondary compact" href={haluCatchReportHref}>
                        <ExternalLink size={14} /> 查看完整报告
                      </Link>
                    ) : null}
                  </div>
                  <div className="evaluation-summary">
                    <div>
                      <span>Provider</span>
                      <strong>HaluCatch</strong>
                    </div>
                    <div>
                      <span>评估时间</span>
                      <strong>{formatDateTime(currentVersion.evaluation.createdAt)}</strong>
                    </div>
                    {haluCatchReport ? (
                      <div>
                        <span>Skill 类型</span>
                        <strong>{haluCatchReport.skillType}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="review-score-card halucatch-radar-card">
                    <HaluCatchRadar
                      averageScores={platformAverageHaluCatch}
                      evaluation={currentVersion.evaluation}
                      sampleSize={platformHaluCatchSampleSize}
                    />
                  </div>
                  {haluCatchReport && haluCatchReportSummary ? (
                    <div className="halucatch-inline-summary">
                      <h4>报告摘要</h4>
                      <MarkdownContent className="markdown-content halucatch-report-summary">
                        {haluCatchReportSummary}
                      </MarkdownContent>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="detail-subsection">
                <div className="section-head">
                  <div>
                    <h3>安全审查</h3>
                    <p className="description">
                      由 SkillSpector 对发布包做静态安全扫描；配置 VirusTotal 后，还会按归档 hash 查询或扫描发布包。以下 finding 用于解释阻断或复核原因，不再汇总为单一安全分。
                      {skillSpectorScan ? ` ${formatSkillSpectorSummaryLine(skillSpectorScan)}` : null}
                      {showVirusTotalSection
                        ? virusTotalScanFailed
                          ? " VirusTotal 扫描未成功完成，以下错误信息来自扫描器。"
                          : virusTotalScan?.status === "completed"
                            ? ` VirusTotal 已完成：${virusTotalScan.malicious} 个恶意、${virusTotalScan.suspicious} 个可疑检出${virusTotalEngineTotal ? `，共 ${virusTotalEngineTotal} 家厂商参与扫描。` : "。"}`
                            : " VirusTotal 未命中该归档的历史报告，且未上传新样本。"
                        : null}
                      {hiddenPlatformFindingCount > 0
                        ? ` 另有 ${hiddenPlatformFindingCount} 条平台质量/合规提示（如 description、tags、tests）计入审查记录，但不在此安全区域展示。`
                        : null}
                    </p>
                  </div>
                </div>
                {skillSpectorScan ? (
                  <div className="evaluation-summary">
                    <div>
                      <span>扫描器</span>
                      <strong>SkillSpector</strong>
                    </div>
                    <div>
                      <span>安全分</span>
                      <strong>{toSkillSpectorSafetyScore(skillSpectorScan.riskScore)}/100</strong>
                    </div>
                    <div>
                      <span>包级风险</span>
                      <strong>{formatSkillSpectorRiskSeverity(skillSpectorScan.riskSeverity)}</strong>
                    </div>
                    <div>
                      <span>安装建议</span>
                      <strong>{formatSkillSpectorRecommendation(skillSpectorScan.recommendation)}</strong>
                    </div>
                    <div>
                      <span>模式</span>
                      <strong>{formatSkillSpectorScanMode(skillSpectorScan.scanMode)}</strong>
                    </div>
                  </div>
                ) : null}
                {showVirusTotalSection ? (
                  <div className="evaluation-summary">
                    <div>
                      <span>扫描器</span>
                      <strong>VirusTotal</strong>
                    </div>
                    {virusTotalScanFailed ? (
                      <>
                        <div>
                          <span>状态</span>
                          <strong>扫描失败</strong>
                        </div>
                        {virusTotalScanError ? (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <span>错误信息</span>
                            <strong>{virusTotalScanError}</strong>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div>
                          <span>状态</span>
                          <strong>{virusTotalScan?.status === "completed" ? "已完成" : "未命中历史报告"}</strong>
                        </div>
                        <div>
                          <span>检出结果</span>
                          <strong>
                            {virusTotalDetections
                              ? `${virusTotalScan!.malicious} 恶意 · ${virusTotalScan!.suspicious} 可疑`
                              : "未检出"}
                          </strong>
                        </div>
                        {virusTotalScan?.status === "completed" && virusTotalEngineTotal > 0 ? (
                          <div>
                            <span>厂家总数</span>
                            <strong>{virusTotalEngineTotal}</strong>
                          </div>
                        ) : null}
                        {formatVirusTotalThreatVerdict(virusTotalScan?.threatVerdict) ? (
                          <div>
                            <span>威胁裁决</span>
                            <strong>{formatVirusTotalThreatVerdict(virusTotalScan!.threatVerdict)}</strong>
                          </div>
                        ) : null}
                        {virusTotalScan?.sha256 ? (
                          <div>
                            <span>归档 SHA-256</span>
                            <strong className="mono">{virusTotalScan.sha256.slice(0, 16)}...</strong>
                          </div>
                        ) : null}
                        {virusTotalScan?.analysisUrl ? (
                          <div>
                            <span>分析报告</span>
                            <a
                              className="text-link"
                              href={virusTotalScan.analysisUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              查看 VirusTotal 报告 <ExternalLink size={13} />
                            </a>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                {securityFindings.length === 0 ? (
                  <div className="empty detail-empty">未发现安全相关 finding。</div>
                ) : (
                  <ul className="list detail-list">
                    {securityFindings.map((finding) => {
                      const displayFinding = localizeSkillSpectorFinding(finding);
                      return (
                      <li className={`list-item finding ${finding.severity}`} key={finding.id}>
                        <div className="card-head">
                          <strong>{displayFinding.title}</strong>
                          <div className="tag-row" style={{ marginTop: 0 }}>
                            <SeverityBadge severity={finding.severity} />
                            <FindingConfidenceBadge finding={finding} />
                          </div>
                        </div>
                        <p className="description">{displayFinding.message}</p>
                        <p className="description">建议：{displayFinding.recommendation}</p>
                        {finding.evidence ? <pre className="pre">{finding.evidence}</pre> : null}
                      </li>
                    );
                    })}
                  </ul>
                )}
              </div>

              {!isHaluCatchEvaluation ? (
              <div className="detail-subsection">
                <div className="section-head">
                  <div>
                    <h3>可靠性评估</h3>
                    <p className="description">查看可靠性任务集的完成情况与发现。</p>
                  </div>
                </div>
                {currentVersion.evaluation ? (
                  <>
                    <div className="evaluation-summary">
                      <div>
                        <span>Provider</span>
                        <strong>{currentVersion.evaluation.provider}</strong>
                      </div>
                      <div>
                        <span>Tasks</span>
                        <strong>
                          {currentVersion.evaluation.tasksPassed}/{currentVersion.evaluation.tasksTotal}
                        </strong>
                      </div>
                      <div>
                        <span>评估时间</span>
                        <strong>{formatDateTime(currentVersion.evaluation.createdAt)}</strong>
                      </div>
                    </div>
                    {currentVersion.evaluation.taskResults.length > 0 ? (
                      <div className="detail-subsection">
                        <h3>任务结果</h3>
                        <ul className="list">
                          {currentVersion.evaluation.taskResults.map((task) => (
                            <li className="list-item" key={task.name}>
                              <div className="card-head">
                                <strong>{task.name}</strong>
                                <span className="badge">Score {task.score}</span>
                              </div>
                              {task.findings.map((finding) => (
                                <p className="description" key={finding.id}>
                                  {finding.message}
                                </p>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {currentVersion.evaluation.findings.length > 0 ? (
                      <div className="detail-subsection">
                        <h3>总体发现</h3>
                        <ul className="list">
                          {currentVersion.evaluation.findings.map((finding) => (
                            <li className={`list-item finding ${finding.severity}`} key={finding.id}>
                              <div className="card-head">
                                <strong>{finding.task ?? "可靠性检查"}</strong>
                                <SeverityBadge severity={finding.severity} />
                              </div>
                              <p className="description">{finding.message}</p>
                              <p className="description">建议：{finding.recommendation}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="empty detail-empty">该版本暂无可靠性评估报告。</div>
                )}
              </div>
              ) : null}
            </>
          ) : null}

          {activePanel === "community" ? (
            <>
              <div className="detail-panel-head">
                <div>
                  <span className="eyebrow">Community feedback</span>
                  <h2>Issue 与评分</h2>
                  <p className="description">登录后可提交 Issue 与评分，并查看社区反馈。</p>
                </div>
                <span className="badge">
                  <Star size={13} /> {skill.averageRating ? skill.averageRating.toFixed(1) : "暂无评分"} · {skill.ratingCount}
                </span>
              </div>
              <div className="two-column detail-split">
                <div className="detail-section">
                  <div className="card-head">
                    <h3>Issues</h3>
                    <div className="card-head-actions">
                      <span className="badge">{skill.issues.length}</span>
                      {viewer ? (
                        <button className="button secondary compact" onClick={openIssueModal} type="button">
                          <Plus size={14} /> 提交 Issue
                        </button>
                      ) : (
                        <Link className="button secondary compact" href="/login">登录后提交</Link>
                      )}
                    </div>
                  </div>
                  {skill.issues.length === 0 ? (
                    <div className="empty detail-empty">暂无 issue。</div>
                  ) : (
                    <ul className="list">
                      {skill.issues.map((issue) => (
                        <li className={`list-item finding ${issue.severity}`} key={issue.id}>
                          <div className="card-head">
                            <strong>{issue.title}</strong>
                            <SeverityBadge severity={issue.severity} />
                          </div>
                          <p className="description">
                            {issue.type} · {issue.status} · {issue.createdBy ?? "anonymous"} ·{" "}
                            {formatDateTime(issue.createdAt)}
                          </p>
                          {issue.body ? <p className="description">{issue.body}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <aside className="detail-side-section">
                  <div className="card-head">
                    <h3>Ratings</h3>
                    <div className="card-head-actions">
                      <span className="badge">{skill.ratingCount}</span>
                      {viewer ? (
                        viewerExistingRating ? (
                          <span className="badge">
                            v{currentVersion.version} · 你已评分 {viewerExistingRating.score}/5
                          </span>
                        ) : (
                          <button className="button secondary compact" onClick={openRatingModal} type="button">
                            <Star size={14} /> 提交评分
                          </button>
                        )
                      ) : (
                        <Link className="button secondary compact" href="/login">登录后提交</Link>
                      )}
                    </div>
                  </div>
                  {skill.ratings.length === 0 ? (
                    <div className="empty detail-empty">暂无评分。</div>
                  ) : (
                    <ul className="list">
                      {skill.ratings.map((rating) => (
                        <li className="list-item" key={rating.id}>
                          <strong>
                            {rating.score}/5 · {rating.user}
                          </strong>
                          <p className="description">
                            {rating.version ? `v${rating.version} · ` : ""}
                            {formatDateTime(rating.createdAt)}
                          </p>
                          {rating.comment ? <p className="description">{rating.comment}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            </>
          ) : null}
        </section>

        {issueModalOpen ? (
          <div
            className="modal-overlay"
            onClick={closeIssueModal}
            role="presentation"
          >
            <div
              aria-labelledby="issue-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Submit issue</span>
                  <h3 id="issue-modal-title">提交 Issue</h3>
                </div>
                <button aria-label="关闭" className="modal-close" onClick={closeIssueModal} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="modal-form" onSubmit={handleSubmitIssue}>
                <div className="publish-form-grid">
                  <label className="field">
                    <span>类型</span>
                    <select
                      className="contributor-select"
                      onChange={(event) => setIssueType(event.target.value as RegistryIssue["type"])}
                      value={issueType}
                    >
                      <option value="bug">bug</option>
                      <option value="security">security</option>
                      <option value="compatibility">compatibility</option>
                      <option value="feature">feature</option>
                      <option value="docs">docs</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>严重程度</span>
                    <select
                      className="contributor-select"
                      onChange={(event) => setIssueSeverity(event.target.value as RegistryIssue["severity"])}
                      value={issueSeverity}
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="critical">critical</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>标题</span>
                  <input
                    maxLength={256}
                    onChange={(event) => setIssueTitle(event.target.value)}
                    placeholder="简要描述问题"
                    required
                    value={issueTitle}
                  />
                </label>
                <label className="field">
                  <span>详情 <i>选填</i></span>
                  <textarea
                    maxLength={4096}
                    onChange={(event) => setIssueBody(event.target.value)}
                    placeholder="补充复现步骤、期望行为或影响范围"
                    rows={4}
                    value={issueBody}
                  />
                </label>
                {issueError ? <div className="error compact-error">{issueError}</div> : null}
                <div className="modal-actions">
                  <button className="button secondary" onClick={closeIssueModal} type="button">
                    取消
                  </button>
                  <button className="button primary" disabled={submittingIssue} type="submit">
                    {submittingIssue ? "提交中..." : "确认提交"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {ratingModalOpen ? (
          <div
            className="modal-overlay"
            onClick={closeRatingModal}
            role="presentation"
          >
            <div
              aria-labelledby="rating-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Submit rating</span>
                  <h3 id="rating-modal-title">提交评分</h3>
                </div>
                <button aria-label="关闭" className="modal-close" onClick={closeRatingModal} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="modal-form" onSubmit={handleSubmitRating}>
                <label className="field">
                  <span>评分</span>
                  <div aria-label="选择 1 到 5 星" className="rating-stars" role="group">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        aria-label={`${score} 星`}
                        aria-pressed={ratingScore === score}
                        className={`rating-star ${ratingScore >= score ? "active" : ""}`}
                        key={score}
                        onClick={() => setRatingScore(score)}
                        type="button"
                      >
                        <Star fill={ratingScore >= score ? "currentColor" : "none"} size={24} />
                      </button>
                    ))}
                  </div>
                  <small>当前版本：v{currentVersion.version}</small>
                </label>
                <label className="field">
                  <span>评论 <i>选填</i></span>
                  <textarea
                    maxLength={1024}
                    onChange={(event) => setRatingComment(event.target.value)}
                    placeholder="分享使用体验或改进建议"
                    rows={4}
                    value={ratingComment}
                  />
                </label>
                {ratingError ? <div className="error compact-error">{ratingError}</div> : null}
                <div className="modal-actions">
                  <button className="button secondary" onClick={closeRatingModal} type="button">
                    取消
                  </button>
                  <button className="button primary" disabled={submittingRating || ratingScore === 0} type="submit">
                    {submittingRating ? "提交中..." : "确认提交"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {unpublishModalOpen ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setUnpublishModalOpen(false);
              setManageError(null);
            }}
            role="presentation"
          >
            <div
              aria-labelledby="unpublish-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Unpublish skill</span>
                  <h3 id="unpublish-modal-title">下架 Skill</h3>
                </div>
                <button
                  aria-label="关闭"
                  className="modal-close"
                  onClick={() => {
                    setUnpublishModalOpen(false);
                    setManageError(null);
                  }}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-form">
                <p className="description">
                  下架后，<strong>{skill.name}</strong> 将从 Skill 广场、排行榜和公开搜索中隐藏，其他用户无法访问或下载。
                  你可以继续在此页面查看，之后可通过「上架」恢复公开。
                </p>
                {manageError ? <div className="error compact-error">{manageError}</div> : null}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setUnpublishModalOpen(false);
                      setManageError(null);
                    }}
                    type="button"
                  >
                    取消
                  </button>
                  <button className="button primary" disabled={unpublishingSkill} onClick={() => void handleUnpublish()} type="button">
                    {unpublishingSkill ? "下架中…" : "确认下架"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {republishModalOpen ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setRepublishModalOpen(false);
              setManageError(null);
            }}
            role="presentation"
          >
            <div
              aria-labelledby="republish-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Republish skill</span>
                  <h3 id="republish-modal-title">上架 Skill</h3>
                </div>
                <button
                  aria-label="关闭"
                  className="modal-close"
                  onClick={() => {
                    setRepublishModalOpen(false);
                    setManageError(null);
                  }}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-form">
                <p className="description">
                  将 <strong>{skill.name}</strong> 重新上架到 Skill 广场与排行榜，使用当前最新版本 v{currentVersion.version}，无需发布新版本。
                </p>
                {manageError ? <div className="error compact-error">{manageError}</div> : null}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setRepublishModalOpen(false);
                      setManageError(null);
                    }}
                    type="button"
                  >
                    取消
                  </button>
                  <button className="button primary" disabled={republishingSkill} onClick={() => void handleRepublish()} type="button">
                    {republishingSkill ? "上架中…" : "确认上架"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {versionManageModal ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setVersionManageModal(null);
              setManageError(null);
            }}
            role="presentation"
          >
            <div
              aria-labelledby="version-manage-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">
                    {versionManageModal.action === "unpublish" ? "Unpublish version" : "Republish version"}
                  </span>
                  <h3 id="version-manage-modal-title">
                    {versionManageModal.action === "unpublish" ? "下架版本" : "恢复版本上架"}
                  </h3>
                </div>
                <button
                  aria-label="关闭"
                  className="modal-close"
                  onClick={() => {
                    setVersionManageModal(null);
                    setManageError(null);
                  }}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-form">
                <p className="description">
                  {versionManageModal.action === "unpublish" ? (
                    <>
                      下架 <strong>v{versionManageModal.version}</strong> 后，其他用户将无法查看或下载该版本。
                      最新版本 v{skill.latestVersion} 不受影响。
                    </>
                  ) : (
                    <>
                      将 <strong>v{versionManageModal.version}</strong> 恢复上架后，其他用户可再次查看并下载该版本。
                    </>
                  )}
                </p>
                {manageError ? <div className="error compact-error">{manageError}</div> : null}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setVersionManageModal(null);
                      setManageError(null);
                    }}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="button primary"
                    disabled={managingVersion}
                    onClick={() => void handleVersionManageConfirm()}
                    type="button"
                  >
                    {managingVersion
                      ? "处理中…"
                      : versionManageModal.action === "unpublish"
                        ? "确认下架"
                        : "确认恢复"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {deleteModalOpen ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setDeleteModalOpen(false);
              setManageError(null);
            }}
            role="presentation"
          >
            <div
              aria-labelledby="delete-modal-title"
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Delete skill</span>
                  <h3 id="delete-modal-title">删除 Skill</h3>
                </div>
                <button
                  aria-label="关闭"
                  className="modal-close"
                  onClick={() => {
                    setDeleteModalOpen(false);
                    setManageError(null);
                  }}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-form">
                <p className="description">
                  将把 <strong>{skill.name}</strong>（<span className="mono">{skill.slug}</span>）移入回收站，并从 Skill
                  广场与搜索中隐藏。回收站保留 3 天，期间可在个人中心恢复；到期后将永久删除所有版本与数据。
                </p>
                {manageError ? <div className="error compact-error">{manageError}</div> : null}
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setManageError(null);
                    }}
                    type="button"
                  >
                    取消
                  </button>
                  <button className="button secondary danger" disabled={deletingSkill} onClick={() => void handleDelete()} type="button">
                    {deletingSkill ? "移入中…" : "确认移入回收站"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
