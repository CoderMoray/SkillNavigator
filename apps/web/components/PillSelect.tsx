"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PillSelectOption {
  value: string;
  label: string;
}

interface PillSelectProps {
  value: string;
  options: PillSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  icon?: ReactNode;
  ariaLabel: string;
  className?: string;
  /** Render the menu with fixed positioning (for use inside overflow containers such as modals). */
  menuFixed?: boolean;
}

export function PillSelect({
  value,
  options,
  onChange,
  disabled = false,
  icon,
  ariaLabel,
  className,
  menuFixed = false,
}: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open || !menuFixed || !rootRef.current) {
      return;
    }

    function updateMenuPosition() {
      const trigger = rootRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, menuFixed]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const menu = open && !disabled ? (
    <div
      className={`pill-select-menu${menuFixed ? " pill-select-menu-fixed" : ""}`}
      ref={menuRef}
      role="listbox"
      style={menuFixed ? menuStyle : undefined}
    >
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className={`pill-select-option ${option.value === value ? "selected" : ""}`}
          key={option.value || "empty"}
          onClick={() => {
            onChange(option.value);
            setOpen(false);
          }}
          role="option"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className={`pill-select ${className ?? ""}`.trim()} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`pill-select-trigger ${open ? "open" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {icon}
        <span>{selected?.label}</span>
        <ChevronDown className={`pill-select-chevron ${open ? "open" : ""}`} size={16} />
      </button>
      {menuFixed && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
