import {
  type BlueprintItemRow,
  useCreateItem,
  useDeleteItem,
  useItems,
  useUpdateItemStatus,
} from '@/hooks/use-blueprint.js';
import { ItemPriority, ItemStatus, VALID_STATUS_TRANSITIONS } from '@ctrlpane/shared';
import { Link, createRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { Route as rootRoute } from '../__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items',
  component: ItemsPage,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: ItemStatus.PENDING, label: 'Pending' },
  { value: ItemStatus.IN_PROGRESS, label: 'In Progress' },
  { value: ItemStatus.DONE, label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: ItemPriority.LOW, label: 'Low' },
  { value: ItemPriority.MEDIUM, label: 'Medium' },
  { value: ItemPriority.HIGH, label: 'High' },
  { value: ItemPriority.CRITICAL, label: 'Critical' },
];

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
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 16 } as const,
  toolbar: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  },
  input: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    minWidth: 200,
  } as const,
  select: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    backgroundColor: '#fff',
  } as const,
  btn: {
    padding: '6px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
    backgroundColor: '#fff',
  } as const,
  btnPrimary: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: '#fff',
    fontWeight: 500,
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as const,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#374151',
  },
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: color,
    color: '#fff',
    cursor: 'pointer',
  }),
  emptyState: { padding: 40, textAlign: 'center' as const, color: '#9ca3af' },
  link: { color: '#2563eb', textDecoration: 'none' } as const,
  statusBtn: (active: boolean) => ({
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: active ? '#dbeafe' : '#f3f4f6',
    color: active ? '#1d4ed8' : '#6b7280',
    marginLeft: 4,
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ItemsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  // Build filter params
  const filters: Record<string, string> = { limit: '25' };
  if (search) filters.search = search;
  if (statusFilter) filters.status = statusFilter;
  if (priorityFilter) filters.priority = priorityFilter;
  if (cursor) filters.cursor = cursor;

  const itemsQuery = useItems(filters);
  const updateStatus = useUpdateItemStatus();
  const deleteItem = useDeleteItem();

  const items = itemsQuery.data?.data ?? [];
  const pagination = itemsQuery.data?.pagination;

  const handleLoadMore = useCallback(() => {
    if (pagination?.next_cursor) {
      setCursor(pagination.next_cursor);
    }
  }, [pagination?.next_cursor]);

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setCursor(undefined);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={styles.heading}>Items</h1>
        <button type="button" style={styles.btnPrimary} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New Item'}
        </button>
      </div>

      {showCreate && <CreateItemForm onDone={() => setShowCreate(false)} />}

      {/* ---- Filters ---- */}
      <div style={styles.toolbar}>
        <input
          type="search"
          placeholder="Search items..."
          style={styles.input}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(undefined);
          }}
        />
        <select
          style={styles.select}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCursor(undefined);
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          style={styles.select}
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setCursor(undefined);
          }}
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {(search || statusFilter || priorityFilter) && (
          <button type="button" style={styles.btn} onClick={handleResetFilters}>
            Clear filters
          </button>
        )}
      </div>

      {/* ---- Data table ---- */}
      {itemsQuery.isLoading ? (
        <p>Loading items...</p>
      ) : itemsQuery.isError ? (
        <p style={{ color: '#ef4444' }}>Failed to load items. Is the API running?</p>
      ) : items.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No items found.</p>
          {(search || statusFilter || priorityFilter) && (
            <p>
              <button type="button" style={styles.btn} onClick={handleResetFilters}>
                Clear filters
              </button>
            </p>
          )}
        </div>
      ) : (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Updated</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onStatusChange={(status) => updateStatus.mutate({ id: item.id, status })}
                  onDelete={() => {
                    if (confirm(`Delete "${item.title}"?`)) {
                      deleteItem.mutate(item.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>

          {/* ---- Pagination ---- */}
          {pagination?.has_more && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                type="button"
                style={styles.btn}
                onClick={handleLoadMore}
                disabled={itemsQuery.isFetching}
              >
                {itemsQuery.isFetching ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item row with inline status change
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  onStatusChange,
  onDelete,
}: {
  item: BlueprintItemRow;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const validTransitions =
    VALID_STATUS_TRANSITIONS[item.status as keyof typeof VALID_STATUS_TRANSITIONS] ?? [];

  return (
    <tr>
      <td style={styles.td}>
        <Link to="/items/$id" params={{ id: item.id }} style={styles.link}>
          {item.title}
        </Link>
      </td>
      <td style={styles.td}>
        <span style={styles.badge(STATUS_COLORS[item.status] ?? '#6b7280')}>
          {STATUS_LABELS[item.status] ?? item.status}
        </span>
        {validTransitions.map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            style={styles.statusBtn(false)}
            onClick={() => onStatusChange(nextStatus)}
            title={`Move to ${STATUS_LABELS[nextStatus] ?? nextStatus}`}
          >
            &rarr; {STATUS_LABELS[nextStatus] ?? nextStatus}
          </button>
        ))}
      </td>
      <td style={styles.td}>
        <span style={styles.badge(PRIORITY_COLORS[item.priority] ?? '#6b7280')}>
          {item.priority}
        </span>
      </td>
      <td style={styles.td}>{formatRelative(item.updated_at)}</td>
      <td style={styles.td}>
        <button type="button" style={styles.btnDanger} onClick={onDelete}>
          Delete
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Create item inline form
// ---------------------------------------------------------------------------

function CreateItemForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const createItem = useCreateItem();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createItem.mutate(
      { title: title.trim(), description: description.trim() || undefined, priority },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        marginBottom: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        backgroundColor: '#f9fafb',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Item title"
          style={{ ...styles.input, width: '100%' }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <textarea
          placeholder="Description (optional)"
          style={{ ...styles.input, width: '100%', minHeight: 60, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          style={styles.select}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button type="submit" style={styles.btnPrimary} disabled={createItem.isPending}>
          {createItem.isPending ? 'Creating...' : 'Create Item'}
        </button>
      </div>
      {createItem.isError && (
        <p style={{ color: '#ef4444', marginTop: 8, fontSize: 13 }}>
          Failed to create item. Please try again.
        </p>
      )}
    </form>
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
