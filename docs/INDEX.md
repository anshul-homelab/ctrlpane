# Documentation Index

ctrlpane is an AI-first project management and notes platform with multi-tenant architecture, agent orchestration, and gamification. This index routes you to the right document based on what you need.

For the agent onboarding contract, start with [`AGENTS.md`](../AGENTS.md) at the repo root.

---

## Quick-Reference Routing Table

| If you want to... | Read |
|---|---|
| Understand the system and tech stack | [architecture/README.md](architecture/README.md) |
| See domain boundaries and relationships | [architecture/domains.md](architecture/domains.md) |
| Learn data model conventions (IDs, RLS, columns) | [architecture/data-model.md](architecture/data-model.md) |
| Understand authentication and authorization | [architecture/security.md](architecture/security.md) |
| Know why a technical decision was made | [decisions/README.md](decisions/README.md) |
| Build a feature in the task domain | [specs/task-management.md](specs/task-management.md) |
| Build a feature in the project domain | [specs/project-management.md](specs/project-management.md) |
| Build a feature in the goals domain | [specs/goals-and-planning.md](specs/goals-and-planning.md) |
| Build a feature in the notes domain | [specs/notes.md](specs/notes.md) |
| Integrate an AI agent with ctrlpane | [specs/ai-agent-integration.md](specs/ai-agent-integration.md) |
| Build auth, sessions, or RBAC | [specs/auth.md](specs/auth.md) |
| Build notifications or alerts | [specs/notifications.md](specs/notifications.md) |
| Build external integrations (Jira, Slack, etc.) | [specs/integrations.md](specs/integrations.md) |
| Understand the org-wide CI/CD convention | [guides/org-cicd-convention.md](guides/org-cicd-convention.md) |
| Review single points of failure | [operations/spof-register.yaml](operations/spof-register.yaml) |
| Set up your local dev environment | [guides/development-conventions.md](guides/development-conventions.md) |
| Deploy or operate ctrlpane | [runbooks/deployment.md](runbooks/deployment.md) |
| Understand the CI/CD pipeline design | [architecture/cicd-design.md](architecture/cicd-design.md) |
| Check production readiness for a feature | [architecture/production-checklist.md](architecture/production-checklist.md) |
| Understand multi-agent collaboration | [concepts/multi-agent-workflow.md](concepts/multi-agent-workflow.md) |

---

## Directory Listing

### `architecture/` -- System design and infrastructure

| File | Purpose | Audience |
|---|---|---|
| [README.md](architecture/README.md) | System overview, tech stack, architecture principles, repo structure | Everyone |
| [domains.md](architecture/domains.md) | Bounded context map with responsibilities and inter-domain relationships | Developers, architects |
| [data-model.md](architecture/data-model.md) | Shared column patterns, ID conventions, RLS templates | Developers |
| [security.md](architecture/security.md) | Threat model (STRIDE), auth, data protection, API security, audit | Developers, operators |
| [deployment-architecture.md](architecture/deployment-architecture.md) | Two-machine topology, service placement, networking, backup, DR | Operators, architects |
| [cicd-design.md](architecture/cicd-design.md) | CI/CD pipeline, release process, multi-agent workflow enforcement | Operators, architects |
| [production-checklist.md](architecture/production-checklist.md) | Per-feature verification gate (Bronze tier must-ship items) | Developers, reviewers |
| [production-governance.md](architecture/production-governance.md) | Governance framework: Bronze/Silver/Gold tiers, fitness functions | Architects, operators |
| [polyglot-services.md](architecture/polyglot-services.md) | Contract for non-TypeScript services in the ecosystem | Architects |

### `decisions/` -- Architecture Decision Records

| File | Purpose | Audience |
|---|---|---|
| [README.md](decisions/README.md) | ADR index and template | Everyone |
| [ADR-001-tech-stack.md](decisions/ADR-001-tech-stack.md) | Tech stack selection rationale | Architects |
| [ADR-002-auth-strategy.md](decisions/ADR-002-auth-strategy.md) | Authentication and authorization approach | Developers, architects |
| [ADR-003-domain-pattern.md](decisions/ADR-003-domain-pattern.md) | 3-layer domain pattern (routes/service/repository) | Developers |
| [ADR-004-pm-hierarchy.md](decisions/ADR-004-pm-hierarchy.md) | Project management hierarchy design | Developers |
| [ADR-005-agent-first-design.md](decisions/ADR-005-agent-first-design.md) | Agent-first design philosophy | Developers, architects |
| [ADR-006-event-architecture.md](decisions/ADR-006-event-architecture.md) | Event-driven architecture with NATS and transactional outbox | Developers, architects |
| [ADR-007-resilience-and-deployment.md](decisions/ADR-007-resilience-and-deployment.md) | Resilience patterns (retry, backpressure, bulkheads) | Operators, architects |
| [ADR-008-cicd-deployment.md](decisions/ADR-008-cicd-deployment.md) | CI/CD and two-machine deployment strategy | Operators, architects |
| [ADR-009-api-versioning.md](decisions/ADR-009-api-versioning.md) | URL-path API versioning strategy | Developers |
| [ADR-010-backward-compatibility.md](decisions/ADR-010-backward-compatibility.md) | Deprecation windows and sunset headers | Developers |
| [ADR-011-pagination-and-filtering.md](decisions/ADR-011-pagination-and-filtering.md) | Cursor-based pagination and filter DSL | Developers |
| [ADR-012-event-schema-versioning.md](decisions/ADR-012-event-schema-versioning.md) | CloudEvents envelope versioning | Developers, architects |
| [ADR-013-idempotency-keys.md](decisions/ADR-013-idempotency-keys.md) | Client-supplied idempotency keys | Developers |
| [ADR-014-csrf-ssrf-mitigation.md](decisions/ADR-014-csrf-ssrf-mitigation.md) | CSRF and SSRF mitigation strategies | Developers, architects |
| [ADR-015-gdpr-erasure.md](decisions/ADR-015-gdpr-erasure.md) | GDPR right-to-erasure cascade | Developers, architects |
| [ADR-016-data-consistency-model.md](decisions/ADR-016-data-consistency-model.md) | Three-tier consistency model | Developers, architects |
| [ADR-017-spof-acceptance-register.md](decisions/ADR-017-spof-acceptance-register.md) | SPOF acceptance with blast radius and recovery | Operators, architects |
| [ADR-018-opentelemetry-stack.md](decisions/ADR-018-opentelemetry-stack.md) | OpenTelemetry + SigNoz + trace propagation | Developers, operators |
| [ADR-019-agent-safety-controls.md](decisions/ADR-019-agent-safety-controls.md) | Agent risk classification, prompt versioning, human review | Developers, architects |
| [ADR-020-agent-session-retention.md](decisions/ADR-020-agent-session-retention.md) | Agent session data retention policy | Developers, architects |

### `specs/` -- Feature specifications

| File | Purpose | Audience |
|---|---|---|
| [project-management.md](specs/project-management.md) | Project domain: initiatives, epics, stories, tasks, sprints, boards, gamification | Developers |
| [task-management.md](specs/task-management.md) | Task domain: subtasks, recurrence, activity logs, sprint integration | Developers |
| [goals-and-planning.md](specs/goals-and-planning.md) | Goals domain: goal hierarchy, daily planning, cognitive sprints, day modes | Developers |
| [notes.md](specs/notes.md) | Notes domain: folders, FTS, AI analysis | Developers |
| [ai-agent-integration.md](specs/ai-agent-integration.md) | Agent contract, MCP tools, session management, leasing protocol | Developers, AI agents |
| [auth.md](specs/auth.md) | Authentication, authorization, RBAC, session management | Developers |
| [notifications.md](specs/notifications.md) | Notification channels, priority tiers, delivery, preferences | Developers |
| [integrations.md](specs/integrations.md) | Jira, Google, Slack, GitHub sync, OAuth2, webhooks | Developers |

### `operations/` -- Operational artifacts

| File | Purpose | Audience |
|---|---|---|
| [spof-register.yaml](operations/spof-register.yaml) | Single points of failure register with blast radius and recovery | Operators |

### `guides/` -- How-to references

| File | Purpose | Audience |
|---|---|---|
| [development-conventions.md](guides/development-conventions.md) | Biome config, pre-commit hooks, commit conventions, testing practices | Developers |
| [org-cicd-convention.md](guides/org-cicd-convention.md) | Org-wide CI/CD convention for all anshul-homelab repos (tiers, rollout, reusable components) | Operators, architects |

### `runbooks/` -- Operational procedures

| File | Purpose | Audience |
|---|---|---|
| [deployment.md](runbooks/deployment.md) | Current deployment reality: local processes, Docker services, planned topology | Operators |

### `concepts/` -- Design concepts and patterns

| File | Purpose | Audience |
|---|---|---|
| [multi-agent-workflow.md](concepts/multi-agent-workflow.md) | Hybrid human+AI team model, branch strategy, agent collaboration patterns | Developers, AI agents |

### `superpowers/specs/` -- Design proposals

| File | Purpose | Audience |
|---|---|---|
| [2026-03-12-pre-implementation-architecture-decisions-design.md](superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md) | 21 pre-implementation decisions addressing audit gaps (ADR-009+) | Architects |

### Root-level docs

| File | Purpose | Audience |
|---|---|---|
| [superset-production-checklist.md](superset-production-checklist.md) | 298-item enterprise readiness checklist synthesized from 25+ industry standards | Architects, operators |

---

## Entry Points by Role

**Developer** -- Start here to build features:
1. [AGENTS.md](../AGENTS.md) -- onboarding contract and conventions
2. [architecture/README.md](architecture/README.md) -- system overview
3. [architecture/domains.md](architecture/domains.md) -- domain boundaries
4. [guides/development-conventions.md](guides/development-conventions.md) -- tooling and workflow
5. The relevant `specs/` file for your domain

**Operator** -- Start here to deploy and run:
1. [runbooks/deployment.md](runbooks/deployment.md) -- current deployment state
2. [architecture/deployment-architecture.md](architecture/deployment-architecture.md) -- target topology
3. [architecture/cicd-design.md](architecture/cicd-design.md) -- pipeline design
4. [architecture/security.md](architecture/security.md) -- security posture

**Architect** -- Start here for design decisions:
1. [decisions/README.md](decisions/README.md) -- ADR index
2. [architecture/production-governance.md](architecture/production-governance.md) -- governance tiers
3. [architecture/polyglot-services.md](architecture/polyglot-services.md) -- multi-language contract
4. [superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md](superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md) -- pending decisions

**AI Agent** -- Start here to integrate:
1. [AGENTS.md](../AGENTS.md) -- canonical contract
2. [specs/ai-agent-integration.md](specs/ai-agent-integration.md) -- MCP tools, sessions, leasing
3. [concepts/multi-agent-workflow.md](concepts/multi-agent-workflow.md) -- collaboration model
4. [architecture/domains.md](architecture/domains.md) -- domain map
