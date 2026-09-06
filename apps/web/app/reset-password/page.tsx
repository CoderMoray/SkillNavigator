"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { KeyRound } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { resetPassword } from "../../lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  // 无 token 时展示“链接无效”（由 URL 派生，无需 state/effect；本页不手动改回）。
  const invalid = !token;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorToast(null);

    if (newPassword.length < 8) {
      setErrorToast("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorToast("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      router.push("/login?reset=ok");
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "重置失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="重置密码">
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <KeyRound size={14} />
            Password reset
          </span>
          <h1>设置新密码</h1>

          {invalid ? (
            <>
              <p className="description">重置链接无效或缺少 token。</p>
              <p className="description">
                <Link className="text-link" href="/forgot-password">
                  重新申请重置链接
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="description">输入你的新密码，至少 8 位。</p>
              <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                  <span>新密码</span>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    type="password"
                    value={newPassword}
                  />
                </label>
                <label className="field">
                  <span>确认新密码</span>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </label>
                <button className="button primary" disabled={submitting} type="submit">
                  {submitting ? "提交中..." : "重置密码"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="重置密码">
          <div className="auth-page">
            <div className="empty">加载中…</div>
          </div>
        </AppShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
