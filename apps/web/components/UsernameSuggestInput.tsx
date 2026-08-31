"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { searchUsers } from "../lib/api";
import { getAuthToken } from "../lib/auth-token";
import { normalizeHandle } from "../lib/creators";
import type { UserSearchResult } from "../lib/types";

interface UsernameSuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  excludeHandles?: string[];
  placeholder?: string;
  disabled?: boolean;
}

function normalizeHandles(handles: string[] | undefined): Set<string> {
  return new Set((handles ?? []).map((item) => normalizeHandle(item)).filter(Boolean));
}

export function UsernameSuggestInput({
  value,
  onChange,
  excludeHandles,
  placeholder = "输入已注册用户名，例如 bob",
  disabled = false,
}: UsernameSuggestInputProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const excluded = useMemo(() => normalizeHandles(excludeHandles), [excludeHandles]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length === 0) {
      setSuggestions([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      void searchUsers(token, query)
        .then((items) => {
          if (cancelled) {
            return;
          }
          const filtered = items.filter((item) => !excluded.has(normalizeHandle(item.username)));
          setSuggestions(filtered);
          setActiveIndex(filtered.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setActiveIndex(-1);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, open, excluded]);

  function selectSuggestion(item: UserSearchResult) {
    onChange(item.username);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "ArrowDown" && value.trim()) {
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const item = suggestions[activeIndex];
      if (item) {
        selectSuggestion(item);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showMenu = open && value.trim().length > 0;

  return (
    <div className="username-suggest-field" ref={rootRef}>
      <input
        aria-activedescendant={
          showMenu && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={showMenu ? listboxId : undefined}
        aria-expanded={showMenu}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim()) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />

      {showMenu ? (
        <div
          aria-label="用户名建议"
          className="username-suggest-menu"
          id={listboxId}
          role="listbox"
        >
          {loading ? (
            <div className="username-suggest-status">
              <LoaderCircle aria-hidden className="spin" size={16} />
              搜索中…
            </div>
          ) : suggestions.length === 0 ? (
            <div className="username-suggest-status">未找到匹配用户</div>
          ) : (
            suggestions.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  aria-selected={active}
                  className={`username-suggest-option${active ? " active" : ""}`}
                  id={`${listboxId}-option-${index}`}
                  key={item.username}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(item)}
                  role="option"
                  type="button"
                >
                  <strong>@{item.username}</strong>
                  {item.displayName?.trim() ? (
                    <span>{item.displayName.trim()}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
