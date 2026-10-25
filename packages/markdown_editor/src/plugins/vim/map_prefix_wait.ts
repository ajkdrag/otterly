import { ViewPlugin, type EditorView } from "@codemirror/view";
import { Vim, getCM } from "@replit/codemirror-vim";

// Maps that start with a key Vim already binds, like <leader>w with a Space
// leader, or ,f.
//
// The engine runs a full built-in match before it looks at a longer map, so
// "nnoremap <Space>w :w<CR>" would never fire: Space moves right at once.
// Vim waits timeoutlen for the next key instead. We do the same:
//
//   apply_vimrc registers such a map under an alias for its first key, so
//   <Space>w becomes <OtterlyPrefix1>w, which nothing else binds.
//
//   Vim.handleKey holds a typed Space while a map starts with it:
//     next key starts one of the maps -> <OtterlyPrefix1>, then the key
//     next key is anything else       -> Space, then that key
//     Esc, Ctrl-[ or Ctrl-c           -> nothing, the Space is dropped
//     timeoutlen passes               -> Space (the built-in, or a map of
//                                        Space alone)
//
// Esc cancels instead of running the built-in first. Vim would run Space
// and then beep, but cancelling is what people mean, and most Space leader
// vimrcs map Space to <Nop> anyway. Ctrl-[ and Ctrl-c are Esc in Vim, so
// they cancel too.

// The engine's key context. null means every mode except insert, like :map.
export type MapContext =
  | "normal"
  | "visual"
  | "insert"
  | "operatorPending"
  | null;

export type KeyMap = {
  context: MapContext;
  recursive: boolean;
  lhs: string;
  rhs: string;
};

// A map with no context covers every mode except insert.
export const modes_without_insert: readonly MapContext[] = [
  "normal",
  "visual",
  "operatorPending",
];

// The one-key commands the engine binds, by the modes where each one runs.
// This is the one-token part of its defaultKeymap in @replit/codemirror-vim,
// plus <Esc>, which leaves visual mode before any map sees it. VIM-016 asks
// the engine about every key, so an upgrade that changes this list fails
// there.
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

// The first key of keys, in the engine's spelling.
export function first_key(keys: string): string {
  return /^(?:<[^<>\s]+>|.)/.exec(keys)?.[0] ?? "";
}

// The aliases of the last apply_vimrc, and the maps that use them.
let aliases: { key: string; alias: string; contexts: readonly MapContext[] }[] =
  [];
let aliased_maps: KeyMap[] = [];

// Returns maps ready for the engine: a map that starts with a one-key
// built-in of its mode gets the alias of that key, and so does the same lhs
// inside a recursive map's rhs, so "nmap Q <Space>w" still reaches the
// leader map. Replaces the aliases of the previous call and drops any key
// that is held right now.
export function alias_map_prefixes(maps: readonly KeyMap[]): KeyMap[] {
  for (const cm of [...held_keys.keys()]) drop_held_key(cm);
  aliases = [];
  const renamed = new Map<string, string>();
  const result = maps.map((map) => {
    const key = first_key(map.lhs);
    const shadowed_in = built_in_one_key_commands.get(key) ?? [];
    const covers = map.context ? [map.context] : modes_without_insert;
    if (key === map.lhs || !covers.some((mode) => shadowed_in.includes(mode)))
      return map;
    let entry = aliases.find((alias) => alias.key === key);
    if (!entry) {
      // The engine reads <\w+> as one key, so this survives its key regex.
      entry = {
        key,
        alias: `<OtterlyPrefix${String(aliases.length + 1)}>`,
        contexts: [],
      };
      aliases.push(entry);
    }
    entry.contexts = [...new Set([...entry.contexts, ...covers])];
    const lhs = entry.alias + map.lhs.slice(key.length);
    renamed.set(map.lhs, lhs);
    return { ...map, lhs };
  });
  aliased_maps = result.filter((map) => map.lhs.startsWith("<OtterlyPrefix"));
  return result.map((map) =>
    map.recursive ? { ...map, rhs: rename_keys(map.rhs, renamed) } : map,
  );
}

function rename_keys(rhs: string, renamed: ReadonlyMap<string, string>) {
  let result = rhs;
  for (const [lhs, alias] of renamed) result = result.split(lhs).join(alias);
  return result;
}

// One held key per editor. Keys arrive one at a time, but each editor keeps
// its own, and a timer from a closed editor must not run.
type HeldKey = {
  key: string;
  alias: string;
  timer: ReturnType<typeof setTimeout>;
};
type EngineEditor = Parameters<typeof Vim.handleKey>[0];
const held_keys = new Map<EngineEditor, HeldKey>();

Vim.defineOption("timeoutlen", 1000, "number");

// Every typed key goes through Vim.handleKey: the engine's own view plugin
// calls it via multiSelectHandleKey, which uses the same object. Keys from
// maps, macros and . come with another origin and pass straight through.
const engine_handle_key = Vim.handleKey.bind(Vim);
Vim.handleKey = (cm, key, origin) => {
  const vim = cm.state.vim;
  if (origin !== "user" || !vim || vim.insertMode)
    return engine_handle_key(cm, key, origin);
  const context = vim.inputState.operator
    ? "operatorPending"
    : vim.visualMode
      ? "visual"
      : "normal";
  const held = held_keys.get(cm);
  if (held) {
    if (key === "<Esc>" || key === "<C-[>" || key === "<C-c>") {
      drop_held_key(cm);
      return true;
    }
    clearTimeout(held.timer);
    held_keys.delete(cm);
    // The engine's view plugin already added this key to the keys showcmd
    // shows, so they read "<Space>d" right now. Keep them for a map that
    // goes on waiting (a leader map of three keys). The engine clears them
    // when a command finishes.
    if (starts_aliased_map(held.alias + key, context)) {
      engine_handle_key(cm, held.alias, origin);
      return engine_handle_key(cm, key, origin);
    }
    engine_handle_key(cm, held.key, origin);
    // The held key finished a command (Space moved right), which cleared
    // the keys. This key starts the next command, so show it.
    if (cm.state.vim && !cm.state.vim.status) cm.state.vim.status = key;
    return Vim.handleKey(cm, key, origin);
  }
  const alias = aliases.find(
    (entry) => entry.key === key && entry.contexts.includes(context),
  );
  // Only at the start of a command. A count or a register may come first.
  if (!alias || !/^\d*$/.test(vim.inputState.keyBuffer.join("")))
    return engine_handle_key(cm, key, origin);
  const timeout: unknown = Vim.getOption("timeoutlen");
  const timer = setTimeout(
    () => {
      if (held_keys.get(cm)?.timer !== timer) return;
      held_keys.delete(cm);
      engine_handle_key(cm, key, origin);
    },
    typeof timeout === "number" ? timeout : 1000,
  );
  held_keys.set(cm, { key, alias: alias.alias, timer });
  return true;
};

function starts_aliased_map(keys: string, context: MapContext): boolean {
  return aliased_maps.some(
    (map) =>
      map.lhs.startsWith(keys) &&
      (map.context === null
        ? modes_without_insert.includes(context)
        : map.context === context),
  );
}

// Also clears the keys showcmd shows. The engine only clears them when a
// command finishes, and a dropped key never gets there.
function drop_held_key(cm: EngineEditor) {
  const held = held_keys.get(cm);
  if (!held) return;
  clearTimeout(held.timer);
  held_keys.delete(cm);
  if (cm.state.vim) cm.state.vim.status = "";
}

// A held key is dropped when the editor loses focus and when it goes away
// (a tab switch builds a new one), so it never fires later on its own.
export function map_prefix_wait() {
  return ViewPlugin.define(
    (view: EditorView) => {
      const cm = getCM(view);
      return {
        destroy() {
          if (cm) drop_held_key(cm);
        },
      };
    },
    {
      eventHandlers: {
        blur(_event, view) {
          const cm = getCM(view);
          if (cm) drop_held_key(cm);
        },
      },
    },
  );
}
