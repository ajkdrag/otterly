/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draggable } from "$lib/shared/utils/draggable";

describe("draggable", () => {
  let node: HTMLElement;

  beforeEach(() => {
    node = document.createElement("div");
    node.style.position = "fixed";
    node.style.left = "100px";
    node.style.top = "100px";
    node.style.width = "200px";
    node.style.height = "200px";

    document.body.appendChild(node);

    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 100,
      right: 300,
      bottom: 300,
      width: 200,
      height: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.removeChild(node);
    vi.restoreAllMocks();
  });

  it("applies position directly to node style on drag", () => {
    draggable(node, {});

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 200,
        clientY: 180,
        bubbles: true,
      }),
    );

    expect(node.style.left).toBe("150px");
    expect(node.style.top).toBe("130px");
  });

  it("overrides transform and transition on drag start", () => {
    draggable(node, {});

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(node.style.transform).toBe("none");
    expect(node.style.transition).toBe("none");
  });

  it("snapshots getBoundingClientRect position on drag start", () => {
    draggable(node, {});

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(node.style.left).toBe("100px");
    expect(node.style.top).toBe("100px");
  });

  it("calls on_drag_start when drag begins", () => {
    const on_drag_start = vi.fn();
    draggable(node, { on_drag_start });

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).toHaveBeenCalledOnce();
  });

  it("calls on_drag_end when drag ends", () => {
    const on_drag_end = vi.fn();
    draggable(node, { on_drag_end });

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    document.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 200,
        clientY: 180,
        bubbles: true,
      }),
    );

    expect(on_drag_end).toHaveBeenCalledOnce();
  });

  it("ignores right-click", () => {
    const on_drag_start = vi.fn();
    draggable(node, { on_drag_start });

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 2,
        bubbles: true,
      }),
    );

    expect(on_drag_start).not.toHaveBeenCalled();
  });

  it("ignores clicks on interactive elements", () => {
    const on_drag_start = vi.fn();
    const button = document.createElement("button");
    button.textContent = "Click me";
    node.appendChild(button);

    draggable(node, { on_drag_start });

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).not.toHaveBeenCalled();
  });

  it("ignores clicks on children of interactive elements", () => {
    const on_drag_start = vi.fn();
    const button = document.createElement("button");
    const icon = document.createElement("span");
    icon.textContent = "x";
    button.appendChild(icon);
    node.appendChild(button);

    draggable(node, { on_drag_start });

    icon.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).not.toHaveBeenCalled();
  });

  it("ignores clicks on SVG icons inside interactive elements", () => {
    const on_drag_start = vi.fn();
    const button = document.createElement("button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(path);
    button.appendChild(svg);
    node.appendChild(button);

    draggable(node, { on_drag_start });

    path.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).not.toHaveBeenCalled();
  });

  it("drags from non-interactive children", () => {
    const on_drag_start = vi.fn();
    const panel = document.createElement("div");
    panel.textContent = "empty space";
    node.appendChild(panel);

    draggable(node, { on_drag_start });

    panel.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).toHaveBeenCalledOnce();
  });

  it("uses handle_selector when provided", () => {
    const on_drag_start = vi.fn();
    const handle = document.createElement("div");
    handle.className = "handle";
    node.appendChild(handle);

    draggable(node, { handle_selector: ".handle", on_drag_start });

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );
    expect(on_drag_start).not.toHaveBeenCalled();

    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );
    expect(on_drag_start).toHaveBeenCalledOnce();
  });

  it("clamps position to viewport bounds", () => {
    draggable(node, {});

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 2000,
        clientY: 2000,
        bubbles: true,
      }),
    );

    const left = parseInt(node.style.left);
    const top = parseInt(node.style.top);
    expect(left).toBeLessThanOrEqual(1024 - 100);
    expect(top).toBeLessThanOrEqual(768 - 100);
  });

  it("allows dragging above viewport while keeping min visible", () => {
    draggable(node, {});

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 150,
        clientY: -2000,
        bubbles: true,
      }),
    );

    const top = parseInt(node.style.top);
    expect(top).toBe(100 - 200);
    expect(top + 200).toBeGreaterThanOrEqual(100);
  });

  it("cleans up listeners on destroy", () => {
    const on_drag_start = vi.fn();
    const action = draggable(node, { on_drag_start });

    action.destroy();

    node.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        button: 0,
        bubbles: true,
      }),
    );

    expect(on_drag_start).not.toHaveBeenCalled();
  });
});
