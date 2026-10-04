/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import * as language from "@codemirror/language";
import { markdown_language } from "../../../packages/markdown_editor/src/markdown_language";
import { viewport_parsing } from "../../../packages/markdown_editor/src/viewport_parsing";
vi.mock("@codemirror/language", async () => ({
  ...(await vi.importActual<typeof import("@codemirror/language")>(
    "@codemirror/language",
  )),
}));
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function open_editor() {
  const source = "# Section\n\nParagraph **bold**.\n\n".repeat(5000);
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: source, extensions: markdown_language() }),
  });
  views.push(view);
  return view;
}
// jsdom has no scroll geometry. Supply the viewport that a browser measure
// would report; native acceptance verifies the actual scroll/paint sequence.
function set_viewport(view: EditorView, to: number) {
  Object.defineProperty(view, "viewport", {
    configurable: true,
    value: { from: to - 100, to },
  });
  view
    .plugin(viewport_parsing)
    ?.update({ viewportChanged: true } as ViewUpdate);
}
it("publishes the scrolled viewport syntax in the queued microtask", async () => {
  const view = open_editor();
  const target = 4000;
  expect(language.syntaxTree(view.state).length).toBeLessThan(target);
  set_viewport(view, target);
  await Promise.resolve();
  expect(language.syntaxTree(view.state).length).toBeGreaterThanOrEqual(target);
  expect(
    language.syntaxTree(view.state).resolveInner(target - 10).name,
  ).not.toBe("Document");
});
it("coalesces viewport updates and yields incomplete parsing to a frame", async () => {
  const view = open_editor();
  const parse = vi.spyOn(language, "forceParsing").mockReturnValue(false);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  set_viewport(view, 8000);
  set_viewport(view, 12000);
  await Promise.resolve();
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse).toHaveBeenCalledWith(view, 12000, 100);
  await Promise.resolve();
  expect(parse).toHaveBeenCalledTimes(1);
  set_viewport(view, 16000);
  parse.mockReturnValue(true);
  const frame = frames.shift();
  expect(frame).toBeDefined();
  frame?.(0);
  expect(parse).toHaveBeenLastCalledWith(view, 16000, 8);
  expect(frames).toHaveLength(0);
});
it("cancels queued work when its view is destroyed", async () => {
  const view = open_editor();
  const parse = vi.spyOn(language, "forceParsing");
  set_viewport(view, 8000);
  view.destroy();
  views.splice(views.indexOf(view), 1);
  await Promise.resolve();
  expect(parse).not.toHaveBeenCalled();
});

it("cancels a scheduled retry when the buffer view is replaced", async () => {
  const view = open_editor();
  const parse = vi.spyOn(language, "forceParsing").mockReturnValue(false);
  let retry: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    retry = callback;
    return 42;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  set_viewport(view, 8000);
  await Promise.resolve();
  expect(parse).toHaveBeenCalledTimes(1);
  view.setState(EditorState.create({ doc: "replacement" }));
  expect(cancel).toHaveBeenCalledWith(42);
  retry?.(0);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(view.state.doc.toString()).toBe("replacement");
});

it("does not keep retrying while a lazy fenced-code language is pending", async () => {
  const pending = language.LanguageDescription.of({
    name: "pending",
    load: () => new Promise(() => {}),
  });
  const source = "# Section\n\n".repeat(500) + "```pending\nbody\n```\n";
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: source,
      extensions: markdown_language([pending]),
    }),
  });
  views.push(view);
  const parse = vi.spyOn(language, "forceParsing");
  const frame = vi.spyOn(window, "requestAnimationFrame");
  set_viewport(view, source.length);
  await Promise.resolve();
  expect(parse).toHaveReturnedWith(true);
  expect(language.syntaxTree(view.state).length).toBe(source.length);
  // The Markdown tree is complete; the nested language's promise is not.
  expect(language.syntaxTreeAvailable(view.state, source.length)).toBe(false);
  expect(frame).not.toHaveBeenCalled();
});
