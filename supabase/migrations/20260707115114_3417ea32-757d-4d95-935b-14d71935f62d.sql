CREATE TABLE IF NOT EXISTS public.ai_assistant_config (
  id                 TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  active_provider    TEXT NOT NULL DEFAULT 'openrouter',
  primary_model      TEXT NOT NULL DEFAULT 'anthropic/claude-haiku-4-5',
  openrouter_api_key TEXT,
  fallback_api_key   TEXT,
  fallback_base_url  TEXT,
  fallback_model     TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         TEXT,
  CONSTRAINT ai_assistant_config_singleton CHECK (id = 'default')
);

GRANT ALL ON public.ai_assistant_config TO service_role;
ALTER TABLE public.ai_assistant_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
  id         UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT NOT NULL DEFAULT 'general',
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  keywords   TEXT DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

GRANT ALL ON public.ai_knowledge_base TO service_role;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_assistant_config (id, openrouter_api_key)
SELECT 'default', (SELECT key_value FROM public.ai_integration_settings WHERE key_name = 'openrouter_api_key' LIMIT 1)
ON CONFLICT (id) DO NOTHING;