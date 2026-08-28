"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Braces,
  Cloud,
  Code2,
  FileText,
  GitBranch,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
import { SkillCard } from "../components/SkillCard";
import { skillnavHomeCliExamples } from "../lib/cli-examples";
import { getLeaderboard } from "../lib/api";
import type { SkillSearchResult } from "../lib/types";

const sortTabs = [
  { value: "downloads", label: "Trending" },
  { value: "rating", label: "Top rated" },
  { value: "recent", label: "New" }
];

const appTiles = [
  { name: "GitHub", icon: GitBranch, description: "Review PRs, manage issues, and automate repo workflows." },
  { name: "VS Code", icon: Code2, description: "Edit repos, run tasks, and ship code from the editor." },
  { name: "Docs", icon: FileText, description: "Read, draft, and maintain platform documentation." },
  { name: "Cloud", icon: Cloud, description: "Connect release workflows and cloud deployment checks." },
  { name: "Security", icon: ShieldCheck, description: "Run review gates before installing or publishing skills." },
  { name: "API", icon: Braces, description: "Integrate registry metadata, audit reports, and version downloads." }
];

export default function HomePage() {
  const router = useRouter();
  const [items, setItems] = useState<SkillSearchResult[]>([]);
  const [sort, setSort] = useState("downloads");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getLeaderboard(sort, 12);
        if (!cancelled) {
          setItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
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
  }, [sort]);

  const creators = useMemo(() => {
    const names = new Map<string, number>();
    for (const skill of items) {
      for (const contributor of skill.contributors) {
        names.set(contributor.name, (names.get(contributor.name) ?? 0) + 1);
      }
    }
    return [...names.entries()].slice(0, 8);
  }, [items]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = query.trim() ? `/skills?query=${encodeURIComponent(query.trim())}` : "/skills";
    router.push(target);
  }

  return (
    <AppShell title="Discover">
      <div className="market-stack">
        <section className="market-hero">
          <span className="eyebrow dark">
            <Sparkles size={14} />
            Skills · Plugins · Audits
          </span>
          <h1>Discover trusted skills from standout creators.</h1>
          <p>
            搜索、审查、安装和分发适用于 AI Agent 的 Skill。发布前通过包格式校验；发布后可在详情页查看 HaluCatch 五维质量与 SkillSpector 安全审查。
          </p>

          <form className="hero-search" onSubmit={handleSearch}>
            <Search size={18} />
            <input
              aria-label="搜索 Skill"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills, creators, audits..."
              value={query}
            />
            <kbd>K</kbd>
          </form>

          <div className="hero-actions">
            <Link className="button primary" href="/skills">
              Browse skills <ArrowRight size={16} />
            </Link>
            <Link className="button secondary" href="/reviews">
              View audits
            </Link>
          </div>
        </section>

        <section className="market-panel">
          <div className="market-toolbar">
            <div className="segmented">
              {sortTabs.map((tab) => (
                <button
                  className={sort === tab.value ? "active" : ""}
                  key={tab.value}
                  onClick={() => setSort(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="error">{error}。请确认 API 已通过 npm run dev:api 启动。</div> : null}

          {loading ? (
            <div className="claw-list">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="skill-row skeleton-row" key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">暂无 Skill。可以先登录后发布 demo skill。</div>
          ) : (
            <div className="claw-list">
              {items.slice(0, 8).map((skill) => (
                <SkillCard key={skill.slug} skill={skill} variant="row" />
              ))}
            </div>
          )}
        </section>

        <section className="market-section">
          <div className="section-head">
            <div>
              <h2>Popular creators</h2>
              <p>Explore skills from active maintainers and teams.</p>
            </div>
            <Link className="button secondary compact" href="/creators">Browse creators</Link>
          </div>
          <div className="creator-grid">
            {(creators.length ? creators : [["skill-platform", 0], ["security-team", 0], ["review-bot", 0], ["demo-owner", 0]]).map(
              ([name, count]) => (
                <Link className="creator-card" href={`/creators/${encodeURIComponent(String(name).toLowerCase())}`} key={name}>
                  <div className="creator-avatar">{String(name).slice(0, 1).toUpperCase()}</div>
                  <strong>{name}</strong>
                  <span>Publisher on SkillHub · {count} items</span>
                </Link>
              )
            )}
          </div>
        </section>

        <section className="market-section">
          <div className="section-head">
            <div>
              <h2>Skills for the apps you already use</h2>
              <p>Ready-made skills and review gates for your daily tools.</p>
            </div>
            <Link className="button secondary compact" href="/skills">Browse all skills</Link>
          </div>
          <div className="app-grid">
            {appTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div className="app-tile" key={tile.name}>
                  <Icon size={19} />
                  <strong>{tile.name}</strong>
                  <p>{tile.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="cli-panel">
          <div>
            <span className="eyebrow dark">
              <KeyRound size={14} />
              CLI publish & sync
            </span>
            <h2>Bring your skills to the registry.</h2>
            <p>在 Web 创建 API 密钥登录 skillnav 后，可发布文件夹或 zip 包；平台会自动审查并保留版本历史。</p>
          </div>
          <pre>{skillnavHomeCliExamples()}</pre>
        </section>
      </div>
    </AppShell>
  );
}
