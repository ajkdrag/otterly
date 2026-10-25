import type { OpStore } from "$lib/app";
import type {
  PressAndHoldPort,
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
  // A manual reload that a focus load made stale hands its force to the load
  // that won, so the Reload button still gets its answer.
  private force_requested = false;

  constructor(
    private readonly vimrc_port: VimrcPort,
    private readonly vim_engine_port: VimEnginePort,
    private readonly press_and_hold_port: PressAndHoldPort,
    private readonly vim_store: VimStore,
    private readonly op_store: OpStore,
  ) {}

  // Pass force to apply the file again even when its text did not change.
  async load_vimrc({ force = false } = {}): Promise<VimrcLoadResult> {
    // start() clears the error, so read the last one first.
    const previous_error = this.op_store.get("vim.load_vimrc").error;
    const revision = ++this.load_revision;
    this.force_requested ||= force;
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
        forced: this.take_force_request(),
      };
    }
    if (revision !== this.load_revision) return { status: "stale" };

    const forced = this.take_force_request();
    const previous = this.vim_store.vimrc?.problems ?? [];
    if (!forced && this.applied_file && this.applied_file.text === file.text) {
      this.op_store.succeed("vim.load_vimrc");
      return {
        status: "unchanged",
        problems: previous,
        errors_changed: false,
        forced,
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
      errors_changed: !same_errors(previous, problems),
      forced,
    };
  }

  private take_force_request(): boolean {
    const forced = this.force_requested;
    this.force_requested = false;
    return forced;
  }

  // Nothing to tell the user when this fails: held keys just keep opening
  // the accent menu.
  async set_press_and_hold(enabled: boolean): Promise<void> {
    try {
      await this.press_and_hold_port.set_press_and_hold(enabled);
    } catch (error) {
      log.error("Could not set press and hold", {
        error: error_message(error),
      });
    }
  }

  // A clipboard that cannot be read leaves p with the unnamed register as it
  // was, so there is nothing to tell the user.
  async sync_clipboard(): Promise<void> {
    try {
      await this.vim_engine_port.sync_clipboard_from_host();
    } catch (error) {
      log.debug("Could not read the clipboard", {
        error: error_message(error),
      });
    }
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

function same_errors(left: VimrcProblem[], right: VimrcProblem[]): boolean {
  const left_errors = left.filter((problem) => problem.severity === "error");
  const right_errors = right.filter((problem) => problem.severity === "error");
  return (
    left_errors.length === right_errors.length &&
    left_errors.every(
      (problem, index) =>
        problem.line === right_errors[index]?.line &&
        problem.text === right_errors[index]?.text &&
        problem.message === right_errors[index]?.message,
    )
  );
}
