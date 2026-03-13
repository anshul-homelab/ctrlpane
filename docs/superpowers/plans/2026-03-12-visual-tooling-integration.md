# Visual Tooling Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure Stitch (UI design) and Nano Banana (image generation) as global Claude Code tools with per-project design context.

**Architecture:** Global MCP servers in settings.json + global workflow skills + per-project CLAUDE.md design system sections.

**Tech Stack:** Claude Code MCP, Google Stitch API, Google Gemini API (Nano Banana)

---

## Table of Contents

- [Task 1: API Key Setup](#task-1-api-key-setup)
- [Task 2: MCP Server Configuration](#task-2-mcp-server-configuration)
- [Task 3: Stitch Design Skill](#task-3-stitch-design-skill)
- [Task 4: Nano Banana Skill](#task-4-nano-banana-skill)
- [Task 5: Per-Project Design Context Template](#task-5-per-project-design-context-template)
- [Task 6: End-to-End Verification](#task-6-end-to-end-verification)

---

## Task 1: API Key Setup

**Scope:** Add `STITCH_API_KEY` and `GEMINI_API_KEY` environment variables to `~/.zshenv` so MCP subprocesses inherit them.
**Dependency:** None (prerequisite for everything else).

---

### 1.1 Generate API Keys (manual)

**Steps:**
- [ ] Open <https://stitch.withgoogle.com> — navigate to Settings > API Keys — generate a new API key
- [ ] Open <https://aistudio.google.com/apikey> — generate a new Gemini API key
- [ ] Keep both keys available for the next step

> **Note:** This step cannot be automated. The user must generate these keys manually in a browser.

---

### 1.2 Add Keys to Shell Environment

**Files:**
- Modify: `~/.zshenv`

**Steps:**
- [ ] Read `~/.zshenv` to understand current structure
- [ ] Append the following block to the end of `~/.zshenv`:

```bash
# --- Visual Tooling API Keys ---
export STITCH_API_KEY="<paste-stitch-key-here>"
export GEMINI_API_KEY="<paste-gemini-key-here>"
```

- [ ] Replace the placeholder values with the actual keys from step 1.1
- [ ] Source the file to verify:

```bash
source ~/.zshenv && echo "STITCH_API_KEY is ${STITCH_API_KEY:+set}" && echo "GEMINI_API_KEY is ${GEMINI_API_KEY:+set}"
```

Expected output:
```
STITCH_API_KEY is set
GEMINI_API_KEY is set
```

- [ ] Run `chezmoi re-add ~/.zshenv` to sync the managed file back to the chezmoi source

> **Important:** `~/.zshenv` is chezmoi-managed. The PostToolUse hook runs `chezmoi re-add` automatically on Edit/Write, but if editing manually, run `chezmoi re-add ~/.zshenv` afterward. Never run `chezmoi apply`.

---

## Task 2: MCP Server Configuration

**Scope:** Register Stitch and Nano Banana MCP servers in `~/.claude/settings.json`.
**Dependency:** Task 1 (API keys must be in environment).

---

### 2.1 Add MCP Servers to settings.json

**Files:**
- Modify: `~/.claude/settings.json`

`~/.claude/settings.json` currently has no `mcpServers` key. Add it as a new top-level key.

**Steps:**
- [ ] Read `~/.claude/settings.json` to confirm current structure
- [ ] Add the `mcpServers` key with both server entries. Insert the following block as a new top-level key (e.g., after `"outputStyle"`):

```json
"mcpServers": {
  "stitch": {
    "command": "npx",
    "args": ["@_davideast/stitch-mcp", "proxy"]
  },
  "nano-banana": {
    "command": "npx",
    "args": ["@ycse/nanobanana-mcp"]
  }
}
```

The full `settings.json` after editing should have this new key alongside the existing keys (`cleanupPeriodDays`, `env`, `permissions`, `hooks`, `statusLine`, `enabledPlugins`, `alwaysThinkingEnabled`, `skipDangerousModePermissionPrompt`, `effortLevel`, `outputStyle`, and the new `mcpServers`).

No `env` block is needed inside either MCP entry — the `npx` subprocess inherits `STITCH_API_KEY` and `GEMINI_API_KEY` from the shell environment.

- [ ] Validate JSON syntax:

```bash
python3 -c "import json; json.load(open('$HOME/.claude/settings.json')); print('Valid JSON')"
```

- [ ] Run `chezmoi re-add ~/.claude/settings.json`

---

### 2.2 Verify MCP Server Registration

**Steps:**
- [ ] Start a new Claude Code session (or restart the current one) so it picks up the new config
- [ ] Run `claude mcp list` — confirm both `stitch` and `nano-banana` appear in the output

Expected: both servers listed with their `npx` commands.

> **Troubleshooting:** If a server fails to start, check:
> - `echo $STITCH_API_KEY` / `echo $GEMINI_API_KEY` are non-empty
> - `npx @_davideast/stitch-mcp --help` resolves (network + npm registry accessible)
> - `npx @ycse/nanobanana-mcp --help` resolves

---

## Task 3: Stitch Design Skill

**Scope:** Create a global skill that teaches Claude when and how to use Stitch for UI design work.
**Dependency:** Task 2 (MCP server must be registered).

---

### 3.1 Create Stitch Design Skill

**Files:**
- Create: `~/.claude/skills/stitch-design/SKILL.md`

**Steps:**
- [ ] Create the directory `~/.claude/skills/stitch-design/`
- [ ] Write `~/.claude/skills/stitch-design/SKILL.md` with the following content:

```markdown
---
name: stitch-design
description: Generates UI designs using the Stitch MCP server. Use when the user needs new UI screens, page redesigns, feature UI additions, or layout exploration. Not for minor CSS tweaks, bug fixes, or non-visual changes.
---

# UI Design with Stitch

## When to Use

Use Stitch when the task involves:
- Designing a new UI screen or page from scratch
- Redesigning an existing screen or section
- Adding a new feature that needs UI layout exploration
- Exploring multiple layout variants before committing to code
- Creating a visual prototype to validate a design direction

## When NOT to Use

Do not use Stitch for:
- Minor CSS adjustments (padding, colors, font sizes)
- Bug fixes in existing UI
- Non-visual changes (API, logic, data layer)
- Component-level tweaks where the layout is already decided

## Workflow

1. **Gather context**: Read the project's `## Design System` section from CLAUDE.md (if it exists) for brand, stack, and style preferences
2. **Prompt Stitch**: Use the Stitch MCP tools to generate a design. Start with a broad layout prompt describing the full screen purpose and content areas
3. **Review variants**: Stitch may generate multiple screens or variations — review each and select the best direction
4. **Pull code**: Retrieve the generated code from the chosen design using Stitch's export tools
5. **Adapt to project**: Modify the exported code to match the project's component library, design tokens, and file conventions

## Export Format Priority

Request output in this order of preference:
1. **React/JSX** — preferred for React-based projects
2. **Tailwind CSS** — when the project uses Tailwind
3. **HTML/CSS** — fallback for non-React projects or quick prototyping

If the project's CLAUDE.md specifies a `Stitch Preferences > Export format`, use that instead.

## Iterative Design Pattern

For complex screens, work in layers:
1. **Broad layout** — generate the full page layout with major content areas
2. **Refine sections** — prompt Stitch again for specific sections that need more detail (e.g., "redesign the sidebar navigation with collapsible groups")
3. **Extract components** — break the refined design into reusable components that match the project's component architecture

Avoid trying to get the perfect design in one shot. Iteration produces better results.

## Project Context

Before prompting Stitch, check for a `## Design System` section in the active project's CLAUDE.md. If present, incorporate:
- **Stack** info into export format selection
- **Brand** colors and tone into the design prompt
- **Stitch Preferences** for export format and design style

If no Design System section exists, use sensible defaults: React/JSX export, neutral modern style.

## Rate Limits

Stitch free tier allows 350 standard and 50 experimental generations per month. Before starting a large design batch (5+ generations), check current usage at the Stitch dashboard (stitch.withgoogle.com). Space out exploratory work across sessions.

## Anti-Patterns

- Do NOT generate a design and immediately discard it without reviewing the output
- Do NOT use Stitch for single-element styling (a button color, a margin fix)
- Do NOT ignore the project's existing design system — always adapt Stitch output to match
```

- [ ] Verify the file exists and is well-formed:

```bash
test -f ~/.claude/skills/stitch-design/SKILL.md && echo "Skill file exists" && head -3 ~/.claude/skills/stitch-design/SKILL.md
```

- [ ] Run `chezmoi re-add ~/.claude/skills/stitch-design/SKILL.md`

---

## Task 4: Nano Banana Skill

**Scope:** Create a global skill that teaches Claude when and how to generate images using the Nano Banana MCP server.
**Dependency:** Task 2 (MCP server must be registered).

---

### 4.1 Create Nano Banana Skill

**Files:**
- Create: `~/.claude/skills/nano-banana/SKILL.md`

**Steps:**
- [ ] Create the directory `~/.claude/skills/nano-banana/`
- [ ] Write `~/.claude/skills/nano-banana/SKILL.md` with the following content:

```markdown
---
name: nano-banana
description: Generates images using the Nano Banana MCP server (Google Gemini image models). Use when the user needs landing page heroes, feature illustrations, placeholder assets, or any project image that should be generated rather than sourced from stock.
---

# Image Generation with Nano Banana

## When to Use

Use Nano Banana when the task involves:
- Landing page hero images or background visuals
- Feature illustration graphics
- Placeholder assets during development (to be replaced later or kept)
- Blog post or documentation header images
- App onboarding or empty-state illustrations
- Any image that should be custom-generated rather than pulled from stock

## When NOT to Use

Do not use Nano Banana for:
- Screenshots or screen recordings (use playwright-cli or native tools)
- Icons or small UI elements (use an icon library)
- Photos of real products or people (use stock photography)
- Diagrams or flowcharts (use Mermaid or a diagramming tool)

## Model Selection

| Model | When to Use | Trade-off |
|-------|-------------|-----------|
| **Nano Banana 2** (default) | Most image generation tasks — landscapes, illustrations, abstract visuals | Fast, lower cost |
| **Nano Banana Pro** | Images with prominent text, detailed typography, or complex compositions requiring highest fidelity | Slower, higher cost |

Default to Nano Banana 2. Only use Pro when the image contains significant readable text or the user explicitly requests highest quality.

## Prompt Patterns

Write prompts that produce brand-aligned output:

1. **Start with the subject**: "A modern dashboard interface showing..."
2. **Add style descriptors**: "flat illustration style, clean lines, minimal shadows"
3. **Include brand context**: Read the project's `## Design System` section from CLAUDE.md for colors and tone. Example: "using a navy blue and white color palette, modern minimal aesthetic"
4. **Specify composition**: "centered composition, 16:9 aspect ratio, suitable as a hero banner"
5. **Negative guidance**: "no photorealistic elements, no text overlays" (when applicable)

### Example Prompts

```
A clean, modern illustration of a project management dashboard with
kanban boards and progress charts. Flat design style with navy blue
and teal accent colors, white background. 16:9 aspect ratio, suitable
as a landing page hero image.
```

```
An abstract geometric pattern representing data flow and connectivity.
Soft gradients in indigo and cyan, dark background. Square format,
suitable as a feature section background.
```

## Output Handling

- **Save location**: Use the project's asset directory as specified in CLAUDE.md's `## Design System > Asset Conventions`. If not specified, default to `public/images/` (web projects) or `assets/` (other projects)
- **Filenames**: Use descriptive kebab-case names that describe the content, not the generation process
  - Good: `hero-dashboard-overview.png`, `feature-kanban-illustration.png`
  - Bad: `generated-image-1.png`, `nano-banana-output.png`, `test.png`
- **Format**: PNG for illustrations and graphics, JPEG for photographic-style images

## Resolution

- **2K** (default): Standard web use — hero images, feature illustrations, blog headers
- **4K**: Only when explicitly needed — print materials, retina-optimized hero images, or when the user requests it

Default to 2K. Higher resolution doubles cost and generation time with marginal visual benefit for web use.

## Brand Alignment

Before generating images, check for a `## Design System` section in the active project's CLAUDE.md. If present, incorporate:
- **Brand colors** into the prompt (e.g., "using primary color #1a365d")
- **Tone** into style descriptors (e.g., "modern minimal" vs "playful and colorful")
- **Asset Conventions** for save location and naming

If no Design System section exists, use a neutral modern style and save to the project's most obvious asset directory.

## Anti-Patterns

- Do NOT generate images without saving them to a file — always write to the project's asset directory
- Do NOT use generic filenames — always use descriptive kebab-case names
- Do NOT default to 4K resolution unless explicitly requested
- Do NOT skip reading the project's Design System section (if it exists) before generating
- Do NOT generate multiple variations unless the user asks for options — generate one good image per request
```

- [ ] Verify the file exists and is well-formed:

```bash
test -f ~/.claude/skills/nano-banana/SKILL.md && echo "Skill file exists" && head -3 ~/.claude/skills/nano-banana/SKILL.md
```

- [ ] Run `chezmoi re-add ~/.claude/skills/nano-banana/SKILL.md`

---

## Task 5: Per-Project Design Context Template

**Scope:** Add a `## Design System` section to ctrlpane's `CLAUDE.md` as the first consumer of this pattern, and document the template for other projects.
**Dependency:** Tasks 3 and 4 (skills reference this section).

---

### 5.1 Add Design System Section to ctrlpane's CLAUDE.md

**Files:**
- Modify: `/Users/anshul/projects/personal/ctrlpane/CLAUDE.md`

**Steps:**
- [ ] Read the current `CLAUDE.md` content
- [ ] Append the Design System section. The file should become:

```markdown
See `AGENTS.md`. Repository policy is provider-agnostic; this file is only a compatibility pointer.

## Design System

### Stack
- Framework: React 19
- Styling: Tailwind CSS
- Component library: shadcn/ui

### Brand
- Primary: Indigo (#4F46E5)
- Font: Inter
- Tone: Modern minimal, professional, clean

### Stitch Preferences
- Export format: React/JSX
- Design style: Modern minimal, consistent with shadcn/ui aesthetic

### Asset Conventions
- Images: `packages/web/public/images/`
- Naming: kebab-case descriptive (e.g., `hero-dashboard-overview.png`)
```

- [ ] Verify the file reads correctly:

```bash
cat /Users/anshul/projects/personal/ctrlpane/CLAUDE.md
```

- [ ] Commit this change:

```bash
cd /Users/anshul/projects/personal/ctrlpane && git add CLAUDE.md && git commit -m "docs: add design system section to CLAUDE.md for visual tooling integration"
```

---

### 5.2 Document the Template for Other Projects

This step is informational — no files to create. The template for other projects to adopt is documented in the spec at `docs/superpowers/specs/2026-03-12-visual-tooling-integration-design.md` under "Component 3: Per-Project Design Context". When onboarding a new project to visual tooling, copy the template from the spec and fill in project-specific values.

**Steps:**
- [ ] Verify the spec file contains the template:

```bash
grep -c "## Design System" /Users/anshul/projects/personal/ctrlpane/docs/superpowers/specs/2026-03-12-visual-tooling-integration-design.md
```

Expected: `1` (confirms the template is in the spec).

---

## Task 6: End-to-End Verification

**Scope:** Verify all components are correctly installed and working together.
**Dependency:** All previous tasks.

---

### 6.1 Verify MCP Servers Are Registered

**Steps:**
- [ ] Start a fresh Claude Code session (restart to pick up all config changes)
- [ ] Run `claude mcp list` and confirm both `stitch` and `nano-banana` appear

---

### 6.2 Stitch Smoke Test

**Steps:**
- [ ] In a Claude Code session, ask: "Use Stitch to generate a simple login page design with email and password fields"
- [ ] Confirm:
  - The Stitch MCP tools are available and invoked
  - A design is generated (HTML/React output returned)
  - No authentication errors (confirms `STITCH_API_KEY` is working)

If it fails with an auth error: verify `echo $STITCH_API_KEY` is non-empty in the shell that launched Claude Code, then restart.

---

### 6.3 Nano Banana Smoke Test

**Steps:**
- [ ] In a Claude Code session, ask: "Generate a simple placeholder image — a minimal abstract geometric pattern in blue tones, save it to the current directory as `test-nano-banana.png`"
- [ ] Confirm:
  - The Nano Banana MCP tools are available and invoked
  - An image file is created at the expected path
  - No authentication errors (confirms `GEMINI_API_KEY` is working)
- [ ] Clean up: delete the test image

```bash
rm -f test-nano-banana.png
```

---

### 6.4 Skills Verification

**Steps:**
- [ ] Confirm both skills appear in Claude Code's available skills (visible at session startup or in the skills list)
- [ ] Ask Claude: "What are the Stitch rate limits?" — it should reference 350 standard / 50 experimental per month (from the stitch-design skill)
- [ ] Ask Claude: "What model should I use for an image with text?" — it should recommend Nano Banana Pro (from the nano-banana skill)

---

### 6.5 Project Context Integration Test

**Steps:**
- [ ] In the ctrlpane project directory, ask Claude: "What export format should Stitch use for this project?"
- [ ] Confirm it reads the `## Design System` section from CLAUDE.md and answers "React/JSX"
- [ ] Ask: "Where should generated images be saved for this project?"
- [ ] Confirm it answers `packages/web/public/images/` (from CLAUDE.md's Asset Conventions)

---

## Summary of Files

| Action | Path | Description |
|--------|------|-------------|
| Modify | `~/.zshenv` | Add `STITCH_API_KEY` and `GEMINI_API_KEY` exports |
| Modify | `~/.claude/settings.json` | Add `mcpServers` with `stitch` and `nano-banana` entries |
| Create | `~/.claude/skills/stitch-design/SKILL.md` | Global skill for Stitch UI design workflow |
| Create | `~/.claude/skills/nano-banana/SKILL.md` | Global skill for Nano Banana image generation |
| Modify | `/Users/anshul/projects/personal/ctrlpane/CLAUDE.md` | Add `## Design System` section (first consumer) |

## Rollback

To undo this integration:
1. Remove `stitch` and `nano-banana` from `mcpServers` in `~/.claude/settings.json`
2. Delete `~/.claude/skills/stitch-design/` and `~/.claude/skills/nano-banana/`
3. Remove `STITCH_API_KEY` and `GEMINI_API_KEY` exports from `~/.zshenv`
4. Remove `## Design System` section from project CLAUDE.md files
5. Run `chezmoi re-add` for all modified chezmoi-managed files
6. Restart Claude Code
