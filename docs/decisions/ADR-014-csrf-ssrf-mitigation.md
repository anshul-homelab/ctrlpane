# ADR-014: CSRF and SSRF Mitigation

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: Security

## Context

This ADR addresses two security architecture decisions that set the threat model baseline for CtrlPane.

**CSRF:** Security architecture decisions around CSRF are irreversible — adding CSRF tokens later requires coordinating frontend, backend, and all API clients simultaneously. CtrlPane uses a split token architecture (access token in memory, refresh token in cookie) that changes the CSRF threat model compared to traditional cookie-based session authentication.

**SSRF:** The outbound HTTP abstraction becomes a dependency of every integration. Changing the trust model after integrations are built requires auditing and updating all outbound call sites. Integration domains (webhook URLs, Jira callback URLs, custom endpoints) are user-supplied, creating a direct SSRF attack surface.

## Decision

### CSRF Mitigation

`SameSite=Strict` on the refresh token cookie is sufficient. Origin header validation added as defense-in-depth (~15 lines of Hono middleware). No Double Submit Cookie pattern. No Synchronizer Token pattern. No CSRF tokens in forms or headers.

**Rationale:**
- The access token is stored in memory only (not a cookie), so it cannot be sent by cross-origin requests
- The refresh token uses `SameSite=Strict; HttpOnly; Secure; Path=/api/v1/auth/refresh`
- CORS is locked to `ctrlpane.com` and `localhost:3001`
- MCP and API-key authentication use `Authorization` headers, which are immune to CSRF by design

**CSRF alternatives rejected:**

| Option | Reason |
|--------|--------|
| Double Submit Cookie | Adds frontend complexity (reading cookie, attaching header) for a threat already mitigated by non-cookie auth. |
| Synchronizer Token (server-side) | Requires server-side session state for token storage. Adds latency and state management for a mitigated threat. |
| SameSite=Lax (instead of Strict) | Lax allows cookies on top-level GET navigations. Strict is more secure and the refresh endpoint only uses POST. |
| No Origin check (rely solely on SameSite) | Origin check is trivial to implement and provides defense-in-depth against browser bugs in SameSite enforcement. |

### SSRF Prevention

`SafeHttpClient` as an Effect `Context.Tag` service wrapping all outbound HTTP fetches. Three defense layers:

1. **Provider allowlist** for known integrations — Jira: `*.atlassian.net`, Slack: `slack.com`, Google: `*.googleapis.com`, Telegram: `api.telegram.org`
2. **URL validation** — HTTPS only, block private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`)
3. **DNS resolution pinning** — resolve hostname to IP, validate IP is not private, then connect to the resolved IP directly (preventing DNS rebinding)

**Architecture enforcement:** dependency-cruiser rule and convention test block raw `fetch()` usage in domain code — all outbound HTTP must go through `SafeHttpClient`.

**SSRF alternatives rejected:**

| Option | Reason |
|--------|--------|
| Network-level egress firewall only | Requires infrastructure (iptables/nftables) that adds operational complexity. Application-level controls are sufficient for alpha/beta. Deferred to GA. |
| No DNS pinning (URL validation only) | Vulnerable to DNS rebinding attacks. Industry best practice (OWASP) recommends resolution pinning. |
| Allow HTTP for localhost development | Creates a code path that could leak into production. Use HTTPS everywhere, including local dev (mkcert). |
| Per-request allowlist prompt | Breaks agent automation. Agents need to make integration calls without human approval for non-critical actions. |

### Schema and Code Impact

**CSRF:**
- New Hono middleware: `csrfOriginCheck()` — validates `Origin` header against allowlist
- Refresh token cookie attributes: `SameSite=Strict; HttpOnly; Secure; Path=/api/v1/auth/refresh`
- Zero schema changes

**SSRF:**
- New Context.Tag service: `SafeHttpClient` in `packages/shared/src/http/safe-client.ts`
- Provider allowlist configuration: `packages/shared/src/http/providers.ts`
- IP validation utility: `packages/shared/src/http/ip-validator.ts`
- DNS resolution pinning: `packages/shared/src/http/dns-pinner.ts`
- dependency-cruiser rule: ban `fetch` import in `packages/*/src/domain/` and `packages/*/src/application/`
- Convention test: ts-morph test scanning for raw `fetch()` calls outside `SafeHttpClient`
- All integration adapters (`packages/integrations/src/adapters/`) use `SafeHttpClient`

## Consequences

### Positive

- CSRF: zero-complexity defense — no tokens, no additional state, no frontend coordination required
- CSRF: Origin check is cheap insurance (~15 lines of middleware) providing defense-in-depth against browser bugs
- SSRF: three-layer defense (allowlist + URL validation + DNS pinning) closes DNS rebinding gap that URL-only validation misses
- SSRF: Effect `Context.Tag` makes enforcement compiler-checked — domain code must declare `SafeHttpClient` as a dependency
- SSRF: architecture tests (dependency-cruiser + ts-morph) catch raw `fetch` usage mechanically
- SSRF: HTTPS-only prevents credential leakage in integration payloads

### Negative

- CSRF: relies on browser SameSite enforcement — older browsers without SameSite support are not protected (mitigated by Origin check)
- SSRF: `SafeHttpClient` adds latency to every outbound call (DNS resolution + IP validation), though this is negligible compared to network RTT
- SSRF: provider allowlist requires maintenance as new integrations are added
- SSRF: DNS pinning adds complexity to the HTTP client abstraction

### Neutral

- CSRF posture should be validated by security audit at beta and penetration test at GA
- SSRF: network-level egress controls deferred to GA as an additional layer
- Both mitigations are documented in the security architecture section of the docs

## Phase Gates

| Phase | CSRF | SSRF |
|-------|------|------|
| Alpha | Origin check middleware active. SameSite=Strict on refresh cookie. No additional CSRF tokens needed. | SafeHttpClient implemented for integrations domain. Provider allowlist for Jira, Slack, Google, Telegram. DNS pinning active. |
| Beta | Same. Security audit validates CSRF posture. | Custom webhook URL validation through SafeHttpClient. User-supplied URLs undergo full validation chain. Rate limiting on outbound calls per tenant. |
| GA | Same. Penetration test scope includes CSRF vectors. | Network-level egress controls as additional layer. Outbound call audit logging. Anomaly detection on unusual outbound patterns. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-002: Auth Strategy](./ADR-002-auth-strategy.md)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 8594 — The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594)
