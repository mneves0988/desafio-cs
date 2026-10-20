import express, { type ErrorRequestHandler } from "express";
import type { OrderRepository } from "./orders.js";
import { verifyCancellationProof } from "./confirmation-proof.js";
import { logOrderEvent } from "./observability/events.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";

const validOrderId = /^PED-[0-9]{4}$/;

export function createApp(
  repository: OrderRepository,
  tokenOwners: ReadonlyMap<string, number>,
  confirmationSecret: string
) {
  if (confirmationSecret.length < 32) {
    throw new Error("CANCEL_CONFIRMATION_SECRET must have at least 32 characters");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "order-api" });
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use("/orders", (req, res, next) => {
    // O listener registra somente tipo de operacao, status HTTP e tempo.
    // Nunca registrar URL, IDs, headers, body ou token Bearer.
    const event = req.method === "GET"
      ? "order.lookup"
      : req.method === "POST" && req.path.endsWith("/cancel")
        ? "order.cancel"
        : null;
    if (event) {
      const startedAt = Date.now();
      res.once("finish", () => {
        const status = res.statusCode;
        logOrderEvent(event,
          status >= 500 ? "ERROR" : status >= 400 ? "WARNING" : "INFO",
          { status, durationMs: Date.now() - startedAt }
        );
      });
    }

    const authorization = req.header("authorization");
    const match = /^Bearer (.+)$/i.exec(authorization ?? "");
    const userId = match ? tokenOwners.get(match[1]) : undefined;

    if (!userId) {
      res.status(401).json({
        code: "UNAUTHORIZED", message: "Autenticação necessária."
      });
      return;
    }

    res.locals.userId = userId;
    next();
  });

  app.get("/orders/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!validOrderId.test(id)) {
      res.status(400).json({ code: "INVALID_ORDER_ID" });
      return;
    }

    const order = await repository.findOwned(id, res.locals.userId);
    if (!order) {
      res.status(404).json({ code: "ORDER_NOT_FOUND" });
      return;
    }

    const { userId: _owner, ...publicOrder } = order;
    res.json(publicOrder);
  });

  app.post("/orders/:id/cancel", async (req, res) => {
    const id = String(req.params.id);
    if (!validOrderId.test(id)) {
      res.status(400).json({ code: "INVALID_ORDER_ID" });
      return;
    }

    // Separate the authority to read an order from authority to cancel it.
    // The Agent Service creates this signed proof ONLY after a pending
    // confirmation was atomically claimed. Never accept a client-supplied ID
    // or a plain 'confirmed=true' flag as evidence of consent.
    if (!verifyCancellationProof(id, req.header("x-cancel-confirmation") ?? undefined, confirmationSecret)) {
      res.status(403).json({ code: "CONFIRMATION_REQUIRED" });
      return;
    }

    const result = await repository.cancelIfProcessing(id, res.locals.userId);
    if (result.outcome === "not_found") {
      res.status(404).json({ code: "ORDER_NOT_FOUND" });
      return;
    }
    if (result.outcome === "not_cancelable") {
      res.status(409).json({ code: "ORDER_NOT_CANCELABLE" });
      return;
    }

    res.json({
      success: true,
      orderId: result.order.id,
      status: result.order.status
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(JSON.stringify({
      level: "error", event: "http.error",
      errorType: error instanceof Error ? error.name : "UnknownError"
    }));
    res.status(500).json({
      code: "INTERNAL_ERROR", message: "Erro técnico ao processar solicitação."
    });
  };
  app.use(errorHandler);

  return app;
}
