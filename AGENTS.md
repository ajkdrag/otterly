For adding/updating any feature, always refer to the decision tree in the docs/architecture.md file FIRST and adhere to it RELIGIOUSLY.

## Post edit tasks

- For major features, code-changes, invoke a subagent (code-simplifier subagent/skill) with full context to simplify WITHOUT breaking the logic or the "requirements" that user proposed. Simplification will be penalized if it breaks existing code patterns, standards or guidelines
- When you have made **code changes** run the following and fix any issues:
  - `pnpm check` — Svelte/TypeScript type checking
  - `pnpm lint` — oxlint linting
  - `pnpm test` — Vitest unit/integration tests
  - `cd src-tauri && cargo check` — Rust type checking (run from `src-tauri/` directory)
  - `pnpm format` — Prettier (writes formatting)
- Add tests in the right location (if we should), even if the user might have forgotten to ask you to create them

## Project-specific guidelines

- Prefer snake case for file names
- Don't assume library usage; review before using
- Use `gh` CLI for GitHub interaction
- For UI, always use shadcn semantic utilities. Use custom utilities only when shadcn lacks the specific token

## Web automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
