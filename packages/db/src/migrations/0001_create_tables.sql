-- 0001_create_tables.sql
-- Creates all tables for the blueprint vertical slice with RLS policies.

-- ============================================================
-- Tenants (no RLS — tenant_id IS the row)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- API Keys
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (tenant_id, created_at);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_keys
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Blueprint Items
-- ============================================================
CREATE TABLE IF NOT EXISTS blueprint_items (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  title       TEXT NOT NULL,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  priority    TEXT NOT NULL DEFAULT 'medium',
  kind        TEXT NOT NULL DEFAULT 'idea',
  parent_id   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_by  TEXT,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_items_tenant_status ON blueprint_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_blueprint_items_tenant_kind ON blueprint_items (tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_blueprint_items_parent ON blueprint_items (parent_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_items_tenant_created ON blueprint_items (tenant_id, created_at);

ALTER TABLE blueprint_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_items
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Blueprint Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS blueprint_tags (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_tags_tenant_name ON blueprint_tags (tenant_id, name);

ALTER TABLE blueprint_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_tags
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Blueprint Item Tags (join table)
-- ============================================================
CREATE TABLE IF NOT EXISTS blueprint_item_tags (
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  item_id     TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES blueprint_tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tag_id)
);

ALTER TABLE blueprint_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_item_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_item_tags
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Blueprint Comments
-- ============================================================
CREATE TABLE IF NOT EXISTS blueprint_comments (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  item_id     TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
  author_id   TEXT,
  author_type TEXT NOT NULL DEFAULT 'user',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_comments_item ON blueprint_comments (item_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_comments_tenant ON blueprint_comments (tenant_id, created_at);

ALTER TABLE blueprint_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_comments
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Blueprint Activity (audit trail for blueprint items)
-- ============================================================
CREATE TABLE IF NOT EXISTS blueprint_activity (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  item_id     TEXT NOT NULL REFERENCES blueprint_items(id) ON DELETE CASCADE,
  actor_id    TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'user',
  action      TEXT NOT NULL,
  changes     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_activity_item ON blueprint_activity (item_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_activity_tenant ON blueprint_activity (tenant_id, created_at);

ALTER TABLE blueprint_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON blueprint_activity
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- Outbox Events (transactional outbox pattern)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  event_type      TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  payload         JSONB NOT NULL,
  trace_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_dead_letter ON outbox_events (created_at) WHERE status = 'dead_letter';
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox_events (tenant_id);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = current_setting('app.tenant_id'))
  WITH CHECK (tenant_id = current_setting('app.tenant_id'));

-- ============================================================
-- updated_at trigger function (shared across all tables)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_blueprint_items_updated_at BEFORE UPDATE ON blueprint_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_blueprint_tags_updated_at BEFORE UPDATE ON blueprint_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_blueprint_comments_updated_at BEFORE UPDATE ON blueprint_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
