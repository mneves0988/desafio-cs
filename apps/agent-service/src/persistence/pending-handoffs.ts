import { createHmac } from "node:crypto";
import type { Pool } from "pg";

export type HandoffStage = "reason" | "acceptance";
export type HandoffCategory = "delivery" | "order" | "product" | "payment" | "cancellation" | "other";

export interface PendingHandoffStore {
  get(sessionKey: string): Promise<HandoffStage | null>;
  put(sessionKey: string, stage: HandoffStage): Promise<void>;
  claim(sessionKey: string, stage: HandoffStage): Promise<boolean>;
  clear(sessionKey: string): Promise<void>;
  record(sessionKey: string, category: HandoffCategory): Promise<void>;
}

/**
 * Apenas a impressao HMAC da sessao e uma categoria ampla vao ao banco.
 * Nenhuma mensagem, pedido, ID de Telegram ou identidade pessoal e armazenada.
 */
export class PostgresPendingHandoffStore implements PendingHandoffStore {
  constructor(private readonly pool: Pool, private readonly secret: string) {
    if (secret.length < 32) throw new Error("CANCEL_CONFIRMATION_SECRET must have at least 32 characters");
  }

  private fingerprint(sessionKey: string): string {
    return createHmac("sha256", this.secret)
      .update("handoff-session-v1\n")
      .update(sessionKey)
      .digest("hex");
  }

  async get(sessionKey: string): Promise<HandoffStage | null> {
    const result = await this.pool.query<{ stage: HandoffStage }>(
      `SELECT stage FROM public.agent_pending_handoffs
       WHERE session_hash = $1 AND expires_at > NOW()`,
      [this.fingerprint(sessionKey)]
    );
    return result.rows[0]?.stage ?? null;
  }

  async put(sessionKey: string, stage: HandoffStage): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.agent_pending_handoffs (session_hash, stage, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (session_hash) DO UPDATE
         SET stage = EXCLUDED.stage, expires_at = EXCLUDED.expires_at`,
      [this.fingerprint(sessionKey), stage]
    );
  }

  /** Uma mesma pendencia so pode ser consumida uma vez. */
  async claim(sessionKey: string, stage: HandoffStage): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM public.agent_pending_handoffs
       WHERE session_hash = $1 AND stage = $2 AND expires_at > NOW()
       RETURNING session_hash`,
      [this.fingerprint(sessionKey), stage]
    );
    return result.rows.length === 1;
  }

  async clear(sessionKey: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.agent_pending_handoffs WHERE session_hash = $1`,
      [this.fingerprint(sessionKey)]
    );
  }

  /** Fila interna da demo. Sem consumer, CRM, notificacao ou atendente associado. */
  async record(sessionKey: string, category: HandoffCategory): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.agent_handoff_requests (session_hash, reason_category, status)
       VALUES ($1, $2, 'pending_demo')
       ON CONFLICT (session_hash) DO UPDATE
         SET reason_category = EXCLUDED.reason_category,
             status = 'pending_demo', updated_at = NOW()`,
      [this.fingerprint(sessionKey), category]
    );
  }
}
