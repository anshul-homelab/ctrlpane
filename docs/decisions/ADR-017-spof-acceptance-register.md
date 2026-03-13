# ADR-017: SPOF Acceptance Register

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: resilience, operations

## Context

Solo-dev alpha has inherent Single Points of Failure. Documenting them explicitly (rather than pretending they do not exist) enables informed risk acceptance and planned mitigation. The register format becomes the reference for operational runbooks, monitoring configuration, and upgrade planning. Changing the format after teams depend on it requires migrating all operational documentation. Without a register, risk acceptance is implicit, leading to surprise outages with no recovery plan.

## Decision

YAML-based register at `docs/operations/spof-register.yaml`. Six documented Single Points of Failure for alpha:

1. Mac Studio hardware
2. Cloudflare tunnel
3. PostgreSQL (single instance)
4. Bun API process (single instance)
5. Redis (single instance)
6. NATS JetStream (single instance)

Each entry includes:

- `description`: what the SPOF is
- `blast_radius`: what breaks when this fails
- `probability`: 1-5 scale
- `impact`: 1-5 scale
- `risk_score`: probability x impact
- `compensating_controls`: what mitigates the risk today
- `recovery_procedure`: step-by-step restore
- `upgrade_trigger`: quantitative threshold (e.g., "when MAU > 50 or revenue > $500/mo")

Quarterly review cadence with date tracking.

**Alternatives rejected:**

- No register (accept risk implicitly): leads to surprise outages with no recovery plan.
- Markdown-based register: not machine-parseable, cannot be consumed by CI or monitoring tools.
- Full HA from day one: over-engineering for solo-dev alpha; the cost of HA infrastructure exceeds the cost of occasional downtime at this scale.
- Risk register in external tool (Notion, Jira): must live in the repo for version control, CI integration, and co-location with recovery scripts.

## Consequences

### Positive

- Explicit acceptance prevents surprise: known SPOFs have documented recovery procedures ready for when failures occur.
- Quantitative upgrade triggers prevent boiling-frog syndrome: "when MAU > 50" is actionable, "when we feel like it" is not.
- YAML is machine-parseable: the register can be consumed by monitoring configuration, CI checks (validate all entries have recovery procedures), and dashboard generators.
- Recovery procedures are the most valuable artifact: step-by-step procedures are worth more than any architecture diagram during an incident.
- Quarterly review prevents staleness as risk profiles change with usage growth.

### Negative

- Register requires discipline to maintain: new SPOFs introduced by architecture changes must be added manually.
- Quarterly review cadence creates recurring overhead.
- YAML format is less human-friendly than prose for describing nuanced blast radius scenarios.

### Neutral

- New directory: `docs/operations/` created for operational documentation.
- No code changes required: documentation only.
- Future CI validation can enforce that all entries have non-empty `recovery_procedure` and `upgrade_trigger`.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Initial register with 6 SPOFs. Recovery procedures tested manually. Quarterly review schedule established. |
| Beta | Review triggers evaluated against beta metrics. Add new SPOFs as architecture evolves. Recovery procedures automated where possible. |
| GA | Mitigation implementations for high-risk SPOFs (e.g., Postgres replication). Register drives SLA commitments. Automated failover for critical services. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-007: Resilience and Deployment](./ADR-007-resilience-and-deployment.md)
- [ADR-008: CI/CD and Deployment Architecture](./ADR-008-cicd-deployment.md)
