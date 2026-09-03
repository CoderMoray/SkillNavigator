"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { SuccessToast } from "../../components/SuccessToast";
import { getCurrentUser, resendVerificationEmail, verifyEmailToken, ApiRequestError } from "../../lib/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../../lib/auth-token";
import { resolveBrandName } from "../../lib/brand-name";
import { creatorProfilePath } from "../../lib/creators";
import { saveFlashToast } from "../../lib/flash-toast";

const MIN_PENDING_MS = 1000;
const SUCCESS_HOLD_MS = 3000;

/**
 * 验证链接分类结果：
 * - pending：校验中（至少停留 1 秒）
 * - success：激活成功（①）
 * - other-account：有效链接属于其他已登录账号，token 已被服务端作废（②）
 * - used-self：链接已使用且属于当前账号（③）
 * - used-other：链接已使用且属于其他账号（④）
 * - invalid-signed-in：无效/过期链接，当前已登录（⑤a）
 * - invalid-signed-out：无效/过期链接，未登录（⑤b）
 * - no-token：URL 完全缺少 token（⑥）
 */
type VerifyOutcome =
  | { kind: "pending" }
  | { kind: "success"; target: string }
  | { kind: "other-account"; target: string }
  | { kind: "used-self"; target: string }
  | { kind: "used-other" }
  | { kind: "invalid-signed-in"; target: string }
  | { kind: "invalid-signed-out" }
  | { kind: "no-token" };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 需要自动跳转/登出的场景：倒计时归零后执行。 */
function isAutoKinds(outcome: VerifyOutcome): boolean {
  return (
    outcome.kind === "success" ||
    outcome.kind === "used-self" ||
    outcome.kind === "used-other" ||
    outcome.kind === "invalid-signed-in" ||
    outcome.kind === "invalid-signed-out"
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [outcome, setOutcome] = useState<VerifyOutcome>({ kind: "pending" });
  const [countdown, setCountdown] = useState(SUCCESS_HOLD_MS / 1000);
  // no-token / 未登录失败页的重发表单状态
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // 校验流程：先探测本地登录态，再携带 session 调用验证 API。
  useEffect(() => {
    if (!token) {
      setOutcome({ kind: "no-token" });
      return;
    }

    let cancelled = false;

    async function run() {
      const sessionToken = getAuthToken();
      let currentUsername: string | undefined;
      if (sessionToken) {
        try {
          const me = await getCurrentUser(sessionToken);
          if (cancelled) {
            return;
          }
          currentUsername = me.username;
        } catch {
          // 本地 token 已失效：清除后按未登录处理。
          clearAuthToken();
        }
      }
      if (cancelled) {
        return;
      }

      try {
        // 请求与最小展示时长并行：即使 API 极快，校验界面也至少停留 1 秒。
        const [session] = await Promise.all([verifyEmailToken(token, sessionToken), delay(MIN_PENDING_MS)]);
        if (cancelled) {
          return;
        }
        setAuthToken(session.token);
        setCountdown(SUCCESS_HOLD_MS / 1000);
        setOutcome({ kind: "success", target: creatorProfilePath(session.user.username) });
        saveFlashToast(`邮箱验证成功，已自动登录，欢迎使用${resolveBrandName()}`);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const api = error instanceof ApiRequestError ? error : undefined;
        const code = api?.response?.error;
        setCountdown(SUCCESS_HOLD_MS / 1000);
        if (code === "verification_token_other_account") {
          // ② 有效链接属于其他已登录账号（服务端已作废）——无自动跳转，给用户选择。
          setOutcome({
            kind: "other-account",
            target: currentUsername ? creatorProfilePath(currentUsername) : "/"
          });
        } else if (code === "verification_token_used_self") {
          // ③ 已使用且属于当前账号。
          const owner = api?.response?.username ?? currentUsername ?? "";
          setOutcome({ kind: "used-self", target: creatorProfilePath(owner) });
        } else if (code === "verification_token_used_other") {
          // ④ 已使用且属于其他账号 → 自动登出。
          setOutcome({ kind: "used-other" });
        } else if (currentUsername) {
          // ⑤a 无效/过期链接 & 已登录：不登出，回个人主页。
          setOutcome({ kind: "invalid-signed-in", target: creatorProfilePath(currentUsername) });
        } else {
          // ⑤b 无效/过期链接 & 未登录：引导前往登录页。
          setOutcome({ kind: "invalid-signed-out" });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  // 自动执行场景：每秒倒数，归零后跳转或登出。
  useEffect(() => {
    if (!isAutoKinds(outcome)) {
      return;
    }
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((current) => Math.max(current - 1, 0));
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (outcome.kind === "used-other") {
      clearAuthToken();
      router.replace("/login?notice=logged_out");
      return;
    }
    if (outcome.kind === "invalid-signed-out") {
      router.replace("/login?notice=invalid_link");
      return;
    }
    router.replace(outcome.target);
  }, [outcome, countdown, router]);

  function handlePrimaryAction() {
    switch (outcome.kind) {
      case "success":
      case "used-self":
      case "invalid-signed-in":
        router.replace(outcome.target);
        return;
      case "used-other":
        clearAuthToken();
        router.replace("/login?notice=logged_out");
        return;
      case "invalid-signed-out":
        router.replace("/login?notice=invalid_link");
        return;
      case "other-account":
        clearAuthToken();
        router.replace("/login?notice=logged_out");
        return;
      default:
        return;
    }
  }

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

  const successLike = outcome.kind === "success" || outcome.kind === "used-self";
  const countdownVisible = isAutoKinds(outcome);

  function countdownSuffix(): string {
    switch (outcome.kind) {
      case "success":
      case "used-self":
        return "即将进入你的个人主页";
      case "invalid-signed-in":
        return "即将返回个人主页";
      case "used-other":
        return "已自动退出当前账号";
      case "invalid-signed-out":
        return "即将前往登录页";
      default:
        return "";
    }
  }

  function primaryLabel(): string {
    switch (outcome.kind) {
      case "success":
      case "used-self":
      case "invalid-signed-in":
        return "立即进入平台";
      case "used-other":
        return "立即退出登录";
      case "invalid-signed-out":
        return "前往登录";
      case "other-account":
        return "退出并登录链接账号";
      default:
        return "";
    }
  }

  function renderCard() {
    if (outcome.kind === "pending") {
      return (
        <>
          <h1>正在验证</h1>
          <p className="description">正在验证邮箱并登录…</p>
          <button className="button" disabled type="button">
            请稍候…
          </button>
        </>
      );
    }

    if (outcome.kind === "no-token") {
      return (
        <>
          <h1>验证失败</h1>
          <p className="description">验证链接无效或缺少 token。</p>
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
      );
    }

    if (outcome.kind === "other-account") {
      return (
        <>
          <h1>无法完成激活</h1>
          <p className="description">
            当前登录的账号与该激活链接不匹配。为保护账户安全，此链接已被停用。
            <br />
            请退出后用接收验证邮件的账号重新登录。
          </p>
          <button className="button primary" type="button" onClick={handlePrimaryAction}>
            {primaryLabel()}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => router.replace(outcome.target)}
          >
            返回主页
          </button>
        </>
      );
    }

    const title =
      outcome.kind === "success"
        ? "邮箱已验证"
        : outcome.kind === "used-self"
          ? "邮箱已验证"
          : outcome.kind === "used-other"
            ? "非法激活"
            : "链接无效";
    const description =
      outcome.kind === "success"
        ? "邮箱验证成功，即将进入平台…"
        : outcome.kind === "used-self"
          ? "该邮箱的激活链接已使用，无需重复验证。"
          : outcome.kind === "used-other"
            ? "此激活链接已使用，且不属于当前登录账号。已自动退出当前账号，请重新登录你的账号。"
            : outcome.kind === "invalid-signed-in"
              ? "该激活链接无效或已过期。当前登录状态不受影响。"
              : "该激活链接无效或已过期。如需验证邮箱，请重新登录以获取新的验证邮件。";

    return (
      <>
        <h1>{title}</h1>
        <p className="description">
          {description}
          {countdownVisible ? (
            <>
              <br />
              {countdownSuffix()}，将在 {Math.max(countdown, 0)} 秒后自动跳转
            </>
          ) : null}
        </p>
        <button className="button primary" type="button" onClick={handlePrimaryAction}>
          {primaryLabel()}
        </button>
      </>
    );
  }

  return (
    <AppShell title="验证邮箱">
      {successToast ? <SuccessToast message={successToast} onClose={() => setSuccessToast(null)} /> : null}
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            {successLike ? <MailCheck size={14} /> : <MailWarning size={14} />}
            Email verification
          </span>
          {renderCard()}
        </section>
      </div>
    </AppShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="验证邮箱">
          <div className="auth-page">
            <div className="empty">加载中…</div>
          </div>
        </AppShell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
