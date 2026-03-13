# Visual Tooling Integration Design

**Date**: 2026-03-12
**Author**: Anshul
**Status**: Draft
**Scope**: Global Claude Code configuration for Stitch (UI design) and Nano Banana (image generation)
**Location note**: This spec lives in ctrlpane (the first consumer) but describes global `~/.claude/` configuration applicable to all projects.

## Problem

Multiple applications need UI design and occasional image generation. Currently no tooling is configured for either. Setting up per-project would create maintenance burden and repetitive configuration across projects.

## Decision

**Approach B: Global MCP + Project-Level Design Context**

- MCP servers are infrastructure — configured globally in `~/.claude/settings.json`
- Design workflows are documented in global skills (`~/.claude/skills/`)
- Project-specific design context lives in each project's `CLAUDE.md`
- Image editing tools (Stability AI, etc.) deferred — add later if needed

## Architecture

```
~/.claude/
├── settings.json          # MCP server configs (Stitch + Nano Banana)
└── skills/
    ├── stitch-design/
    │   └── SKILL.md        # UI design workflow patterns
    └── nano-banana/
        └── SKILL.md        # Image generation workflow patterns

<project>/
└── CLAUDE.md              # ## Design System section (per-project context)
```

## Component 1: MCP Server Configuration

### Stitch MCP

- **Package**: [`@_davideast/stitch-mcp`](https://github.com/davideast/stitch-mcp) ([npm](https://www.npmjs.com/package/@_davideast/stitch-mcp)) — maintained by David East (Google Developer Advocate)
- **Auth**: `STITCH_API_KEY` environment variable (generated at stitch.withgoogle.com Settings > API Keys)
- **Tools exposed**: Generate UI designs from prompts, retrieve screen HTML/React/Tailwind, download screen screenshots
- **Rate limits**: 350 standard / 50 experimental generations per month (free tier). Check usage at stitch.withgoogle.com dashboard.

### Nano Banana MCP

- **Package**: [`@ycse/nanobanana-mcp`](https://github.com/YCSE/nanobanana-mcp) ([npm](https://www.npmjs.com/package/@ycse/nanobanana-mcp))
- **Auth**: `GEMINI_API_KEY` environment variable (from Google AI Studio)
- **Tools exposed**: Text-to-image generation, image editing, style transfer
- **Models**: Nano Banana 2 (`gemini-3.1-flash-image-preview`) as default, Pro (`gemini-3-pro-image-preview`) for text-heavy images

### Configuration

Added to `~/.claude/settings.json` under `mcpServers`:

```json
{
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

API keys (`STITCH_API_KEY`, `GEMINI_API_KEY`) must be set in the shell environment (e.g., `~/.zshenv`). The MCP subprocess inherits the parent shell's environment, so no `env` block is needed in `settings.json` — the keys are already available.

API keys are stored as shell environment variables in `~/.zshenv` (chezmoi-managed), not hardcoded. Claude Code's MCP `env` block inherits from the process environment — the `env` field sets additional env vars for the spawned process. Keys set in the shell profile are automatically available to `npx` subprocesses.

## Component 2: Global Skills

### Stitch Design Skill (`~/.claude/skills/stitch-design/SKILL.md`)

Purpose: Teach Claude when and how to use Stitch for UI design work.

Content covers:
- **When to use**: New UI screens, redesigns, feature additions, layout exploration
- **When not to use**: Minor CSS tweaks, bug fixes, non-visual changes
- **Workflow**: Prompt Stitch for design variants -> review options -> pull React/Tailwind code -> adapt to project design system
- **Export format priority**: React/JSX > Tailwind CSS > HTML/CSS
- **Iterative pattern**: Broad layout first -> refine individual sections -> extract into components
- **Project context**: Read `## Design System` section from the active project's CLAUDE.md for brand, stack, and style preferences
- **Rate limit awareness**: Note monthly limits; check Stitch dashboard for current usage before large batches

### Nano Banana Skill (`~/.claude/skills/nano-banana/SKILL.md`)

Purpose: Teach Claude when and how to generate images for projects.

Content covers:
- **When to use**: Landing page hero images, feature illustrations, placeholder assets during development
- **Model selection**: Nano Banana 2 (default, fast, cheap) vs Pro (complex text rendering, highest quality)
- **Prompt patterns**: Include brand context, style descriptors, composition guidance
- **Output handling**: Save to project's asset directory (read from CLAUDE.md), use descriptive kebab-case filenames
- **Resolution**: 2K for standard web use, 4K only when explicitly needed (doubles cost)
- **Brand alignment**: Reference project's `## Design System` section for colors, tone, and style

Both skills are intentionally lightweight — they document workflow patterns, not API details. The MCP tools handle the API interaction.

## Component 3: Per-Project Design Context

Each project that uses Stitch or Nano Banana adds a `## Design System` section to its `CLAUDE.md`:

```markdown
## Design System

### Stack
- Framework: [React/Next.js/etc.]
- Styling: [Tailwind CSS / CSS Modules / etc.]
- Component library: [shadcn/ui / custom / etc.]

### Brand
- Primary: [color]
- Font: [font family]
- Tone: [modern minimal / playful / enterprise / etc.]

### Stitch Preferences
- Export format: [React/JSX | Tailwind | HTML/CSS]
- Design style: [Material 3 / custom / match existing]

### Asset Conventions
- Images: [public/images/ | src/assets/]
- Naming: [kebab-case descriptive, e.g., hero-dashboard-overview.png]
```

Projects without this section get sensible defaults from the global skills. The section is added only when a project first needs UI design or image generation work.

## Usage Priority

| Tool | Use Case | Frequency |
|------|----------|-----------|
| Stitch | New UI design, redesign, feature UI additions | High (primary tool) |
| Nano Banana 2 | Landing page images, hero images | Moderate |
| Nano Banana Pro | Images requiring high-quality text rendering | Rare |
| Image editing (deferred) | Background removal, upscaling, style transfer | Rare — add Stability AI MCP later if needed |

## Prerequisites

1. Google account with access to stitch.withgoogle.com
2. Stitch API key generated from Stitch Settings
3. Google AI Studio account with Gemini API key
4. Both API keys exported as environment variables (`STITCH_API_KEY`, `GEMINI_API_KEY`)

## Verification

After setup, verify each component:

1. **MCP servers registered**: Run `claude mcp list` — both `stitch` and `nano-banana` should appear
2. **Stitch smoke test**: In a Claude Code session, ask to generate a simple login page design via Stitch. Confirm the MCP tools are available and return HTML/React output.
3. **Nano Banana smoke test**: Ask Claude to generate a simple placeholder image. Confirm the image file is created in the working directory.
4. **Skills loaded**: Confirm both skills appear in Claude Code's skill list (visible in session startup or via `/help`)

If an MCP server fails to start, check:
- API key is exported in the shell environment (`echo $STITCH_API_KEY`, `echo $GEMINI_API_KEY`)
- `npx` can resolve the package (`npx @_davideast/stitch-mcp --help`)
- Network access is available (both are remote API services)

## Rollback

To disable either tool: remove its entry from `~/.claude/settings.json` `mcpServers` and restart Claude Code. Skills in `~/.claude/skills/` can be deleted independently. Per-project `## Design System` sections are inert without the MCP servers.

## What Is Not Included

- Image editing / manipulation tools (deferred — Stability AI MCP if needed later)
- DALL-E / OpenAI image generation (Nano Banana covers this need)
- Local model hosting (Flux MCP) — unnecessary for the described use cases
- Figma integration — Stitch handles design-to-code directly
