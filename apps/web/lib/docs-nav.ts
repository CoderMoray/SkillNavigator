export type DocNavItem = {
  slug: string;
  title: string;
  sidebarTitle: string;
  href: string;
  filename: string;
};

export const DEFAULT_DOC_SLUG = "monoskill-navigator";

export const DOC_NAV: DocNavItem[] = [
  {
    slug: "monoskill-navigator",
    title: "MonoSkillNavigator 介绍",
    sidebarTitle: "平台介绍",
    href: "/docs/monoskill-navigator",
    filename: "monoskill-navigator.md"
  },
  {
    slug: "quick-start-tutorial",
    title: "新手教程：快速上手",
    sidebarTitle: "新手教程",
    href: "/docs/quick-start-tutorial",
    filename: "quick-start-tutorial.md"
  },
  {
    slug: "cli-developer-guide",
    title: "CLI 指南：从 0 到 1 发布 Skill",
    sidebarTitle: "CLI 指南",
    href: "/docs/cli-developer-guide",
    filename: "cli-developer-guide.md"
  },
  {
    slug: "platform-agent-prompt",
    title: "平台 Agent 系统提示词",
    sidebarTitle: "Agent 提示词",
    href: "/docs/platform-agent-prompt",
    filename: "platform-agent-prompt.md"
  },
  {
    slug: "skill-format",
    title: "Skill 格式",
    sidebarTitle: "Skill 格式",
    href: "/docs/skill-format",
    filename: "skill-format.md"
  },
  {
    slug: "publish-workflow",
    title: "发布流程",
    sidebarTitle: "发布流程",
    href: "/docs/publish-workflow",
    filename: "publish-workflow.md"
  },
  {
    slug: "security-scan",
    title: "安全检测",
    sidebarTitle: "安全检测",
    href: "/docs/security-scan",
    filename: "security-scan.md"
  },
  {
    slug: "halucatch-review",
    title: "质量审查",
    sidebarTitle: "质量审查",
    href: "/docs/halucatch-review",
    filename: "halucatch-review.md"
  }
];

export function getDocNavBySlug(slug: string): DocNavItem | undefined {
  return DOC_NAV.find((item) => item.slug === slug);
}

export function getDocSlugs(): string[] {
  return DOC_NAV.map((item) => item.slug);
}

/** Rewrite relative *.md links to in-app /docs routes. */
export function resolveDocHref(href: string | undefined): string | undefined {
  if (!href) {
    return href;
  }
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return href;
  }
  if (href.startsWith("#")) {
    return href;
  }

  const hashIndex = href.indexOf("#");
  const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
  const normalized = pathPart.replace(/^\.\//, "");
  if (normalized.endsWith(".md")) {
    const base = normalized.slice(0, -3);
    if (base.toLowerCase() === "readme") {
      return `/docs/${DEFAULT_DOC_SLUG}${hash ? `#${hash}` : ""}`;
    }
    const nav = DOC_NAV.find((item) => item.slug === base || item.filename === normalized);
    if (nav) {
      return `${nav.href}${hash ? `#${hash}` : ""}`;
    }
    return `/docs/${base}${hash ? `#${hash}` : ""}`;
  }

  return href;
}

/** Map doc markdown image paths to Next.js public URLs (with optional basePath). */
export function resolveDocImageSrc(src: string | undefined): string | undefined {
  if (!src) {
    return src;
  }
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = src.replace(/\\/g, "/");

  const tutorialMatch = normalized.match(/(?:^|\/)docs\/tutorial\/([^?#]+)$/);
  if (tutorialMatch) {
    return `${basePath}/docs/tutorial/${tutorialMatch[1]}`;
  }

  if (normalized.startsWith("/")) {
    return `${basePath}${normalized}`;
  }

  return src;
}
