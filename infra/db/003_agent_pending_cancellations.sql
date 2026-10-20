-- Apenas controle de confirmações pendentes, sem dados de clientes nem memória geral.
CREATE TABLE IF NOT EXISTS public.agent_pending_cancellations (
    session_key VARCHAR(256) PRIMARY KEY,
    order_id VARCHAR(32) NOT NULL
        CHECK (order_id ~ '^PED-[0-9]{4}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_pending_expires
    ON public.agent_pending_cancellations (expires_at);

ALTER TABLE public.agent_pending_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.agent_pending_cancellations
    FROM PUBLIC, anon, authenticated;
