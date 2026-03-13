import {
  useAddTagToItem,
  useCreateComment,
  useItem,
  useItemActivity,
  useItemComments,
  useItemTags,
  useRemoveTagFromItem,
  useTags,
  useUpdateItemStatus,
} from '@/hooks/use-blueprint.js';
import { VALID_STATUS_TRANSITIONS } from '@ctrlpane/shared';
import { Link, createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Route as rootRoute } from '../__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: ItemDetailPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  done: '#10b981',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  back: {
    display: 'inline-block',
    marginBottom: 16,
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: 14,
  } as const,
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 8 } as const,
  meta: { fontSize: 13, color: '#6b7280', marginBottom: 24 } as const,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: color,
    color: '#fff',
  }),
  section: {
    marginBottom: 28,
    padding: 16,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  } as const,
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12 } as const,
  btn: {
    padding: '6px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    backgroundColor: '#fff',
  } as const,
  btnPrimary: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: '#fff',
  } as const,
  btnDanger: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    backgroundColor: '#ef4444',
    color: '#fff',
  } as const,
  input: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
  } as const,
  tabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '2px solid #e5e7eb',
    marginBottom: 16,
  } as const,
  tab: (active: boolean) => ({
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    marginBottom: -2,
    color: active ? '#2563eb' : '#6b7280',
    background: 'none',
    border: 'none',
  }),
  tagChip: (color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: color,
    color: '#fff',
    marginRight: 4,
    marginBottom: 4,
  }),
  emptyState: { color: '#9ca3af', fontSize: 14, padding: '12px 0' } as const,
};

type TabKey = 'comments' | 'activity' | 'tags';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ItemDetailPage() {
  const { id } = Route.useParams();
  const [activeTab, setActiveTab] = useState<TabKey>('comments');

  const itemQuery = useItem(id);
  const updateStatus = useUpdateItemStatus();

  const item = itemQuery.data?.data;

  if (itemQuery.isLoading) return <p>Loading item...</p>;
  if (itemQuery.isError)
    return (
      <div>
        <Link to="/items" style={styles.back}>
          &larr; Back to items
        </Link>
        <p style={{ color: '#ef4444' }}>Failed to load item.</p>
      </div>
    );
  if (!item)
    return (
      <div>
        <Link to="/items" style={styles.back}>
          &larr; Back to items
        </Link>
        <p>Item not found.</p>
      </div>
    );

  const validTransitions =
    VALID_STATUS_TRANSITIONS[item.status as keyof typeof VALID_STATUS_TRANSITIONS] ?? [];

  return (
    <div>
      <Link to="/items" style={styles.back}>
        &larr; Back to items
      </Link>

      {/* ---- Header ---- */}
      <h1 style={styles.heading}>{item.title}</h1>
      <div style={styles.meta}>
        <span style={styles.badge(STATUS_COLORS[item.status] ?? '#6b7280')}>
          {STATUS_LABELS[item.status] ?? item.status}
        </span>{' '}
        <span style={styles.badge(PRIORITY_COLORS[item.priority] ?? '#6b7280')}>
          {item.priority}
        </span>
        {item.assigned_to && <span> &middot; Assigned to {item.assigned_to}</span>}
        {item.due_date && <span> &middot; Due {new Date(item.due_date).toLocaleDateString()}</span>}
        <span> &middot; Created {formatRelative(item.created_at)}</span>
      </div>

      {/* ---- Status transitions ---- */}
      {validTransitions.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {validTransitions.map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              style={styles.btn}
              onClick={() => updateStatus.mutate({ id: item.id, status: nextStatus })}
              disabled={updateStatus.isPending}
            >
              Move to {STATUS_LABELS[nextStatus] ?? nextStatus}
            </button>
          ))}
        </div>
      )}

      {/* ---- Description ---- */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Description</h2>
        {item.description ? (
          <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {item.description}
          </p>
        ) : (
          <p style={styles.emptyState}>No description provided.</p>
        )}
      </section>

      {/* ---- Tabs ---- */}
      <div style={styles.tabs}>
        {(['comments', 'activity', 'tags'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            style={styles.tab(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'comments' && <CommentsPanel itemId={id} />}
      {activeTab === 'activity' && <ActivityPanel itemId={id} />}
      {activeTab === 'tags' && <TagsPanel itemId={id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments panel
// ---------------------------------------------------------------------------

function CommentsPanel({ itemId }: { itemId: string }) {
  const commentsQuery = useItemComments(itemId);
  const createComment = useCreateComment(itemId);
  const [content, setContent] = useState('');

  const comments = commentsQuery.data?.data ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createComment.mutate({ content: content.trim() }, { onSuccess: () => setContent('') });
  };

  return (
    <div>
      {/* Add comment form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <textarea
          placeholder="Write a comment..."
          style={{ ...styles.input, minHeight: 60, resize: 'vertical', marginBottom: 8 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          type="submit"
          style={styles.btnPrimary}
          disabled={createComment.isPending || !content.trim()}
        >
          {createComment.isPending ? 'Posting...' : 'Add Comment'}
        </button>
      </form>

      {commentsQuery.isLoading ? (
        <p>Loading comments...</p>
      ) : commentsQuery.isError ? (
        <p style={{ color: '#ef4444', fontSize: 13 }}>Failed to load comments.</p>
      ) : comments.length === 0 ? (
        <p style={styles.emptyState}>No comments yet. Be the first to comment.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {comments.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: 14,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 2 }}>
                {c.author_type}{' '}
                <span style={{ fontWeight: 400, color: '#9ca3af' }}>
                  {formatRelative(c.created_at)}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity timeline panel
// ---------------------------------------------------------------------------

function ActivityPanel({ itemId }: { itemId: string }) {
  const activityQuery = useItemActivity(itemId);
  const activities = activityQuery.data?.data ?? [];

  if (activityQuery.isLoading) return <p>Loading activity...</p>;
  if (activityQuery.isError)
    return <p style={{ color: '#ef4444', fontSize: 13 }}>Failed to load activity.</p>;
  if (activities.length === 0)
    return <p style={styles.emptyState}>No activity recorded for this item.</p>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {activities.map((a) => (
        <li
          key={a.id}
          style={{
            padding: '8px 0',
            borderBottom: '1px solid #f3f4f6',
            fontSize: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <div>
            <strong>{a.action}</strong>
            {a.actor ? ` by ${a.actor}` : ''}
            <div style={{ color: '#9ca3af', fontSize: 12 }}>{formatRelative(a.created_at)}</div>
            {Object.keys(a.changes).length > 0 && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {Object.entries(a.changes).map(([key, val]) => (
                  <span key={key} style={{ marginRight: 8 }}>
                    {key}: {String(val)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tags panel — shows current tags, lets you add/remove
// ---------------------------------------------------------------------------

function TagsPanel({ itemId }: { itemId: string }) {
  const itemTagsQuery = useItemTags(itemId);
  const allTagsQuery = useTags();
  const addTag = useAddTagToItem(itemId);
  const removeTag = useRemoveTagFromItem(itemId);

  const itemTags = itemTagsQuery.data?.data ?? [];
  const allTags = allTagsQuery.data?.data ?? [];

  // Tags not yet assigned to this item
  const assignedIds = new Set(itemTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedIds.has(t.id));

  return (
    <div>
      {/* Current tags */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>Current tags</div>
        {itemTagsQuery.isLoading ? (
          <p>Loading...</p>
        ) : itemTags.length === 0 ? (
          <p style={styles.emptyState}>No tags assigned.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {itemTags.map((tag) => (
              <span key={tag.id} style={styles.tagChip(tag.color)}>
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag.mutate(tag.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                    marginLeft: 2,
                  }}
                  title={`Remove ${tag.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Available tags to add */}
      <div>
        <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>Add a tag</div>
        {allTagsQuery.isLoading ? (
          <p>Loading tags...</p>
        ) : availableTags.length === 0 ? (
          <p style={styles.emptyState}>
            No more tags available.{' '}
            <Link to="/tags" style={{ color: '#2563eb' }}>
              Create tags
            </Link>
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                style={{
                  ...styles.btn,
                  fontSize: 12,
                  padding: '2px 10px',
                  borderColor: tag.color,
                  color: tag.color,
                }}
                onClick={() => addTag.mutate(tag.id)}
                disabled={addTag.isPending}
              >
                + {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}
