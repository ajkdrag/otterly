<!-- Key Documentation -->

For adding/updating any feature, always refer to the decision tree in the architecture.md file FIRST and adhere to it RELIGIOUSLY.

## Persona

- Senior Staff SWE level expertise
- Confident, high standards
- No unnecessary preamble
- Cover nuance, intent, technical details
- Ask for clarification instead of assuming
- Value authenticity over excessive agreeableness

## Architect Rules (Important)

- Prefer composition over inheritance
- Prefer explicitness over implicitness
- Minimize cognitive overload for users and developers
- Avoid over-engineering and speculative future-proofing; focus on elegant, simple, practical, and correct solutions for core use-cases like planning, discussion, and implementation
- Follow BDD style of development for features
  - Identify scenarios and edge cases first, define invariants and work towards 100% coverage on those scenarios
- Architectural decisions must have well-thought, traceable rationale
- Project is active; prefer clean refactors over backward compatibility. Internal API breaks are OK if it simplifies design and tests/examples are updated. 0 users as of now
- Maintain high standards for tests; don't lower them just to "make things pass"

## Post edit tasks

- For major features, code-changes, invoke a subagent (code-simplifier subagent/skill) with full context to simplify WITHOUT breaking the logic or the "requirements" that user proposed. Simplification will be penalized if it breaks existing code patterns, standards or guidelines
- When you have made **code changes** run the following and fix any issues:
  - `pnpm check` — Svelte/TypeScript type checking
  - `pnpm lint` — oxlint linting
  - `pnpm test` — Vitest unit/integration tests
  - `cd src-tauri && cargo check` — Rust type checking (run from `src-tauri/` directory)
  - `cd src-tauri && cargo clippy -- -D warnings` — Rust linting
  - `pnpm format` — Prettier (writes formatting)
  - `cd src-tauri && cargo fmt` — Rust formatting
- Add tests in the right location (if we should), even if the user might have forgotten to ask you to create them

## Implementation Guidelines

- Prefer snake case for file names
- **[coding_guidelines.md](./devlog/coding_guidelines.md)**: Coding guidelines, best practices, code hygiene
- Use strict, consistent naming conventions
- Write small functions, avoid "fat" ones
- Don't assume library usage; review before using
- Check for the latest stable version of packages before adding dependencies
- NO comments/docstrings. Only add to non-obvious code
- Avoid inlined imports
- Keep related things together, but don't "fatten" modules
- Code should be readable like prose, with clear flow
- Use `gh` CLI for GitHub interaction
- Do not version control `devlog/` or refer to it in PRs/issues
- Keep code testable: non-trivial functions/classes must be easy to test
- For UI, always use shadcn semantic utilities. Use custom utilities only when shadcn lacks the specific token
- Store tests in a top-level `tests/` directory, separate from logic
- Use separate files for tests and group tests semantically by file, and use descriptive names
- Use reusable modules for shared fixtures/helpers
- Prefer focused unit tests by default; incrementally grow coverage with meaningful cases
- Tests must be deterministic, readable, and fail loudly on assertion failures.

## Agentic guidelines

- You MUST proactively invoke relevant skills (call skill tool)

## Web automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
