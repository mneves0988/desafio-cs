-- Memoria contextual minima, somente referencias de recursos realmente consultados.
-- Nao armazena historico bruto, texto de mensagens nem dados pessoais.
CREATE TABLE IF NOT EXISTS public.agent_session_context (
    session_key VARCHAR(256) NOT NULL,
    context_kind VARCHAR(16) NOT NULL
        CHECK (context_kind IN ('order', 'product')),
    reference_id VARCHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_key, context_kind),
    CONSTRAINT valid_context_reference CHECK (
        (context_kind = 'order' AND reference_id ~ '^PED-[0-9]{4}$')
        OR
        (context_kind = 'product' AND reference_id ~ '^[1-9][0-9]*$')
    )
);

CREATE INDEX IF NOT EXISTS idx_agent_context_expires
    ON public.agent_session_context (expires_at);

ALTER TABLE public.agent_session_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.agent_session_context
    FROM PUBLIC, anon, authenticated;
