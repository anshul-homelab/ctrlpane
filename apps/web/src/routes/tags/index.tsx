import { useCreateTag, useDeleteTag, useTags } from '@/hooks/use-blueprint.js';
import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Route as rootRoute } from '../__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tags',
  component: TagsPage,
});

// ---------------------------------------------------------------------------
// Preset colors for the color picker
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  heading: { fontSize: 24, fontWeight: 700, marginBottom: 24 } as const,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 32,
  } as const,
  card: {
    padding: 16,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  } as const,
  colorDot: (color: string) => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.1)',
  }),
  tagName: { fontSize: 14, fontWeight: 500 } as const,
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
  input: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
  } as const,
  form: {
    padding: 16,
    marginBottom: 24,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  } as const,
  colorPicker: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
    marginBottom: 12,
  },
  colorSwatch: (color: string, selected: boolean) => ({
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: color,
    cursor: 'pointer',
    border: selected ? '3px solid #1d4ed8' : '2px solid transparent',
    outline: selected ? '2px solid #fff' : 'none',
  }),
  emptyState: { padding: 40, textAlign: 'center' as const, color: '#9ca3af' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TagsPage() {
  const tagsQuery = useTags();
  const deleteTag = useDeleteTag();
  const [showCreate, setShowCreate] = useState(false);

  const tags = tagsQuery.data?.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={styles.heading}>Tags</h1>
        <button type="button" style={styles.btnPrimary} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New Tag'}
        </button>
      </div>

      {showCreate && <CreateTagForm onDone={() => setShowCreate(false)} />}

      {tagsQuery.isLoading ? (
        <p>Loading tags...</p>
      ) : tagsQuery.isError ? (
        <p style={{ color: '#ef4444' }}>Failed to load tags. Is the API running?</p>
      ) : tags.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No tags yet.</p>
          <p>
            <button type="button" style={styles.btnPrimary} onClick={() => setShowCreate(true)}>
              Create your first tag
            </button>
          </p>
        </div>
      ) : (
        <div style={styles.grid}>
          {tags.map((tag) => (
            <div key={tag.id} style={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={styles.colorDot(tag.color)} />
                <span style={styles.tagName}>{tag.name}</span>
              </div>
              <button
                type="button"
                style={styles.btnDanger}
                onClick={() => {
                  if (confirm(`Delete tag "${tag.name}"?`)) {
                    deleteTag.mutate(tag.id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create tag form with color picker
// ---------------------------------------------------------------------------

function CreateTagForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6'); // default blue
  const [customColor, setCustomColor] = useState('');
  const createTag = useCreateTag();

  const effectiveColor = customColor || color;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createTag.mutate(
      { name: name.trim(), color: effectiveColor },
      {
        onSuccess: () => {
          setName('');
          setCustomColor('');
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="tag-name"
          style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
        >
          Tag name
        </label>
        <input
          id="tag-name"
          type="text"
          placeholder="e.g. bug, feature, urgent"
          style={{ ...styles.input, width: '100%' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <span
          id="color-label"
          style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
        >
          Color
        </span>
        <div style={styles.colorPicker}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              style={styles.colorSwatch(c, color === c && !customColor)}
              onClick={() => {
                setColor(c);
                setCustomColor('');
              }}
              title={c}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="custom-color" style={{ fontSize: 13, color: '#6b7280' }}>
            Custom:
          </label>
          <input
            id="custom-color"
            type="color"
            value={effectiveColor}
            onChange={(e) => setCustomColor(e.target.value)}
            style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{effectiveColor}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            backgroundColor: effectiveColor,
            color: '#fff',
          }}
        >
          {name || 'preview'}
        </span>
        <button
          type="submit"
          style={styles.btnPrimary}
          disabled={createTag.isPending || !name.trim()}
        >
          {createTag.isPending ? 'Creating...' : 'Create Tag'}
        </button>
      </div>

      {createTag.isError && (
        <p style={{ color: '#ef4444', marginTop: 8, fontSize: 13 }}>
          Failed to create tag. Please try again.
        </p>
      )}
    </form>
  );
}
