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
// a map line cannot end in a comment. A leading ":" is fine. Key names such as
// <esc> and <C-J> are rewritten to the engine's spelling (see canonical_keys).
// Anything else is a problem, reported with its line number. A bad line never
// stops the good ones.

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

// Each option's value from before our first apply touched it, in the order we
// touched them. The engine is global, so this is too.
const original_options = new Map<string, unknown>();

// Applies a whole vimrc to the global engine and returns every line that did
// not apply. Each call starts clean: it drops the maps and restores the
// options of the previous call, so deleting a line and reloading removes it.
export function apply_vimrc(text: string): VimrcProblem[] {
  const { commands, problems } = parse_vimrc(text);
  // Newest first. langmap and lmap are one option under two names, and the
  // second name recorded the value the first one had already changed. The
  // oldest record holds the real original, so it has to be applied last.
  for (const [name, value] of [...original_options].reverse())
    Vim.setOption(name, value);
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
    if (command.kind === "unmap") {
      // Plain :unmap removes normal, visual and operator-pending maps, as
      // in Vim.
      const contexts = command.context
        ? [command.context]
        : [null, ...modes_without_insert];
      const removed = contexts.map((context) =>
        maps.delete(map_key(context, command.lhs)),
      );
      if (!removed.includes(true))
        problems.push(problem(command, `No such mapping: ${command.lhs}`));
      continue;
    }
    // A later map of the same keys replaces the earlier one, as in Vim.
    const key = map_key(command.context, command.lhs);
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

function map_key(context: MapContext, lhs: string): string {
  return `${context ?? "all"} ${lhs}`;
}

const map_contexts: Record<string, MapContext> = {
  "": null,
  n: "normal",
  v: "visual",
  i: "insert",
  o: "operatorPending",
};

function parse_line(command: CommandLine): VimrcCommand | VimrcProblem {
  const [, name = "", rest = ""] =
    /^:?\s*(\S+)\s*(.*)$/.exec(command.text) ?? [];
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
    const lhs = canonical_keys(body);
    if (lhs.unknown) return problem(command, `Unknown key ${lhs.unknown}`);
    return { ...command, kind: "unmap", context, lhs: lhs.keys };
  }
  const space = body.search(/\s/);
  const typed_lhs = space === -1 ? body : body.slice(0, space);
  const typed_rhs = space === -1 ? "" : body.slice(space).trim();
  if (!typed_lhs || !typed_rhs)
    return problem(command, `${name} needs a key and a mapping`);
  const leader = /<(?:local)?leader>/i.exec(typed_lhs);
  if (leader)
    return problem(
      command,
      `${leader[0]} is not supported, map the keys themselves (for example \\w)`,
    );

  const lhs = canonical_keys(typed_lhs);
  // <Nop> maps a key to nothing. The engine does the same for an empty rhs,
  // but left in it would be typed as text in insert mode.
  const rhs = canonical_keys(typed_rhs.replace(/<nop>/gi, ""));
  // A ":" rhs goes to the ex prompt, which keeps a <name> it does not know as
  // plain text (:s/<b>/x/). Any other rhs would drop it silently, or type it
  // as text in insert mode. Write <lt> for a literal "<", as in Vim.
  const unknown_key =
    lhs.unknown ?? (typed_rhs.startsWith(":") ? null : rhs.unknown);
  if (unknown_key) return problem(command, `Unknown key ${unknown_key}`);

  // The engine keeps maps of ":" commands outside the keymap, where
  // mapclear() cannot remove them, so a reload would never drop one.
  if (lhs.keys.startsWith(":") && lhs.keys !== ":")
    return problem(command, `Maps of ":" commands are not supported`);
  const shadowing_key = find_shadowing_key(context, lhs.keys);
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
    lhs: lhs.keys,
    rhs: rhs.keys,
  };
}

// Vim's key names in lowercase, and the spelling the engine compares.
const key_names = new Map([
  ["esc", "Esc"],
  ["escape", "Esc"],
  ["cr", "CR"],
  ["return", "CR"],
  ["enter", "CR"],
  ["space", "Space"],
  ["bs", "BS"],
  ["backspace", "BS"],
  ["tab", "Tab"],
  ["del", "Del"],
  ["delete", "Del"],
  ["ins", "Ins"],
  ["insert", "Ins"],
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["lt", "<"],
  ["gt", ">"],
]);

// Vim reads <esc>, <Esc> and <ESC> as one key, and <C-J> as <C-j>. The engine
// compares the exact spelling of the key it was given, so a map written any
// other way never fires. This rewrites each <...> token to the engine's
// spelling, and returns the first token it does not know.
function canonical_keys(keys: string): {
  keys: string;
  unknown: string | null;
} {
  let unknown: string | null = null;
  const rewritten = keys.replace(
    /<((?:[csam]-)*)([^<>\s]+)>/gi,
    (token: string, typed_modifiers: string, name: string) => {
      // The engine writes modifiers in this order, and Vim's M- is Alt.
      const modifiers = typed_modifiers.toLowerCase();
      const shift = modifiers.includes("s");
      const prefix =
        (modifiers.includes("c") ? "C-" : "") +
        (/[am]/.test(modifiers) ? "A-" : "") +
        (shift ? "S-" : "");
      const key = engine_key_name(name, prefix !== "", shift);
      if (key === null) {
        unknown ??= token;
        return token;
      }
      // <lt> and <gt> are the plain characters.
      return key.length === 1 && !prefix ? key : `<${prefix}${key}>`;
    },
  );
  return { keys: rewritten, unknown };
}

function engine_key_name(
  name: string,
  has_modifier: boolean,
  shift: boolean,
): string | null {
  const lowered = name.toLowerCase();
  const named = key_names.get(lowered);
  if (named) return named;
  if (/^f\d{1,2}$/.test(lowered)) return lowered.toUpperCase();
  // A letter after C- or A- is lowercase unless S- is there, as in Vim.
  if (has_modifier && name.length === 1) return shift ? name : lowered;
  return null;
}

// A map with no context covers every mode except insert.
const modes_without_insert: readonly MapContext[] = [
  "normal",
  "visual",
  "operatorPending",
];

// The one-key commands the engine binds, by the modes where each one runs.
// This is the one-token part of its defaultKeymap in @replit/codemirror-vim,
// plus <Esc>, which leaves visual mode before any map sees it. The engine
// runs a full match as soon as the key is typed, and a longer map that starts
// with the same key only counts as a partial match, so it never fires.
// VIM-016 asks the engine about every key, so an upgrade that changes this
// list fails there.
// @Incomplete: Commands that take a second key (gg, zz, f<char>, q<register>)
// shadow maps of three or more keys the same way, and insert mode has a few
// of its own (<C-u>, <C-w>, <C-o>). We do not list those.
const keys_by_modes: [readonly MapContext[], string][] = [
  [
    modes_without_insert,
    `<Left> <Right> <Up> <Down> <Space> <BS> <Del> <C-Space> <C-BS> <S-Space>
    <S-BS> <C-n> <C-p> <C-[> <C-c> <C-Esc> <Home> <End> <PageUp> <PageDown>
    H M L h l j k w W e E b B { } ( ) <C-f> <C-b> <C-d> <C-u> G 0 ^ + - _ $ %
    ; , | d y c = > < n N x X / ? * # :`,
  ],
  [
    ["normal", "visual"],
    `s S o O D Y C ~ <C-i> <C-o> <C-e> <C-y> A I v V <C-v> <C-q> J p P R u
    <C-r> . <C-a> <C-x>`,
  ],
  [["normal"], "<CR> <Ins> <C-w> a i"],
  [["visual"], "U <Esc>"],
];

export const built_in_one_key_commands: ReadonlyMap<
  string,
  readonly MapContext[]
> = new Map(
  keys_by_modes.flatMap(([modes, keys]) =>
    keys.split(/\s+/).map((key) => [key, modes] as const),
  ),
);

// The first key of lhs when a built-in command shadows a map that is longer
// than that key in every context the map covers.
function find_shadowing_key(context: MapContext, lhs: string): string | null {
  const first_key = /^(?:<[^<>\s]+>|.)/.exec(lhs)?.[0] ?? "";
  const shadowed_in = built_in_one_key_commands.get(first_key);
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
