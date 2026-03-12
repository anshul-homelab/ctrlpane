# ADR-002: Passkeys (WebAuthn) Primary Auth with Email/Password+TOTP Fallback

- Status: accepted
- Date: 2026-03-12
- Decision-Makers: Anshul
- Consulted: WebAuthn spec, OWASP authentication guidelines, FIDO2 Alliance documentation, LifeOS ADR-002

## Context and Problem Statement

ctrlpane needs an authentication system that works across web browsers and supports multiple devices per user. The system must resist phishing, support multi-tenant access, and allow independent session revocation per device. How should we authenticate users while maximizing security and minimizing friction?

## Decision Drivers

- Phishing resistance: credentials should not be replayable or interceptable
- Device-scoped sessions: revoking one device must not affect others
- Multi-tenant: users may belong to multiple tenants; session carries tenant context
- Token theft detection: system must detect and respond to refresh token reuse
- Account recovery: users must have a fallback if they lose all passkey-capable devices

## Considered Options

1. Passkeys (WebAuthn) primary with email/password+TOTP fallback
2. OAuth-only (delegate to Google/Apple/GitHub)
3. Password-only with optional TOTP

## Decision Outcome

Chosen option: "Passkeys (WebAuthn) primary with email/password+TOTP fallback", because passkeys provide the strongest phishing resistance available today, work natively on modern browsers, and the fallback path covers account recovery without creating a vendor dependency.

### Token Architecture

| Token | Lifetime | Storage | Rotation |
|-------|----------|---------|----------|
| Access (JWT) | 15 min | Memory only | On login + refresh |
| Refresh | 7 days | `httpOnly; Secure; SameSite=Strict` cookie | Every exchange; old token invalidated |
| Centrifugo | 10 min | Memory only | Re-issued via `/api/realtime/token` |

### JWT Claims

```json
{
  "sub": "usr_01HQ...",
  "tid": "tnt_01HQ...",
  "permissions": ["tasks.task.create", "tasks.task.read", "projects.task.admin"],
  "role": "member",
  "features": ["agents.terminal_capture", "integrations.jira_sync"],
  "iat": 1741000000,
  "exp": 1741000900
}
```

### Multi-Tenant Session Model

- Users may belong to multiple tenants
- Login flow includes tenant selection (or defaults to last-used tenant)
- `SET LOCAL app.tenant_id` is set per-transaction from the JWT `tid` claim
- Switching tenants issues a new JWT with the target tenant's permissions
- Sessions are device-scoped: `device_id` + `device_public_key`

### Refresh Token Flow

1. Client sends `POST /auth/refresh` with httpOnly cookie
2. Server verifies `refresh_token_hash` against session row
3. Checks: `revoked_at IS NULL`, token not reused
4. **Reuse detection**: if revoked token presented, ALL user sessions invalidated (signals theft)
5. Issues new access JWT + new refresh token; hashes and stores new refresh

### Consequences

**Good:**
- Passkeys eliminate password phishing entirely for the primary auth flow
- Platform authenticators (Touch ID, Face ID, Windows Hello) provide biometric convenience
- Device-scoped sessions with independent revocation give users full control
- Refresh token rotation with reuse detection catches token theft

**Bad:**
- Passkey support varies across browsers — fallback path is mandatory
- Password fallback reintroduces phishing risk for users who choose it
- Multiple session management increases backend state

## More Information

- [Security Architecture](../architecture/security.md) — full security posture
- [ADR-001 Tech Stack](./ADR-001-tech-stack.md) — infrastructure context
- Argon2id parameters for password hashing: m=64MB, t=3, p=4
- Related: [ADR-005 Agent-First Design](./ADR-005-agent-first-design.md) — agent API key auth
