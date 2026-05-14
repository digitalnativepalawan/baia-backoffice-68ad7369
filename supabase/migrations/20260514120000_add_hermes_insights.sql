
-- Hermes Insights: Proactive alerts and recommendations for admins
CREATE TABLE IF NOT EXISTS hermes_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'alert', 'recommendation', 'forecast'
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('low','medium','high','critical')),
  action_url TEXT,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hermes_insights_created_at ON hermes_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hermes_insights_dismissed ON hermes_insights(dismissed);

-- Conversation memory (future)
CREATE TABLE IF NOT EXISTS hermes_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type TEXT NOT NULL,
  user_id TEXT,
  session_id UUID,
  messages JSONB NOT NULL DEFAULT '[]',
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hermes_conversations_user_type ON hermes_conversations(user_type, created_at DESC);
