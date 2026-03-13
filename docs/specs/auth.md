# Authentication & Authorization

> Identity management, session lifecycle, RBAC enforcement, multi-tenancy, API key management, and audit logging for ctrlpane.

## Overview

Auth is the foundational domain of ctrlpane. Every request flows through the auth layer before reaching any business domain. The domain handles user identity (registration, login, credential management), session lifecycle (JWT access tokens, refresh token rotation), role-based access control (tenant-level and project-level roles), multi-tenancy (tenant creation, membership, RLS context), API key management (for agent and integration access), and audit logging of all security-relevant events.

Passkeys (WebAuthn) are the primary authentication method — no passwords in the default flow. Email/password with mandatory TOTP serves as the fallback for environments where passkeys are unavailable. All authentication state is device-scoped: revoking one device does not affect sessions on other devices.

The RBAC system uses a two-tier model with tenant-level roles (owner, admin, member, viewer) and project-level roles (pm, engineer, tester, sme). Permissions follow a three-segment dot notation (`{domain}.{resource}.{action}`) and are evaluated in a four-step chain: feature flag check, RLS enforcement, RBAC check, resource ownership check.

## Capabilities

- User registration with email verification
- Passkey (WebAuthn Level 2) enrollment and authentication — platform (Touch ID, Face ID, Windows Hello) and roaming (YubiKey) authenticators
- Email/password + mandatory TOTP as fallback authentication
- Recovery codes (10 single-use) generated at TOTP enrollment
- JWT access tokens (15 min) stored in memory; refresh tokens (7 days) in httpOnly cookies
- Refresh token rotation with reuse detection (stolen token invalidates all user sessions)
- Device-scoped sessions with `device_id` and `device_public_key`
- Session management: list active sessions, revoke individual sessions
- Tenant creation and configuration
- User invitation and tenant membership management
- Two-tier RBAC: tenant roles (owner, admin, member, viewer) and project roles (pm, engineer, tester, sme)
- Permission evaluation chain: feature flag -> RLS -> RBAC -> ownership
- Escalation prevention: users cannot assign roles >= their own
- API key generation for agent and integration access (stored as salted hashes)
- Password reset via email link with time-limited token
- Account deletion with GDPR-compliant data erasure
- Append-only audit logging of all auth events with OpenTelemetry trace correlation

## Multi-Tenancy

Tenants are the top-level isolation boundary. Every domain table includes `tenant_id` enforced by Postgres RLS (`ENABLE + FORCE`). The auth domain owns the tenant lifecycle:

- **Tenant creation**: Creates tenant record + assigns creator as `owner`
- **Membership**: Users can belong to multiple tenants with different roles per tenant
- **Tenant context**: Set via `SET LOCAL app.tenant_id` at the start of every database transaction (middleware-enforced)
- **Tenant configuration**: Default role for new members, feature flag overrides, branding

Users are global entities (not tenant-scoped). The `tenant_memberships` table bridges users to tenants with a role assignment.

## Architecture

```
Routes (Hono.js)
  -> AuthService (Effect.ts layer)
    -> UserRepository (Drizzle -> Postgres)
    -> SessionRepository (Drizzle -> Postgres)
    -> PasskeyService (WebAuthn ceremony handling)
    -> TOTPService (RFC 6238 TOTP verification)
    -> TokenService (JWT signing, refresh token rotation)
    -> ApiKeyService (generation, hashing, validation)
    -> AuditService (append-only audit log writes)
  -> EventBus (NATS JetStream)
```

The auth domain follows the 3-layer pattern: `routes.ts` -> `service.ts` -> `repository.ts`. All password hashing uses Argon2id (m=64MB, t=3, p=4). API keys are stored as salted hashes and are never retrievable in plaintext after creation. OAuth tokens and integration credentials use AES-256-GCM column encryption with per-tenant keys.

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new user (public) |
| POST | `/api/auth/login` | Login with email/password + TOTP |
| POST | `/api/auth/refresh` | Exchange refresh token for new access + refresh token |
| POST | `/api/auth/logout` | Revoke current session |
| POST | `/api/auth/passkey/register/begin` | Begin passkey registration ceremony |
| POST | `/api/auth/passkey/register/complete` | Complete passkey registration |
| POST | `/api/auth/passkey/login/begin` | Begin passkey authentication ceremony |
| POST | `/api/auth/passkey/login/complete` | Complete passkey authentication |
| POST | `/api/auth/totp/enroll` | Begin TOTP enrollment (returns secret + QR URI) |
| POST | `/api/auth/totp/verify` | Verify TOTP code to complete enrollment |
| POST | `/api/auth/password/reset-request` | Request password reset email |
| POST | `/api/auth/password/reset` | Reset password with token |
| POST | `/api/auth/email/verify` | Verify email address with token |

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/sessions` | List active sessions for current user |
| DELETE | `/api/auth/sessions/:id` | Revoke a specific session |
| DELETE | `/api/auth/sessions` | Revoke all sessions except current |

### Account Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/me` | Current user profile |
| PATCH | `/api/auth/me` | Update profile (display name, avatar) |
| DELETE | `/api/auth/me` | Request account deletion (GDPR) |
| GET | `/api/auth/me/passkeys` | List enrolled passkeys |
| DELETE | `/api/auth/me/passkeys/:id` | Remove a passkey |
| GET | `/api/auth/me/recovery-codes` | View recovery codes (requires re-auth) |
| POST | `/api/auth/me/recovery-codes/regenerate` | Regenerate recovery codes |

### Tenant Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tenants` | Create a new tenant |
| GET | `/api/tenants/:id` | Tenant details |
| PATCH | `/api/tenants/:id` | Update tenant configuration |
| GET | `/api/tenants/:id/members` | List tenant members with roles |
| POST | `/api/tenants/:id/members/invite` | Invite user to tenant |
| PATCH | `/api/tenants/:id/members/:userId` | Change member role |
| DELETE | `/api/tenants/:id/members/:userId` | Remove member from tenant |

### Roles & Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/roles` | List available roles and their permissions |
| POST | `/api/auth/roles` | Create custom role (admin+) |
| PATCH | `/api/auth/roles/:id` | Update custom role permissions |
| DELETE | `/api/auth/roles/:id` | Delete custom role |
| GET | `/api/auth/permissions` | List all permission strings |

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/api-keys` | List API keys (metadata only, no secrets) |
| POST | `/api/auth/api-keys` | Create API key (returns plaintext once) |
| PATCH | `/api/auth/api-keys/:id` | Update API key metadata (name, scopes) |
| DELETE | `/api/auth/api-keys/:id` | Revoke API key |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/audit` | Query audit log (admin+, supports filters) |

## Data Model

All tables include standard columns (`id`, `created_at`, `updated_at`). Tables marked with RLS include `tenant_id` and enforce row-level security. Users and tenants are global — they do not have tenant-scoped RLS.

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `usr_` + ULID |
| `email` | text | Unique, required |
| `display_name` | text | User-facing name |
| `avatar_url` | text | Optional avatar |
| `password_hash` | text | Argon2id hash, nullable (passkey-only users) |
| `email_verified` | boolean | Default false |
| `email_verification_token` | text | Time-limited token |
| `email_verification_expires_at` | timestamptz | Token expiry |
| `password_reset_token` | text | Time-limited token |
| `password_reset_expires_at` | timestamptz | Token expiry |
| `totp_secret` | text | Encrypted TOTP secret, nullable |
| `totp_enabled` | boolean | Default false |
| `recovery_codes` | text[] | Encrypted, single-use |
| `deleted_at` | timestamptz | Soft delete |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `tenants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `tnt_` + ULID |
| `name` | text | Tenant display name |
| `slug` | text | URL-safe identifier, unique |
| `config` | jsonb | Default role, feature overrides, branding |
| `owner_id` | text FK -> users | Tenant owner |
| `deleted_at` | timestamptz | Soft delete |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `tenant_memberships`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `tenant_id` | text FK -> tenants | |
| `user_id` | text FK -> users | |
| `role` | enum | `owner`, `admin`, `member`, `viewer` |
| `invited_by` | text FK -> users | Who sent the invitation |
| `accepted_at` | timestamptz | Null until invitation accepted |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Constraints**: Unique on (`tenant_id`, `user_id`). Exactly one `owner` per tenant enforced by application logic.

### `sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `ses_` + ULID |
| `user_id` | text FK -> users | |
| `tenant_id` | text FK -> tenants | Active tenant for this session |
| `refresh_token_hash` | text | Salted hash of current refresh token |
| `device_id` | text | Client-generated device identifier |
| `device_public_key` | text | For device binding |
| `device_name` | text | User-facing device label |
| `ip_address` | text | Last known IP |
| `user_agent` | text | Last known user agent |
| `last_active_at` | timestamptz | Updated on token refresh |
| `revoked_at` | timestamptz | Null = active |
| `expires_at` | timestamptz | Absolute session expiry |
| `created_at` | timestamptz | |

### `passkeys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | ULID |
| `user_id` | text FK -> users | |
| `credential_id` | text | WebAuthn credential ID (base64url) |
| `public_key` | text | COSE public key (base64url) |
| `sign_count` | integer | Signature counter for clone detection |
| `transports` | text[] | `usb`, `nfc`, `ble`, `internal` |
| `device_name` | text | User-assigned label |
| `last_used_at` | timestamptz | |
| `created_at` | timestamptz | |

### `roles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `rol_` + ULID |
| `tenant_id` | text FK -> tenants | RLS enforced |
| `name` | text | Role display name |
| `slug` | text | Unique within tenant |
| `scope` | enum | `tenant`, `project` |
| `permissions` | text[] | Array of permission strings |
| `is_system` | boolean | True for built-in roles (cannot delete) |
| `created_by` | text FK -> users | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `api_keys`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `apk_` + ULID |
| `tenant_id` | text FK -> tenants | RLS enforced |
| `user_id` | text FK -> users | Owner of the key |
| `name` | text | User-assigned label |
| `key_hash` | text | Salted hash (never stored in plaintext) |
| `key_prefix` | text | First 8 chars for identification |
| `scopes` | text[] | Permitted permission strings |
| `last_used_at` | timestamptz | |
| `expires_at` | timestamptz | Optional expiry |
| `revoked_at` | timestamptz | Null = active |
| `created_at` | timestamptz | |

### `audit_logs`

See [Data Model — Audit Log Table](../architecture/data-model.md) for the full schema. Key fields:

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | `aud_` + ULID |
| `tenant_id` | text | RLS enforced |
| `actor_id` | text | User, agent, or system |
| `actor_type` | enum | `user`, `agent`, `system` |
| `action` | text | Event name (e.g., `auth.login`) |
| `resource_type` | text | `session`, `user`, `role`, `api_key` |
| `resource_id` | text | ID of affected entity |
| `risk_level` | enum | `normal`, `elevated`, `critical` |
| `component` | text | Always `auth` for this domain |
| `details` | jsonb | Structured event context |
| `ip_address` | text | |
| `user_agent` | text | |
| `device_id` | text | |
| `trace_id` | text | OpenTelemetry trace ID |
| `created_at` | timestamptz | |

**Immutability**: Append-only. `REVOKE UPDATE, DELETE` from app role. Trigger prevents modification. Monthly partitions with 2-year retention.

## Authentication Flows

### Passkey Registration

1. Client calls `POST /auth/passkey/register/begin` -> server returns WebAuthn creation options (challenge, RP info, user info)
2. Browser calls `navigator.credentials.create()` with options
3. Client sends attestation response to `POST /auth/passkey/register/complete`
4. Server verifies attestation, stores credential in `passkeys` table

### Passkey Login

1. Client calls `POST /auth/passkey/login/begin` -> server returns WebAuthn request options (challenge, allowed credentials)
2. Browser calls `navigator.credentials.get()` with options
3. Client sends assertion response to `POST /auth/passkey/login/complete`
4. Server verifies assertion, checks `sign_count` for clone detection, creates session, returns access JWT + sets refresh cookie

### Email/Password + TOTP Login

1. Client sends email + password to `POST /auth/login`
2. Server verifies Argon2id hash. If TOTP enabled, returns `{ requires_totp: true, session_token }`
3. Client sends TOTP code + session_token to `POST /auth/login`
4. Server verifies TOTP (RFC 6238, 30-second window with +/- 1 drift), creates session, returns access JWT + sets refresh cookie

### Refresh Token Rotation

1. Client sends `POST /auth/refresh` with httpOnly cookie containing refresh token
2. Server verifies `refresh_token_hash` against session row
3. Checks: `revoked_at IS NULL`, token not reused
4. **Reuse detection**: if a revoked token is presented, ALL user sessions are invalidated (signals credential theft)
5. Issues new access JWT + new refresh token; hashes and stores new refresh; invalidates old refresh hash

## RBAC Model

### Permission String Format

```
{domain}.{resource}.{action}
```

Examples:
- `tasks.task.create` — create personal tasks
- `projects.sprint.manage` — manage sprints
- `admin.role.assign` — assign roles to users
- `admin.audit.read` — read audit logs

### Evaluation Chain

```
1. Feature flag check: is the feature enabled for this tenant?
   -> No: hide entirely (not a 403)
2. RLS enforcement: does this row belong to the user's tenant?
   -> Postgres-level, automatic via SET LOCAL
3. RBAC check: does the user's role include the required permission?
   -> Cached in Redis, O(1) lookup
4. Resource ownership check: for non-admin roles, is this the user's own resource?
```

### Role-Permission Mapping (Tenant-Level)

| Permission | owner | admin | member | viewer |
|-----------|-------|-------|--------|--------|
| `*.*.read` | yes | yes | yes | yes |
| `*.*.create` | yes | yes | yes | no |
| `*.*.update` (own) | yes | yes | yes | no |
| `*.*.delete` (own) | yes | yes | yes | no |
| `*.*.admin` | yes | yes | no | no |
| `admin.role.assign` | yes | yes | no | no |
| `admin.role.manage` | yes | no | no | no |
| `admin.audit.read` | yes | yes | no | no |
| `admin.tenant.manage` | yes | no | no | no |

### Escalation Prevention

- Users cannot assign roles at or above their own level (except owner transfer, which requires re-authentication)
- Custom roles cannot include permissions absent from the creator's effective permission set
- All role changes are audited at `elevated` or `critical` risk level

## API Key Management

API keys provide non-interactive access for AI agents and external integrations.

- **Creation**: `POST /api/auth/api-keys` returns the plaintext key exactly once. The key is stored as a salted hash.
- **Format**: `cpk_{random_bytes_base62}` — the `cpk_` prefix identifies it as a ctrlpane API key
- **Scopes**: Each key has an explicit list of permission strings. The key cannot exceed the creating user's permissions.
- **Authentication**: Keys are sent via `Authorization: Bearer cpk_...` header. The server hashes the key and looks up the matching `api_keys` row.
- **Rotation**: Create new key, update consumers, revoke old key. No automatic rotation.
- **Expiry**: Optional `expires_at` for time-limited keys.

## Audit Logging

### Must-Audit Events

| Event | Risk Level | Details |
|-------|-----------|---------|
| `auth.login` | normal | Method (passkey/password+totp), device_id |
| `auth.login.failed` | elevated | Reason (invalid_password, invalid_totp, account_locked) |
| `auth.logout` | normal | Session ID |
| `auth.session.revoked` | normal | Session ID, revoked_by |
| `auth.session.revoked_all` | elevated | Reason (reuse_detection, user_initiated) |
| `auth.password.reset` | elevated | |
| `auth.totp.enrolled` | elevated | |
| `auth.passkey.registered` | elevated | Device name |
| `auth.passkey.removed` | elevated | Credential ID |
| `auth.permission.changed` | critical | User ID, old role, new role, changed_by |
| `auth.api_key.created` | elevated | Key prefix, scopes |
| `auth.api_key.revoked` | elevated | Key prefix |
| `auth.account.deleted` | critical | User ID |
| `auth.tenant.created` | elevated | Tenant name |
| `auth.member.invited` | normal | Email, role |
| `auth.member.removed` | elevated | User ID, removed_by |

## MCP Tools

AI agents interact with the auth domain via these MCP tools:

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the authenticated agent's identity and permissions |
| `list_api_keys` | List API keys for the current tenant (metadata only) |
| `check_permission` | Check if a permission is granted for a given user/role |

## Events

The following events are published to NATS JetStream:

| Event | Trigger | Payload |
|-------|---------|---------|
| `auth.user.created` | New user registration | User ID, email (hashed), tenant_id |
| `auth.user.invited` | User invited to tenant | User ID, tenant_id, role, invited_by |
| `auth.login` | Successful login | User ID, tenant_id, method, device_id |
| `auth.logout` | Session revoked or logout | User ID, session_id |
| `auth.permission.changed` | Role assignment changed | User ID, tenant_id, old_role, new_role, changed_by |
| `auth.session.revoked` | Individual session revoked | Session ID, user_id, reason |
| `auth.session.revoked_all` | All sessions invalidated | User ID, reason (reuse_detection, user_initiated) |
| `auth.api_key.created` | New API key generated | Key prefix, tenant_id, scopes |
| `auth.api_key.revoked` | API key revoked | Key prefix, tenant_id |
| `auth.tenant.created` | New tenant created | Tenant ID, owner_id |
| `auth.account.deleted` | User account deleted | User ID |

## Security Considerations

- **No passwords in primary flow**: Passkeys are phishing-resistant by design
- **Argon2id parameters**: m=64MB, t=3, p=4 — tuned for single-machine deployment
- **Refresh token reuse detection**: Presenting a revoked refresh token invalidates ALL user sessions, not just the compromised one
- **Rate limiting**: Auth endpoints are rate-limited to 10 req/min per user (Redis-backed)
- **Account lockout**: 5 consecutive failed login attempts trigger a 15-minute lockout
- **TOTP drift tolerance**: +/- 1 time step (30 seconds) to accommodate clock skew
- **Recovery codes**: 10 codes, single-use, encrypted at rest, regenerable
- **API key hashing**: Salted SHA-256 — keys are never retrievable after creation

## Related Documentation

- [Security Architecture](../architecture/security.md) — threat model, OWASP mapping, security headers
- [Data Model](../architecture/data-model.md) — RLS templates, audit log schema, ID prefix registry
- [Domain Map](../architecture/domains.md) — auth domain definition and cross-domain relationships
- [Task Management](./task-management.md) — RBAC integration for task permissions
- [AI Agent Integration](./ai-agent-integration.md) — API key authentication for agents
