"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Plus,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmToast } from "./ConfirmToast";
import { ErrorToast } from "./ErrorToast";
import { PillSelect } from "./PillSelect";
import { createApiKey, deleteApiKey, listApiKeys, updateApiKey } from "../lib/api";
import { getAuthToken } from "../lib/auth-token";
import { copyTextToClipboard } from "../lib/copy-text";
import type { ApiKeySummary } from "../lib/types";

type CopyTarget = "secret" | "cli";

type ExpiryPreset = "" | "3h" | "1d" | "7d" | "1m" | "3m" | "6m" | "1y";

const EXPIRY_PRESET_OPTIONS: { value: ExpiryPreset; label: string }[] = [
  { value: "", label: "永久" },
  { value: "3h", label: "三小时后" },
  { value: "1d", label: "一天后" },
  { value: "7d", label: "七天后" },
  { value: "1m", label: "一个月后" },
  { value: "3m", label: "三个月后" },
  { value: "6m", label: "六个月后" },
  { value: "1y", label: "一年后" },
];

function expiryPresetToIso(preset: ExpiryPreset): string | null {
  if (!preset) {
    return null;
  }
  const expires = new Date();
  switch (preset) {
    case "3h":
      expires.setHours(expires.getHours() + 3);
      break;
    case "1d":
      expires.setDate(expires.getDate() + 1);
      break;
    case "7d":
      expires.setDate(expires.getDate() + 7);
      break;
    case "1m":
      expires.setMonth(expires.getMonth() + 1);
      break;
    case "3m":
      expires.setMonth(expires.getMonth() + 3);
      break;
    case "6m":
      expires.setMonth(expires.getMonth() + 6);
      break;
    case "1y":
      expires.setFullYear(expires.getFullYear() + 1);
      break;
  }
  return expires.toISOString();
}

function formatExpiry(value: string | null): string {
  if (!value) {
    return "永久";
  }
  return formatDateTime(value);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isKeyExpired(key: ApiKeySummary): boolean {
  if (!key.expiresAt) {
    return false;
  }
  return new Date(key.expiresAt).getTime() <= Date.now();
}

function keyStatusLabel(key: ApiKeySummary): string {
  if (!key.isActive) {
    return "已停用";
  }
  if (isKeyExpired(key)) {
    return "已过期";
  }
  return "有效";
}

function keyStatusClass(key: ApiKeySummary): string {
  if (!key.isActive) {
    return "badge-unpublished";
  }
  if (isKeyExpired(key)) {
    return "rejected";
  }
  return "passed";
}

function resetCreateForm(
  setters: {
    setName: (value: string) => void;
    setExpiryPreset: (value: ExpiryPreset) => void;
    setError: (value: string | null) => void;
    setCreatedSecret: (value: string | null) => void;
    setCopiedTarget: (value: CopyTarget | null) => void;
    setCopyError: (value: string | null) => void;
  },
) {
  setters.setName("");
  setters.setExpiryPreset("");
  setters.setError(null);
  setters.setCreatedSecret(null);
  setters.setCopiedTarget(null);
  setters.setCopyError(null);
}

const DUPLICATE_NAME_MESSAGE = "该名称已被使用，请换一个名称";

function formatCreateApiKeyError(message: string): string {
  if (message === "API key name is required") {
    return "请填写 API 密钥名称";
  }
  if (message === "API key name already exists") {
    return DUPLICATE_NAME_MESSAGE;
  }
  if (message.includes("API key name must be")) {
    return "名称长度为 1–64 个字符";
  }
  return message;
}

export function ApiKeysPanel() {
  const [items, setItems] = useState<ApiKeySummary[]>([]);
  const [name, setName] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeySummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const keys = await listApiKeys(token);
        if (!cancelled) {
          setItems(keys);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!createModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !createdSecret) {
        closeCreateModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [createModalOpen, createdSecret]);

  function openCreateModal() {
    setErrorToast(null);
    resetCreateForm({
      setName,
      setExpiryPreset,
      setError,
      setCreatedSecret,
      setCopiedTarget,
      setCopyError,
    });
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createdSecret) {
      return;
    }
    setCreateModalOpen(false);
    resetCreateForm({
      setName,
      setExpiryPreset,
      setError,
      setCreatedSecret,
      setCopiedTarget,
      setCopyError,
    });
  }

  function handleSavedSecret() {
    setCreateModalOpen(false);
    resetCreateForm({
      setName,
      setExpiryPreset,
      setError,
      setCreatedSecret,
      setCopiedTarget,
      setCopyError,
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setErrorToast(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请填写 API 密钥名称");
      return;
    }
    if (items.some((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setErrorToast(DUPLICATE_NAME_MESSAGE);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setError("请先登录");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createApiKey(token, {
        name: trimmedName,
        expiresAt: expiryPresetToIso(expiryPreset),
      });
      setItems((current) => [created.apiKey, ...current]);
      setCreatedSecret(created.secret);
      setCopiedTarget(null);
      setCopyError(null);
    } catch (err) {
      const message = formatCreateApiKeyError(err instanceof Error ? err.message : "创建失败");
      if (message === DUPLICATE_NAME_MESSAGE) {
        setErrorToast(message);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(key: ApiKeySummary) {
    const token = getAuthToken();
    if (!token) {
      return;
    }
    setBusyKeyId(key.id);
    try {
      const updated = await updateApiKey(token, key.id, { isActive: !key.isActive });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } finally {
      setBusyKeyId(null);
    }
  }

  function requestDelete(key: ApiKeySummary) {
    setDeleteTarget(key);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    const token = getAuthToken();
    if (!token) {
      return;
    }
    setDeleting(true);
    setBusyKeyId(deleteTarget.id);
    try {
      await deleteApiKey(token, deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
      setBusyKeyId(null);
    }
  }

  async function copyValue(text: string, target: CopyTarget) {
    setCopyError(null);
    try {
      await copyTextToClipboard(text);
      setCopiedTarget(target);
      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? null : current));
      }, 2000);
    } catch {
      setCopyError("复制失败，请手动选择并复制");
    }
  }

  async function copySecret() {
    if (!createdSecret) {
      return;
    }
    await copyValue(createdSecret, "secret");
  }

  async function copyCliCommand() {
    if (!createdSecret) {
      return;
    }
    await copyValue(`skillnav login --api-key ${createdSecret}`, "cli");
  }

  if (loading) {
    return <div className="skeleton settings-content-skeleton" />;
  }

  return (
    <>
      {errorToast ? <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} /> : null}
      {deleteTarget ? (
        <ConfirmToast
          cancelLabel="取消"
          confirmClassName="button secondary compact danger"
          confirmLabel="确认删除"
          confirming={deleting}
          confirmingLabel="删除中…"
          message={`确定删除 API 密钥「${deleteTarget.name?.trim() || deleteTarget.prefix}」吗？CLI 将无法继续使用该密钥，此操作不可恢复。`}
          onCancel={() => {
            if (!deleting) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={() => void confirmDelete()}
          title="删除 API 密钥"
        />
      ) : null}

      <div className="settings-callout">
        <Terminal size={18} aria-hidden />
        <div>
          <strong>CLI 登录</strong>
          <p>
            创建 Key 后，在终端执行{" "}
            <code className="inline-code">skillnav login --api-key sk_…</code>
          </p>
        </div>
      </div>

      <section className="card settings-section-card api-keys-list-panel">
        <header className="settings-section-head settings-section-head-inline">
          <div className="settings-section-head-main">
            <span className="settings-section-icon" aria-hidden>
              <KeyRound size={18} />
            </span>
            <div>
              <h2>API tokens</h2>
              <p className="description">
                为 skillnav CLI 创建独立密钥。每个密钥可单独命名、设定失效时间或随时停用。
              </p>
            </div>
          </div>
          <button className="button primary" onClick={openCreateModal} type="button">
            <Plus size={15} />
            创建 API 密钥
          </button>
        </header>

        <div className="settings-section-body">
          <p className="description settings-inline-meta">{items.length} 个密钥</p>

          {items.length === 0 ? (
            <div className="empty api-keys-empty">
              <KeyRound size={28} strokeWidth={1.5} />
              <p>还没有 API 密钥</p>
              <span>点击右上角「创建 API 密钥」，即可在 CLI 中登录。</span>
            </div>
          ) : (
            <ul className="api-key-list">
              {items.map((item) => {
                const busy = busyKeyId === item.id;
                const displayName = item.name?.trim() || "未命名密钥";
                return (
                  <li className="api-key-item" key={item.id}>
                    <div className="api-key-item-identity">
                      <div className="api-key-item-icon" aria-hidden>
                        <KeyRound size={18} />
                      </div>
                      <div className="api-key-item-title">
                        <strong>{displayName}</strong>
                        <span className="mono api-key-prefix">{item.prefix}…</span>
                      </div>
                    </div>
                    <dl className="api-key-meta">
                      <div>
                        <dt>创建</dt>
                        <dd>{formatDateTime(item.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>失效</dt>
                        <dd>{formatExpiry(item.expiresAt)}</dd>
                      </div>
                      <div>
                        <dt>
                          <Clock size={12} aria-hidden />
                          最近使用
                        </dt>
                        <dd>{formatDateTime(item.lastUsedAt)}</dd>
                      </div>
                    </dl>
                    <div className="api-key-item-actions">
                      <span className={`badge ${keyStatusClass(item)}`}>{keyStatusLabel(item)}</span>
                      <button
                        className="button secondary compact"
                        disabled={busy}
                        onClick={() => void handleToggle(item)}
                        type="button"
                      >
                        {item.isActive ? "停用" : "启用"}
                      </button>
                      <button
                        aria-label={`删除 ${displayName}`}
                        className="icon-button danger"
                        disabled={busy}
                        onClick={() => requestDelete(item)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {createModalOpen ? (
        <div
          className="modal-overlay"
          onClick={createdSecret ? undefined : closeCreateModal}
          role="presentation"
        >
          <div
            aria-labelledby="create-api-key-modal-title"
            aria-modal="true"
            className="modal-card api-key-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {createdSecret ? (
                    <>
                      <ShieldAlert size={14} />
                      仅此一次
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} />
                      新建密钥
                    </>
                  )}
                </span>
                <h3 id="create-api-key-modal-title">
                  {createdSecret ? "请立即保存你的 API 密钥" : "创建 API 密钥"}
                </h3>
              </div>
              {!createdSecret ? (
                <button aria-label="关闭" className="modal-close" onClick={closeCreateModal} type="button">
                  <X size={18} />
                </button>
              ) : null}
            </div>

            {createdSecret ? (
              <div className="modal-form">
                <p className="description">
                  完整密钥不会再次显示。若遗失，请停用此密钥并创建新的。
                </p>
                <div
                  className={`api-key-secret-box${copiedTarget === "secret" ? " copied" : ""}`}
                  onClick={() => void copySecret()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void copySecret();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="点击复制 API 密钥"
                >
                  <code>{createdSecret}</code>
                  <span className="api-key-secret-copy-hint">
                    {copiedTarget === "secret" ? (
                      <>
                        <Check size={14} /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> 点击复制
                      </>
                    )}
                  </span>
                </div>
                {copyError ? <p className="form-error api-key-copy-error">{copyError}</p> : null}
                <div className="modal-actions api-key-modal-actions">
                  <button className="button secondary" onClick={() => void copySecret()} type="button">
                    {copiedTarget === "secret" ? <Check size={15} /> : <Copy size={15} />}
                    {copiedTarget === "secret" ? "已复制密钥" : "复制密钥"}
                  </button>
                  <button className="button secondary" onClick={() => void copyCliCommand()} type="button">
                    {copiedTarget === "cli" ? <Check size={15} /> : <Terminal size={15} />}
                    {copiedTarget === "cli" ? "已复制命令" : "复制 CLI 命令"}
                  </button>
                  <button className="button primary" onClick={handleSavedSecret} type="button">
                    我已保存
                  </button>
                </div>
              </div>
            ) : (
              <form className="modal-form" onSubmit={handleCreate}>
                <p className="description">为不同设备或环境使用独立密钥，便于轮换与管理。</p>
                <label className="field">
                  <span>名称（必填）</span>
                  <input
                    autoFocus
                    maxLength={64}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="例如：MacBook CLI"
                    required
                    value={name}
                  />
                  <p className="field-hint">同一账户下名称不可重复（不区分大小写）。</p>
                </label>
                <label className="field">
                  <span>失效时间</span>
                  <PillSelect
                    ariaLabel="失效时间"
                    className="expiry-select"
                    icon={<Clock size={16} />}
                    menuFixed
                    onChange={(value) => setExpiryPreset(value as ExpiryPreset)}
                    options={EXPIRY_PRESET_OPTIONS}
                    value={expiryPreset}
                  />
                  <p className="field-hint">默认永久有效。</p>
                </label>
                {error ? <div className="error compact-error">{error}</div> : null}
                <div className="modal-actions">
                  <button className="button secondary" onClick={closeCreateModal} type="button">
                    取消
                  </button>
                  <button className="button primary" disabled={submitting} type="submit">
                    <Plus size={15} />
                    {submitting ? "创建中…" : "创建"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
