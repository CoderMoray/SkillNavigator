import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveRegistryInstallGuideUrl,
  resolveRegistryStoreInstallPrompt,
  resolveWebOrigin,
} from "../apps/web/lib/registry-install-guide";

describe("registry-install-guide URL resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("full guide URL env wins over everything", () => {
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL", "https://docs.example.com/guide.md");
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://web.example.com");
    expect(resolveRegistryInstallGuideUrl("https://other.example.com")).toBe(
      "https://docs.example.com/guide.md"
    );
  });

  it("NEXT_PUBLIC_WEB_URL + guide path when no full override", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://web.example.com");
    expect(resolveRegistryInstallGuideUrl()).toBe(
      "https://web.example.com/usage/skillnavigator.md"
    );
  });

  it("client origin is used when no env is configured (browser)", () => {
    expect(resolveRegistryInstallGuideUrl("https://client.example.com")).toBe(
      "https://client.example.com/usage/skillnavigator.md"
    );
  });

  it("unconfigured production build resolves to null instead of a dev URL (SSR)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveWebOrigin()).toBeNull();
    expect(resolveRegistryInstallGuideUrl()).toBeNull();
  });

  it("development fallback keeps the local dev URL usable", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveWebOrigin()).toBe("http://127.0.0.1:3001");
    expect(resolveRegistryInstallGuideUrl()).toBe(
      "http://127.0.0.1:3001/usage/skillnavigator.md"
    );
  });

  it("prompt renders an explicit maintainer notice when unconfigured (never 127.0.0.1)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prompt = resolveRegistryStoreInstallPrompt();
    expect(prompt).toContain("未配置安装引导地址");
    expect(prompt).not.toContain("127.0.0.1");
    expect(prompt).not.toContain("https://");
  });
});
