-- Pendencia de consentimento para encaminhamento HUMANO SIMULADO.
-- Somente fingerprint HMAC da sessao, sem numero Telegram, pedido ou texto da conversa.
CREATE TABLE IF NOT EXISTS public.agent_pending_handoffs (
    session_hash CHAR(64) PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_pending_handoff_expires
    ON public.agent_pending_handoffs (expires_at);

ALTER TABLE public.agent_pending_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.agent_pending_handoffs
    FROM PUBLIC, anon, authenticated;
