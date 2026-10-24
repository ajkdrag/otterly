// One vimrc line that did not apply. line counts from 1.
export type VimrcProblem = { line: number; text: string; message: string };

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
      // False when this load found the same problems as the last one, so a
      // focus reload does not repeat a warning.
      problems_changed: boolean;
    }
  | { status: "failed"; error: string }
  // A newer load started before this one finished. It reports instead.
  | { status: "stale" };
