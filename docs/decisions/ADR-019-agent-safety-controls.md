# ADR-019: Agent Safety Controls

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: ai, security, data-model

## Context

CtrlPane is an AI-first project management platform where agents perform actions on behalf of users. Four interrelated decisions govern how agents interact safely with the system: which actions are risky, how agent instructions are versioned, when human approval is required, and how sensitive data is protected from agent access. These decisions are irreversible because they determine the agent execution model, approval workflow schema, instruction template structure, and data classification boundaries. Changing any of these after agents are deployed requires updating all agent instruction sets, approval workflows, and data handling logic.

## Decision

### 1. Agent Action Risk Classification

Static per-action risk classification with three tiers, defined in a TypeScript const map `ACTION_RISK_MAP`:

- **Normal**: create task, add comment, update task fields, claim task, log time, create note.
- **Elevated**: bulk operations (bulk update, bulk assign), sprint complete, role assignment, workflow state transition, integration configuration.
- **Critical**: delete project, modify workflow definition, bulk delete, role escalation (promoting to admin), API key generation, instruction template modification.

Classification aligns with the existing `audit_logs.risk_level` column. The risk map is the single source of truth -- both the approval workflow and audit logging reference it.

**Alternatives rejected:**

- Dynamic risk scoring (ML-based): requires training data that does not exist yet.
- Two tiers (normal/critical): no intermediate level for bulk operations that are impactful but not destructive.
- Per-tenant configurable risk levels: deferred to GA.

### 2. Prompt/Instructions Versioning

Immutable versioned rows in `instruction_templates` table (prefix `itp_`):

- Columns: `id`, `slug` (e.g., `pm-agent`, `qa-agent`), `version` (integer, auto-incrementing per slug), `role` (agent role enum), `content` (Markdown template with `{{variable}}` placeholders), `variables` (JSONB schema defining available variables and defaults), `status` (`draft` | `published` | `deprecated`), `created_at`, `created_by`.

Per-project customization via `instruction_overrides` table (prefix `ito_`):

- Columns: `id`, `project_id`, `template_id`, `variable_overrides` (JSONB), `extra_sections` (Markdown appended to template), `created_at`, `updated_by`.

Resolution: find latest `published` template for the agent's role -> merge project overrides (variables + extra sections) -> render Markdown with resolved variables. Agent sessions record `instruction_template_id` in session metadata for full auditability.

**Alternatives rejected:**

- Mutable templates (edit in place): no audit trail, no rollback capability.
- File-based templates (in repo): cannot be customized per-project at runtime.
- Template inheritance hierarchy: over-engineered; two-level (template + project override) is sufficient.

### 3. Human Review Checkpoints (Approval Workflow)

Async approval via `pending_approvals` table (prefix `apr_`).

**Flow:** Agent encounters a critical action -> service layer creates approval row with action details, risk level, and requesting agent session -> returns `{ status: 'pending_approval', approval_id: 'apr_xxx' }` to agent -> agent releases its lease (does NOT block waiting) -> notification sent to project admins via Centrifugo + configured channels -> human reviews and approves/rejects via UI or API (`POST /api/v1/approvals/:id/approve` or `/reject`) -> **system** (not agent) executes the approved action -> result event published.

Key invariants:

- The system executes the approved action, not the agent. The agent never holds a lease while waiting for approval.
- Approval expiry: 24 hours -> auto-reject with `expired` status.
- Expiry reaper: scheduled job running every 5 minutes.

**Schema:** `pending_approvals` table with columns: `id`, `tenant_id`, `project_id`, `agent_session_id`, `action_type`, `action_payload` (JSONB), `risk_level`, `status` (`pending` | `approved` | `rejected` | `expired`), `requested_at`, `decided_at`, `decided_by`, `expiry_at`, `reason` (optional text).

**Alternatives rejected:**

- Synchronous approval (agent waits): agent holds lease and resources for potentially hours.
- Agent executes after approval: agent must reconstruct context after potentially hours; risk of context drift.
- No expiry (pending forever): stale approvals accumulate and may be approved when no longer appropriate.

### 4. Sensitive Data Controls

Three-layer progressive model:

**Layer 1 (Alpha):** Field-level sensitivity classification in TypeScript code. Four levels: `public` (project names, task titles), `internal` (user emails, team membership), `pii` (full names, phone numbers, addresses), `restricted` (API keys, terminal raw output streams, passwords). `restricted` fields are NEVER included in agent context -- filtered at the instructions rendering layer before any LLM call.

**Layer 2 (Beta):** Configurable redaction rules per tenant via `data_redaction_configs` table (prefix `drc_`). Tenants can promote fields to higher classification.

**Layer 3 (GA):** Explicit consent tracking via `data_processing_consents` table (prefix `dpc_`). Users consent to specific data categories being processed by agents. Consent withdrawal triggers field reclassification.

**Alternatives rejected:**

- No classification (all data accessible to agents): API keys and passwords in agent context is a security vulnerability.
- Two levels (public/restricted): insufficient granularity; PII requires different handling than internal data (GDPR implications).
- Database-only classification: code-level classification provides compile-time guarantees.

## Consequences

### Positive

- Static risk classification is predictable: agents and humans can reason about risk levels without runtime context.
- Three tiers map cleanly to three response patterns: normal = execute immediately, elevated = execute + alert, critical = require approval.
- Immutable versioned instruction templates enable rollback: reverting to a previous version is a single-row status change.
- Per-project overrides separate concerns: base templates define agent behavior, project overrides customize variables without forking the template.
- Session-to-template linkage enables debugging: the exact instruction template version used in any session is immediately retrievable.
- Agent releases lease during approval: no resources held for potentially hours.
- System executes approved actions, not agents: eliminates context reconstruction risk.
- Restricted fields NEVER reach agents: hard architectural constraint enforced at the rendering layer, not a policy.
- Four classification levels (public/internal/pii/restricted) map to common data handling tiers in security frameworks (ISO 27001, SOC 2).

### Negative

- Four new tables add schema complexity: `instruction_templates`, `instruction_overrides`, `pending_approvals`, and (beta) `data_redaction_configs`.
- Risk classification requires maintenance as new action types are added.
- Approval workflow adds latency for critical operations (up to 24 hours).
- Field-level classification must be maintained in sync with schema changes.
- 24-hour approval expiry may be too short for weekend operations.

### Neutral

- Six new ID prefixes: `itp_`, `ito_`, `apr_`, `drc_`, `dpc_` (must be registered in the ID Prefix Registry).
- New event types: `approval.requested.v1`, `approval.approved.v1`, `approval.rejected.v1`, `approval.expired.v1`.
- New Centrifugo channel: `approvals:{tenant_id}` for real-time approval notifications.
- `ACTION_RISK_MAP` aligns with existing `audit_logs.risk_level` column: no new risk taxonomy needed.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Full risk map implemented. Critical actions require approval. Approve/reject via API. 24h expiry. Default instruction templates per agent role (PM, QA, Dev). Sessions record template version. Code-level data classification. `restricted` fields stripped from all agent contexts. |
| Beta | Elevated action alerts visible in dashboard. Per-project instruction overrides enabled. Template versioning UI. `data_redaction_configs` table for per-tenant classification overrides. Configurable approval requirements per project. |
| GA | Per-tenant risk level customization. ML-based anomaly detection layered on top of static classification. Template marketplace. A/B testing of template variations. `data_processing_consents` table for GDPR Article 7 compliance. Dual-approval option for enterprise tenants. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-005: Agent-First Design](./ADR-005-agent-first-design.md)
- [ADR-002: Auth Strategy](./ADR-002-auth-strategy.md)
