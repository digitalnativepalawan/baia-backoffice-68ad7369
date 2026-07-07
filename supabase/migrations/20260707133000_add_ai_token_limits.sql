ALTER TABLE public.ai_assistant_config
  ADD COLUMN IF NOT EXISTS admin_max_tokens INTEGER NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS guest_max_tokens INTEGER NOT NULL DEFAULT 500;

ALTER TABLE public.ai_assistant_config
  DROP CONSTRAINT IF EXISTS ai_assistant_config_admin_max_tokens_check,
  DROP CONSTRAINT IF EXISTS ai_assistant_config_guest_max_tokens_check;

ALTER TABLE public.ai_assistant_config
  ADD CONSTRAINT ai_assistant_config_admin_max_tokens_check
    CHECK (admin_max_tokens BETWEEN 100 AND 4000),
  ADD CONSTRAINT ai_assistant_config_guest_max_tokens_check
    CHECK (guest_max_tokens BETWEEN 100 AND 1500);

UPDATE public.ai_assistant_config
SET admin_max_tokens = COALESCE(admin_max_tokens, 1500),
    guest_max_tokens = COALESCE(guest_max_tokens, 500)
WHERE id = 'default';
