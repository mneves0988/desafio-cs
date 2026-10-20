import type { Pool, QueryResultRow } from "pg";

import type {
  Order,
  OrderRepository,
  CancelResult
} from "./orders.js";

interface OrderRow extends QueryResultRow {
  id: string;
  user_id: number;
  status: Order["status"];
  items: Order["items"];
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    items: row.items
  };
}

export class PostgresOrderRepository
  implements OrderRepository {

  constructor(private readonly pool: Pool) {}

  async findOwned(
    id: string,
    userId: number
  ): Promise<Order | null> {
    const result = await this.pool.query<OrderRow>(
      `SELECT id, user_id, status, items
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return result.rows[0]
      ? toOrder(result.rows[0])
      : null;
  }

  async cancelIfProcessing(
    id: string,
    userId: number
  ): Promise<CancelResult> {
    const updated = await this.pool.query<OrderRow>(
      `UPDATE orders
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND status = 'processing'
       RETURNING id, user_id, status, items`,
      [id, userId]
    );

    if (updated.rows.length > 0) {
      return {
        outcome: "cancelled",
        order: toOrder(updated.rows[0])
      };
    }

    const existing = await this.pool.query(
      `SELECT status FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (existing.rows.length === 0) {
      return { outcome: "not_found" };
    }

    return { outcome: "not_cancelable" };
  }
}
