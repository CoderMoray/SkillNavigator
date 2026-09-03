import type { Metadata } from "next";
import { resolveBrandName } from "../lib/brand-name";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: resolveBrandName(),
  description: "可信 Skill 注册、审查、评分和分发平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const key = "skill-platform-theme";
                  const stored = localStorage.getItem(key);
                  const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
                  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.dataset.themeMode = mode;
                  document.documentElement.dataset.theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
                } catch {}
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
