"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { ErrorToast } from "../../components/ErrorToast";
import { registerUser } from "../../lib/api";
import { setAuthToken } from "../../lib/auth-token";
import { creatorProfilePath } from "../../lib/creators";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

function setRegisterUsernameValidity(input: HTMLInputElement) {
  if (input.validity.valueMissing) {
    input.setCustomValidity("请输入用户名。");
    return;
  }
  if (input.validity.tooShort) {
    input.setCustomValidity(
      `请将此用户名加长到 ${input.minLength} 个字符或更多（目前使用了 ${input.value.length} 个字符）。`
    );
    return;
  }
  if (!USERNAME_PATTERN.test(input.value)) {
    input.setCustomValidity("用户名只能包含字母、数字、点、下划线或连字符。");
    return;
  }
  input.setCustomValidity("");
}

function setRegisterPasswordValidity(input: HTMLInputElement, label: string) {
  if (input.validity.valueMissing) {
    input.setCustomValidity(`请输入${label}。`);
    return;
  }
  if (input.validity.tooShort) {
    input.setCustomValidity(
      `请将此${label}加长到 ${input.minLength} 个字符或更多（目前使用了 ${input.value.length} 个字符）。`
    );
    return;
  }
  input.setCustomValidity("");
}

function formatRegisterError(message: string): string {
  if (message === "Registration is disabled") {
    return "暂未开放注册，请联系管理员创建账号";
  }
  if (message === "Username already exists") {
    return "该用户名已被注册";
  }
  if (message === "Email already exists") {
    return "该邮箱已被注册";
  }
  if (message === "Invalid email address") {
    return "请输入有效的邮箱地址";
  }
  if (message.startsWith("Username must be")) {
    return "用户名需为 3–64 个字符，仅含字母、数字、点、下划线或连字符";
  }
  if (message === "Password must be at least 8 characters") {
    return "密码至少需要 8 个字符";
  }
  if (message === "registration_email_not_configured") {
    return "邮件服务未配置，暂时无法完成注册验证";
  }
  if (message === "verification_email_rate_limited") {
    return "验证邮件发送过于频繁，请稍后再试";
  }
  return message;
}

function setRegisterEmailValidity(input: HTMLInputElement) {
  if (input.validity.valueMissing) {
    input.setCustomValidity("请输入邮箱。");
    return;
  }
  if (input.validity.typeMismatch) {
    input.setCustomValidity("请输入有效的邮箱地址。");
    return;
  }
  input.setCustomValidity("");
}

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorToast(null);

    if (password !== confirmPassword) {
      setErrorToast("两次输入的密码不一致");
      return;
    }

    if (!USERNAME_PATTERN.test(username.trim())) {
      setErrorToast("用户名需为 3–64 个字符，仅含字母、数字、点、下划线或连字符");
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerUser(username, password, email);
      if ("token" in result) {
        setAuthToken(result.token);
        router.push(creatorProfilePath(result.user.username));
        return;
      }
      router.push(`/register/pending?email=${encodeURIComponent(result.user.email ?? email)}`);
    } catch (err) {
      setErrorToast(formatRegisterError(err instanceof Error ? err.message : "注册失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="注册">
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      <div className="auth-page">
        <section className="auth-card card">
          <span className="eyebrow">
            <UserPlus size={14} />
            Create account
          </span>
          <h1>注册平台用户</h1>
          <p className="description">首个注册用户会自动成为管理员；后续用户默认为普通用户。</p>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>用户名</span>
              <input
                autoComplete="username"
                minLength={3}
                onChange={(event) => setUsername(event.target.value)}
                onInput={(event) => setRegisterUsernameValidity(event.currentTarget)}
                onInvalid={(event) => setRegisterUsernameValidity(event.currentTarget)}
                required
                value={username}
              />
            </label>
            <label className="field">
              <span>邮箱</span>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                onInput={(event) => setRegisterEmailValidity(event.currentTarget)}
                onInvalid={(event) => setRegisterEmailValidity(event.currentTarget)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                onInput={(event) => setRegisterPasswordValidity(event.currentTarget, "密码")}
                onInvalid={(event) => setRegisterPasswordValidity(event.currentTarget, "密码")}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="field">
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onInput={(event) => setRegisterPasswordValidity(event.currentTarget, "确认密码")}
                onInvalid={(event) => setRegisterPasswordValidity(event.currentTarget, "确认密码")}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            <button className="button primary" disabled={submitting} type="submit">
              {submitting ? "注册中..." : "注册"}
            </button>
          </form>

          <p className="description">
            已有账户？<Link className="text-link" href="/login">去登录</Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
