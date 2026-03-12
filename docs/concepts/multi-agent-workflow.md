# Multi-Agent Development Workflow

## Team Composition

ctrlpane development uses a hybrid human+AI team model:
- **1 human developer** (Anshul) — provides direction, reviews, approves merges
- **Multiple AI agents** — work in parallel on exclusive and sometimes intersecting features

Agents onboard via `AGENTS.md` — no tribal knowledge required. This self-documenting convention is the core of the multi-agent strategy.

## Branch Model

- **`main` only** — no long-lived feature branches for solo dev
- Multiple agents may commit to `main` simultaneously
- Pre-commit hooks (Lefthook) are the quality gates (biome, syncpack, sherif)

## Multi-Session Safety

When multiple agent sessions run simultaneously, they may try to edit the same file. **Never lose another agent's code.**

### Before Editing Any File
```bash
git diff <file>   # Check for unstaged changes you didn't make
```

If a file has unexpected changes:
1. STOP immediately
2. Notify the user: "File `<path>` was modified by another session. Changes: <summary>. How should I proceed?"
3. Wait for instructions before touching the file

### Forbidden Without Explicit Approval
- `git checkout -- <file>` (reverts changes)
- `git restore <file>`
- `git stash`
- `git reset` (any form)
- Overwriting a file with Write tool if it has unexpected content
- Deleting or moving files you didn't create

If a merge conflict occurs: **STOP and notify the user**. Do not attempt to resolve automatically.

## Decision Tree: How to Handle Tasks

```
Single focused task?
  -> Use Task tool directly (no team)

Sequential tasks that build on each other?
  -> Subagent-Driven: one agent per task, sequential execution

10+ tasks from a written plan?
  -> Executing-Plans skill in a separate terminal

2+ independent tasks, separable directories?
  -> Agent Teams (parallel)
```

## Agent Team Templates

| Template | Agents | Best For |
|---|---|---|
| Full-Stack Feature | 5 | Feature spanning API + web + tests |
| Research then Implementation | 4 | Unknown problem space needing research first |
| Debug Squad | 3-4 | Complex bugs with unclear root cause |
| Parallel Tasks | N + 2 | N independent tasks + coordinator + reviewer |

## Model Routing

Agents are assigned to tasks based on complexity:

| Model | Use Cases |
|---|---|
| **Haiku** | Mechanical tasks: file search, test running, linting, exploration |
| **Sonnet** | Documentation, plan writing, routine implementation |
| **Opus** | Architecture decisions, complex implementation, code review, security review |

## Separable Directories for Agent Teams

These directories can be assigned exclusively to one agent at a time:

- `apps/api/src/domains/<module>/` — one domain per agent (e.g., tasks/, projects/, goals/)
- `apps/web/src/components/<module>/` — one component group per agent
- `apps/web/src/routes/<module>/` — one route group per agent
- `tests/<domain>/` — one test domain per agent
- `packages/shared/` — **single-writer only** (coordinate explicitly)

### Example: Parallel Agent Assignment

```
Agent A: apps/api/src/domains/tasks/     + apps/web/src/routes/tasks/
Agent B: apps/api/src/domains/projects/  + apps/web/src/routes/projects/
Agent C: apps/api/src/domains/goals/     + apps/web/src/routes/goals/
Agent D: apps/api/src/domains/notes/     + apps/web/src/routes/notes/
Agent E: apps/api/src/domains/agents/    + apps/web/src/routes/agents/
```

## Output Hygiene (Mandatory for All Agents)

Verbose tool output wastes context tokens. All agents must:

```bash
# Test output
bun run test 2>&1 | tail -30
bun run test 2>&1 | grep -E '(FAIL|Error|x)' | head -20

# Build output
bun run build 2>&1 | tail -20

# File reading
# Use offset/limit for files >200 lines — never dump entire large files
```

Subagent prompts must include: "Limit Bash output to relevant lines. Use `| tail -N` or `| grep` to filter."

## Development Methodology

Every change follows this order:

1. **Document** — Update AGENTS.md, design docs, or memory files with target design
2. **Code** — Implement changes aligned with documented design
3. **Test** — Add or update tests to cover changes
4. **Verify** — `bun run typecheck && bun run check && bun run test`
5. **Update memory** — Ensure memory files reflect final state

Never code first and document after. Documentation is the source of truth.

## Memory System

Provider runtimes may maintain persistent memory outside the repository:

- Memory files are always loaded into conversation context
- Updated after each session with stable patterns and architectural decisions
- What to save: architectural decisions, conventions confirmed across sessions, key file paths, solutions to recurring problems
- What NOT to save: session-specific context, speculative conclusions from a single file

## Skills System

Specialized skills extend agent capabilities:

| Skill | Purpose |
|---|---|
| `task-protocol` | Task classification, subagent delegation, progress tracking |
| `executing-plans` | Execute written plans with review checkpoints |
| `subagent-driven-development` | Sequential multi-task execution |
| `agent-team-driven-development` | Parallel agent teams with inter-agent messaging |
| `test-driven-development` | TDD before implementation |
| `systematic-debugging` | Structured debugging protocol |
| `requesting-code-review` | Review before completing work |
| `writing-plans` | Convert specs to implementation plans |

Skills may live in provider-specific registries. For Claude-based sessions, they are invoked via the Skill tool.
