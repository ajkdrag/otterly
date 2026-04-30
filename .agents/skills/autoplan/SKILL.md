---
name: autoplan
description: One-command full review pipeline — automatically runs CEO, Design, and Eng review in sequence with auto-decisions. Invoke with /autoplan.
---

# Autoplan — Full Review Pipeline

One command, fully reviewed plan. Sequentially runs CEO → Design → Engineering review with auto-decisions on mechanical questions. Only stops for strategic decisions that need your judgment.

## How It Works

Instead of running `/plan-ceo-review`, `/plan-design-review`, and `/plan-eng-review` separately and answering 15-30 intermediate questions, `/autoplan` chains them together and auto-decides using 6 principles. You only answer 1-2 critical questions.

## The 6 Auto-Decision Principles

When a review step would normally ask you a question, auto-decide using:

1. **Completeness** — Pick the approach covering more edge cases
2. **Boil Lakes** — Fix everything in blast radius if <1 day effort
3. **Pragmatic** — Two solutions, same problem? Pick the cleaner one
4. **DRY** — Reject duplicates; reuse existing functionality
5. **Explicit over Clever** — 10-line obvious fix beats 200-line abstraction
6. **Bias toward Action** — Ship > deliberate endlessly

## Decision Classification

- **Mechanical**: one clearly right answer → auto-decide silently
- **Taste**: reasonable people could disagree → auto-decide + surface at final gate
- **User Challenge**: direction should change → never auto-decide, ask user

## Phase 0: Context Gathering

```bash
git log --oneline -20 2>/dev/null
```

- Read CLAUDE.md, TODOS.md, any plan/design docs
- Detect scope: does this have UI? (look for components, templates, CSS)
- Detect scope: does this have developer-facing API/SDK?

## Phase 1: CEO Review

Run the full `/plan-ceo-review` workflow:

- Challenge premises
- Map existing code leverage
- Generate 2-3 alternatives
- Failure mode analysis
- 11-dimension review

**Auto-decide** all mechanical questions. **Stop only** for premise challenges that could change direction.

### Codex Outside Voice (Phase 1)

After Claude completes the CEO review, use `/codex:rescue` to get an independent strategic perspective:

- Prompt: "As a startup advisor, review this plan. Challenge the premises, identify blind spots, and suggest what could go wrong. Focus on strategy, not implementation."
- Compare Codex's concerns with Claude's findings
- **Agreement** = high confidence in the finding
- **Disagreement** = surface at final gate for user decision

Output: premise validation, chosen approach, failure modes, Codex strategic concerns.

## Phase 2: Design Review (if UI scope detected)

Only runs if Phase 0 detected UI-related files.

Run the full `/plan-design-review` workflow:

- Rate 7 design dimensions (0-10)
- Information architecture
- Interaction states
- Responsive & accessibility
- AI slop risk

**Auto-decide** design gaps. **Surface** taste decisions (aesthetic choices) at final gate.

### Codex Outside Voice (Phase 2)

Use `/codex:rescue` for design critique:

- Prompt: "Review this UI/UX plan. Focus on: information hierarchy, user confusion risks, accessibility gaps, and whether the design feels generic or specific to this product."
- Merge unique Codex findings into the design review

Output: dimension scores, design recommendations, Codex design critique.

## Phase 3: Engineering Review

Run the full `/plan-eng-review` workflow:

- Architecture review with data flow diagram
- Error/rescue mapping
- Test coverage mapping (every code path)
- Performance review

**Auto-decide** architecture and test gaps. **Surface** tradeoff decisions at final gate.

### Codex Outside Voice (Phase 3)

Use `/codex:rescue` for architecture challenge:

- Prompt: "Review this architecture plan. Focus on: scaling bottlenecks, edge cases the plan misses, unnecessary complexity, and whether simpler alternatives exist."
- Merge unique Codex findings into the eng review

Output: architecture diagram, test coverage map, performance concerns, Codex architecture critique.

### Codex Unavailable?

If Codex is unavailable at any phase, skip the outside voice and note "單模型審查" in that phase's output. Continue normally.

## Phase 4: Final Approval Gate

Present a summary of everything:

```
AUTOPLAN REVIEW COMPLETE
════════════════════════════════════════
Phases run:    CEO [✓] Design [✓/skipped] Eng [✓]

PREMISE CHECK:
  [VALIDATED/CHALLENGED/UNVERIFIED] for each premise

APPROACH: [chosen approach and why]

AUTO-DECIDED (N decisions):
  - [decision]: [principle used] — [rationale]
  - [decision]: [principle used] — [rationale]

TASTE DECISIONS (need your eye):
  1. [decision] — 我建議 [X] 因為 [reason]
  2. [decision] — 我建議 [X] 因為 [reason]

USER CHALLENGES (need your call):
  1. [both review phases flagged this] — [what and why]

SCORES:
  Design:      [N/10 average across dimensions, or N/A]
  Test coverage: [N paths covered / N total]
  Performance: [OK / N concerns]
  Failure modes: [N identified]

OPTIONS:
  A) 批准 — 按計劃執行
  B) 修改 taste decisions — 覆蓋我的自動決定
  C) 深入詢問 — 問我任何細節
  D) 修改計劃 — 改了之後重跑受影響的 phase
  E) 否決 — 重新開始
════════════════════════════════════════
```

## Language

All output MUST be in **Simplified Chinese (简体中文)**. Only actual code stays in English.

## Rules

- **Sequential execution.** CEO → Design → Eng. Never parallel. Each phase must complete before next.
- **Full depth.** Don't summarize the sub-reviews. Run them completely.
- **Two stops maximum.** Premise gate (Phase 1) and final approval (Phase 4).
- **Log every auto-decision.** Show principle + rationale in the final summary.
- **Respect user sovereignty.** Auto-decisions are recommendations. User can override any of them.

## Voice

Efficient orchestrator. "跑完三輪審查了。15 個決定中 13 個自動處理，2 個需要你看一下。"
