// Checks tests/vim_conformance_cases.json against a real Vim.
//
//   node scripts/vim_ground_truth.mjs           print the cases where Vim disagrees
//   node scripts/vim_ground_truth.mjs --write   update their "vim" answers
//   VIM=/path/to/vim node scripts/vim_ground_truth.mjs
//
// Dev only, nothing in CI runs it. The table was made with Vim 9.1. Run
// `pnpm format` after --write, which lays the JSON out the way prettier does.
//
// Each case is a text, a cursor and keys. Vim runs the keys with
// feedkeys(keys, 'xt'), so undo steps close the way they do when you type.
// -Nu NONE keeps your vimrc out of it. A text that ends with a line break is
// a file, and that break ends its last line, like Vim reads a file.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const table_path = join(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/vim_conformance_cases.json",
);
const cases = JSON.parse(readFileSync(table_path, "utf8"));
const should_write = process.argv.includes("--write");

const answers = new Map(run_vim(cases).map((answer) => [answer.id, answer]));
const disagreements = [];
for (const test_case of cases) {
  const actual = answers.get(test_case.id);
  if (!actual) {
    console.error(`Vim gave no answer for ${test_case.id}`);
    process.exitCode = 1;
    continue;
  }
  if (JSON.stringify(actual.vim) === JSON.stringify(test_case.vim)) continue;
  disagreements.push({ test_case, actual: actual.vim });
  if (should_write) test_case.vim = actual.vim;
}

for (const { test_case, actual } of disagreements) {
  console.log(`${test_case.id}  keys=${JSON.stringify(test_case.keys)}`);
  console.log(`  table: ${JSON.stringify(test_case.vim)}`);
  console.log(`  vim:   ${JSON.stringify(actual)}`);
}
console.log(
  `${cases.length - disagreements.length} of ${cases.length} cases match this Vim.`,
);
if (should_write && disagreements.length > 0) {
  writeFileSync(table_path, JSON.stringify(cases, null, 2) + "\n");
  console.log("Updated the table. Run pnpm format.");
} else if (disagreements.length > 0) {
  process.exitCode = 1;
}

// One Vim process runs every case, each in a fresh buffer. Vim writes its
// answers to a file, because -es has no usable stdout.
function run_vim(cases) {
  const dir = mkdtempSync(join(tmpdir(), "vim-ground-truth-"));
  const out_path = join(dir, "out.jsonl");
  const script_path = join(dir, "run.vim");
  const lines = [
    "set encoding=utf-8",
    "set nocompatible autoindent expandtab shiftwidth=2 backspace=indent,eol,start",
    "set shortmess+=s",
    "let g:out = []",
  ];
  for (const { id, text, at, keys } of cases) {
    lines.push(
      "enew!",
      `call setline(1, json_decode(${vim_string(JSON.stringify(text.replace(/\n$/, "").split("\n")))}))`,
      "let &undolevels = &undolevels",
      `call setcharpos('.', [0, ${at[0]}, ${at[1]}, 0])`,
      "let @/ = ''",
      "for r in ['\"', 'a', '0', '1', '2', '3', '-'] | call setreg(r, []) | endfor",
      `silent! call feedkeys("${vim_keys(keys)}", 'xt')`,
      `call add(g:out, json_encode({'id': ${vim_string(id)}, 'lines': getline(1, '$'), 'cursor': [line('.'), charcol('.')], 'register': getreg('"'), 'type': getregtype('"')}))`,
    );
  }
  lines.push(`call writefile(g:out, ${vim_string(out_path)})`, "qa!");
  writeFileSync(script_path, lines.join("\n"));
  try {
    execFileSync(
      process.env.VIM ?? "vim",
      ["-Nu", "NONE", "-i", "NONE", "-n", "-es", "-S", script_path],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  } catch {
    // -es exits 1 when any command failed, and a case may fail on purpose.
    // A missing output file is the real failure, and readFileSync throws it.
  }
  try {
    return readFileSync(out_path, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const row = JSON.parse(line);
        return {
          id: row.id,
          vim: {
            lines: row.lines,
            cursor: row.cursor,
            register: row.register === "" ? null : row.register,
            register_type: register_type(row.type),
          },
        };
      });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// v is characterwise, V linewise, and anything else (^V and a width) is a
// block. The table has null for an empty register.
function register_type(type) {
  if (type === "") return null;
  return type === "v" ? "char" : type === "V" ? "line" : "block";
}

// Keys are written like <Esc> and <C-v>. Inside a Vim double quoted string,
// "\<Esc>" is the key.
function vim_keys(keys) {
  let result = "";
  for (const [token] of keys.matchAll(/<[^<>]+>|./gsu)) {
    if (token.length > 1 && token.startsWith("<")) result += "\\" + token;
    else if (token === "\\") result += "\\\\";
    else if (token === '"') result += '\\"';
    else result += token;
  }
  return result;
}

function vim_string(text) {
  return "'" + text.replaceAll("'", "''") + "'";
}
