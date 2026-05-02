# Feature-First Organization

LeapGrowNotes uses capability-first organization for frontend modules.

## Rule of thumb

- Slice by feature first.
- Keep layer concepts inside each feature.
- Put business rules in `domain/` inside the owning feature.
- Import from feature entrypoints (`$lib/features/<feature>`) in composition and orchestration code.
- Keep cross-feature imports explicit and limited.

## Dependency rules

- Features may depend on `shared` modules (`$lib/shared/types`, `$lib/shared/utils`, `$lib/shared/adapters`).
- Features should only deep-import their own internals.
- Cross-feature behavior should go through public entrypoints.
- Each feature owns its own `ports.ts` contracts.
