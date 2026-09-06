import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 组件测试（jsdom）之间的 DOM 清理。
afterEach(() => {
  cleanup();
});

// Node/jsdom 在该环境下的 localStorage 行为不一致（有时抛出
// "Cannot initialize local storage without a --localstorage-file"）。
// 为所有组件测试提供内存版实现，行为对齐 Web Storage API。
if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  const storageMock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value))
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storageMock
  });
}

// jsdom 未实现 matchMedia；组件主题/系统偏好逻辑需要它。
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => {
      const listeners: Array<(event: MediaQueryListEvent) => void> = [];
      const list = {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      };
      return list as MediaQueryList;
    }
  });
}
