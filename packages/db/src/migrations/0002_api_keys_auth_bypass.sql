-- 0002_api_keys_auth_bypass.sql
-- Remove FORCE ROW LEVEL SECURITY from api_keys so the table owner
-- (ctrlpane_app) can look up keys during authentication before tenant
-- context is established. Regular RLS still applies to non-owner roles.

ALTER TABLE api_keys NO FORCE ROW LEVEL SECURITY;
