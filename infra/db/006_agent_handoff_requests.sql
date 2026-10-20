-- Evolucao de handoff: registrar encaminhamento ficticio, sem texto ou PII.
-- Mantem compatibilidade com a migracao 005 existente.
ALTER TABLE public.agent_pending_handoffs
    ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'reason';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_pending_handoffs_stage_check'
  ) THEN
    ALTER TABLE public.agent_pending_handoffs
      ADD CONSTRAINT agent_pending_handoffs_stage_check
      CHECK (stage IN ('reason', 'acceptance'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.agent_handoff_requests (
    session_hash CHAR(64) PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
    reason_category TEXT NOT NULL CHECK (reason_category IN
      ('delivery', 'order', 'product', 'payment', 'cancellation', 'other')),
    status TEXT NOT NULL DEFAULT 'pending_demo' CHECK (status = 'pending_demo'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_handoff_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.agent_handoff_requests
    FROM PUBLIC, anon, authenticated;
