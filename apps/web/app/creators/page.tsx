"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Search, Sparkles, UserRound } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { resolveBrandName } from "../../lib/brand-name";
import { getCreators } from "../../lib/api";
import type { CreatorSummary } from "../../lib/creators";
import { formatNumber } from "../../lib/format";

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const items = await getCreators();
        if (!cancelled) {
          setCreators(items);
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
  }, []);

  const visibleCreators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return creators;
    }
    return creators.filter(
      (creator) =>
        creator.name.toLowerCase().includes(normalizedQuery) || creator.handle.includes(normalizedQuery)
    );
  }, [creators, query]);

  return (
    <AppShell title="Creators">
      <div className="market-stack">
        <section className="creator-hero">
          <span className="eyebrow">
            <Sparkles size={14} />
            Creators
          </span>
          <h1>Explore publishers behind trusted skills.</h1>
          <p>查看平台中的发布者、贡献者、代表 Skill、发布数量和下载表现。</p>
        </section>

        <section className="market-panel">
          <div className="market-toolbar">
            <div className="searchbox compact-search">
              <Search size={16} color="var(--muted)" />
              <input
                aria-label="搜索 Creator"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search creators..."
                value={query}
              />
            </div>
          </div>

          <div className="section-head">
            <div>
              <h2>Popular publishers</h2>
              <p>包含已发布 Skill 的 Creator 与已注册但尚未发布的用户。</p>
            </div>
          </div>

          {error ? <div className="error">{error}。请确认 API 已启动。</div> : null}

          {loading ? (
            <div className="publisher-list">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="publisher-row skeleton-row" key={index} />
              ))}
            </div>
          ) : visibleCreators.length === 0 ? (
            <div className="empty">暂无匹配 Creator。</div>
          ) : (
            <div className="publisher-list">
              {visibleCreators.map((creator) => (
                <Link className="publisher-row" href={`/creators/${encodeURIComponent(creator.handle)}`} key={creator.handle}>
                  <div className="creator-avatar">{creator.name.slice(0, 1).toUpperCase()}</div>
                  <div className="publisher-main">
                    <div className="publisher-title">
                      <strong>{creator.name}</strong>
                      <span>@{creator.handle}</span>
                    </div>
                    <p>{creator.skills.slice(0, 3).map((skill) => skill.name).join(" · ") || `Publisher on ${resolveBrandName()}.`}</p>
                  </div>
                  <div className="publisher-stats">
                    <span><UserRound size={13} /> {formatNumber(creator.published)} published</span>
                    <span><Download size={13} /> {formatNumber(creator.downloads)} downloads</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
