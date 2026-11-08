import { EditorView, WidgetType } from "@codemirror/view";
import {
  BlockWidget,
  block_for_dom,
  wrap_in_layers,
  type Block,
  type BlockController,
} from "../../core/block_field.js";
import { parse_math_source } from "./math_syntax.js";

export type MathOptions = {
  // Return a sanitized element for the TeX, or null for nothing to draw. The
  // host owns the TeX engine and its loading. A rejected promise shows the
  // source with an error style.
  render_math: (request: {
    tex: string;
    display: boolean;
    signal: AbortSignal;
  }) => Promise<HTMLElement | null>;
};

// Fills `host` with the formula. The TeX source shows until the engine has
// loaded, so the first formula in a session does not leave a gap. The
// returned controller cancels a render that is still running.
export function draw_math(
  host: HTMLElement,
  tex: string,
  display: boolean,
  options: MathOptions,
): AbortController {
  const abort = new AbortController();
  host.classList.remove("md-math-error");
  host.classList.add("md-math-pending");
  host.removeAttribute("title");
  host.textContent = tex;
  options
    .render_math({ tex, display, signal: abort.signal })
    .then((element) => {
      if (abort.signal.aborted) return;
      host.classList.remove("md-math-pending");
      if (element) host.replaceChildren(element);
    })
    .catch((error: unknown) => {
      if (abort.signal.aborted) return;
      host.classList.replace("md-math-pending", "md-math-error");
      host.title = error instanceof Error ? error.message : "Could not render";
    });
  return abort;
}

const inline_renders = new WeakMap<HTMLElement, AbortController>();

export class InlineMathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly options: MathOptions,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof InlineMathWidget &&
      other.tex === this.tex &&
      other.display === this.display &&
      other.options === this.options
    );
  }

  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "md-math";
    inline_renders.set(
      host,
      draw_math(host, this.tex, this.display, this.options),
    );
    return host;
  }

  destroy(dom: HTMLElement): void {
    inline_renders.get(dom)?.abort();
    inline_renders.delete(dom);
  }

  // Let the editor place the caret on a click, which reveals the source.
  ignoreEvent(): boolean {
    return false;
  }
}

export class MathBlockWidget extends BlockWidget {
  readonly tex: string;

  constructor(
    block: Block,
    read_only: boolean,
    readonly options: MathOptions,
  ) {
    super(block, read_only);
    this.tex = parse_math_source(block.source).tex;
  }

  protected override same_options(other: BlockWidget): boolean {
    return other instanceof MathBlockWidget && other.options === this.options;
  }

  protected estimate_height(): number {
    return 40 + 24 * this.block.source.split("\n").length;
  }

  protected create_controller(view: EditorView): BlockController {
    return new MathBlockController(view, this);
  }
}

class MathBlockController implements BlockController {
  readonly root = document.createElement("div");
  private readonly content = document.createElement("div");
  private render: AbortController | null = null;
  private widget: MathBlockWidget;

  constructor(
    readonly view: EditorView,
    widget: MathBlockWidget,
  ) {
    this.widget = widget;
    this.root.className = "md-math-block";
    this.content.className = "md-math-content";
    this.root.append(wrap_in_layers(widget.block, this.content));
    this.root.addEventListener("mousedown", this.on_mousedown);
    this.draw();
  }

  update(widget: BlockWidget): boolean {
    if (!(widget instanceof MathBlockWidget)) return false;
    const changed =
      widget.tex !== this.widget.tex || widget.options !== this.widget.options;
    this.widget = widget;
    if (changed) this.draw();
    return true;
  }

  destroy(): void {
    this.render?.abort();
    this.root.removeEventListener("mousedown", this.on_mousedown);
  }

  private draw(): void {
    this.render?.abort();
    this.render = draw_math(
      this.content,
      this.widget.tex,
      true,
      this.widget.options,
    );
  }

  // A click puts the caret in the formula, which shows its source. The caret
  // goes to the first TeX line, or the end of a one line formula.
  private readonly on_mousedown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const block = block_for_dom(this.view, this.root);
    if (!block) return;
    event.preventDefault();
    const first_newline = block.source.indexOf("\n");
    this.view.dispatch({
      selection: {
        anchor: first_newline < 0 ? block.to : block.from + first_newline + 1,
      },
    });
    this.view.focus();
  };
}
