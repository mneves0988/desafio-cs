import { describe, it, expect, vi } from "vitest";

import {
  FakeStoreClient,
  FakeStoreError
} from "../src/integrations/fake-store.js";

const product = {
  id: 1,
  title: "Test Product",
  price: 29.90,
  category: "electronics",
  description: "Example product",
  image: "https://example.com/image.jpg"
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("Fake Store API", () => {
  it("01 - Consulta produto válido", async () => {
    const http = vi.fn(async () => jsonResponse(product));

    const client = new FakeStoreClient(http);
    const result = await client.getProduct(1);

    expect(result.id).toBe(1);
    expect(result.title).toBe("Test Product");
    expect(http).toHaveBeenCalledOnce();
  });

  it("02 - Remove campos não utilizados", async () => {
    const client = new FakeStoreClient(
      async () => jsonResponse(product)
    );

    const result = await client.getProduct(1);

    expect(result).not.toHaveProperty("image");
  });

  it("03 - Protege campos sensíveis de usuário", async () => {
    const client = new FakeStoreClient(
      async () => jsonResponse({
        id: 1,
        email: "test@example.com",
        name: {
          firstname: "Test",
          lastname: "User"
        },
        password: "should-not-be-exposed",
        phone: "123456"
      })
    );

    const user = await client.getUser(1);

    expect(user.id).toBe(1);
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("phone");
  });

  it("04 - Trata recurso inexistente", async () => {
    const client = new FakeStoreClient(
      async () => new Response(null, { status: 404 })
    );

    await expect(client.getProduct(999))
      .rejects.toMatchObject({
        code: "NOT_FOUND"
      });
  });

  it("05 - Trata indisponibilidade externa", async () => {
    const client = new FakeStoreClient(
      async () => {
        throw new Error("Network failure");
      }
    );

    await expect(client.getProduct(1))
      .rejects.toMatchObject({
        code: "UPSTREAM_UNAVAILABLE"
      });
  });

  it("06 - Rejeita estrutura inesperada", async () => {
    const client = new FakeStoreClient(
      async () => jsonResponse({
        id: 1,
        invalid: true
      })
    );

    await expect(client.getProduct(1))
      .rejects.toMatchObject({
        code: "INVALID_RESPONSE"
      });
  });

  it("07 - Rejeita identificador inválido", async () => {
    const http = vi.fn(async () => jsonResponse(product));
    const client = new FakeStoreClient(http);

    await expect(client.getProduct(-1))
      .rejects.toThrow(RangeError);

    expect(http).not.toHaveBeenCalled();
  });
});
