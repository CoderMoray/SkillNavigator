import Link from "next/link";
import { ArrowRight, ClipboardCheck, ShieldCheck, Sparkles, Terminal } from "lucide-react";

const trustPillars = [
  {
    icon: ClipboardCheck,
    title: "SKILL.md / skill-spec",
    description: "校验 frontmatter、目录结构与不可变 slug，让发布包具备可验证的格式基础。",
  },
  {
    icon: ShieldCheck,
    title: "静态安全审查",
    description: "SkillSpector 扫描与 VirusTotal hash 查毒；平台不会执行 Skill 包中的脚本。",
  },
  {
    icon: Sparkles,
    title: "HaluCatch 五维可靠性",
    description: "从地基、代码风险、规则、护栏与复杂度生成可靠性评估和 findings 报告。",
  },
  {
    icon: Terminal,
    title: "多种发布方式",
    description: "支持 Web 上传 ZIP、skillnav CLI 推送与 HTTP API，版本可追踪、可下载。",
  },
];

export function HomeTrustSection() {
  return (
    <section className="market-section home-trust-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">可信发布</span>
          <h2>把专业能力，发布成可信的 Skill</h2>
          <p>面向个人开发者：格式、安全与可靠性审查结果与发布包一起进入平台。</p>
        </div>
        <div className="home-trust-actions">
          <Link className="button primary compact" href="/skills/publish">
            发布 Skill <ArrowRight size={14} />
          </Link>
          <Link className="button secondary compact" href="/docs/publish-workflow">
            发布流程
          </Link>
        </div>
      </div>

      <div className="home-trust-grid">
        {trustPillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <article className="home-trust-card" key={pillar.title}>
              <Icon size={22} />
              <h3>{pillar.title}</h3>
              <p>{pillar.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
