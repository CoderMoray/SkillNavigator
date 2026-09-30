// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { useToastSlot } from "./toast-slot";

/** Stand-in for the real toasts: renders its own visibility, nothing else. */
function Toast({ slotKey, label }: { slotKey: string; label: string }) {
  const superseded = useToastSlot(slotKey);
  return <span data-testid={label}>{superseded ? "hidden" : "visible"}</span>;
}

describe("useToastSlot", () => {
  it("shows a lone toast", () => {
    render(<Toast label="only" slotKey="a" />);
    expect(screen.getByTestId("only")).toHaveTextContent("visible");
  });

  it("hides the older toast when a newer one mounts", () => {
    render(
      <>
        <Toast label="older" slotKey="a" />
        <Toast label="newer" slotKey="b" />
      </>
    );
    expect(screen.getByTestId("older")).toHaveTextContent("hidden");
    expect(screen.getByTestId("newer")).toHaveTextContent("visible");
  });

  it("re-claims the slot when its own key changes, without hiding itself", () => {
    const { rerender } = render(
      <>
        <Toast label="first" slotKey="a" />
        <Toast label="second" slotKey="b" />
      </>
    );
    expect(screen.getByTestId("first")).toHaveTextContent("hidden");

    // Same component instance, new notice: it must come back and take the slot.
    rerender(
      <>
        <Toast label="first" slotKey="a-2" />
        <Toast label="second" slotKey="b" />
      </>
    );
    expect(screen.getByTestId("first")).toHaveTextContent("visible");
    expect(screen.getByTestId("second")).toHaveTextContent("hidden");
  });

  it("stays visible across a plain re-render with an unchanged key", () => {
    // Guards the render-phase reset: it must not fire (or loop) when the key is
    // the same, and a toast must never supersede itself.
    const { rerender } = render(<Toast label="only" slotKey="a" />);
    rerender(<Toast label="only" slotKey="a" />);
    expect(screen.getByTestId("only")).toHaveTextContent("visible");
  });

  it("keeps the newest visible under StrictMode double-invocation", () => {
    render(
      <StrictMode>
        <Toast label="older" slotKey="a" />
        <Toast label="newer" slotKey="b" />
      </StrictMode>
    );
    expect(screen.getByTestId("older")).toHaveTextContent("hidden");
    expect(screen.getByTestId("newer")).toHaveTextContent("visible");
  });
});
