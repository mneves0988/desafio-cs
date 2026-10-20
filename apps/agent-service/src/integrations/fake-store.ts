import { z } from "zod";
import { logIntegrationEvent } from "../observability/events.js";

const productSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  category: z.string(),
  description: z.string()
});

const userSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  name: z.object({
    firstname: z.string(),
    lastname: z.string()
  })
});

export type StoreProduct = z.infer<typeof productSchema>;
export type StoreUser = z.infer<typeof userSchema>;

export type FakeStoreErrorCode =
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_RESPONSE";

export class FakeStoreError extends Error {
  constructor(public readonly code: FakeStoreErrorCode) {
    super(code);
    this.name = "FakeStoreError";
  }
}

type HttpFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export class FakeStoreClient {
  private readonly baseUrl = "https://fakestoreapi.com";

  constructor(private readonly http: HttpFetch = fetch) {}

  private async request(path: string): Promise<unknown> {
    const startedAt = Date.now();
    const resource = path.startsWith("/products/") ? "product" : "user";
    let status: number | undefined;
    let outcome: "ok" | "not_found" | "unavailable" | "invalid_response" = "unavailable";

    try {
      let response: Response;
      try {
        response = await this.http(`${this.baseUrl}${path}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(3500)
        });
      } catch {
        outcome = "unavailable";
        throw new FakeStoreError("UPSTREAM_UNAVAILABLE");
      }

      status = response.status;
      if (status === 404) {
        outcome = "not_found";
        throw new FakeStoreError("NOT_FOUND");
      }
      if (!response.ok) {
        outcome = "unavailable";
        throw new FakeStoreError("UPSTREAM_UNAVAILABLE");
      }

      try {
        const data: unknown = await response.json();
        if (data === null) {
          outcome = "not_found";
          throw new FakeStoreError("NOT_FOUND");
        }
        outcome = "ok";
        return data;
      } catch (error) {
        if (error instanceof FakeStoreError) throw error;
        outcome = "invalid_response";
        throw new FakeStoreError("INVALID_RESPONSE");
      }
    } finally {
      logIntegrationEvent("fake_store.request", outcome === "ok" ? "INFO" : "WARNING", {
        status, outcome, resource, durationMs: Date.now() - startedAt
      });
    }
  }

  async getProduct(id: number): Promise<StoreProduct> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError("Invalid product ID");
    const data = await this.request(`/products/${id}`);
    if (data === null) throw new FakeStoreError("NOT_FOUND");

    const result = productSchema.safeParse(data);
    if (!result.success || result.data.id !== id) {
      logIntegrationEvent("fake_store.validation_failed", "WARNING", {
        resource: "product", outcome: "invalid_response"
      });
      throw new FakeStoreError("INVALID_RESPONSE");
    }
    return result.data;
  }

  async getUser(id: number): Promise<StoreUser> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError("Invalid user ID");
    const data = await this.request(`/users/${id}`);
    if (data === null) throw new FakeStoreError("NOT_FOUND");

    const result = userSchema.safeParse(data);
    if (!result.success || result.data.id !== id) {
      logIntegrationEvent("fake_store.validation_failed", "WARNING", {
        resource: "user", outcome: "invalid_response"
      });
      throw new FakeStoreError("INVALID_RESPONSE");
    }
    return result.data;
  }
}
