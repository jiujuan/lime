import crypto from "node:crypto";

export function isProductionWebhookUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return false;
    const host = String(url.hostname || "").trim().toLowerCase();
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
}

export function productionWebhookTargetHash(value) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(String(value ?? "").trim())
    .digest("hex")}`;
}

export function buildProductionWebhookPayload(input = {}) {
  return {
    action: String(input.action || "deliver").trim(),
    connectorId: String(input.connector || "webhook").trim(),
    deliveryRef: String(input.deliveryRef || "").trim() || null,
    inputPreview: input.inputPreview && typeof input.inputPreview === "object"
      ? input.inputPreview
      : {},
    mutationId: String(input.mutationId || "").trim() || null,
    outboxRef: String(input.outboxRef || "").trim() || null,
    source: "plugin_connector_production_webhook_delivery_adapter",
  };
}

export function buildProductionWebhookEvidence(input = {}) {
  const httpStatus = Number(input.httpStatus || 0);
  const delivered = httpStatus >= 200 && httpStatus < 300;
  return {
    schemaVersion: 1,
    status: delivered ? "delivered_to_production_platform" : "production_delivery_failed",
    connector: String(input.connector || "webhook").trim(),
    action: String(input.action || "deliver").trim(),
    mutationId: String(input.mutationId || "").trim() || null,
    outboxRef: String(input.outboxRef || "").trim() || null,
    deliveryRef: String(input.deliveryRef || "").trim() || null,
    productionDelivery: {
      status: delivered ? "production_platform_delivered" : "production_platform_delivery_failed",
      proofLevel: "production_connector_delivery_adapter",
      productionPlatformDelivered: delivered,
      nextRequired: delivered
        ? "production_connector_delivery_complete"
        : "production_connector_delivery_retry",
      targetHash: productionWebhookTargetHash(input.targetUrl),
      targetExposed: false,
      credentialMaterialExposed: false,
      tokenExposed: false,
      httpStatus,
      deliveredAt: input.deliveredAt || new Date().toISOString(),
    },
    note:
      "This evidence intentionally omits webhook URL, token, credential material, and response body.",
  };
}

export function buildProductionWebhookDryRun(input = {}) {
  return {
    schemaVersion: 1,
    status: "blocked",
    ready: false,
    sendRequested: false,
    connector: String(input.connector || "webhook").trim(),
    action: String(input.action || "deliver").trim(),
    productionDelivery: {
      status: "send_not_requested",
      proofLevel: "production_connector_delivery_adapter",
      productionPlatformDelivered: false,
      nextRequired: "operator_confirm_send",
      targetHash: productionWebhookTargetHash(input.targetUrl),
      targetExposed: false,
      credentialMaterialExposed: false,
      tokenExposed: false,
    },
    payloadPreview: buildProductionWebhookPayload(input),
    note:
      "Dry-run only. Re-run with --send after confirming the target is a production webhook secret source.",
  };
}

export function productionPreflightReadyForConnector(preflight, connector = "webhook") {
  const expectedConnector = String(connector || "webhook").trim().toLowerCase();
  const preflightConnector = String(preflight?.connector || "all").trim().toLowerCase();
  const connectorMatches = preflightConnector === "all" || preflightConnector === expectedConnector;
  return (
    connectorMatches &&
    preflight?.status === "ready" &&
    preflight?.ready === true &&
    preflight?.productionPlatformDeliveryReady === true &&
    (preflight?.missingSecrets?.length || 0) === 0
  );
}
