import { useDashboardStats, useItems } from '@/hooks/use-blueprint.js';
import { ItemStatus } from '@ctrlpane/shared';
import { Link, createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 24 } as const,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 32,
  } as const,
  card: {
    padding: 20,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    backgroundColor: '#fff',
  } as const,
  cardLabel: { fontSize: 13, color: '#6b7280', marginBottom: 4 } as const,
  cardValue: { fontSize: 28, fontWeight: 700 } as const,
  section: { marginBottom: 32 } as const,
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12 } as const,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as const,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#374151',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
  },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: color,
    color: '#fff',
  }),
  emptyState: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#9ca3af',
  },
  link: { color: '#2563eb', textDecoration: 'none' } as const,
} as const;

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
// Component
// ---------------------------------------------------------------------------

function DashboardPage() {
  const statsQuery = useDashboardStats();
  const recentItemsQuery = useItems({ limit: '5', order: 'desc', sort: 'updated_at' });

  // Derive counts from stats or fall back to empty
  const counts = statsQuery.data?.data?.counts ?? [];
  const totalItems = statsQuery.data?.data?.total_items ?? 0;
  const recentActivity = statsQuery.data?.data?.recent_activity ?? [];
  const recentItems = recentItemsQuery.data?.data ?? [];

  const countByStatus = (status: string): number => {
    const found = counts.find((c) => c.status === status);
    return found?.count ?? 0;
  };

  return (
    <div>
      <h1 style={styles.heading}>Dashboard</h1>

      {/* ---- Summary cards ---- */}
      <div style={styles.grid}>
        <SummaryCard label="Total Items" value={totalItems} />
        <SummaryCard
          label="Pending"
          value={countByStatus(ItemStatus.PENDING)}
          accent={STATUS_COLORS.pending}
        />
        <SummaryCard
          label="In Progress"
          value={countByStatus(ItemStatus.IN_PROGRESS)}
          accent={STATUS_COLORS.in_progress}
        />
        <SummaryCard
          label="Done"
          value={countByStatus(ItemStatus.DONE)}
          accent={STATUS_COLORS.done}
        />
      </div>

      {/* ---- Recently updated items ---- */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recently Updated Items</h2>
        {recentItemsQuery.isLoading ? (
          <p>Loading...</p>
        ) : recentItemsQuery.isError ? (
          <p style={{ color: '#ef4444' }}>Failed to load recent items.</p>
        ) : recentItems.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No items yet.</p>
            <p>
              <Link to="/items" style={styles.link}>
                Create your first item
              </Link>
            </p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentItems.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>
                    <Link to="/items/$id" params={{ id: item.id }} style={styles.link}>
                      {item.title}
                    </Link>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.badge(STATUS_COLORS[item.status] ?? '#6b7280')}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.badge(PRIORITY_COLORS[item.priority] ?? '#6b7280')}>
                      {item.priority}
                    </span>
                  </td>
                  <td style={styles.td}>{formatRelative(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- Recent activity ---- */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recent Activity</h2>
        {statsQuery.isLoading ? (
          <p>Loading...</p>
        ) : statsQuery.isError ? (
          <p style={{ color: '#ef4444' }}>Failed to load activity.</p>
        ) : recentActivity.length === 0 ? (
          <div style={styles.emptyState}>No activity recorded yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recentActivity.slice(0, 10).map((a) => (
              <li
                key={a.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 14,
                }}
              >
                <strong>{a.action}</strong>
                {a.actor ? ` by ${a.actor}` : ''}
                {' — '}
                <span style={{ color: '#6b7280' }}>{formatRelative(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      style={{
        ...styles.card,
        borderTop: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardValue}>{value}</div>
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
