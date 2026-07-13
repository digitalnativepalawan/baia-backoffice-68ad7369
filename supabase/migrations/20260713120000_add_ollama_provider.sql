-- Add Ollama (local) provider support to the AI assistant config.
ALTER TABLE public.ai_assistant_config
  ADD COLUMN IF NOT EXISTS ollama_base_url TEXT,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC NOT NULL DEFAULT 0.2;

-- Align default model to a free OpenRouter model (was a stale hardcoded HAiku).
UPDATE public.ai_assistant_config
  SET primary_model = 'tencent/hy3:free'
  WHERE id = 'default' AND (primary_model IS NULL OR primary_model = 'anthropic/claude-haiku-4-5');
