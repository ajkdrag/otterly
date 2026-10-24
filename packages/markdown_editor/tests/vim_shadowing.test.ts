/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Vim, getCM } from "@replit/codemirror-vim";
import { vim_mode } from "../src/plugins/vim/index";
import {
  apply_vimrc,
  built_in_one_key_commands,
} from "../src/plugins/vim/vimrc";

// This has its own file on purpose. Every Markdown editor state adds about 80
// theme rules to jsdom's one stylesheet, and view.setState gets slower with
// each rule. After the dozen views in vim.test.ts these probes took about 10 s
// a mode. Here they take under a second.

// jsdom has no layout, and the block cursor measures text.
const original_get_client_rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
});
afterAll(() => {
  if (original_get_client_rects)
    Object.defineProperty(
      Range.prototype,
      "getClientRects",
      original_get_client_rects,
    );
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

afterEach(() => {
  document.body.replaceChildren();
  apply_vimrc("");
});

describe("vimrc shadowing", () => {
  // Keys that put a fresh editor in each mode before the probe key.
  const first_keys = {
    normal: [],
    visual: ["v"],
    operatorPending: ["d"],
  } as const;
  const printable = Array.from({ length: 94 }, (_, index) =>
    String.fromCharCode(33 + index),
  );
  const named =
    "Space BS CR Del Tab Esc Left Right Up Down Home End PageUp PageDown Ins"
      .split(" ")
      .map((name) => `<${name}>`);
  const control = Array.from(
    "abcdefghijklmnopqrstuvwxyz",
    (letter) => `<C-${letter}>`,
  );
  const candidates = [
    ...new Set([
      ...printable,
      ...named,
      ...control,
      ...built_in_one_key_commands.keys(),
    ]),
  ];

  function probe_state() {
    return EditorState.create({ doc: "one two", extensions: vim_mode() });
  }

  // The engine runs a one-key command the moment the key is typed. A key
  // that only starts a longer map waits in the key buffer instead. setState
  // gives each key a fresh Vim (mode, pending keys, text). Esc is no use as a
  // reset, because <Esc><Esc> is one of the probed maps.
  function runs_at_once(
    view: EditorView,
    context: keyof typeof first_keys,
    key: string,
  ) {
    view.setState(probe_state());
    const cm = getCM(view);
    if (!cm) throw new Error("Vim is not running in this view");
    for (const first_key of first_keys[context])
      Vim.handleKey(cm, first_key, "user");
    Vim.handleKey(cm, key, "user");
    return (cm.state.vim?.inputState.keyBuffer.length ?? 0) === 0;
  }

  test.each(["normal", "visual", "operatorPending"] as const)(
    "VIM-016 the engine runs exactly the listed one-key commands in %s mode",
    (context) => {
      for (const key of candidates) Vim.noremap(key + key, "x", "");

      const parent = document.createElement("div");
      document.body.append(parent);
      const view = new EditorView({ parent, state: probe_state() });
      const actual = candidates.filter((key) =>
        runs_at_once(view, context, key),
      );
      view.destroy();
      const listed = candidates.filter((key) =>
        built_in_one_key_commands.get(key)?.includes(context),
      );
      expect(actual).toEqual(listed);
    },
  );
});
