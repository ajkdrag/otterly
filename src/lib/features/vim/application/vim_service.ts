import type { OpStore } from "$lib/app";
import type {
  VimEnginePort,
  VimrcFile,
  VimrcPort,
} from "$lib/features/vim/ports";
import type { VimStore } from "$lib/features/vim/state/vim_store.svelte";
import type {
  VimrcLoadResult,
  VimrcOpenResult,
  VimrcProblem,
} from "$lib/features/vim/types/vimrc";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("vim_service");

export class VimService {
  // Loads overlap when the window gains focus during a manual reload. The
  // latest one wins.
  private load_revision = 0;
  // The file the engine holds now, so a focus reload with no edit skips it.
  private applied_file: VimrcFile | null = null;

  constructor(
    private readonly vimrc_port: VimrcPort,
    private readonly vim_engine_port: VimEnginePort,
    private readonly vim_store: VimStore,
    private readonly op_store: OpStore,
  ) {}

  // Pass force to apply the file again even when its text did not change.
  async load_vimrc({ force = false } = {}): Promise<VimrcLoadResult> {
    // start() clears the error, so read the last one first.
    const previous_error = this.op_store.get("vim.load_vimrc").error;
    const revision = ++this.load_revision;
    this.op_store.start("vim.load_vimrc", Date.now());
    let file: VimrcFile;
    try {
      file = await this.vimrc_port.read_vimrc();
    } catch (error) {
      if (revision !== this.load_revision) return { status: "stale" };
      const message = error_message(error);
      log.error("Could not read vimrc", { error: message });
      this.op_store.fail("vim.load_vimrc", message);
      return {
        status: "failed",
        error: message,
        error_changed: message !== previous_error,
      };
    }
    if (revision !== this.load_revision) return { status: "stale" };

    const previous = this.vim_store.vimrc?.problems ?? [];
    if (!force && this.applied_file && this.applied_file.text === file.text) {
      this.op_store.succeed("vim.load_vimrc");
      return {
        status: "unchanged",
        problems: previous,
        problems_changed: false,
      };
    }
    // A missing file applies as empty, so deleting it drops its maps too.
    const problems = this.vim_engine_port.apply_vimrc(file.text ?? "");
    this.applied_file = file;
    this.vim_store.set_vimrc({
      path: file.path,
      exists: file.text !== null,
      problems,
    });
    this.op_store.succeed("vim.load_vimrc");
    return {
      status: file.text === null ? "missing" : "applied",
      problems,
      problems_changed: !same_problems(previous, problems),
    };
  }

  async open_vimrc(): Promise<VimrcOpenResult> {
    try {
      await this.vimrc_port.open_vimrc();
      return { status: "opened" };
    } catch (error) {
      const message = error_message(error);
      log.error("Could not open vimrc", { error: message });
      return { status: "failed", error: message };
    }
  }
}

function same_problems(left: VimrcProblem[], right: VimrcProblem[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (problem, index) =>
        problem.line === right[index]?.line &&
        problem.text === right[index]?.text &&
        problem.message === right[index]?.message,
    )
  );
}
