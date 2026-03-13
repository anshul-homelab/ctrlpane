import { type ItemStatus, VALID_STATUS_TRANSITIONS } from '@ctrlpane/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Abstraction over the blueprint HTTP API so the MCP server can work with
 * either a live API endpoint or a direct in-process service.
 *
 * Every method returns a plain JSON-serialisable object (or throws).
 * The MCP tool handlers convert errors into MCP-level `isError` responses.
 */
export interface BlueprintApiClient {
  listItems(params: {
    status?: string;
    priority?: string;
    tag?: string;
    search?: string;
    assigned_to?: string;
    cursor?: string;
    limit?: number;
    sort?: string;
    order?: string;
  }): Promise<unknown>;

  getItem(id: string): Promise<unknown>;

  createItem(params: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    assigned_to?: string;
    parent_id?: string;
    tag_ids?: string[];
  }): Promise<unknown>;

  updateItem(id: string, fields: Record<string, unknown>): Promise<unknown>;

  changeStatus(id: string, newStatus: string): Promise<unknown>;

  searchItems(params: {
    query: string;
    status?: string;
    priority?: string;
  }): Promise<unknown>;

  addComment(itemId: string, content: string): Promise<unknown>;

  listTags(): Promise<unknown>;

  assignTag(itemId: string, tagId: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// HTTP-based API client (default implementation)
// ---------------------------------------------------------------------------

export class HttpBlueprintApiClient implements BlueprintApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...init?.headers,
      },
    });

    const body = await res.json();

    if (!res.ok) {
      const errorMessage = body?.error?.message ?? `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(errorMessage);
    }

    return body;
  }

  async listItems(params: Record<string, unknown>): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const query = qs.toString();
    return this.request(`/api/v1/blueprint/items${query ? `?${query}` : ''}`);
  }

  async getItem(id: string): Promise<unknown> {
    return this.request(`/api/v1/blueprint/items/${id}`);
  }

  async createItem(params: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/v1/blueprint/items', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async updateItem(id: string, fields: Record<string, unknown>): Promise<unknown> {
    return this.request(`/api/v1/blueprint/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  }

  async changeStatus(id: string, newStatus: string): Promise<unknown> {
    return this.request(`/api/v1/blueprint/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async searchItems(params: Record<string, unknown>): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    qs.set('search', String(params.query));
    qs.delete('query');
    const query = qs.toString();
    return this.request(`/api/v1/blueprint/items${query ? `?${query}` : ''}`);
  }

  async addComment(itemId: string, content: string): Promise<unknown> {
    return this.request(`/api/v1/blueprint/items/${itemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async listTags(): Promise<unknown> {
    return this.request('/api/v1/blueprint/tags');
  }

  async assignTag(itemId: string, tagId: string): Promise<unknown> {
    return this.request(`/api/v1/blueprint/items/${itemId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_id: tagId }),
    });
  }
}

// ---------------------------------------------------------------------------
// Status transition validation (shared logic, independent of API client)
// ---------------------------------------------------------------------------

function validateStatusTransition(currentStatus: string, newStatus: string): string | null {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus as ItemStatus];
  if (!allowed) {
    return `Unknown current status: ${currentStatus}`;
  }
  if (!allowed.includes(newStatus as ItemStatus)) {
    return `Invalid transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns an MCP server with all 9 blueprint tools registered.
 *
 * The server uses the `@modelcontextprotocol/sdk` McpServer high-level API.
 * Tools accept Zod schemas for input validation (the SDK converts them to
 * JSON Schema for the tools/list response automatically).
 *
 * Transport is pluggable — call `server.connect(transport)` with either
 * `StdioServerTransport` or an SSE/Streamable HTTP transport.
 */
export function createBlueprintMcpServer(apiClient: BlueprintApiClient): McpServer {
  const server = new McpServer(
    {
      name: 'ctrlpane-blueprint',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // -----------------------------------------------------------------------
  // 1. blueprint_list_items
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_list_items',
    {
      description: 'List blueprint items with optional filters and cursor pagination',
      inputSchema: {
        status: z.enum(['pending', 'in_progress', 'done']).optional().describe('Filter by status'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .optional()
          .describe('Filter by priority'),
        tag: z.string().optional().describe('Filter by tag ID'),
        search: z.string().optional().describe('Full-text search query'),
        assigned_to: z.string().optional().describe('Filter by assignee'),
        cursor: z.string().optional().describe('Pagination cursor from previous response'),
        limit: z.number().min(1).max(100).optional().describe('Items per page (1-100, default 25)'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.listItems(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing items: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 2. blueprint_get_item
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_get_item',
    {
      description: 'Get a blueprint item by ID with sub-items, tags, comments, and activity',
      inputSchema: {
        id: z.string().startsWith('bpi_').describe('Blueprint item ID (prefixed with bpi_)'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.getItem(args.id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting item: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 3. blueprint_create_item
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_create_item',
    {
      description: 'Create a new blueprint item',
      inputSchema: {
        title: z.string().min(1).max(500).describe('Item title (required)'),
        description: z.string().optional().describe('Item description (markdown supported)'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .optional()
          .describe('Priority level (default: medium)'),
        status: z
          .enum(['pending', 'in_progress', 'done'])
          .optional()
          .describe('Initial status (default: pending)'),
        assigned_to: z.string().optional().describe('Assignee identifier'),
        parent_id: z
          .string()
          .startsWith('bpi_')
          .optional()
          .describe('Parent item ID for sub-items'),
        tag_ids: z.array(z.string().startsWith('bpt_')).optional().describe('Tag IDs to attach'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.createItem(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error creating item: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 4. blueprint_update_item
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_update_item',
    {
      description:
        'Update an existing blueprint item (partial update). Use blueprint_change_status for status transitions.',
      inputSchema: {
        id: z.string().startsWith('bpi_').describe('Blueprint item ID'),
        fields: z
          .object({
            title: z.string().min(1).max(500).optional(),
            description: z.string().nullable().optional(),
            priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
            assigned_to: z.string().nullable().optional(),
            due_date: z.string().datetime().nullable().optional(),
            metadata: z.record(z.unknown()).optional(),
          })
          .describe('Fields to update'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.updateItem(args.id, args.fields);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error updating item: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 5. blueprint_change_status
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_change_status',
    {
      description:
        'Transition item status with validation. Valid transitions: pending->in_progress, in_progress->done, in_progress->pending, done->in_progress.',
      inputSchema: {
        id: z.string().startsWith('bpi_').describe('Blueprint item ID'),
        new_status: z.enum(['pending', 'in_progress', 'done']).describe('Target status'),
      },
    },
    async (args) => {
      try {
        // First fetch the current item to validate the transition
        const currentItem = (await apiClient.getItem(args.id)) as {
          data?: { status?: string };
        };
        const currentStatus = currentItem?.data?.status;

        if (currentStatus) {
          const error = validateStatusTransition(currentStatus, args.new_status);
          if (error) {
            return {
              content: [{ type: 'text' as const, text: `Status transition error: ${error}` }],
              isError: true,
            };
          }
        }

        const result = await apiClient.changeStatus(args.id, args.new_status);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error changing status: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 6. blueprint_search_items
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_search_items',
    {
      description: 'Full-text search across blueprint items with optional filters',
      inputSchema: {
        query: z.string().min(1).describe('Search query string'),
        status: z
          .enum(['pending', 'in_progress', 'done'])
          .optional()
          .describe('Filter results by status'),
        priority: z
          .enum(['critical', 'high', 'medium', 'low'])
          .optional()
          .describe('Filter results by priority'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.searchItems(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error searching items: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 7. blueprint_add_comment
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_add_comment',
    {
      description: 'Add a comment to a blueprint item',
      inputSchema: {
        item_id: z.string().startsWith('bpi_').describe('Blueprint item ID to comment on'),
        content: z.string().min(1).max(10_000).describe('Comment content (plain text or markdown)'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.addComment(args.item_id, args.content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error adding comment: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 8. blueprint_list_tags
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_list_tags',
    {
      description: 'List all tags for the current tenant',
    },
    async () => {
      try {
        const result = await apiClient.listTags();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing tags: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // 9. blueprint_assign_tag
  // -----------------------------------------------------------------------
  server.registerTool(
    'blueprint_assign_tag',
    {
      description: 'Assign a tag to a blueprint item',
      inputSchema: {
        item_id: z.string().startsWith('bpi_').describe('Blueprint item ID'),
        tag_id: z.string().startsWith('bpt_').describe('Tag ID to assign'),
      },
    },
    async (args) => {
      try {
        const result = await apiClient.assignTag(args.item_id, args.tag_id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error assigning tag: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
