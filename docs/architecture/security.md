# Security Architecture

> **Date:** 2026-03-12 | **Status:** Ratified
> **Scope:** Security posture for ctrlpane — threat model, authentication, authorization, data protection, multi-tenancy, API security, audit, supply chain.
> **Related:** [ADR-002 Auth](../decisions/ADR-002-auth-strategy.md), [ADR-003 Domain Pattern](../decisions/ADR-003-domain-pattern.md), [Production Checklist](./production-checklist.md)

---

## 1. Threat Model (Lightweight STRIDE)

### Trust Boundary Diagram

```
                         INTERNET
    ========================|=========================
    |       Cloudflare Tunnel (TLS 1.3 termination)  |
    =======================|==========================
                           |
    ---- DMZ ------------- | ----------------------------
    |                      v                             |
    |  +----------+   +--------+   +-----------+        |
    |  | Web App  |-->|  API   |-->| Centrifugo |        |
    |  | (:33001) |   |(:33000)|   | (:38000)   |        |
    |  +----------+   +---+----+   +-----+------+        |
    ---- LOCAL NET ------- | ----------- | ---------------
    |                      v             v               |
    |  +----------+   +--------+   +---------+           |
    |  | Postgres |   | Redis  |   |  NATS   |           |
    |  | (:35432) |   |(:36379)|   | (:34222) |           |
    |  +----------+   +--------+   +---------+           |
    ------------------------------------------------------
```

### Assets & Classification

| Asset | Level | Impact if Compromised |
|-------|-------|----------------------|
| Agent session content, API keys | Restricted | Credential exposure, unauthorized agent actions |
| OAuth tokens, integration credentials | Restricted | Third-party account compromise |
| User credentials (passkeys, refresh tokens) | Restricted | Account takeover |
| Project data, notes, task details | Internal | Business data exposure |
| Session tokens (JWT) | Internal | Temporary impersonation |
| Audit logs | Internal | Forensic evidence destruction |

### STRIDE Summary

| Category | Key Threat | Primary Mitigation |
|----------|-----------|-------------------|
| **Spoofing** | Stolen JWT from another device | Device-bound sessions; refresh token rotation; reuse detection invalidates all sessions |
| **Tampering** | Modified request payloads | Zod validation at boundary; Drizzle ORM (no raw SQL) |
| **Tampering** | Audit log modification | Append-only table; `REVOKE UPDATE/DELETE`; trigger-enforced immutability |
| **Repudiation** | User denies action | Structured audit with trace_id, device_id, ip, user_agent |
| **Info Disclosure** | Cross-tenant data leak | Postgres RLS `ENABLE + FORCE`; `SET LOCAL` per transaction |
| **DoS** | API flood | Redis-backed rate limiting per tenant/user/endpoint |
| **Elevation** | Self-granting higher role | `canGrantRole()` requires strictly higher privilege |
| **Elevation** | RLS bypass via superuser | `FORCE ROW LEVEL SECURITY`; app uses non-superuser role |

### Additional Threat Vectors

#### 1. MCP Authentication

MCP tool calls execute in-process with the API server — there is no network boundary between the MCP handler and the Hono application. Agent sessions authenticate via leased JWT tokens issued at session start.

**Auth flow:**

1. Agent authenticates via `POST /auth/agent-session` with a salted API key hash.
2. Server issues a short-lived JWT (15 min) with scoped permissions (`agents.session.manage`, plus any project-level grants).
3. JWT `sub` encodes `agent:{agent_id}`, `tid` encodes tenant. Standard `requireAuth` middleware validates the token on every MCP call.
4. Refresh follows the same rotation + reuse-detection flow as user sessions (Section 2).

**Session binding:** Each agent session is bound to a `session_id` + `tenant_id` pair. The JWT `sid` claim must match the active session row. Revoked or expired sessions reject all MCP calls immediately.

**Permission boundaries:** Agent JWTs carry a `scope` array that is a strict subset of the creating user's permissions. Agents cannot escalate beyond their issuer's role. MCP tool handlers check `requirePermission()` like any other route — no implicit trust.

#### 2. File Upload Security

ctrlpane accepts file attachments on tasks and notes. Uploads are validated and stored without server-side execution.

| Control | Implementation |
|---------|---------------|
| **Type validation** | Extension + MIME allowlist: `png, jpg, jpeg, gif, webp, pdf, txt, md, csv, doc, docx, xls, xlsx`. Magic-byte verification via `file-type` library. |
| **Size limit** | 10 MB per file; 50 MB per request (enforced by Hono body parser). |
| **Storage isolation** | Files stored under `/{tenant_id}/{upload_id}/{filename}`. Tenant ID is derived from the authenticated session, never from the request body. |
| **No execution** | Files served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. No server-side processing beyond thumbnail generation (image types only). |
| **Filename sanitization** | Original filenames stripped of path separators and null bytes; stored with a UUID prefix. |
| **Virus scanning** | Deferred to Beta. When implemented: ClamAV scan before storage; quarantine on detection. |

#### 3. Timing Attacks

All secret comparisons use constant-time functions to prevent timing-based information leakage.

| Comparison | Implementation |
|-----------|---------------|
| Password verification | Argon2id `verify()` — inherently constant-time |
| HMAC validation | `crypto.timingSafeEqual()` for webhook signature and HMAC checks |
| Token comparison | `crypto.timingSafeEqual()` for refresh token hash, API key hash, and recovery code comparison |
| Early rejection prevention | Auth endpoints always perform the full hash comparison even for non-existent users (hash a dummy value) to prevent user-enumeration timing |

Rate limiting on auth endpoints (10 req/min per user, Section 7) provides an additional layer against brute-force timing attacks.

#### 4. JWT Algorithm Confusion

JWT verification is hardcoded to prevent `alg: none` and RSA/HMAC confusion attacks.

| Control | Implementation |
|---------|---------------|
| **Algorithm hardcoding** | Verification specifies `algorithms: ['RS256']` explicitly. No dynamic algorithm selection from the token header. |
| **`alg: none` rejection** | Tokens with `alg: none` or empty `alg` are rejected before signature verification. The JWT library (`jose`) rejects these by default when `algorithms` is specified. |
| **Key type enforcement** | Verification uses an RSA public key only. Passing an HMAC secret to an asymmetric verifier is structurally impossible — the key types are incompatible. |
| **Header validation** | Tokens with `alg` not matching `RS256` are rejected with a `401` and audit-logged at `elevated` risk level. |

#### 5. Dependency Confusion Attacks

All internal packages use the `@ctrlpane` npm scope to prevent public registry shadowing.

| Control | Implementation |
|---------|---------------|
| **Scoped packages** | Every internal package is published under `@ctrlpane/*` (e.g., `@ctrlpane/shared`, `@ctrlpane/domain-tasks`). The scope is registered on npm (reserved, not published). |
| **Registry pinning** | `.npmrc` configures `@ctrlpane:registry=https://registry.npmjs.org/` with the scope explicitly pinned. Bun resolves `@ctrlpane/*` only from the configured registry. |
| **Frozen lockfile in CI** | `bun install --frozen-lockfile` in all CI jobs. Any lockfile drift (new dependency resolution) fails the build. |
| **Workspace protocol** | Internal dependencies use `workspace:*` protocol in `package.json`, which Bun resolves locally — never hitting the registry for workspace packages. |
| **Pre-publish guard** | No `@ctrlpane/*` package has `"private": false`. All are `"private": true` until an explicit public release decision. |

---

## 2. Authentication

### Passkeys (WebAuthn) — Primary

No passwords for the primary flow. Passkeys via WebAuthn Level 2 (FIDO2). Platform authenticators (Touch ID, Face ID, Windows Hello) and roaming (YubiKey). Users may enroll multiple passkeys across devices.

### Fallback: Email/Password + TOTP

Email/password with mandatory TOTP (RFC 6238) as the fallback authentication method. Argon2id for password hashing with parameters: m=64MB, t=3, p=4. 10 single-use recovery codes generated at enrollment.

### Token Architecture

| Token | Lifetime | Storage | Rotation |
|-------|----------|---------|----------|
| Access (JWT) | 15 min | Memory only | On login + refresh |
| Refresh | 7 days | `httpOnly; Secure; SameSite=Strict` cookie | Every exchange; old token invalidated |
| Centrifugo | 10 min | Memory only | Re-issued via `/api/realtime/token` |

### Refresh Token Flow

1. Client sends `POST /auth/refresh` with httpOnly cookie
2. Server verifies `refresh_token_hash` against session row
3. Checks: `revoked_at IS NULL`, token not reused
4. **Reuse detection**: if revoked token presented, ALL user sessions invalidated (signals theft)
5. Issues new access JWT + new refresh token; hashes and stores new refresh

### Session Model

Sessions are device-scoped (`device_id` + `device_public_key`). Revoking one device does not affect others. Users manage sessions from settings.

---

## 3. Authorization

### RBAC Model

Two-tier role system:

**Tenant-Level Roles:**

| Role | Description |
|------|-------------|
| `owner` | Full administrative control. One per tenant. Cannot be removed. |
| `admin` | User management, configuration. Cannot manage owners. |
| `member` | Standard read/write access on own data. |
| `viewer` | Read-only access. |

**Project-Level Roles:**

| Role | Description |
|------|-------------|
| `pm` | Project management privileges. |
| `engineer` | Task execution privileges. |
| `tester` | QA and testing privileges. |
| `sme` | Subject matter expert (comment/review). |

Default role for new users: `member`. Configurable per tenant.

### Permission String Format

Permissions follow a three-segment dot notation: `{domain}.{resource}.{action}`.

```
tasks.task.create        -- Create tasks
tasks.task.read          -- Read tasks
tasks.task.update        -- Update own tasks
tasks.task.delete        -- Delete own tasks
tasks.task.admin         -- Manage any task in the tenant
projects.task.create     -- Create project tasks
projects.sprint.manage   -- Sprint management
goals.goal.create        -- Create goals
notes.note.create        -- Create notes
agents.session.manage    -- Manage agent sessions
admin.role.assign        -- Assign roles to users
admin.role.manage        -- Create/modify role definitions
admin.audit.read         -- Read audit logs
```

### Evaluation Chain

```
1. Feature flag check: is the feature enabled? (No -> hide entirely, not a 403)
2. RLS enforcement: does this row belong to the user's tenant? (Postgres-level, automatic)
3. RBAC check: does the user's role include the required permission? (Cached, O(1))
4. Resource ownership check: for non-admin roles, is this the user's own resource?
```

### Escalation Prevention

- Users cannot assign roles >= their own (except owner transfer)
- Custom roles cannot include permissions absent from creator's set
- All role changes audited at `elevated` or `critical` risk level

### Middleware

```typescript
// requirePermission — Hono middleware for RBAC checks
app.post('/tasks', requireAuth, requirePermission('tasks.task.create'), handler);
app.get('/tasks', requireAuth, requirePermission('tasks.task.read'), handler);
app.delete('/admin/roles/:id', requireAuth, requirePermission('admin.role.manage'), handler);
```

---

## 4. Data Protection

### Encryption

| Segment | Mechanism |
|---------|-----------|
| Client <-> API/Centrifugo | TLS 1.3 via Cloudflare Tunnel |
| API <-> Postgres/Redis/NATS | Plaintext on local network (single-machine deployment) |
| Full disk | OS-level (FileVault on macOS) |
| Sensitive columns (API keys, OAuth tokens) | Application-level AES-256-GCM; per-tenant key |

### Data Classification Levels

| Level | Examples | Controls |
|-------|----------|----------|
| **Restricted** | Agent API keys, OAuth tokens, integration credentials | Column encryption; audit every access |
| **Internal** | Tasks, projects, goals, notes, agent sessions | RLS; standard auth |
| **Public** | Feature flag names, API schema, docs | No access control |

---

## 5. Multi-Tenancy Isolation

### Postgres RLS (Every Domain Table)

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));
```

`FORCE` ensures RLS applies even to table owners. `SET LOCAL` scoped to transaction (safe with pooling).

### Infrastructure Namespacing

All Redis keys, NATS subjects, Centrifugo channels include `tenant:{tid}:user:{uid}` scope.

### Isolation Tests

| Test | Assertion |
|------|-----------|
| Missing context | Query without `SET LOCAL app.tenant_id` returns zero rows |
| Cross-tenant | Insert as Tenant A, query as Tenant B -> empty |
| RLS coverage | Fitness function: every domain table has RLS enabled |

---

## 6. Input Validation & Output Encoding

| Layer | Mechanism |
|-------|-----------|
| API input | `zValidator` with Zod schemas on every endpoint |
| SQL injection | Drizzle ORM; no raw SQL outside migrations |
| XSS | React auto-escaping; DOMPurify for user HTML (notes markdown) |
| Event payloads | Zod validation on consumer ingestion |
| Config | Zod schema at startup; fails fast on invalid |
| Request body | 1 MB general, 10 MB uploads |
| Log output | Never log tokens, passwords, keys, or PII beyond user_id |

---

## 7. API Security

### Auth Coverage

All routes behind `requireAuth` except: `GET /health`, `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`.

### Rate Limiting (Redis-Backed)

| Scope | Limit | Window |
|-------|-------|--------|
| Per-user general | 100 req/min | Sliding |
| Per-user auth | 10 req/min | Sliding |
| Per-tenant global | 1000 req/min | Sliding |
| Per-endpoint agent | 200 req/min | Sliding |

Redis down -> approximate in-memory counters (fail-open for availability; RLS+auth remain enforced).

### Security Headers

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### CORS

Origins: `https://ctrlpane.com`, `http://localhost:33001`. Credentials: true. Methods: GET, POST, PUT, PATCH, DELETE.

### Idempotency

All mutating endpoints accept `Idempotency-Key` header. Same key + same hash -> cached response. Same key + different hash -> `409`. Keys expire 24h.

---

## 8. Audit Logging

### Audit Log Table

Append-only Postgres table with three layers of immutability enforcement:
1. `REVOKE UPDATE, DELETE` from app role
2. `BEFORE UPDATE OR DELETE` trigger raises error
3. RLS tenant isolation using same `current_setting('app.tenant_id')` pattern

### Must-Audit Events

| Category | Events | Risk Level |
|----------|--------|------------|
| Authentication | Login, logout, refresh, failed attempts | normal-elevated |
| Authorization | Permission denied, escalation blocked, role changes | elevated-critical |
| Agent sessions | Session start, session end, lease claims, lease expirations | normal-elevated |
| Data access | Bulk export, integration credential access | elevated |
| Admin | Tenant configuration changes, user management | elevated |

### Immutability

- Monthly partitions, 2-year retention
- Every audit entry carries OpenTelemetry `trace_id` for end-to-end correlation
- Structured entries: `actor_type`, `risk_level`, `component`, `trace_id`

---

## 9. Supply Chain Security

| Control | Implementation |
|---------|---------------|
| Version pinning | Caret ranges (`^x.y.z`); no `latest` tags |
| Lockfile integrity | `bun.lockb` committed |
| Version governance | `syncpack` + `sherif` |
| Vulnerability scan | `bun audit` in pre-push |
| Pre-commit gates | biome, typecheck, test:unit, lint:deps, check:sizes |

---

## 10. Secrets Management

- **No hardcoded credentials** in source code — env vars only
- Pre-commit grep check for patterns like `password=`, `secret=`, `token=`, `api_key=`
- Integration credentials (OAuth tokens, API keys) stored with AES-256-GCM column encryption
- Agent API keys stored as salted hashes — never retrievable in plaintext after creation
- Secrets never logged — grep verification: `grep -rn 'password\|secret\|token' apps/api/src/domains/ | grep -i 'log\|console'`

---

## 11. OWASP Top 10 (2021) Mapping

| # | Category | Mitigation |
|---|----------|-----------|
| A01 | Broken Access Control | RLS `FORCE` on all tables; RBAC chain; escalation prevention; `<Can>` UI gates |
| A02 | Cryptographic Failures | AES-256-GCM for sensitive columns; Argon2id for passwords; TLS 1.3 |
| A03 | Injection | Zod `zValidator`; Drizzle ORM; React auto-escaping + DOMPurify |
| A04 | Insecure Design | This threat model; defense-in-depth; least-privilege defaults |
| A05 | Security Misconfiguration | Zod config validation at startup; security headers; `FORCE RLS`; no default credentials |
| A06 | Vulnerable Components | `bun audit`; no `latest` tags; lockfile committed |
| A07 | Auth Failures | Passkeys (phishing-resistant); token rotation + reuse detection; rate-limited auth |
| A08 | Integrity Failures | Lockfile integrity; transactional outbox |
| A09 | Logging Failures | Append-only audit; must-audit list; trace_id correlation |
| A10 | SSRF | No user-supplied URLs in server fetches; provider abstractions with allowlisted endpoints |

---

## Cross-References

- [ADR-002 Auth Strategy](../decisions/ADR-002-auth-strategy.md) — passkeys, token architecture, session model
- [Production Checklist](./production-checklist.md) — security verification items
- [Production Governance](./production-governance.md) — enforcement pyramid
- [Data Model](./data-model.md) — RLS policy templates, audit log schema
