import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BarChart3, BookOpen, Boxes, ShieldCheck, UserCircle } from "lucide-react";

const quickLinks: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    href: "/skills",
    label: "Skills 市场",
    description: "搜索、筛选并安装已审查的 Agent Skill。",
    icon: Boxes,
  },
  {
    href: "/creators",
    label: "Creators",
    description: "浏览创作者主页与已发布作品。",
    icon: UserCircle,
  },
  {
    href: "/leaderboard",
    label: "榜单",
    description: "按下载、评分与发布时间排序。",
    icon: BarChart3,
  },
  {
    href: "/reviews",
    label: "Audits",
    description: "查看 SkillSpector / VirusTotal 审查摘要。",
    icon: ShieldCheck,
  },
  {
    href: "/docs/cli-developer-guide",
    label: "站内文档",
    description: "格式规范、发布流程与 CLI 教程。",
    icon: BookOpen,
  },
];

export function HomeQuickLinks() {
  return (
    <section className="home-quick-links" aria-label="平台快捷入口">
      {quickLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Link className="home-quick-link" href={item.href} key={item.href}>
            <Icon size={20} />
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </Link>
        );
      })}
    </section>
  );
}
