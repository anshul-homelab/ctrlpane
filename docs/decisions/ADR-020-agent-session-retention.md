# ADR-020: Agent Session Data Retention

- Status: accepted
- Date: 2026-03-12
- Deciders: Anshul Bisen
- Categories: ai, data-model, operations

## Context

Data retention tiers determine table partitioning strategy, archive file format, and cleanup job design. Changing partition boundaries on a live table requires `pg_partman` migration and potential downtime. Retroactive partitioning requires exclusive locks, data migration, and downtime, so implementing partitioning from day one avoids this entirely. Agent sessions generate significant data volume: terminal output alone is 1-10 MB per session, 10-500 MB per day at moderate usage. Storing this in Postgres would bloat the database and degrade query performance.

## Decision

Tiered retention with Postgres range partitioning (monthly).

**Sessions** (`agent_sessions` table):

- 6 months hot (in Postgres)
- 6-24 months warm (compressed JSON export to `data/session-archives/`)
- Deleted after 24 months

**Activity** (`agent_activity` table):

- 3 months hot (in Postgres)
- 3-12 months warm (compressed export)
- Deleted after 12 months

**Terminal output:**

- 7 days hot (streamed via Centrifugo, metadata in Postgres)
- 7-90 days warm (gzip files at `data/terminal-archives/{tenant_id}/{session_id}.gz`)
- Deleted after 90 days

Terminal output is file-based rather than database-stored because the volume (10-500 MB/day) would double database size monthly if stored in Postgres.

**Partitioning:** `pg_partman` manages monthly partition creation and old partition detachment. Dropping a partition is O(1) regardless of row count, whereas DELETE operations on large tables are O(n) and create bloat.

**Cleanup:** Cron jobs handle archival and deletion -- daily for terminal archives (> 90 days), weekly for session archives (> 24 months) and activity archives (> 12 months).

**Alternatives rejected:**

- All data in Postgres (no partitioning): terminal output volume would bloat the database with no efficient cleanup path.
- S3/object storage for archives: deferred to GA; adds cloud dependency, local file storage is sufficient for single-server alpha/beta.
- No retention limits (keep everything): storage grows unbounded, query performance degrades, GDPR requires data minimization.
- Time-series database for terminal output: adds another database to operate; file-based storage is simpler for the access pattern (rarely read, bulk write).
- Shorter retention (30 days hot): debugging agent behavior often requires reviewing sessions from weeks ago; 3-6 months provides adequate investigation window.

## Consequences

### Positive

- Three retention tiers match three data sensitivity levels: sessions (low-volume metadata, long-term useful), activity (medium-volume actions/decisions), terminal output (high-volume raw streams, useful only for recent debugging).
- Monthly partitioning enables O(1) cleanup regardless of data volume.
- File-based terminal storage with gzip compression keeps storage manageable at 10-500 MB/day.
- Warm tier preserves data for compliance: compressed JSON exports are accessible for audits without impacting production query performance.
- Implementing partitioning from day one avoids painful retroactive migration.

### Negative

- `pg_partman` adds operational complexity: partition creation and detachment must be monitored.
- File-based terminal archives require separate backup strategy (not covered by Postgres backups).
- Cleanup cron jobs must be monitored for failures to prevent unbounded storage growth.
- Warm-tier query API requires separate implementation for accessing archived data.

### Neutral

- `agent_sessions` and `agent_activity` tables are range-partitioned by `created_at` (monthly).
- New directories: `data/terminal-archives/` (tenant-scoped subdirectories) and `data/session-archives/`.
- `.gitignore` must exclude `data/` directory from version control.
- Archive export script: `scripts/archive-sessions.sh` exports old partitions to compressed JSON and detaches partition.

## Phase Gates

| Phase | Behavior |
|-------|----------|
| Alpha | Implement partitioning and file-based terminal storage from day one. Monthly partitions on `agent_sessions` and `agent_activity`. Terminal output written to gzip files. Basic cleanup cron jobs. |
| Beta | Archive export automation. Warm-tier query API for compliance. Retention policy documented for employees. Storage usage monitoring and alerting. |
| GA | Configurable retention per tenant. S3 offsite backup for warm tier. Retention policy enforcement audit. Data subject access requests include archived data. |

## More Information

- [Pre-Implementation Architecture Decisions](../superpowers/specs/2026-03-12-pre-implementation-architecture-decisions-design.md)
- [ADR-005: Agent-First Design](./ADR-005-agent-first-design.md)
- [ADR-015: GDPR Data Erasure Cascade](./ADR-015-gdpr-erasure.md)
