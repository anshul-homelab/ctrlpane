# Notes

> Personal note-taking with hierarchical folder organization, full-text search, and AI-powered analysis.

## Overview

Notes is the knowledge capture space within ctrlpane. Notes can be organized into folders, pinned for quick access, and searched with Postgres full-text search (tsvector). A built-in AI analysis endpoint summarizes or extracts insights from a note.

The editor supports rich text content stored as Markdown. Folders provide a single level of organization without deep nesting — a deliberate choice to keep the UI simple. Notes without a folder are accessible from the root view.

Notes serve as the raw idea capture layer. Ideas captured in notes can be converted into project constructs (initiatives, epics, tasks) through the project management domain, similar to how a Confluence page might spawn Jira tickets.

## Capabilities

- Create, read, update, and delete notes
- Organize notes into folders (create, rename, delete folders)
- Pin notes for top-of-list visibility
- Filter notes by folder and search by title/content (Postgres FTS)
- Sort by last-updated date
- AI analysis: summarize, extract action items, or extract structured data from a note
- Soft folder deletion: notes in a deleted folder have their `folder_id` set to null (not deleted)
- Tags for cross-folder organization
- Entity links: connect notes to tasks, project items, or goals
- Version history: track note revisions (configurable retention)

## Multi-Tenancy and Multi-User

All tables include `tenant_id` with RLS. Notes are scoped to the tenant level — all users within a tenant can access notes based on their permissions:

| Permission | Description |
|-----------|-------------|
| **Owner** | Full control (edit, delete, move, share) |
| **Editor** | Edit content, add comments |
| **Viewer** | Read-only access |

Notes default to being visible to all tenant members. Private notes can be restricted to the creator only.

## Architecture

```
Routes (Hono.js)
  -> NoteService (Effect.ts)
    -> NoteRepository (Drizzle -> Postgres)
    -> FTS (Postgres tsvector with GIN index)
    -> AI Analysis (inference service for summarization and extraction)
  -> EventBus (NATS JetStream)
```

A Postgres trigger maintains the `search_vector` tsvector column automatically on insert and update. A GIN index on `search_vector` makes full-text queries fast without any application-side indexing logic.

## API Endpoints

### Folders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/folders` | List all folders |
| POST | `/api/notes/folders` | Create folder |
| PATCH | `/api/notes/folders/:id` | Rename/update folder |
| DELETE | `/api/notes/folders/:id` | Delete folder (nullifies note folder_id) |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | List notes (folder, search, tag, sort filters) |
| GET | `/api/notes/:id` | Get single note |
| POST | `/api/notes` | Create note |
| PATCH | `/api/notes/:id` | Update note (title, content, folder, pinned, tags) |
| DELETE | `/api/notes/:id` | Soft delete note |
| POST | `/api/notes/:id/analyze` | AI analysis of note content |
| GET | `/api/notes/:id/versions` | Note version history |
| POST | `/api/notes/:id/restore/:versionId` | Restore a previous version |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/tags` | List all tags with note counts |
| POST | `/api/notes/:id/tags` | Add tag to note |
| DELETE | `/api/notes/:id/tags/:tag` | Remove tag from note |

## Data Model

All tables include `tenant_id` for multi-tenancy.

### `note_folders`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (UUID) | Primary key |
| `tenant_id` | text | RLS enforced |
| `name` | text | Folder display name |
| `sort_order` | integer | Manual ordering |
| `created_by` | text FK -> users | Creator |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `notes`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (UUID) | Primary key |
| `tenant_id` | text | RLS enforced |
| `title` | text | Note title (defaults to "Untitled") |
| `content` | text | Note body (Markdown) |
| `folder_id` | text FK -> note_folders | Nullable, set null on folder delete |
| `pinned` | boolean | Pin to top of list |
| `tags` | text[] | Array of tag strings |
| `created_by` | text FK -> users | Creator |
| `is_private` | boolean | If true, only visible to creator |
| `deleted_at` | timestamptz | Soft delete timestamp |
| `search_vector` | tsvector | Auto-updated FTS column (Postgres trigger) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes**: folder_id, pinned, updated_at, tags (GIN), search_vector (GIN), deleted_at.

### `note_versions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (UUID) | Primary key |
| `tenant_id` | text | RLS enforced |
| `note_id` | text FK -> notes | |
| `title` | text | Title at this version |
| `content` | text | Content at this version |
| `created_by` | text FK -> users | Who made the edit |
| `created_at` | timestamptz | When this version was saved |

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_notes` | List notes with folder/tag/search filters |
| `get_note` | Get full note content |
| `create_note` | Create a new note |
| `update_note` | Update note content or metadata |
| `search_notes` | Full-text search across all notes |
| `analyze_note` | Run AI analysis (summarize, extract action items) |
| `list_folders` | List note folders |
| `create_folder` | Create a new folder |

## Events

| Event | Trigger |
|-------|---------|
| `note.created` | New note |
| `note.updated` | Note content or metadata changed |
| `note.deleted` | Note soft-deleted |
| `note.analyzed` | AI analysis completed |

## External Integrations

Notes can integrate with external knowledge systems:
- **LifeOS Knowledge Base**: entity links can reference LifeOS knowledge entries (read-only, via API)
- **Notion import**: bulk import notes from Notion exports
- **Markdown file sync**: sync notes from a local directory (e.g., Obsidian vault)

These integrations are handled through the integrations domain and are not built into the notes domain itself.

## Notes vs Knowledge Base

ctrlpane Notes and the external **[knowledgebase](https://github.com/anshulbisen/knowledgebase)** service serve complementary but distinct purposes:

| Aspect | Notes (ctrlpane) | Knowledge Base (knowledgebase service) |
|--------|-----------------|---------------------------------------|
| **Purpose** | Lightweight freeform capture | Structured entries with semantic search, Q&A, and linking |
| **Content** | Markdown, folders, quick access | Categorized entries (fact, preference, decision, experience, skill, habit, relationship) |
| **Search** | Postgres full-text search (tsvector) | Hybrid full-text + semantic search (pgvector embeddings) |
| **Organization** | Folders and tags | Hierarchical domains, tags, and entry linking (related, builds_on, contradicts, supersedes) |
| **AI features** | Summarize, extract action items | Q&A with citations, interview sessions, auto-linking |

### Promote Note to Knowledge Entry

A note in ctrlpane can be "promoted" to a knowledge entry in the knowledgebase service. This calls the knowledgebase API to create an entry in the `ctrlpane-project` workspace with the note's content, and optionally archives or links back to the original note.

Use cases:
- A meeting note contains an architecture decision worth preserving as structured knowledge
- A research note contains learnings that should be searchable via semantic search
- A retrospective note captures a pattern that AI agents should be able to reference

---

## Related Documentation

- [Task Management](./task-management.md) — notes can be linked to tasks via entity links
- [Project Management](./project-management.md) — notes can be linked to project items; ideas in notes can become project constructs
- [AI Agent Integration](./ai-agent-integration.md) — agent contract for note operations
