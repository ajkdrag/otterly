import { Vim } from "@replit/codemirror-vim";

// A small vimrc subset, one command per line:
//
//   " comments and blank lines are fine
//   imap jk <Esc>
//   nnoremap Y y$
//   nunmap Y
//   set insertModeEscKeysTimeout=300 nopcre
//
// Map commands: map nmap vmap imap omap, their noremap forms, and their unmap
// forms. lhs is the first word and rhs is the rest of the line, as in Vim, so
// a map line cannot end in a comment. Anything else is a problem, reported
// with its line number. A bad line never stops the good ones.

export type VimrcProblem = { line: number; text: string; message: string };

// The engine's key context. null means every mode except insert, like :map.
type MapContext = "normal" | "visual" | "insert" | "operatorPending" | null;

type CommandLine = { line: number; text: string };
type MapCommand = CommandLine & {
  kind: "map";
  context: MapContext;
  recursive: boolean;
  lhs: string;
  rhs: string;
};
type UnmapCommand = CommandLine & {
  kind: "unmap";
  context: MapContext;
  lhs: string;
};
type SetCommand = CommandLine & { kind: "set"; items: string[] };
export type VimrcCommand = MapCommand | UnmapCommand | SetCommand;

export function parse_vimrc(text: string): {
  commands: VimrcCommand[];
  problems: VimrcProblem[];
} {
  const commands: VimrcCommand[] = [];
  const problems: VimrcProblem[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('"')) return;
    const parsed = parse_line({ line: index + 1, text: line });
    if ("message" in parsed) problems.push(parsed);
    else commands.push(parsed);
  });
  return { commands, problems };
}

// Each option's value from before our first apply touched it. The engine is
// global, so this is too.
const original_options = new Map<string, unknown>();

// Applies a whole vimrc to the global engine and returns every line that did
// not apply. Each call starts clean: it drops the maps and restores the
// options of the previous call, so deleting a line and reloading removes it.
export function apply_vimrc(text: string): VimrcProblem[] {
  const { commands, problems } = parse_vimrc(text);
  for (const [name, value] of original_options) Vim.setOption(name, value);
  original_options.clear();
  Vim.mapclear();

  // Maps are resolved here first, so unmap only ever removes a map from this
  // file. The engine's own unmap also removes built-in keys, and then the
  // next mapclear() cuts its keymap in the wrong place.
  const maps = new Map<string, MapCommand>();
  for (const command of commands) {
    if (command.kind === "set") {
      for (const item of command.items) {
        const message = apply_set_item(item);
        if (message) problems.push(problem(command, message));
      }
      continue;
    }
    const key = `${command.context ?? "all"} ${command.lhs}`;
    if (command.kind === "unmap") {
      if (!maps.delete(key))
        problems.push(problem(command, `No such mapping: ${command.lhs}`));
      continue;
    }
    // A later map of the same keys replaces the earlier one, as in Vim.
    maps.delete(key);
    maps.set(key, command);
  }
  for (const command of maps.values()) {
    // The engine only sets a context when ctx is truthy, so "" means every
    // mode. It throws for some forms it does not support.
    const context = command.context ?? "";
    try {
      if (command.recursive) Vim.map(command.lhs, command.rhs, context);
      else Vim.noremap(command.lhs, command.rhs, context);
    } catch (error) {
      problems.push(
        problem(
          command,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  return problems.sort((left, right) => left.line - right.line);
}

const map_contexts: Record<string, MapContext> = {
  "": null,
  n: "normal",
  v: "visual",
  i: "insert",
  o: "operatorPending",
};

function parse_line(command: CommandLine): VimrcCommand | VimrcProblem {
  const [, name = "", rest = ""] = /^(\S+)\s*(.*)$/.exec(command.text) ?? [];
  if (name === "set") {
    // Vim ends a set line at a " that follows a space, like a comment.
    const items = rest
      .replace(/(^|\s)".*$/, "")
      .split(/\s+/)
      .filter(Boolean);
    if (!items.length) return problem(command, "set needs an option");
    return { ...command, kind: "set", items };
  }
  const map_name = /^([nvio]?)(map|noremap|unmap)$/.exec(name);
  if (!map_name) return problem(command, `Unsupported command "${name}"`);
  const [, mode = "", verb] = map_name;
  const context = map_contexts[mode] ?? null;

  // Vim's map arguments come before lhs. <silent> only hides the echo, and
  // we never echo, so it is fine to skip.
  const [, map_arguments = "", body = ""] =
    /^((?:<(?:buffer|nowait|silent|special|script|expr|unique)>\s*)*)(.*)$/.exec(
      rest,
    ) ?? [];
  const unsupported = map_arguments
    .match(/<\w+>/g)
    ?.find((argument) => argument !== "<silent>");
  if (unsupported)
    return problem(command, `Unsupported map argument ${unsupported}`);

  if (verb === "unmap") {
    if (!body) return problem(command, `${name} needs a key`);
    return { ...command, kind: "unmap", context, lhs: body };
  }
  const space = body.search(/\s/);
  const lhs = space === -1 ? body : body.slice(0, space);
  const rhs = space === -1 ? "" : body.slice(space).trim();
  if (!lhs || !rhs)
    return problem(command, `${name} needs a key and a mapping`);
  // The engine keeps maps of ":" commands outside the keymap, where
  // mapclear() cannot remove them, so a reload would never drop one.
  if (lhs.startsWith(":") && lhs !== ":")
    return problem(command, `Maps of ":" commands are not supported`);
  const leader = /<(?:local)?leader>/i.exec(lhs);
  if (leader)
    return problem(
      command,
      `${leader[0]} is not supported, map the keys themselves (for example \\w)`,
    );
  const shadowing_key = find_shadowing_key(context, lhs);
  if (shadowing_key)
    return problem(
      command,
      `Never fires: ${shadowing_key} is already a Vim command`,
    );
  return {
    ...command,
    kind: "map",
    context,
    recursive: verb === "map",
    lhs,
    rhs,
  };
}

// A map with no context covers every mode except insert.
const modes_without_insert: readonly MapContext[] = [
  "normal",
  "visual",
  "operatorPending",
];

// One-key commands the engine already binds, and the contexts where it does.
// The engine runs a full match as soon as the key is typed, and a longer map
// that starts with the same key only counts as a partial match, so it never
// fires. These are the keys vimrc files use as a leader or a prefix.
// @Incomplete: Any other one-key command shadows longer maps the same way
// (nmap jk ... never fires), but we do not keep a list of the engine's keys.
const shadowing_keys: Record<string, readonly MapContext[]> = {
  "<Space>": modes_without_insert,
  "<BS>": modes_without_insert,
  ",": modes_without_insert,
  ";": modes_without_insert,
  "<CR>": ["normal"],
};

// The first key of lhs when a built-in command shadows a map that is longer
// than that key in every context the map covers.
function find_shadowing_key(context: MapContext, lhs: string): string | null {
  const first_key = /^(?:<(?:[CSMA]-)*\w+>|.)/.exec(lhs)?.[0] ?? "";
  const shadowed_in = shadowing_keys[first_key];
  if (!shadowed_in || lhs.length === first_key.length) return null;
  const covers = context ? [context] : modes_without_insert;
  return covers.every((mode) => shadowed_in.includes(mode)) ? first_key : null;
}

// Returns a problem message, or null when the option took the value.
function apply_set_item(item: string): string | null {
  const equals = item.indexOf("=");
  let name = equals === -1 ? item : item.slice(0, equals);
  let value: string | number | boolean =
    equals === -1 ? true : item.slice(equals + 1);
  if (equals === -1 && name.startsWith("no")) {
    name = name.slice(2);
    value = false;
  }
  const before: unknown = Vim.getOption(name);
  if (before instanceof Error) return before.message;
  if (typeof value === "boolean" && typeof before !== "boolean")
    return `${name} needs a value, like ${name}=...`;
  // The engine stores number options as given, and a timeout of "abc"
  // would quietly break insert mode maps.
  if (typeof value === "string" && typeof before === "number") {
    if (!/^\d+$/.test(value)) return `Invalid argument: ${item}`;
    value = Number(value);
  }
  if (!original_options.has(name)) original_options.set(name, before);
  const result: unknown = Vim.setOption(name, value);
  if (result instanceof Error) return result.message;
  // Options such as textwidth only exist per editor. Setting them globally
  // does nothing, and we would rather say so.
  if (Vim.getOption(name) !== value)
    return `${name} is a per-editor option, so vimrc cannot set it`;
  return null;
}

function problem(command: CommandLine, message: string): VimrcProblem {
  return { line: command.line, text: command.text, message };
}
