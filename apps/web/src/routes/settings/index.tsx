import { useAuth, useLogout } from '@/hooks/use-auth.js';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-blueprint.js';
import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Route as rootRoute } from '../__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 24 } as const,
  section: {
    marginBottom: 32,
    padding: 16,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  } as const,
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12 } as const,
  input: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
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
  form: {
    padding: 16,
    marginBottom: 16,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  } as const,
  emptyState: { color: '#9ca3af', fontSize: 14, padding: '16px 0' } as const,
  keyReveal: {
    padding: 12,
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    wordBreak: 'break-all' as const,
  },
  mono: { fontFamily: 'monospace', fontSize: 13 } as const,
  checkbox: { marginRight: 6 } as const,
  label: { fontSize: 13, color: '#6b7280' } as const,
  value: { fontSize: 14, fontWeight: 500, color: '#111827' } as const,
};

const PERMISSION_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SettingsPage() {
  return (
    <div>
      <h1 style={styles.heading}>Settings</h1>
      <SessionSection />
      <ApiKeysSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session — current auth status and logout
// ---------------------------------------------------------------------------

function SessionSection() {
  const auth = useAuth();
  const logout = useLogout();

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Session</h2>

      {auth.isLoading ? (
        <p style={styles.emptyState}>Checking session...</p>
      ) : auth.isError ? (
        <p style={{ color: '#ef4444', fontSize: 13 }}>Not authenticated.</p>
      ) : auth.data ? (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div>
              <span style={styles.label}>Tenant ID: </span>
              <code style={styles.mono}>{auth.data.data.tenant_id}</code>
            </div>
            <div>
              <span style={styles.label}>Auth method: </span>
              <span style={styles.value}>{auth.data.data.auth_method}</span>
            </div>
          </div>
          <button
            type="button"
            style={styles.btnDanger}
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? 'Logging out...' : 'Logout'}
          </button>
          {logout.isError && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
              Failed to log out. Please try again.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// API keys management (server-side keys)
// ---------------------------------------------------------------------------

function ApiKeysSection() {
  const keysQuery = useApiKeys();
  const revokeKey = useRevokeApiKey();
  const [showCreate, setShowCreate] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const keys = keysQuery.data?.data ?? [];

  return (
    <section style={styles.section}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h2 style={styles.sectionTitle}>API Keys</h2>
        <button type="button" style={styles.btnPrimary} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ Create Key'}
        </button>
      </div>

      {revealedKey && (
        <div style={styles.keyReveal}>
          <strong>New API key created.</strong> Copy it now — it will not be shown again.
          <br />
          <code style={styles.mono}>{revealedKey}</code>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              style={styles.btn}
              onClick={() => {
                navigator.clipboard.writeText(revealedKey);
              }}
            >
              Copy to clipboard
            </button>{' '}
            <button type="button" style={styles.btn} onClick={() => setRevealedKey(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateApiKeyForm
          onCreated={(key) => {
            setRevealedKey(key);
            setShowCreate(false);
          }}
        />
      )}

      {keysQuery.isLoading ? (
        <p>Loading API keys...</p>
      ) : keysQuery.isError ? (
        <p style={{ color: '#ef4444', fontSize: 13 }}>Failed to load API keys.</p>
      ) : keys.length === 0 ? (
        <p style={styles.emptyState}>No API keys created yet.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Key prefix</th>
              <th style={styles.th}>Permissions</th>
              <th style={styles.th}>Last used</th>
              <th style={styles.th}>Expires</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td style={styles.td}>{k.name}</td>
                <td style={styles.td}>
                  <code style={styles.mono}>{k.key_prefix}...</code>
                </td>
                <td style={styles.td}>{k.permissions.join(', ')}</td>
                <td style={styles.td}>
                  {k.last_used_at ? formatRelative(k.last_used_at) : 'Never'}
                </td>
                <td style={styles.td}>
                  {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                </td>
                <td style={styles.td}>
                  <button
                    type="button"
                    style={styles.btnDanger}
                    onClick={() => {
                      if (confirm(`Revoke key "${k.name}"? This cannot be undone.`)) {
                        revokeKey.mutate(k.id);
                      }
                    }}
                    disabled={revokeKey.isPending}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Create API key form
// ---------------------------------------------------------------------------

function CreateApiKeyForm({ onCreated }: { onCreated: (key: string) => void }) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['read']);
  const createKey = useCreateApiKey();

  const togglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || permissions.length === 0) return;
    createKey.mutate(
      { name: name.trim(), permissions },
      {
        onSuccess: (data) => {
          const fullKey = (data as { data: { key: string } }).data?.key;
          if (fullKey) {
            onCreated(fullKey);
          }
          setName('');
          setPermissions(['read']);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="key-name"
          style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
        >
          Key name
        </label>
        <input
          id="key-name"
          type="text"
          placeholder="e.g. CI pipeline, Agent access"
          style={{ ...styles.input, width: '100%' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          Permissions
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          {PERMISSION_OPTIONS.map((p) => (
            <label key={p.value} style={{ fontSize: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={permissions.includes(p.value)}
                onChange={() => togglePermission(p.value)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        style={styles.btnPrimary}
        disabled={createKey.isPending || !name.trim() || permissions.length === 0}
      >
        {createKey.isPending ? 'Creating...' : 'Create Key'}
      </button>

      {createKey.isError && (
        <p style={{ color: '#ef4444', marginTop: 8, fontSize: 13 }}>
          Failed to create API key. Please try again.
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
