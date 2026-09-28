/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  CodeMirrorBlock,
  defaultConfig,
} from "@milkdown/kit/component/code-block";
import {
  LanguageSupport,
  StreamLanguage,
  language,
} from "@codemirror/language";

function deferred_language() {
  let resolve!: (value: LanguageSupport) => void;
  const promise = new Promise<LanguageSupport>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function language_support(name: string): LanguageSupport {
  return new LanguageSupport(
    StreamLanguage.define({
      name,
      token(stream) {
        stream.skipToEnd();
        return null;
      },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Milkdown code block language patch", () => {
  it("ignores late language loads and clears an unsupported grammar", async () => {
    const schema = new Schema({
      nodes: {
        doc: { content: "code_block" },
        text: { group: "inline" },
        code_block: {
          content: "text*",
          group: "block",
          code: true,
          attrs: { language: { default: "" } },
          toDOM: () => ["pre", ["code", 0]] as const,
        },
      },
      marks: {},
    });
    const node = schema.node(
      "code_block",
      { language: "js" },
      schema.text("const x = 1"),
    );
    let state = EditorState.create({
      schema,
      doc: schema.node("doc", null, [node]),
    });
    const view = {
      root: document,
      editable: true,
      get state() {
        return state;
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction);
      },
      focus() {},
    } as EditorView;
    const javascript = deferred_language();
    const python = deferred_language();
    const loader = {
      getAll: () => [],
      load: (name: string) => {
        if (name === "js") return javascript.promise;
        if (name === "python") return python.promise;
        return Promise.resolve(undefined);
      },
    } as unknown as ConstructorParameters<typeof CodeMirrorBlock>[3];
    const block = new CodeMirrorBlock(
      node,
      view,
      () => 0,
      loader,
      defaultConfig,
    );
    document.body.appendChild(block.dom);
    block.selectNode();

    block.update(node.type.create({ language: "python" }, node.content));
    python.resolve(language_support("python"));
    await Promise.resolve();
    expect(block.cm.state.facet(language)?.name).toBe("python");

    javascript.resolve(language_support("js"));
    await Promise.resolve();
    expect(block.cm.state.facet(language)?.name).toBe("python");

    block.update(node.type.create({ language: "unsupported" }, node.content));
    await Promise.resolve();
    expect(block.cm.state.facet(language)).toBeNull();
    block.destroy();
  });
});
