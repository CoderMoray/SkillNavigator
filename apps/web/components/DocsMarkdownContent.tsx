"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { resolveDocHref, resolveDocImageSrc } from "../lib/docs-nav";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

function DocAnchor({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const resolved = resolveDocHref(href);

  if (!resolved) {
    return <a {...rest}>{children}</a>;
  }

  if (resolved.startsWith("/")) {
    return (
      <Link href={resolved} {...rest}>
        {children}
      </Link>
    );
  }

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    return (
      <a href={resolved} rel="noopener noreferrer" target="_blank" {...rest}>
        {children}
      </a>
    );
  }

  return (
    <a href={resolved} {...rest}>
      {children}
    </a>
  );
}

function DocImage({ src, alt, ...rest }: ComponentPropsWithoutRef<"img">) {
  const resolved = resolveDocImageSrc(src);
  return <img src={resolved} alt={alt} {...rest} />;
}

export function DocsMarkdownContent({ children }: { children: string }) {
  return (
    <div className="markdown-content docs-markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{ a: DocAnchor, img: DocImage }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
