"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getDocNavItems } from "../lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside aria-label="文档导航" className="docs-sidebar">
      <div className="docs-sidebar-header">
        <BookOpen aria-hidden size={18} />
        <span>帮助文档</span>
      </div>
      <nav className="docs-sidebar-nav">
        {getDocNavItems().map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              className={`docs-sidebar-link${active ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.sidebarTitle}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
