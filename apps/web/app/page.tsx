"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Braces,
  Code2,
  FileText,
  GitBranch,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "../components/AppShell";
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

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = query.trim() ? `/skills?query=${encodeURIComponent(query.trim())}` : "/skills";
    router.push(target);
  }

  return (
    <AppShell title="首页">
      <div className="homepage">
        <section className="homepage-hero">
          <div className="homepage-hero-copy">
            <span className="homepage-kicker">
              <Sparkles size={14} />
              MonoSkillNavigator · Agent Skill registry
            </span>
            <h1>Discover trusted skills from standout creators.</h1>
            <p>
              把可复用的 Agent 工作流整理为可发现、可审查、可追溯的 Skill。浏览公开条目，或从一个清晰的
              <code>SKILL.md</code> 开始发布自己的能力包。
            </p>

            <form className="homepage-search" onSubmit={handleSearch}>
              <Search aria-hidden="true" size={18} />
              <input
                aria-label="搜索 Skill"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Skill、作者或使用场景"
                value={query}
              />
              <button aria-label="提交搜索" type="submit">
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="homepage-hero-actions">
              <Link className="button homepage-button-primary" href="/skills">
                探索公开 Skill <ArrowRight size={16} />
              </Link>
              <Link className="button homepage-button-secondary" href="/skills/publish">
                发布一个 Skill
              </Link>
            </div>

            <div className="homepage-hero-meta">
              <span>SKILL.md 格式校验</span>
              <span>审查结果可查</span>
              <span>版本历史可回看</span>
            </div>
          </div>

          <div aria-hidden="true" className="homepage-signal-stage">
            <div className="homepage-signal-grid" />
            <div className="homepage-signal-orbit homepage-signal-orbit-one" />
            <div className="homepage-signal-orbit homepage-signal-orbit-two" />
            <div className="homepage-signal-route homepage-signal-route-one" />
            <div className="homepage-signal-route homepage-signal-route-two" />

            <div className="homepage-signal-card homepage-signal-file">
              <span className="homepage-signal-icon"><FileText size={18} /></span>
              <span>
                <small>package entry</small>
                <strong>SKILL.md</strong>
              </span>
            </div>
            <div className="homepage-signal-core">
              <span>MONO</span>
              <i />
            </div>
            <div className="homepage-signal-card homepage-signal-review">
              <span className="homepage-signal-icon"><ShieldCheck size={18} /></span>
              <span>
                <small>review trace</small>
                <strong>审查摘要</strong>
              </span>
            </div>
            <div className="homepage-signal-card homepage-signal-version">
              <span className="homepage-signal-icon"><GitBranch size={18} /></span>
              <span>
                <small>release trail</small>
                <strong>版本记录</strong>
              </span>
            </div>
            <div className="homepage-signal-pulse homepage-signal-pulse-one" />
            <div className="homepage-signal-pulse homepage-signal-pulse-two" />
          </div>
        </section>

        <section className="homepage-discovery">
          <div className="homepage-section-heading">
            <div>
              <span className="homepage-section-label">探索</span>
              <h2>从正在解决的问题开始。</h2>
              <p>按目录分类浏览公开 Skill，再进入详情了解版本、发布者与审查信息。</p>
            </div>
            <Link className="homepage-inline-link" href="/skills">
              查看全部 <ArrowRight size={15} />
            </Link>
          </div>

          <div className="homepage-category-grid">
            {SKILL_CATEGORY_OPTIONS.slice(0, 6).map((category) => (
              <Link
                className="homepage-category-card"
                href={`/skills?category=${encodeURIComponent(category)}`}
                key={category}
              >
                <SkillCategoryLabel category={category} iconSize={18} />
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ))}
          </div>
        </section>

        <section className="homepage-featured">
          <div className="homepage-section-heading homepage-featured-heading">
            <div>
              <span className="homepage-section-label">精选内容</span>
              <h2>从公开注册表实时挑选。</h2>
              <p>按热度、评分或最近更新查看当前可探索的 Skill。</p>
            </div>
            <Link className="homepage-inline-link" href="/leaderboard">
              打开榜单 <ArrowRight size={15} />
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
            <span>来自公开 Skill 注册表</span>
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
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="homepage-skill-skeleton" key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="homepage-load-state">
              <Boxes aria-hidden="true" size={22} />
              <div>
                <strong>公开注册表还没有可展示的 Skill。</strong>
                <p>可先从 <code>SKILL.md</code> 准备一个能力包，再通过 Web 或 skillnav 发布。</p>
              </div>
              <Link className="button secondary compact" href="/skills/publish">前往发布</Link>
            </div>
          ) : (
            <div className="homepage-featured-grid">
              {items.slice(0, 6).map((skill) => (
                <SkillCard key={skill.slug} skill={skill} />
              ))}
            </div>
          )}
        </section>

        <section className="homepage-trust">
          <div className="homepage-section-heading">
            <div>
              <span className="homepage-section-label">可信审查</span>
              <h2>不是只看描述，也保留检查的线索。</h2>
              <p>每个环节都围绕包结构、静态风险与可靠性报告组织，便于在安装前做自己的判断。</p>
            </div>
            <Link className="homepage-inline-link" href="/reviews">
              查看审查中心 <ArrowRight size={15} />
            </Link>
          </div>

          <div className="homepage-trust-grid">
            <Link className="homepage-trust-card" href="/docs/skill-format">
              <span className="homepage-trust-icon"><FileText size={20} /></span>
              <div>
                <h3>从 SKILL.md 开始</h3>
                <p>发布时读取入口文件和元数据，帮助保持包结构与登记信息一致。</p>
              </div>
              <span className="homepage-card-link">查看格式 <ArrowRight size={14} /></span>
            </Link>
            <Link className="homepage-trust-card" href="/docs/security-scan">
              <span className="homepage-trust-icon"><ShieldCheck size={20} /></span>
              <div>
                <h3>静态安全审查</h3>
                <p>SkillSpector 与 VirusTotal 的结果会成为审查记录的一部分，而不是安全保证。</p>
              </div>
              <span className="homepage-card-link">了解检测 <ArrowRight size={14} /></span>
            </Link>
            <Link className="homepage-trust-card" href="/docs/halucatch-review">
              <span className="homepage-trust-icon"><Braces size={20} /></span>
              <div>
                <h3>五维可靠性报告</h3>
                <p>在详情页查看 HaluCatch 评估，让能力边界与风险判断更容易被追溯。</p>
              </div>
              <span className="homepage-card-link">了解评估 <ArrowRight size={14} /></span>
            </Link>
          </div>
        </section>

        <section className="homepage-publish">
          <div className="homepage-publish-copy">
            <span className="homepage-kicker">
              <KeyRound size={14} />
              发布与版本
            </span>
            <h2>用你习惯的入口，把 Skill 交给注册表。</h2>
            <p>
              在浏览器上传文件夹或 ZIP，或通过 skillnav CLI 完成登录与发布。每个版本都保留关联的包快照、审查结果和变更记录。
            </p>
            <div className="homepage-hero-actions">
              <Link className="button homepage-button-primary" href="/skills/publish">
                从 Web 发布 <ArrowRight size={16} />
              </Link>
              <Link className="button homepage-button-secondary" href="/docs/cli-developer-guide">
                阅读 CLI 指南
              </Link>
            </div>
          </div>

          <div className="homepage-publish-paths">
            <article className="homepage-publish-card">
              <span className="homepage-publish-icon"><Boxes size={20} /></span>
              <div>
                <h3>浏览器上传</h3>
                <p>选择一个 Skill 文件夹或 ZIP。平台解析入口文件，并在提交前补全发布信息。</p>
              </div>
              <Link className="homepage-card-link" href="/skills/publish">
                打开发布页 <ArrowRight size={14} />
              </Link>
            </article>

            <article className="homepage-publish-card homepage-cli-card">
              <div className="homepage-cli-card-head">
                <span className="homepage-publish-icon"><Code2 size={20} /></span>
                <span>skillnav CLI</span>
              </div>
              <pre>{skillnavHomeCliExamples()}</pre>
              <Link className="homepage-card-link" href="/docs/cli-developer-guide">
                查看命令说明 <ArrowRight size={14} />
              </Link>
            </article>

            <div className="homepage-version-trail">
              <GitBranch aria-hidden="true" size={20} />
              <p>
                <strong>版本不会覆盖历史。</strong>
                新版本沿用不可变的 slug，并在 Skill 详情中保留可查看的版本记录。
              </p>
            </div>
          </div>
        </section>

        <section className="homepage-final-cta">
          <div>
            <span className="homepage-section-label">下一步</span>
            <h2>让下一项 Agent 能力，拥有清晰的来处与去向。</h2>
            <p>从阅读公开 Skill、查看审查信息，或准备自己的 SKILL.md 开始。</p>
          </div>
          <div className="homepage-final-actions">
            <Link className="button homepage-final-primary" href="/skills/publish">
              发布 Skill <ArrowRight size={16} />
            </Link>
            <Link className="button homepage-final-secondary" href="/docs/quick-start-tutorial">
              阅读新手教程
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
