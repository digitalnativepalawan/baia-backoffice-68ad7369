CREATE TABLE public.ai_integration_settings (
  key_name   TEXT NOT NULL PRIMARY KEY,
  key_value  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE public.ai_integration_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: default-deny for anon/authenticated roles.
-- The service role (used by Edge Functions) bypasses RLS entirely.