export type OrderStatus =
  | "processing"
  | "shipped"
  | "cancelled";

export interface Order {
  id: string;
  userId: number;
  status: OrderStatus;
  items: Array<{
    productId: number;
    quantity: number;
  }>;
}

export type CancelResult =
  | { outcome: "cancelled"; order: Order }
  | { outcome: "not_found" }
  | { outcome: "not_cancelable" };

export interface OrderRepository {
  findOwned(id: string, userId: number): Promise<Order | null>;
  cancelIfProcessing(
    id: string,
    userId: number
  ): Promise<CancelResult>;
}

export class MemoryOrderRepository implements OrderRepository {
  private orders: Map<string, Order>;

  constructor(seed: Order[]) {
    this.orders = new Map(
      seed.map(order => [order.id, structuredClone(order)])
    );
  }

  async findOwned(id: string, userId: number) {
    const order = this.orders.get(id);

    if (!order || order.userId !== userId) {
      return null;
    }

    return structuredClone(order);
  }

  async cancelIfProcessing(
    id: string,
    userId: number
  ): Promise<CancelResult> {
    const order = this.orders.get(id);

    if (!order || order.userId !== userId) {
      return { outcome: "not_found" };
    }

    if (order.status !== "processing") {
      return { outcome: "not_cancelable" };
    }

    const updated: Order = {
      ...order,
      status: "cancelled"
    };

    this.orders.set(id, updated);

    return {
      outcome: "cancelled",
      order: structuredClone(updated)
    };
  }
}

export const demoOrders: Order[] = [
  {
    id: "PED-1001",
    userId: 1,
    status: "processing",
    items: [{ productId: 1, quantity: 2 }]
  },
  {
    id: "PED-1002",
    userId: 1,
    status: "shipped",
    items: [{ productId: 3, quantity: 1 }]
  },
  {
    id: "PED-2001",
    userId: 2,
    status: "processing",
    items: [{ productId: 5, quantity: 1 }]
  }
];
