// One vimrc line that did not apply. line counts from 1.
// "error" is something you meant to work. "skipped" is Vimscript or a
// terminal-only setting that has no meaning here, so it never toasts.
export type VimrcProblem = {
  line: number;
  text: string;
  message: string;
  severity: "error" | "skipped";
};

// The vimrc as of the last load.
export type VimrcStatus = {
  path: string;
  exists: boolean;
  problems: VimrcProblem[];
};

export type VimrcLoadResult =
  | {
      // "missing" applies an empty vimrc. "unchanged" skipped the same text.
      status: "applied" | "missing" | "unchanged";
      problems: VimrcProblem[];
      // False when this load found the same errors as the last one, so a
      // focus reload does not repeat a warning. Skipped lines do not count.
      errors_changed: boolean;
      forced: boolean;
    }
  | {
      status: "failed";
      error: string;
      // False when the previous load failed with the same error, so a focus
      // reload of a file that stays unreadable does not repeat its error.
      error_changed: boolean;
      forced: boolean;
    }
  // A newer load started before this one finished. It reports instead.
  | { status: "stale" };

export type VimrcOpenResult =
  | { status: "opened" }
  | { status: "failed"; error: string };
