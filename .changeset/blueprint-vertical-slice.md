---
"@ctrlpane/api": minor
"@ctrlpane/web": minor
---

Add blueprint vertical slice proving all architectural layers end-to-end

- Database: 8 Drizzle tables with RLS, migrations, and seed data
- Shared: Types, Zod schemas, ID/cursor utilities
- API: Hono server with auth/error/request-id middleware, 22 blueprint routes, outbox poller, Centrifugo publisher
- Web: React 19 with TanStack Router/Query, 5 views, 24 hooks
- MCP: 9 tools with @modelcontextprotocol/sdk
- Testing: 104 unit tests, 16 integration tests, architecture tests
- CI/CD: GitHub Actions workflows, systemd units, production docker-compose
- Tooling: Biome, Lefthook, commitlint, Changesets, Turborepo
