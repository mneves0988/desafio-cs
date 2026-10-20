import type { Pool } from "pg";

export interface PendingCancellationStore {
  get(sessionKey: string): Promise<string | null>;
  put(sessionKey: string, orderId: string): Promise<void>;
  claim(sessionKey: string, expectedOrderId: string): Promise<string | null>;
  clear(sessionKey: string): Promise<void>;
}

/** A chave de sessão vem de um canal autenticado, nunca do texto do cliente. */
export class PostgresPendingCancellationStore
  implements PendingCancellationStore {
  constructor(private readonly pool: Pool) {}

  async get(sessionKey: string): Promise<string | null> {
    const result = await this.pool.query<{ order_id: string }>(
      `SELECT order_id FROM public.agent_pending_cancellations
       WHERE session_key = $1 AND expires_at > NOW()`,
      [sessionKey]
    );
    return result.rows[0]?.order_id ?? null;
  }

  async put(sessionKey: string, orderId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.agent_pending_cancellations
       (session_key, order_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (session_key) DO UPDATE
       SET order_id = EXCLUDED.order_id,
           expires_at = EXCLUDED.expires_at,
           created_at = NOW()`,
      [sessionKey, orderId]
    );
  }

  /** DELETE ... RETURNING evita executar duas vezes a mesma confirmação. */
  async claim(sessionKey: string, expectedOrderId: string): Promise<string | null> {
    const result = await this.pool.query<{ order_id: string }>(
      `DELETE FROM public.agent_pending_cancellations
       WHERE session_key = $1 AND order_id = $2 AND expires_at > NOW()
       RETURNING order_id`,
      [sessionKey, expectedOrderId]
    );
    return result.rows[0]?.order_id ?? null;
  }

  async clear(sessionKey: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.agent_pending_cancellations WHERE session_key = $1`,
      [sessionKey]
    );
  }
}
