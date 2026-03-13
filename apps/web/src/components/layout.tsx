import { Link, Outlet } from '@tanstack/react-router';

/**
 * Application shell with sidebar navigation.
 * Used as the root layout via __root.tsx.
 */
export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 220,
          padding: 16,
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>ctrlpane</h2>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <li>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/items" style={{ textDecoration: 'none', color: 'inherit' }}>
              Items
            </Link>
          </li>
          <li>
            <Link to="/tags" style={{ textDecoration: 'none', color: 'inherit' }}>
              Tags
            </Link>
          </li>
          <li>
            <Link to="/settings" style={{ textDecoration: 'none', color: 'inherit' }}>
              Settings
            </Link>
          </li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
