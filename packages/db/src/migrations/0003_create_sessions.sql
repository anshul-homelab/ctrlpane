-- 0003_create_sessions.sql
-- Creates sessions table for httpOnly cookie-based auth.
-- NO RLS — the auth middleware needs to look up sessions before tenant
-- context is established (same pattern as the api_keys fix in migration 0002).

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  token_hash  TEXT NOT NULL,
  user_agent  TEXT,
  ip_address  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX idx_sessions_tenant ON sessions (tenant_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
