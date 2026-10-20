/** Allowlist de campos de observabilidade: nunca passar identificadores, texto ou segredos. */
type EventMetadata = Readonly<{
  status?: number;
  durationMs?: number;
}>;

export function logOrderEvent(
  event: "order.lookup" | "order.cancel",
  severity: "INFO" | "WARNING" | "ERROR",
  metadata: EventMetadata
): void {
  console.log(JSON.stringify({
    severity,
    level: severity.toLowerCase(),
    service: "order-api",
    event,
    ...(metadata.status === undefined ? {} : { status: metadata.status }),
    ...(metadata.durationMs === undefined ? {} : { durationMs: metadata.durationMs })
  }));
}
