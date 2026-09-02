"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Mail } from "lucide-react";
import { AppShell } from "../../../components/AppShell";

function RegisterPendingContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const resent = searchParams.get("resent") === "1";

  return (
    <AppShell title="验证邮箱">
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <Mail size={14} />
            Verify your email
          </span>
          <h1>请验证邮箱</h1>
          <p className="description">
            {resent
              ? `登录时检测到邮箱尚未验证，我们已向${email ? ` ${email} ` : "你的邮箱"}重新发送验证邮件，请点击邮件中的链接完成账户激活。`
              : `注册成功。我们已向${email ? ` ${email} ` : "你的邮箱"}发送验证邮件，请点击邮件中的链接完成账户激活。`}
          </p>
          <p className="description">验证完成后即可登录。若未收到邮件，可在验证失败页重新发送。</p>
          <Link className="button primary" href="/login">
            去登录
          </Link>
          <p className="description" style={{ marginTop: 16 }}>
            未收到邮件？<Link className="text-link" href="/verify-email">重新验证或重发</Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}

export default function RegisterPendingPage() {
  return (
    <Suspense fallback={<AppShell title="验证邮箱"><div className="auth-page"><div className="empty">加载中…</div></div></AppShell>}>
      <RegisterPendingContent />
    </Suspense>
  );
}
