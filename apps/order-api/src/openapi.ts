const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/ApiError" } }
  }
});

const orderIdParameter = {
  name: "id", in: "path", required: true,
  schema: { type: "string", pattern: "^PED-[0-9]{4}$", example: "PED-1001" }
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Contato Seguro - Order API", version: "0.1.0",
    description: "Consulta e cancelamento de pedidos de demonstracao."
  },
  components: {
    securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } },
    schemas: {
      ApiError: {
        type: "object",
        properties: { code: { type: "string" }, message: { type: "string" } },
        required: ["code"]
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["processing", "shipped", "cancelled"] },
          items: {
            type: "array",
            items: { type: "object", properties: {
              productId: { type: "integer" }, quantity: { type: "integer" }
            } }
          }
        },
        required: ["id", "status", "items"]
      },
      CancellationResult: {
        type: "object",
        properties: {
          success: { type: "boolean" }, orderId: { type: "string" },
          status: { type: "string", enum: ["cancelled"] }
        },
        required: ["success", "orderId", "status"]
      }
    }
  },
  paths: {
    "/health": {
      get: { summary: "Verificar disponibilidade", responses: {
        "200": { description: "Serviço disponível" }
      } }
    },
    "/orders/{id}": {
      get: {
        summary: "Consultar pedido", security: [{ BearerAuth: [] }],
        parameters: [orderIdParameter],
        responses: {
          "200": { description: "Pedido encontrado", content: {
            "application/json": { schema: { $ref: "#/components/schemas/Order" } }
          } },
          "400": errorResponse("Identificador inválido"),
          "401": errorResponse("Não autorizado"),
          "404": errorResponse("Pedido não encontrado"),
          "500": errorResponse("Erro técnico")
        }
      }
    },
    "/orders/{id}/cancel": {
      post: {
        summary: "Cancelar pedido após confirmação explícita",
        description:
          "Somente pedidos em processamento. Requer token Bearer e prova HMAC " +
          "temporária gerada pelo Agent Service após confirmação do cliente. " +
          "O cabeçalho X-Cancel-Confirmation não deve ser apresentado ao usuário final. " +
          "Ambiente demonstrativo: não utilizar com clientes reais.",
        security: [{ BearerAuth: [] }],
        parameters: [
          orderIdParameter,
          {
            name: "X-Cancel-Confirmation",
            in: "header",
            required: true,
            description:
              "Prova assinada pelo Agent Service apos " +
              "confirmacao explicita do cliente. Uso interno.",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { description: "Cancelamento realizado", content: {
            "application/json": { schema: { $ref: "#/components/schemas/CancellationResult" } }
          } },
          "400": errorResponse("Identificador inválido"),
          "401": errorResponse("Não autorizado"),
          "403": errorResponse("Confirmação ausente, inválida ou expirada"),
          "404": errorResponse("Pedido não encontrado"),
          "409": errorResponse("Pedido não cancelável"),
          "500": errorResponse("Erro técnico")
        }
      }
    }
  }
};
