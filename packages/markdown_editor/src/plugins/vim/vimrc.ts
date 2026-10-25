import { Vim } from "@replit/codemirror-vim";
import {
  alias_map_prefixes,
  modes_without_insert,
  type KeyMap,
  type MapContext,
} from "./map_prefix_wait.js";

// A small vimrc subset, one command per line:
//
//   " comments and blank lines are fine
//   let mapleader = " "
//   imap jk <Esc>
//   nnoremap <leader>w :w<CR>
//   nunmap Y
//   set clipboard=unnamed timeoutlen=500
//
// Map commands: map nmap vmap xmap imap omap, their noremap and unmap forms,
// and Vim's abbreviations of them (nn, xn, ino...). lhs is the first word and
// rhs is the rest of the line, as in Vim, so a map line cannot end in a
// comment. A leading ":" is fine. Key names such as <esc> and <C-J> are
// rewritten to the engine's spelling (see canonical_keys).
//
// Every line that does not apply comes back as a problem with its line
// number. An "error" is a line you meant to work. A "skipped" line is
// Vimscript or a terminal Vim setting, which means nothing here (a vimrc
// pasted from terminal Vim has lots of those). A bad line never stops the
// good ones.

export type VimrcProblem = {
  line: number;
  text: string;
  message: string;
  severity: "error" | "skipped";
};

type CommandLine = { line: number; text: string };
type MapCommand = CommandLine &
  KeyMap & {
    kind: "map";
    // For the recursion message, like "nnoremap".
    noremap_name: string;
  };
type UnmapCommand = CommandLine & {
  kind: "unmap";
  context: MapContext;
  lhs: string;
};
type SetCommand = CommandLine & { kind: "set"; items: string[] };
type VimrcCommand = MapCommand | UnmapCommand | SetCommand;

const script_reason = "Vimscript is not run here";
const terminal_reason = "Terminal Vim only";
const indent_reason = "Indentation follows the editor here";
const no_effect_reason = "Has no effect here";

export function parse_vimrc(text: string): {
  commands: VimrcCommand[];
  problems: VimrcProblem[];
} {
  const commands: VimrcCommand[] = [];
  const problems: VimrcProblem[] = [];
  // Vim substitutes the leader when a map is defined, so a later
  // "let mapleader" only changes the maps after it.
  const leaders = { leader: "\\", localleader: "\\" };
  // We do not run conditions or functions, so every line inside an if,
  // function, augroup, for, while or try is skipped, maps included.
  let block_depth = 0;
  // The line that ends a "lua << EOF" script, while we are inside one.
  let script_end: string | null = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const command_line = { line: index + 1, text: line };
    if (script_end !== null) {
      problems.push(problem(command_line, script_reason, "skipped"));
      if (line === script_end) script_end = null;
      return;
    }
    if (!line || line.startsWith('"')) return;
    const [, typed_name = "", rest = ""] =
      /^:?\s*(\S+)\s*(.*)$/.exec(line) ?? [];
    const skipped = find_command(
      skipped_commands,
      typed_name.replace(/!$/, ""),
    );
    if (block_depth > 0 || skipped) {
      if (skipped) {
        block_depth = Math.max(
          0,
          block_depth + block_change(skipped[0], rest, line),
        );
        script_end = script_end_marker(skipped[0], rest);
      }
      problems.push(
        problem(command_line, skipped?.[2] ?? script_reason, "skipped"),
      );
      return;
    }
    const parsed = parse_line(command_line, typed_name, rest, leaders);
    if (!parsed) return;
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
      const set_problems = command.items.flatMap((item) => {
        const result = apply_set_item(item);
        return result
          ? [problem(command, result.message, result.severity)]
          : [];
      });
      // One skipped entry per line is enough, its errors all count.
      const first_skipped = set_problems.find((p) => p.severity === "skipped");
      problems.push(
        ...set_problems.filter((p) => p.severity === "error"),
        ...(first_skipped ? [first_skipped] : []),
      );
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

  const looping = find_recursive_maps([...maps.values()]);
  for (const [command, message] of looping)
    problems.push(problem(command, message));
  const applied = [...maps.values()].filter((command) => !looping.has(command));
  const engine_maps = alias_map_prefixes(applied);
  applied.forEach((command, index) => {
    const map = engine_maps[index] ?? command;
    // The engine only sets a context when ctx is truthy, so "" means every
    // mode. It throws for some forms it does not support.
    const context = map.context ?? "";
    try {
      if (map.recursive) Vim.map(map.lhs, map.rhs, context);
      else Vim.noremap(map.lhs, map.rhs, context);
    } catch (error) {
      problems.push(
        problem(
          command,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
  return problems.sort((left, right) => left.line - right.line);
}

function map_key(context: MapContext, lhs: string): string {
  return `${context ?? "all"} ${lhs}`;
}

// Vim's command names, each with its shortest abbreviation. A typed name
// matches when it is a prefix of the full name and at least as long as the
// shortest form, so "nn" and "nnor" are nnoremap, and "n" is nothing.
type CommandName = readonly [full: string, shortest: string];

const map_commands: readonly CommandName[] = [
  ["map", "map"],
  ["nmap", "nm"],
  ["nnoremap", "nn"],
  ["nunmap", "nun"],
  ["vmap", "vm"],
  ["vnoremap", "vn"],
  ["vunmap", "vu"],
  ["xmap", "xm"],
  ["xnoremap", "xn"],
  ["xunmap", "xu"],
  ["imap", "im"],
  ["inoremap", "ino"],
  ["iunmap", "iu"],
  ["omap", "om"],
  ["onoremap", "ono"],
  ["ounmap", "ou"],
  ["noremap", "no"],
  ["unmap", "unm"],
  ["set", "se"],
  ["let", "let"],
];

const select_maps = "Select mode maps are not supported";
const command_line_maps = "Command-line maps are not supported";
const unsupported_maps: readonly (readonly [string, string, string])[] = [
  ["smap", "smap", select_maps],
  ["snoremap", "snor", select_maps],
  ["sunmap", "sunm", select_maps],
  ["cmap", "cm", command_line_maps],
  ["cnoremap", "cno", command_line_maps],
  ["cunmap", "cu", command_line_maps],
];

const skipped_commands: readonly (readonly [string, string, string])[] = [
  ["syntax", "sy", terminal_reason],
  ["filetype", "filet", terminal_reason],
  ["colorscheme", "colo", terminal_reason],
  ["highlight", "hi", terminal_reason],
  ["tmap", "tma", terminal_reason],
  ["tnoremap", "tno", terminal_reason],
  ["tunmap", "tunma", terminal_reason],
  ["autocmd", "au", script_reason],
  ["augroup", "aug", script_reason],
  ["function", "fu", script_reason],
  ["endfunction", "endf", script_reason],
  ["if", "if", script_reason],
  ["elseif", "elsei", script_reason],
  ["else", "el", script_reason],
  ["endif", "en", script_reason],
  ["for", "for", script_reason],
  ["endfor", "endfo", script_reason],
  ["while", "wh", script_reason],
  ["endwhile", "endw", script_reason],
  ["try", "try", script_reason],
  ["catch", "cat", script_reason],
  ["finally", "fina", script_reason],
  ["endtry", "endt", script_reason],
  ["call", "cal", script_reason],
  ["execute", "exe", script_reason],
  ["silent", "sil", script_reason],
  ["setlocal", "setl", script_reason],
  ["setglobal", "setg", script_reason],
  ["unlet", "unl", script_reason],
  ["echo", "ec", script_reason],
  ["source", "so", script_reason],
  ["runtime", "ru", script_reason],
  ["packadd", "pa", script_reason],
  ["command", "com", script_reason],
  ["iabbrev", "ia", script_reason],
  ["abbreviate", "ab", script_reason],
  ["inoreabbrev", "inorea", script_reason],
  ["cabbrev", "ca", script_reason],
  ["nohlsearch", "noh", script_reason],
  ["vim9script", "vim9", script_reason],
  ["lua", "lua", script_reason],
  ["python", "py", script_reason],
  ["python3", "py3", script_reason],
  ["perl", "pe", script_reason],
  ["ruby", "rub", script_reason],
  ["Plug", "Plug", script_reason],
];

function find_command<Entry extends readonly [string, string, ...string[]]>(
  table: readonly Entry[],
  name: string,
): Entry | undefined {
  return table.find(
    ([full, shortest]) =>
      full.startsWith(name) && name.length >= shortest.length,
  );
}

// +1 for a line that opens a block, -1 for one that closes it.
function block_change(command: string, rest: string, line: string): number {
  // "if has('mac') | set x | endif" opens and closes on one line.
  if (/\|\s*end\w*\s*$/.test(line)) return 0;
  if (command === "augroup") return /^end$/i.test(rest.trim()) ? -1 : 1;
  if (["if", "function", "for", "while", "try"].includes(command)) return 1;
  if (
    ["endif", "endfunction", "endfor", "endwhile", "endtry"].includes(command)
  )
    return -1;
  return 0;
}

// "lua << EOF" runs the lines up to EOF as a script, and those lines are not
// Vim commands. Returns the line that ends the script, or null when this is
// not the start of one. Without a marker, Vim ends it at a lone ".".
function script_end_marker(command: string, rest: string): string | null {
  if (!["lua", "python", "python3", "perl", "ruby"].includes(command))
    return null;
  const heredoc = /^<<\s*(?:trim\s+)?(\S*)\s*$/.exec(rest);
  return heredoc ? heredoc[1] || "." : null;
}

const map_contexts: Record<string, MapContext> = {
  "": null,
  n: "normal",
  v: "visual",
  // The engine has one visual context, so xmap and vmap are the same.
  x: "visual",
  i: "insert",
  o: "operatorPending",
};

function parse_line(
  command: CommandLine,
  typed_name: string,
  rest: string,
  leaders: { leader: string; localleader: string },
): VimrcCommand | VimrcProblem | null {
  if (command.text.startsWith("\\"))
    return problem(command, "Line continuations are not supported");
  const unsupported = find_command(unsupported_maps, typed_name);
  if (unsupported) return problem(command, unsupported[2]);
  const name = find_command(map_commands, typed_name)?.[0];
  if (!name) return problem(command, `Unknown command "${typed_name}"`);

  if (name === "set") {
    // Vim ends a set line at a " that follows a space, like a comment.
    // A backslash keeps a space in the value (statusline=%f\ %m).
    const items = rest.replace(/(^|\s)".*$/, "").match(/(?:\\.|\S)+/g) ?? [];
    if (!items.length) return problem(command, "set needs an option");
    return { ...command, kind: "set", items };
  }
  if (name === "let") return parse_let(command, rest, leaders);

  const [, mode = "", verb] =
    /^([nvxio]?)(map|noremap|unmap)$/.exec(name) ?? [];
  const context = map_contexts[mode] ?? null;

  // Vim's map arguments come before lhs. <silent> only hides the echo, and
  // we never echo, so it is fine to skip.
  const [, map_arguments = "", typed_body = ""] =
    /^((?:<(?:buffer|nowait|silent|special|script|expr|unique)>\s*)*)(.*)$/.exec(
      rest,
    ) ?? [];
  // The rhs of an <expr> map is a Vimscript expression.
  if (/<expr>/i.test(map_arguments))
    return problem(command, script_reason, "skipped");
  const unsupported_argument = map_arguments
    .match(/<\w+>/g)
    ?.find((argument) => argument !== "<silent>");
  if (unsupported_argument)
    return problem(command, `Unsupported map argument ${unsupported_argument}`);
  const body = typed_body
    .replace(/<leader>/gi, leaders.leader)
    .replace(/<localleader>/gi, leaders.localleader);

  if (verb === "unmap") {
    if (!body) return problem(command, `${typed_name} needs a key`);
    const lhs = canonical_keys(body);
    if (lhs.unknown) return problem(command, unknown_key_message(lhs.unknown));
    return { ...command, kind: "unmap", context, lhs: lhs.keys };
  }
  const space = body.search(/\s/);
  const typed_lhs = space === -1 ? body : body.slice(0, space);
  const typed_rhs = space === -1 ? "" : body.slice(space).trim();
  if (!typed_lhs || !typed_rhs)
    return problem(command, `${typed_name} needs a key and a mapping`);

  const lhs = canonical_keys(typed_lhs);
  // <Nop> maps a key to nothing. The engine does the same for an empty rhs,
  // but left in it would be typed as text in insert mode.
  const rhs = canonical_keys(typed_rhs.replace(/<nop>/gi, ""));
  // A ":" rhs goes to the ex prompt, which keeps a <name> it does not know as
  // plain text (:s/<b>/x/). Insert mode types it as text too, like Vim
  // (inoremap <C-b> <b></b>). Any other rhs would drop it silently.
  const checks_rhs = context !== "insert" && !typed_rhs.startsWith(":");
  const unknown_key = lhs.unknown ?? (checks_rhs ? rhs.unknown : null);
  if (unknown_key) return problem(command, unknown_key_message(unknown_key));

  // The engine keeps maps of ":" commands outside the keymap, where
  // mapclear() cannot remove them, so a reload would never drop one.
  if (lhs.keys.startsWith(":") && lhs.keys !== ":")
    return problem(command, `Maps of ":" commands are not supported`);
  return {
    ...command,
    kind: "map",
    context,
    recursive: verb === "map",
    lhs: lhs.keys,
    rhs: rhs.keys,
    noremap_name: `${mode}noremap`,
  };
}

function unknown_key_message(key: string): string {
  return `Unknown key ${key}. Write <lt> for a literal "<".`;
}

// let mapleader and let maplocalleader, with or without g:, in single or
// double quotes. Any other let is Vimscript. Returns null when the line
// applied.
function parse_let(
  command: CommandLine,
  rest: string,
  leaders: { leader: string; localleader: string },
): VimrcProblem | null {
  const [, name, value = ""] =
    /^(?:g:)?(mapleader|maplocalleader)\s*=\s*(.*)$/.exec(rest) ?? [];
  if (!name) return problem(command, script_reason, "skipped");
  const key = leader_key(value.trim());
  if (!key)
    return problem(
      command,
      `${name} needs one key in quotes, like let ${name} = " "`,
    );
  if (name === "mapleader") leaders.leader = key;
  else leaders.localleader = key;
  return null;
}

// The leader in the key notation maps use, or null when the value is not
// one quoted key. "\<Space>" and " " are both Space, "\\" is a backslash.
function leader_key(value: string): string | null {
  let text: string;
  if (/^".*"$/.test(value))
    text = value.slice(1, -1).replace(/\\(<[^<>\s]+>|.)/g, "$1");
  else if (/^'.*'$/.test(value)) text = value.slice(1, -1).replace(/''/g, "'");
  else return null;
  if (text === " ") return "<Space>";
  if (text === "<") return "<lt>";
  const { keys, unknown } = canonical_keys(text);
  if (unknown || (keys.match(/<[^<>\s]+>|./gs) ?? []).length !== 1) return null;
  return text;
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

// Recursive maps that would loop: one whose rhs uses its own lhs again after
// the start (nmap Q xQ), and pairs that use each other (nmap a b, nmap b a).
// The engine cuts such a loop quietly when it runs, so the map would do
// something else than it says.
// A rhs that starts with its own lhs is fine, Vim does not map those keys
// again (nmap x xp).
// @Incomplete: Longer loops (a, b, c, a) are not found.
function find_recursive_maps(maps: readonly MapCommand[]) {
  const looping = new Map<MapCommand, string>();
  const recursive = maps.filter((map) => map.recursive);
  for (const map of recursive) {
    if (runs_keys(map.rhs, map.lhs, 1))
      looping.set(
        map,
        `Recursive map: ${map.lhs} uses ${map.lhs} again. Use ${map.noremap_name}.`,
      );
  }
  recursive.forEach((left, index) => {
    for (const right of recursive.slice(index + 1)) {
      if (left.context !== right.context) continue;
      if (
        !runs_keys(left.rhs, right.lhs, 0) ||
        !runs_keys(right.rhs, left.lhs, 0)
      )
        continue;
      for (const [map, other] of [
        [left, right],
        [right, left],
      ] as const)
        looping.set(
          map,
          `Recursive map: ${map.lhs} maps to ${other.lhs}, which maps back to ${map.lhs}. Use ${map.noremap_name}.`,
        );
    }
  });
  return looping;
}

// Keys after which the next key belongs to the same command, so a map of
// that next key does not apply there. In nmap j gj the j is part of gj, and
// in nmap Q dQ the Q is a motion, where normal mode maps do not apply.
const takes_next_key = new Set([
  "g",
  "z",
  "d",
  "c",
  "y",
  "f",
  "F",
  "t",
  "T",
  "r",
  "m",
  "'",
  "`",
  '"',
  "@",
  "q",
  "[",
  "]",
  "<",
  ">",
  "=",
  "!",
]);

// Whether the engine would look up wanted as a fresh command somewhere in
// keys, at key index from or later. Text typed into a : or / prompt is not
// a command.
function runs_keys(keys: string, wanted: string, from: number): boolean {
  const all = keys.match(/<[^<>\s]+>|./gs) ?? [];
  const parts = wanted.match(/<[^<>\s]+>|./gs) ?? [];
  if (!parts.length) return false;
  let in_prompt = false;
  for (let start = 0; start + parts.length <= all.length; start++) {
    const key = all[start] ?? "";
    if (in_prompt) {
      in_prompt = key !== "<CR>" && key !== "<Esc>";
      continue;
    }
    const fresh = start === 0 || !takes_next_key.has(all[start - 1] ?? "");
    if (
      start >= from &&
      fresh &&
      parts.every((part, offset) => all[start + offset] === part)
    )
      return true;
    in_prompt = [":", "/", "?"].includes(key);
  }
  return false;
}

// Terminal Vim settings mean nothing here, so these are skipped, set or not.
// So is every t_ option (t_Co, t_ut...), which are terminal codes.
const skipped_options = new Map<string, string>([
  ...`number nu relativenumber rnu ruler ru showcmd sc showmode smd laststatus
  ls cmdheight ch cursorline cul cursorcolumn cuc colorcolumn cc signcolumn scl
  list listchars lcs wrap linebreak lbr breakindent bri scrolloff so
  sidescrolloff siso termguicolors tgc background bg title visualbell vb
  errorbells eb belloff bo lazyredraw lz ttyfast tf mouse spell spelllang spl
  foldmethod fdm foldenable fen foldlevel fdl conceallevel cole splitbelow sb
  splitright spr hidden hid wildmenu wmnu wildmode wim history hi undofile udf
  undodir udir undolevels ul backup bk writebackup wb swapfile swf encoding
  enc fileencoding fenc fileformat ff fileformats ffs autoread ar autowrite aw
  updatetime ut compatible cp modeline ml shortmess shm backspace bs
  showmatch sm matchtime mat ttimeout ttimeoutlen ttm statusline stl
  showtabline stal guicursor gcr display dy inccommand icm`
    .split(/\s+/)
    .map((name) => [name, terminal_reason] as const),
  ...`joinspaces js autochdir acd virtualedit ve confirm cf startofline sol
  modelines mls completeopt cot path pa wildignore wig whichwrap ww`
    .split(/\s+/)
    .map((name) => [name, no_effect_reason] as const),
  ...`tabstop ts shiftwidth sw softtabstop sts expandtab et autoindent ai
  smartindent si cindent cin`
    .split(/\s+/)
    .map((name) => [name, indent_reason] as const),
]);

// The engine already searches like this, so setting them changes nothing.
const always_on_options = new Set(
  "ignorecase ic smartcase scs incsearch is hlsearch hls wrapscan ws".split(
    " ",
  ),
);

const clipboard_values = new Set([
  "",
  "unnamed",
  "unnamedplus",
  "unnamed,unnamedplus",
  "unnamedplus,unnamed",
]);

// Returns a problem, or null when the option took the value.
function apply_set_item(
  item: string,
): { message: string; severity: "error" | "skipped" } | null {
  const [, typed_name = "", operator = ""] = /^(\w*)(.*)$/.exec(item) ?? [];
  const negated = !operator && /^(no|inv)/.test(typed_name);
  const base = negated ? typed_name.replace(/^(no|inv)/, "") : typed_name;
  const skip_reason =
    skipped_options.get(base) ?? (base.startsWith("t_") ? terminal_reason : "");
  if (skip_reason) return { message: skip_reason, severity: "skipped" };
  const error = (message: string) => ({ message, severity: "error" as const });
  if (always_on_options.has(base))
    return negated || operator ? error(`${base} is always on here`) : null;
  if (/^[+\-^]=/.test(operator))
    return error(
      is_engine_option(typed_name)
        ? `${item}: write the whole value, like ${typed_name}=...`
        : `Unknown option: ${typed_name}`,
    );
  if (operator && !operator.startsWith("="))
    return error(`Invalid argument: ${item}`);

  const equals = item.indexOf("=");
  let name = equals === -1 ? item : item.slice(0, equals);
  let value: string | number | boolean =
    equals === -1 ? true : item.slice(equals + 1);
  if (equals === -1 && name.startsWith("no")) {
    name = name.slice(2);
    value = false;
  }
  if (!is_engine_option(name)) return error(`Unknown option: ${name}`);
  if (name === "clipboard" && !clipboard_values.has(String(value)))
    return error(`Invalid argument: ${item}`);
  const before: unknown = Vim.getOption(name);
  if (typeof value === "boolean" && typeof before !== "boolean")
    return error(`${name} needs a value, like ${name}=...`);
  // The engine stores number options as given, and a timeout of "abc"
  // would quietly break insert mode maps.
  if (typeof value === "string" && typeof before === "number") {
    if (!/^\d+$/.test(value)) return error(`Invalid argument: ${item}`);
    value = Number(value);
  }
  if (!original_options.has(name)) original_options.set(name, before);
  const result: unknown = Vim.setOption(name, value);
  if (result instanceof Error) return error(result.message);
  // Options such as textwidth only exist per editor. Setting them globally
  // does nothing, and we would rather say so.
  if (Vim.getOption(name) !== value)
    return error(`${name} is a per-editor option, so vimrc cannot set it`);
  return null;
}

// The engine keeps its options in a plain {}, so a name like __proto__ or
// constructor would write to Object.prototype. Check the name before any
// engine call.
function is_engine_option(name: string): boolean {
  return (
    /^[A-Za-z]+$/.test(name) &&
    !(name in Object.prototype) &&
    !(Vim.getOption(name) instanceof Error)
  );
}

function problem(
  command: CommandLine,
  message: string,
  severity: VimrcProblem["severity"] = "error",
): VimrcProblem {
  return { line: command.line, text: command.text, message, severity };
}
