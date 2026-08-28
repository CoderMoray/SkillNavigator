"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, BadgeCheck, Download, LogOut, Package, RotateCcw, Search, Settings, Star, Trash2 } from "lucide-react";
import { SkillCard } from "./SkillCard";
import { ConfirmToast } from "./ConfirmToast";
import { ErrorToast } from "./ErrorToast";
import { SuccessToast } from "./SuccessToast";
import { PillSelect } from "./PillSelect";
import { clearAuthToken, getAuthToken } from "../lib/auth-token";
import { getBookmarkedSkills, getRecycleBin, logoutUser, purgeRecycleBinSkill, restoreSkill, type RecycleBinSkill } from "../lib/api";
import { normalizeHandle, type CreatorSummary } from "../lib/creators";
import { formatDateTime, formatNumber } from "../lib/format";
import {
  listProfileSkills,
  PROFILE_SKILL_SORT_OPTIONS,
  type ProfileSkillSort
} from "../lib/profile-skills";
import type { PublicUser, SkillSearchResult } from "../lib/types";

const RECYCLE_RETENTION_DAYS = 3;

type CreatorProfileTab = "skills" | "plugins" | "bookmarks" | "recycle";

const profileTabs: Array<{ id: Exclude<CreatorProfileTab, "recycle" | "bookmarks">; label: (creator: CreatorSummary) => string }> = [
  { id: "skills", label: (creator) => `Skills ${creator.published}` },
  { id: "plugins", label: () => "Plugins 0" }
];

interface CreatorProfileViewProps {
  creator: CreatorSummary;
  viewer?: PublicUser | null;
  showBackLink?: boolean;
}

export function CreatorProfileView({ creator, viewer = null, showBackLink = true }: CreatorProfileViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CreatorProfileTab>("skills");
  const [recycleItems, setRecycleItems] = useState<RecycleBinSkill[]>([]);
  const [recycleLoading, setRecycleLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [restoringSlug, setRestoringSlug] = useState<string | null>(null);
  const [purgingSlug, setPurgingSlug] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState<{ slug: string; name: string } | null>(null);
  const [bookmarkItems, setBookmarkItems] = useState<SkillSearchResult[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillSort, setSkillSort] = useState<ProfileSkillSort>("recent");
  const isOwner = Boolean(viewer && normalizeHandle(viewer.username) === creator.handle);
  const visibleSkills = useMemo(
    () => listProfileSkills(creator.skills, skillQuery, skillSort),
    [creator.skills, skillQuery, skillSort]
  );
  const topSkillNames = creator.skills
    .slice(0, 3)
    .map((skill) => skill.name)
    .join(" · ");

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "recycle") {
      setActiveTab("recycle");
    } else if (tab === "bookmarks") {
      setActiveTab("bookmarks");
    }
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) {
      setBookmarkItems([]);
      return;
    }

    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      return;
    }

    setBookmarkLoading(true);
    setBookmarkError(null);
    void getBookmarkedSkills(token)
      .then((items) => {
        if (!cancelled) {
          setBookmarkItems(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBookmarkError(err instanceof Error ? err.message : "加载收藏失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBookmarkLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) {
      setRecycleItems([]);
      return;
    }

    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      return;
    }

    setRecycleLoading(true);
    void getRecycleBin(token)
      .then((items) => {
        if (!cancelled) {
          setRecycleItems(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorToast(err instanceof Error ? err.message : "加载回收站失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecycleLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  async function handleLogout() {
    const token = getAuthToken();
    clearAuthToken();
    if (token) {
      await logoutUser(token).catch(() => undefined);
    }
    window.location.href = "/";
  }

  async function handleRestore(slug: string) {
    const token = getAuthToken();
    if (!token) {
      setErrorToast("请先登录后再恢复 Skill。");
      return;
    }

    setErrorToast(null);
    setRestoringSlug(slug);
    try {
      await restoreSkill(token, slug);
      setRecycleItems((current) => current.filter((item) => item.slug !== slug));
      setSuccessToast(`已恢复 Skill「${slug}」。`);
      router.refresh();
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setRestoringSlug(null);
    }
  }

  function requestPurge(slug: string, name: string) {
    if (purgingSlug !== null) {
      return;
    }
    setPurgeConfirm({ slug, name });
  }

  async function handleConfirmPurge() {
    if (!purgeConfirm || purgingSlug !== null) {
      return;
    }

    const { slug, name } = purgeConfirm;
    const token = getAuthToken();
    if (!token) {
      setPurgeConfirm(null);
      setErrorToast("请先登录后再删除 Skill。");
      return;
    }

    setErrorToast(null);
    setPurgingSlug(slug);
    try {
      await purgeRecycleBinSkill(token, slug);
      setRecycleItems((current) => current.filter((item) => item.slug !== slug));
      setSuccessToast(`已永久删除 Skill「${name}」。`);
      router.refresh();
      setPurgeConfirm(null);
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "永久删除失败");
    } finally {
      setPurgingSlug(null);
    }
  }

  return (
    <>
      {purgeConfirm ? (
        <ConfirmToast
          confirmClassName="button secondary compact danger"
          confirmLabel="立即删除"
          confirming={purgingSlug === purgeConfirm.slug}
          confirmingLabel="删除中…"
          message={`确定立即永久删除 Skill「${purgeConfirm.name}」（${purgeConfirm.slug}）吗？此操作不可恢复，相关版本与 artifact 将被清除。`}
          onCancel={() => {
            if (purgingSlug === null) {
              setPurgeConfirm(null);
            }
          }}
          onConfirm={() => void handleConfirmPurge()}
          title="确认永久删除"
        />
      ) : null}
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      {successToast ? <SuccessToast message={successToast} onClose={() => setSuccessToast(null)} /> : null}
      <div className="market-stack">
      {showBackLink ? (
        <Link className="button secondary" href="/creators" style={{ width: "fit-content" }}>
          返回 Creators
        </Link>
      ) : null}

      <section className="profile-layout">
        <aside className="profile-card">
          <div className="profile-card-leading">
            <div className="profile-avatar">{creator.name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-identity">
              <div className="profile-name-row">
                <h1>{creator.name}</h1>
                {isOwner && viewer?.role === "admin" ? <BadgeCheck color="var(--blue)" size={20} /> : null}
              </div>
              <p>@{creator.handle}</p>
            </div>

            <div className="profile-stat-grid">
              <div className="profile-stat">
                <div className="profile-stat-main">
                  <Download aria-hidden className="profile-stat-icon" size={18} strokeWidth={1.75} />
                  <strong>{formatNumber(creator.downloads)}</strong>
                </div>
                <span>downloads</span>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-main">
                  <Star aria-hidden className="profile-stat-icon" size={18} strokeWidth={1.75} />
                  <strong>{creator.averageRating ? creator.averageRating.toFixed(1) : "new"}</strong>
                </div>
                <span>stars</span>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-main">
                  <Package aria-hidden className="profile-stat-icon" size={18} strokeWidth={1.75} />
                  <strong>{formatNumber(creator.published)}</strong>
                </div>
                <span>published</span>
              </div>
            </div>
          </div>

          <div className="profile-meta">
            <h2>About</h2>
            <p>
              {topSkillNames
                ? `Publisher behind ${topSkillNames}.`
                : isOwner && viewer?.role === "admin"
                  ? "Platform administrator."
                  : "Publisher on MonoSkillNavigator."}
            </p>
            {isOwner && viewer ? (
              <>
                <h2>Account</h2>
                <div className="tag-row">
                  <span className="badge">ID {viewer.id.slice(0, 8)}</span>
                  {viewer.email ? <span className="badge">{viewer.email}</span> : null}
                  <span className="badge">创建 {formatDateTime(viewer.createdAt)}</span>
                  <span className="badge">更新 {formatDateTime(viewer.updatedAt)}</span>
                </div>
              </>
            ) : null}
          </div>

          {isOwner ? (
            <div className="hero-actions profile-actions">
              <Link className="button secondary" href="/account/settings">
                <Settings size={15} /> 设置
              </Link>
              <button className="button secondary" onClick={handleLogout} type="button">
                <LogOut size={15} /> 登出
              </button>
            </div>
          ) : null}
        </aside>

        <section className="profile-content">
          <div className="market-toolbar">
            <div className="segmented">
              {profileTabs.map((tab) => (
                <button
                  className={activeTab === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label(creator)}
                </button>
              ))}
              {isOwner ? (
                <button
                  className={activeTab === "bookmarks" ? "active" : ""}
                  onClick={() => setActiveTab("bookmarks")}
                  type="button"
                >
                  收藏 {bookmarkItems.length}
                </button>
              ) : null}
              {isOwner ? (
                <button
                  className={activeTab === "recycle" ? "active" : ""}
                  onClick={() => setActiveTab("recycle")}
                  type="button"
                >
                  回收站 {recycleItems.length}
                </button>
              ) : null}
            </div>
            {activeTab === "skills" && creator.skills.length > 0 ? (
              <div className="toolbar inset">
                <div className="searchbox compact-search">
                  <Search size={16} color="var(--muted)" />
                  <input
                    aria-label="搜索 Skill"
                    onChange={(event) => setSkillQuery(event.target.value)}
                    placeholder="按名称、Slug 或描述搜索…"
                    value={skillQuery}
                  />
                </div>
                <PillSelect
                  ariaLabel="排序方式"
                  className="compact"
                  icon={<ArrowDownUp size={16} />}
                  onChange={(value) => setSkillSort(value as ProfileSkillSort)}
                  options={PROFILE_SKILL_SORT_OPTIONS}
                  value={skillSort}
                />
              </div>
            ) : null}
          </div>

          {activeTab === "skills" ? (
            creator.skills.length === 0 ? (
              <div className="empty">
                {isOwner
                  ? "暂无发布记录。可通过 CLI 或「添加 Skill」发布文件夹或 zip 包。"
                  : "该 Creator 暂无已发布 Skill。"}
              </div>
            ) : (
              <>
                {isOwner &&
                (creator.skills.some((skill) => skill.published === false) ||
                  creator.skills.some((skill) => skill.status === "rejected")) ? (
                  <p className="description" style={{ marginBottom: 12 }}>
                    已下架或审查未通过（已拒绝）的 Skill 仅在此个人中心对你可见，不会出现在 Skill 广场或搜索页。
                  </p>
                ) : null}
                {visibleSkills.length === 0 ? (
                  <div className="empty">暂无匹配的 Skill。</div>
                ) : (
                  <div className="claw-list">
                    {visibleSkills.map((skill) => (
                      <SkillCard key={skill.slug} skill={skill} variant="row" />
                    ))}
                  </div>
                )}
              </>
            )
          ) : null}

          {activeTab === "recycle" && isOwner ? (
            <>
              <p className="description" style={{ marginBottom: 12 }}>
                删除的 Skill 会在回收站保留 {RECYCLE_RETENTION_DAYS} 天，之后永久删除。期间可恢复，也可立即永久删除。
              </p>
              {recycleLoading ? (
                <div className="skeleton" />
              ) : recycleItems.length === 0 ? (
                <div className="empty">回收站为空。</div>
              ) : (
                <ul className="list">
                  {recycleItems.map((item) => (
                    <li className="list-item recycle-bin-item" key={item.slug}>
                      <div className="card-head">
                        <div>
                          <strong>{item.name}</strong>
                          <p className="description mono">{item.slug} · v{item.latestVersion}</p>
                        </div>
                        <div className="card-head-actions">
                          <button
                            className="button secondary compact"
                            disabled={restoringSlug === item.slug || purgingSlug === item.slug}
                            onClick={() => void handleRestore(item.slug)}
                            type="button"
                          >
                            <RotateCcw size={14} /> {restoringSlug === item.slug ? "恢复中…" : "恢复"}
                          </button>
                          <button
                            className="button secondary compact danger"
                            disabled={restoringSlug === item.slug || purgingSlug === item.slug || purgeConfirm !== null}
                            onClick={() => requestPurge(item.slug, item.name)}
                            type="button"
                          >
                            <Trash2 size={14} /> {purgingSlug === item.slug ? "删除中…" : "立即删除"}
                          </button>
                        </div>
                      </div>
                      <p className="description">
                        <Trash2 size={13} style={{ verticalAlign: "-2px" }} /> 删除于 {formatDateTime(item.deletedAt)}
                        ，将于 {formatDateTime(item.purgeAt)} 永久删除
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}

          {activeTab === "plugins" ? (
            <div className="empty">Plugins 功能暂未开放，当前平台仅支持 Skill 发布与浏览。</div>
          ) : null}

          {activeTab === "bookmarks" && isOwner ? (
            <>
              <p className="description" style={{ marginBottom: 12 }}>
                你收藏的 Skill 仅自己可见，方便快速回到常用包。
              </p>
              {bookmarkError ? <div className="error compact-error">{bookmarkError}</div> : null}
              {bookmarkLoading ? (
                <div className="skeleton" />
              ) : bookmarkItems.length === 0 ? (
                <div className="empty">暂无收藏。在 Skill 详情页点击「收藏」即可加入列表。</div>
              ) : (
                <div className="claw-list">
                  {bookmarkItems.map((skill) => (
                    <SkillCard key={skill.slug} skill={skill} variant="row" />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      </section>
    </div>
    </>
  );
}
