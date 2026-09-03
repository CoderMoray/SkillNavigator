import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsMarkdownContent } from "../../../components/DocsMarkdownContent";
import { getDocNavBySlug, getDocSlugs } from "../../../lib/docs-nav";
import { loadDocFile } from "../../../lib/docs-server";
import { PLATFORM_AGENT_PROMPT_DOC_SLUG } from "../../../lib/platform-agent-prompt";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const nav = getDocNavBySlug(slug);
  if (!nav) {
    return { title: "文档" };
  }
  return {
    title: `${nav.title} · 文档`,
    description: `${nav.title} — MonoSkillNavigator 平台帮助文档`
  };
}

export default async function DocSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const nav = getDocNavBySlug(slug);
  if (!nav) {
    notFound();
  }

  const markdown = await loadDocFile(nav.filename);

  return (
    <article className="docs-page-inner">
      <DocsMarkdownContent enableAgentPromptCopy={slug === PLATFORM_AGENT_PROMPT_DOC_SLUG}>
        {markdown}
      </DocsMarkdownContent>
    </article>
  );
}
