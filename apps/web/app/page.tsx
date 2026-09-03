"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Braces,
  Code2,
  FileText,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
import { HomeAgentInstallBar } from "../components/home/HomeAgentInstallBar";
import { SkillCategoryLabel } from "../components/SkillCategoryIcon";
import { SkillCard } from "../components/SkillCard";
import { skillnavHomeCliExamples } from "../lib/cli-examples";
import { getLeaderboard } from "../lib/api";
import { SKILL_CATEGORY_OPTIONS } from "../lib/skill-categories";
import type { SkillSearchResult } from "../lib/types";

const sortTabs = [
  { value: "downloads", label: "热门" },
  { value: "rating", label: "高评分" },
  { value: "recent", label: "最近更新" }
];

const trustRecords = [
  {
    href: "/docs/skill-format",
    icon: FileText,
    index: "01",
    title: "从 SKILL.md 开始",
    description: "读取入口文件与元数据，让包结构和登记信息有清晰、可检查的基础。",
  },
  {
    href: "/docs/security-scan",
    icon: ShieldCheck,
    index: "02",
    title: "保留静态审查线索",
    description: "SkillSpector 与 VirusTotal 的结果会进入审查记录，供安装前进一步判断。",
  },
  {
    href: "/docs/halucatch-review",
    icon: Braces,
    index: "03",
    title: "查看可靠性报告",
    description: "HaluCatch 的五维评估帮助厘清能力边界，并将发现保留在详情页中。",
  },
];

export default function HomePage() {
  const [items, setItems] = useState<SkillSearchResult[]>([]);
  const [sort, setSort] = useState("downloads");
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

  return (
    <AppShell title="首页">
      <div className="homepage">
        <section aria-labelledby="home-hero-title" className="homepage-hero">
          <div className="homepage-hero-copy">
            <h1 id="home-hero-title">发现可信Skill，放心复用</h1>
            <p className="homepage-hero-lead">发布要审查、安装有记录、质量有评分、版本可追溯</p>

            <HomeAgentInstallBar />

            <div className="homepage-hero-actions">
              <Link className="button homepage-button-primary" href="/skills">
                探索公开 Skill <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button homepage-button-secondary" href="/skills/publish">
                发布一个 Skill
              </Link>
            </div>

            <ul aria-label="平台能力" className="homepage-hero-meta">
              <li>SKILL.md 格式校验</li>
              <li>审查结果可查</li>
              <li>版本历史可回看</li>
            </ul>
          </div>

          <div aria-hidden="true" className="homepage-hero-proof">
            <div className="homepage-proof-stage">
              <div className="homepage-proof-glow" />
              <div className="homepage-proof-document-stack">
                <div className="homepage-proof-document-back" aria-hidden="true" />
                <div className="homepage-proof-document">
                  <div className="homepage-proof-document-head">
                    <span className="homepage-proof-window">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span>skill package</span>
                    <span>latest</span>
                  </div>
                  <div className="homepage-proof-code">
                    <span>
                      <b>name:</b> research-notes
                    </span>
                    <span>
                      <b>slug:</b> research-notes
                    </span>
                    <span>
                      <b>entry:</b> SKILL.md
                    </span>
                  </div>
                  <div className="homepage-proof-document-foot">
                    <span>package manifest</span>
                    <span>ready to review</span>
                  </div>
                </div>
              </div>

              <div className="homepage-proof-trace">
              <div className="homepage-proof-trace-line" />
              <div className="homepage-proof-row">
                <span className="homepage-proof-icon"><FileText size={16} /></span>
                <span>
                  <small>package entry</small>
                  <strong>SKILL.md</strong>
                </span>
                <em>已读取</em>
              </div>
              <div className="homepage-proof-row">
                <span className="homepage-proof-icon"><ShieldCheck size={16} /></span>
                <span>
                  <small>review trace</small>
                  <strong>审查摘要</strong>
                </span>
                <em>可查看</em>
              </div>
              <div className="homepage-proof-row">
                <span className="homepage-proof-icon"><GitBranch size={16} /></span>
                <span>
                  <small>release trail</small>
                  <strong>版本记录</strong>
                </span>
                <em>可追溯</em>
              </div>
            </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="home-discovery-title" className="homepage-discovery">
          <div className="homepage-section-heading">
            <div>
              <span className="homepage-section-label">探索</span>
              <h2 id="home-discovery-title">从正在解决的问题开始。</h2>
              <p>按领域浏览公开 Skill，再进入详情查看版本、发布者与审查信息。</p>
            </div>
          </div>

          <div className="homepage-discovery-layout">
            <div className="homepage-category-panel">
              <span className="homepage-panel-label">按领域浏览</span>
              <div className="homepage-category-grid">
                {SKILL_CATEGORY_OPTIONS.slice(0, 6).map((category) => (
                  <Link
                    className="homepage-category-card"
                    href={`/skills?category=${encodeURIComponent(category)}`}
                    key={category}
                  >
                    <SkillCategoryLabel category={category} iconSize={17} />
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                ))}
              </div>
            </div>

            <aside className="homepage-discovery-note">
              <span className="homepage-panel-label">更快缩小范围</span>
              <strong>从名称、作者或使用场景搜索。</strong>
              <p>目录用于浏览，搜索用于直接抵达；两种方式都能通向同一个公开平台。</p>
              <Link className="homepage-inline-link" href="/skills">
                浏览全部 Skill <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </aside>
          </div>
        </section>

        <section aria-labelledby="home-featured-title" className="homepage-featured">
          <div className="homepage-section-heading homepage-featured-heading">
            <div>
              <span className="homepage-section-label">精选内容</span>
              <h2 id="home-featured-title">此刻值得细看的 Skill。</h2>
              <p>按热度、评分或最近更新，从公开平台中挑选三个可继续探索的条目。</p>
            </div>
            <Link className="homepage-inline-link" href="/leaderboard">
              打开榜单 <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>

          <div className="homepage-featured-controls">
            <div aria-label="精选排序方式" className="segmented">
              {sortTabs.map((tab) => (
                <button
                  aria-pressed={sort === tab.value}
                  className={sort === tab.value ? "active" : ""}
                  key={tab.value}
                  onClick={() => setSort(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="homepage-featured-source">来自公开 Skill 平台</span>
          </div>

          {error ? (
            <div className="homepage-load-state homepage-load-error" role="alert">
              <ShieldCheck aria-hidden="true" size={20} />
              <div>
                <strong>{error}</strong>
                <p>请确认 API 已通过 npm run dev:api 启动。</p>
              </div>
            </div>
          ) : loading ? (
            <div aria-busy="true" aria-label="正在加载精选 Skill" className="homepage-featured-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="homepage-skill-skeleton" key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="homepage-load-state">
              <Boxes aria-hidden="true" size={22} />
              <div>
                <strong>公开平台还没有可展示的 Skill。</strong>
                <p>可先从 <code>SKILL.md</code> 准备一个能力包，再通过 Web 或 skillnav 发布。</p>
              </div>
              <Link className="button secondary compact" href="/skills/publish">前往发布</Link>
            </div>
          ) : (
            <div className="homepage-featured-grid">
              {items.slice(0, 3).map((skill) => (
                <SkillCard key={skill.slug} skill={skill} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="home-trust-title" className="homepage-trust">
          <div className="homepage-trust-heading">
            <div>
              <span className="homepage-section-label">可信审查</span>
              <h2 id="home-trust-title">不仅看描述，也保留检查的线索。</h2>
              <p>每个环节都围绕包结构、静态风险与可靠性报告组织，便于在安装前做自己的判断。</p>
            </div>
            <Link className="homepage-inline-link" href="/reviews">
              查看审查中心 <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>

          <ol className="homepage-trust-list">
            {trustRecords.map((record) => {
              const Icon = record.icon;
              return (
                <li key={record.index}>
                  <span aria-hidden="true" className="homepage-trust-index">{record.index}</span>
                  <span aria-hidden="true" className="homepage-trust-icon"><Icon size={19} /></span>
                  <div>
                    <h3>
                      <Link href={record.href}>
                        {record.title} <ArrowRight aria-hidden="true" size={15} />
                      </Link>
                    </h3>
                    <p>{record.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="home-publish-title" className="homepage-publish">
          <div className="homepage-publish-copy">
            <span className="homepage-kicker">
              <GitBranch aria-hidden="true" size={14} />
              发布与版本
            </span>
            <h2 id="home-publish-title">用习惯的入口，把 Skill 交给平台。</h2>
            <p>
              在浏览器上传文件夹或 ZIP，或通过 skillnav CLI 完成登录与发布。每个版本都会关联包快照、审查结果与变更记录。
            </p>
            <div className="homepage-hero-actions">
              <Link className="button homepage-button-primary" href="/skills/publish">
                从 Web 发布 <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button homepage-button-secondary" href="/docs/cli-developer-guide">
                阅读 CLI 指南
              </Link>
            </div>
          </div>

          <div className="homepage-publish-command">
            <div className="homepage-publish-command-head">
              <span className="homepage-publish-icon"><Code2 aria-hidden="true" size={20} /></span>
              <span>
                <small>ship with skillnav</small>
                <strong>CLI 发布路径</strong>
              </span>
              <span className="homepage-command-status">可重复执行</span>
            </div>
            <pre aria-label="skillnav CLI 发布示例">{skillnavHomeCliExamples()}</pre>
            <div className="homepage-version-trail">
              <GitBranch aria-hidden="true" size={19} />
              <p>
                <strong>版本不会覆盖历史。</strong>
                新版本沿用不可变的 slug，并在 Skill 详情中保留可查看的版本记录。
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
