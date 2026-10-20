/** Somente campos classificados como seguros. Nao registrar ID, mensagem, prompt ou segredo. */
type Outcome = "ok" | "not_found" | "unavailable" | "invalid_id" | "invalid_response";
type EventMetadata = Readonly<{
  status?: number;
  durationMs?: number;
  outcome?: Outcome;
  resource?: "product" | "user";
}>;

export function logIntegrationEvent(
  event: "order_api.lookup" | "fake_store.request" | "fake_store.validation_failed",
  severity: "INFO" | "WARNING" | "ERROR",
  metadata: EventMetadata
): void {
  console.log(JSON.stringify({
    severity,
    level: severity.toLowerCase(),
    service: "agent-service",
    event,
    ...(metadata.status === undefined ? {} : { status: metadata.status }),
    ...(metadata.durationMs === undefined ? {} : { durationMs: metadata.durationMs }),
    ...(metadata.outcome === undefined ? {} : { outcome: metadata.outcome }),
    ...(metadata.resource === undefined ? {} : { resource: metadata.resource })
  }));
}
