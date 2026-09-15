import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsMarkdownContent } from "../../../components/DocsMarkdownContent";
import { getDocNavBySlug, getDocSlugs } from "../../../lib/docs-nav";
import { loadDocFile } from "../../../lib/docs-server";
import { resolveBrandName } from "../../../lib/brand-name";
import { applyDeploymentConfig } from "../../../lib/deployment-config";
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
    description: `${nav.title} — ${resolveBrandName()} 平台帮助文档`
  };
}

export default async function DocSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const nav = getDocNavBySlug(slug);
  if (!nav) {
    notFound();
  }

  // Guides are authored with {{brand_name}} / {{web_url}} / {{registry_api_url}}
  // placeholders; render them here so a page never shows a raw placeholder (the
  // same values are inlined for the raw markdown under /usage/).
  const markdown = applyDeploymentConfig(await loadDocFile(nav.filename));

  return (
    <article className="docs-page-inner">
      <DocsMarkdownContent enableAgentPromptCopy={slug === PLATFORM_AGENT_PROMPT_DOC_SLUG}>
        {markdown}
      </DocsMarkdownContent>
    </article>
  );
}
