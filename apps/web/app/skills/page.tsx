"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, Trophy, UploadCloud } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { SkillCategoryLabel } from "../../components/SkillCategoryIcon";
import { PillSelect } from "../../components/PillSelect";
import { SkillCard } from "../../components/SkillCard";
import { getLeaderboard, getSkills } from "../../lib/api";
import { skillnavPublishExample } from "../../lib/cli-examples";
import {
  normalizeSkillCategoryFilters,
  SKILL_CATEGORY_OPTIONS
} from "../../lib/skill-categories";
import type { SkillSearchResult } from "../../lib/types";

const tabs = ["Skills", "Plugins"];

const sortOptions = [
  { value: "recent", label: "New" },
  { value: "rating", label: "Rating" },
  { value: "downloads", label: "Trending" }
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState("Skills");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeCategories = useMemo(
    () => normalizeSkillCategoryFilters(selectedCategories),
    [selectedCategories]
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("query") ?? "");
    const urlCategories = url.searchParams.getAll("category");
    setSelectedCategories(normalizeSkillCategoryFilters(urlCategories));
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.key === "k" || event.key === "K") && !event.metaKey && !event.ctrlKey && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const items = query.trim()
          ? await getSkills(query, activeCategories)
          : await getLeaderboard(sort, 50, activeCategories);
        if (!cancelled) {
          setSkills(items);
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

    const timeout = window.setTimeout(load, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, sort, activeCategories]);

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  }

  return (
    <AppShell title="Skill 广场">
      <div className="page-stack">
        <section className="section-head">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} />
              Skills marketplace
            </span>
            <h2 style={{ marginTop: 14 }}>Discover skills and plugins from trusted creators</h2>
            <p>浏览已发布 Skill、查看评分、下载量和安全状态，点击条目进入详情页。</p>
          </div>
          <Link className="button primary" href="/skills/publish">
            <UploadCloud size={15} /> 发布
          </Link>
        </section>

        <section className="market-panel">
          <div className="market-toolbar">
            <div className="segmented">
              {tabs.map((item) => (
                <button
                  className={tab === item ? "active" : ""}
                  key={item}
                  onClick={() => setTab(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="category-row">
              {SKILL_CATEGORY_OPTIONS.map((item) => (
                <button
                  aria-pressed={selectedCategories.includes(item)}
                  className={`category-chip ${selectedCategories.includes(item) ? "active" : ""}`}
                  key={item}
                  onClick={() => toggleCategory(item)}
                  type="button"
                >
                  <SkillCategoryLabel category={item} iconSize={13} />
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar inset">
            <div className="searchbox">
            <Search size={17} color="var(--muted)" />
            <input
              aria-label="搜索 Skill"
              ref={searchInputRef}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by skill name, creator, description...  Press K"
              value={query}
            />
            </div>
            <PillSelect
              ariaLabel="排序方式"
              disabled={Boolean(query.trim())}
              icon={<Trophy size={16} />}
              onChange={setSort}
              options={sortOptions}
              value={sort}
            />
          </div>
        </section>

        {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

        {tab !== "Skills" ? (
          <div className="empty">{tab} 页面正在建设中，当前先开放 Skills 市场。</div>
        ) : loading ? (
          <div className="claw-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skill-row skeleton-row" key={index} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="empty">
            {activeCategories.length > 0
              ? "暂无匹配所选分类的 Skill。"
              : `暂无匹配 Skill。可在 Web 创建 API 密钥后运行 ${skillnavPublishExample("examples/demo-skill")}。`}
          </div>
        ) : (
          <div className="claw-list">
            {skills.map((skill) => (
              <SkillCard key={skill.slug} skill={skill} variant="row" />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
