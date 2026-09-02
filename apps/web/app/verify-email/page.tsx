"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { SuccessToast } from "../../components/SuccessToast";
import { resendVerificationEmail, verifyEmailToken, ApiRequestError } from "../../lib/api";
import { setAuthToken } from "../../lib/auth-token";
import { creatorProfilePath } from "../../lib/creators";
import { saveFlashToast } from "../../lib/flash-toast";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("正在验证邮箱并登录…");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("验证链接无效或缺少 token。");
      return;
    }

    let cancelled = false;
    void verifyEmailToken(token)
      .then((session) => {
        if (!cancelled) {
          setAuthToken(session.token);
          setStatus("success");
          setMessage("邮箱验证成功，正在进入平台…");
          saveFlashToast("邮箱验证成功，已自动登录。");
          router.replace(creatorProfilePath(session.user.username));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "邮箱验证失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessToast(null);
    setErrorToast(null);
    setResending(true);
    try {
      const result = await resendVerificationEmail(username, password);
      setSuccessToast(`验证邮件已重新发送至 ${result.email}，请查收。`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.response?.error === "verification_email_rate_limited") {
        const seconds = error.response.retryAfterSeconds ?? 60;
        setErrorToast(`发送过于频繁，请 ${seconds} 秒后再试。`);
        return;
      }
      setErrorToast(error instanceof Error ? error.message : "重新发送失败");
    } finally {
      setResending(false);
    }
  }

  return (
    <AppShell title="验证邮箱">
      {successToast ? <SuccessToast message={successToast} onClose={() => setSuccessToast(null)} /> : null}
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            {status === "success" ? <MailCheck size={14} /> : <MailWarning size={14} />}
            Email verification
          </span>
          <h1>{status === "success" ? "邮箱已验证" : status === "pending" ? "正在验证" : "验证失败"}</h1>
          <p className="description">{message}</p>

          {status === "success" ? (
            <button className="button" disabled type="button">
              正在跳转…
            </button>
          ) : null}

          {status === "error" ? (
            <>
              <form className="form-grid" onSubmit={handleResend}>
                <p className="description">输入注册时的用户名和密码，可重新发送验证邮件。</p>
                <label className="field">
                  <span>用户名</span>
                  <input
                    autoComplete="username"
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    value={username}
                  />
                </label>
                <label className="field">
                  <span>密码</span>
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                <button className="button primary" disabled={resending} type="submit">
                  {resending ? "发送中…" : "重新发送验证邮件"}
                </button>
              </form>
              <p className="description">
                <Link className="text-link" href="/login">
                  返回登录
                </Link>
              </p>
            </>
          ) : null}

          {status === "pending" ? (
            <button className="button" disabled type="button">
              请稍候…
            </button>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AppShell title="验证邮箱"><div className="auth-page"><div className="empty">加载中…</div></div></AppShell>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
