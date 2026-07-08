import {
  isRecord,
  readString,
} from "./capabilityDispatcherRecord";

const TOOL_INTENT_KEYS = new Set([
  "action",
  "artifactId",
  "command",
  "connectorId",
  "cwdRef",
  "depth",
  "format",
  "fullPage",
  "input",
  "limit",
  "operation",
  "options",
  "prompt",
  "quality",
  "query",
  "ref",
  "reason",
  "runId",
  "selector",
  "serverId",
  "sessionId",
  "size",
  "style",
  "text",
  "tool",
  "url",
  "voice",
]);

const EXECUTION_SECRET_KEY_PATTERN =
  /(?:secret|token|api[_-]?key|provider[_-]?key|password|credential|authorization|oauth|client[_-]?secret)/i;
const EXECUTION_EVIDENCE_KEY_PATTERN =
  /(?:evidence[_-]?(?:id|ref)?|artifact[_-]?evidence)/i;
const EXECUTION_LOCAL_PATH_KEY_PATTERN =
  /(?:absolute[_-]?path|local[_-]?path|workspace[_-]?root|project[_-]?root|file[_-]?path|directory|dir|cwd|path)$/i;

export function readToolIntent(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const intent = Object.fromEntries(
    Object.entries(input).filter(([key]) => TOOL_INTENT_KEYS.has(key)),
  );
  return sanitizeExecutionRequestInput(intent) as Record<string, unknown>;
}

function isSafeConnectorRuntimeFactValue(
  key: string | undefined,
  value: unknown,
): boolean {
  if (!key) {
    return false;
  }
  switch (key) {
    case "authorizationStatus":
    case "authorization_status":
      return (
        typeof value === "string" &&
        ["authorized", "connected", "observed", "ready"].includes(
          value.trim().toLowerCase(),
        )
      );
    case "secretBinding":
    case "secret_binding":
      return value === "host_managed";
    case "tokenExposed":
    case "token_exposed":
      return value === false;
    case "credentialMaterialExposed":
    case "credential_material_exposed":
      return value === false;
    default:
      return false;
  }
}

function sanitizeConnectorSecretDeliveryFact(
  value: Record<string, unknown>,
  options: { exposeSecretLeaseRef?: boolean } = {},
): Record<string, unknown> | string {
  const sanitized: Record<string, unknown> = {};
  const status = readString(value.status);
  if (
    status &&
    ["ready", "pending", "available", "observed", "lease_observed"].includes(
      status.toLowerCase(),
    )
  ) {
    sanitized.status = status;
  }
  if (value.binding === "host_managed") {
    sanitized.binding = "host_managed";
  }
  if (value.source === "host_managed_secret_delivery_fact") {
    sanitized.source = "host_managed_secret_delivery_fact";
  }
  if (value.target === "cloud_overlay_worker") {
    sanitized.target = "cloud_overlay_worker";
  }
  const leaseRef = readString(value.leaseRef) ?? readString(value.lease_ref);
  if (leaseRef?.startsWith("secret-lease://connector/")) {
    sanitized.leaseObserved = true;
    sanitized.leaseRefExposed = false;
    sanitized.leaseHandleStatus = "host_managed";
    if (options.exposeSecretLeaseRef) {
      sanitized.leaseRef = leaseRef;
    }
  } else if (value.leaseObserved === true || value.lease_observed === true) {
    sanitized.leaseObserved = true;
    sanitized.leaseRefExposed = false;
    sanitized.leaseHandleStatus = "host_managed";
  }
  if (value.leaseRefExposed === false || value.lease_ref_exposed === false) {
    sanitized.leaseRefExposed = false;
  }
  const leaseHandleStatus =
    readString(value.leaseHandleStatus) ??
    readString(value.lease_handle_status);
  if (leaseHandleStatus === "host_managed") {
    sanitized.leaseHandleStatus = "host_managed";
  }
  const expiresAt = readString(value.expiresAt) ?? readString(value.expires_at);
  if (expiresAt) {
    sanitized.expiresAt = expiresAt;
  }
  if (value.credentialMaterialExposed === false) {
    sanitized.credentialMaterialExposed = false;
  }
  if (value.credential_material_exposed === false) {
    sanitized.credential_material_exposed = false;
  }
  if (value.tokenExposed === false) {
    sanitized.tokenExposed = false;
  }
  if (value.token_exposed === false) {
    sanitized.token_exposed = false;
  }
  return Object.keys(sanitized).length > 0
    ? sanitized
    : "[redacted:host_managed_secret]";
}

function isAbsoluteLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\") ||
    value.startsWith("file:///")
  );
}

export function sanitizeExecutionRequestInput(
  value: unknown,
  key?: string,
  depth = 0,
  options: { exposeSecretLeaseRef?: boolean } = {},
): unknown {
  if (isSafeConnectorRuntimeFactValue(key, value)) {
    return value;
  }
  if (
    key &&
    /^(?:secretDelivery|secret_delivery)$/i.test(key) &&
    isRecord(value)
  ) {
    return sanitizeConnectorSecretDeliveryFact(value, options);
  }
  if (key && EXECUTION_SECRET_KEY_PATTERN.test(key)) {
    return "[redacted:host_managed_secret]";
  }
  if (key && EXECUTION_EVIDENCE_KEY_PATTERN.test(key)) {
    return "[redacted:host_owned_evidence]";
  }
  if (
    key &&
    typeof value === "string" &&
    EXECUTION_LOCAL_PATH_KEY_PATTERN.test(key) &&
    isAbsoluteLocalPath(value.trim())
  ) {
    return "[redacted:absolute_local_path]";
  }
  if (depth >= 8) {
    return "[redacted:depth_limit]";
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeExecutionRequestInput(item, key, depth + 1, options),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        sanitizeExecutionRequestInput(itemValue, itemKey, depth + 1, options),
      ]),
    );
  }
  return value;
}
