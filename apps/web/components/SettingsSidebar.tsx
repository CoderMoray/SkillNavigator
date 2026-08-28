"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { isSettingsNavActive, SETTINGS_NAV } from "../lib/settings-nav";

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside aria-label="设置导航" className="settings-sidebar">
      <div className="settings-sidebar-header">
        <Settings aria-hidden size={18} />
        <span>设置</span>
      </div>
      <nav className="settings-sidebar-nav">
        {SETTINGS_NAV.map((item) => {
          const Icon = item.icon;
          const active = isSettingsNavActive(pathname, item.href);
          return (
            <Link
              className={`settings-sidebar-link${active ? " active" : ""}${item.danger ? " danger" : ""}`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
