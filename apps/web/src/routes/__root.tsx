import { useAuth } from '@/hooks/use-auth.js';
import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

// ---------------------------------------------------------------------------
// Auth guard — redirects to /login if unauthenticated
// ---------------------------------------------------------------------------

function AuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: '#6b7280',
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    );
  }

  if (auth.isError) {
    // Not authenticated — redirect to login
    window.location.href = '/login';
    return null;
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Root layout — renders login without shell, protected routes with shell
// ---------------------------------------------------------------------------

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginPage = pathname === '/login';

  // Login page renders without the sidebar shell
  if (isLoginPage) {
    return <Outlet />;
  }

  // Protected routes get the auth guard + sidebar
  return (
    <AuthGuard>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <nav style={{ width: 220, padding: 16, borderRight: '1px solid #e5e7eb' }}>
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
    </AuthGuard>
  );
}
