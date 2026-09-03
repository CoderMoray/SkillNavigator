"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { SuccessToast } from "../../components/SuccessToast";
import { loginUser, ApiRequestError } from "../../lib/api";
import { setAuthToken } from "../../lib/auth-token";
import { resolveBrandName } from "../../lib/brand-name";
import { creatorProfilePath } from "../../lib/creators";

function formatLoginError(message: string): string {
  // 严格模式（默认）：统一文案，不暴露账号是否存在
  if (message === "Invalid username or password") {
    return "用户名或密码错误";
  }
  // 宽松模式：区分账号标识错误与密码错误
  if (message === "Invalid username") {
    return "用户名或邮箱错误";
  }
  if (message === "Invalid password") {
    return "密码错误";
  }
  if (message === "Email not verified") {
    return "邮箱尚未验证，请查收验证邮件或重新发送";
  }
  return message;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);

  useEffect(() => {
    if (searchParams.get("reset") === "ok") {
      setResetNotice(true);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorToast(null);

    try {
      const session = await loginUser(username, password);
      setAuthToken(session.token);
      router.push(creatorProfilePath(session.user.username));
    } catch (err) {
      if (err instanceof ApiRequestError && err.response?.error === "email_not_verified") {
        const email = err.response.email;
        if (err.response.verificationEmailSent && email) {
          router.push(`/register/pending?email=${encodeURIComponent(email)}&resent=1`);
          return;
        }
        if (err.response.verificationEmailRateLimited) {
          const seconds = err.response.retryAfterSeconds ?? 60;
          setErrorToast(`邮箱尚未验证。验证邮件发送过于频繁，请 ${seconds} 秒后再试。`);
          return;
        }
        if (email) {
          router.push(`/register/pending?email=${encodeURIComponent(email)}`);
          return;
        }
        setErrorToast("邮箱尚未验证，请查收验证邮件或重新发送");
        return;
      }
      setErrorToast(formatLoginError(err instanceof Error ? err.message : "登录失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="登录">
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      {resetNotice ? (
        <SuccessToast
          message="密码已重置，请使用新密码登录。"
          onClose={() => setResetNotice(false)}
        />
      ) : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <LogIn size={14} />
            Sign in
          </span>
          <h1>登录 {resolveBrandName()}</h1>
          <p className="description">登录后可以进入用户中心，并使用后续需要身份态的协作能力。</p>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>用户名或邮箱</span>
              <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="用户名或邮箱" required value={username} />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button className="button primary" disabled={submitting} type="submit">
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>

          <p className="description">
            <Link className="text-link" href="/forgot-password">
              忘记密码？
            </Link>
          </p>
          <p className="description">
            还没有账户？<Link className="text-link" href="/register">注册新用户</Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="登录">
          <div className="auth-page">
            <div className="empty">加载中…</div>
          </div>
        </AppShell>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
