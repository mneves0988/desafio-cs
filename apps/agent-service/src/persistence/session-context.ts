import type { Pool } from "pg";

export type ContextKind = "order" | "product";

export interface SessionContextStore {
  get(sessionKey: string, kind: ContextKind): Promise<string | null>;
  save(sessionKey: string, kind: ContextKind, referenceId: string): Promise<void>;
  clear(sessionKey: string, kind: ContextKind): Promise<void>;
}

/** Referencias confirmadas, separadas por canal e por sessao. Sem texto bruto. */
export class PostgresSessionContextStore implements SessionContextStore {
  constructor(private readonly pool: Pool) {}

  async get(sessionKey: string, kind: ContextKind): Promise<string | null> {
    const result = await this.pool.query<{ reference_id: string }>(
      `SELECT reference_id FROM public.agent_session_context
       WHERE session_key = $1 AND context_kind = $2 AND expires_at > NOW()`,
      [sessionKey, kind]
    );
    return result.rows[0]?.reference_id ?? null;
  }

  async save(sessionKey: string, kind: ContextKind, referenceId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.agent_session_context
       (session_key, context_kind, reference_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
       ON CONFLICT (session_key, context_kind) DO UPDATE
       SET reference_id = EXCLUDED.reference_id,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()`,
      [sessionKey, kind, referenceId]
    );
  }

  async clear(sessionKey: string, kind: ContextKind): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.agent_session_context
       WHERE session_key = $1 AND context_kind = $2`,
      [sessionKey, kind]
    );
  }
}
