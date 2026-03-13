import { useDevLogin } from '@/hooks/use-auth.js';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Route as rootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  } as const,
  card: {
    width: 360,
    padding: 32,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    textAlign: 'center' as const,
  } as const,
  brand: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
    color: '#111827',
  } as const,
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
  } as const,
  divider: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 16,
  } as const,
  btnPrimary: {
    width: '100%',
    padding: '10px 16px',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: '#fff',
  } as const,
  btnDisabled: {
    width: '100%',
    padding: '10px 16px',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'not-allowed',
    backgroundColor: '#93c5fd',
    color: '#fff',
  } as const,
  error: {
    marginTop: 12,
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 6,
    fontSize: 13,
    color: '#dc2626',
  } as const,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function LoginPage() {
  const devLogin = useDevLogin();
  const navigate = useNavigate();

  const handleDevLogin = () => {
    devLogin.mutate(undefined, {
      onSuccess: () => {
        navigate({ to: '/' });
      },
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.brand}>ctrlpane</h1>
        <p style={styles.subtitle}>Sign in to your workspace</p>

        <div style={styles.divider}>Development Mode</div>

        <button
          type="button"
          style={devLogin.isPending ? styles.btnDisabled : styles.btnPrimary}
          onClick={handleDevLogin}
          disabled={devLogin.isPending}
        >
          {devLogin.isPending ? 'Signing in...' : 'Dev Login'}
        </button>

        {devLogin.isError && (
          <div style={styles.error}>
            {devLogin.error instanceof Error
              ? devLogin.error.message
              : 'Login failed. Is the API server running?'}
          </div>
        )}
      </div>
    </div>
  );
}
