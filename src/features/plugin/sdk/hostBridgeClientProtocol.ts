import type {
  LimeCapabilityInvokeRequest,
  LimeCapabilityInvokeResponse,
} from "./capabilityContract";
import { toLimeCapabilityError } from "./capabilityErrors";
import {
  LIME_PLUGIN_BRIDGE_PROTOCOL,
  LIME_PLUGIN_BRIDGE_VERSION,
  type LimePluginBridgeClientMessage,
} from "./hostBridgeClientTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function attachOptional<T extends Record<string, unknown>>(
  target: T,
  values: Record<string, unknown | undefined>,
): T {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  });
  return target;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function unwrapLegacyResponse<T>(
  response: LimeCapabilityInvokeResponse<T>,
): T {
  if (response.ok) {
    return response.value;
  }
  const error = new Error(response.error.message) as Error & {
    code?: string;
    payload?: unknown;
    capability?: string;
    method?: string;
    requestId?: string;
  };
  error.code = response.error.code;
  error.payload = response.error;
  error.capability = response.error.capability;
  error.method = response.error.method;
  error.requestId = response.error.requestId;
  throw error;
}

export function isBridgeMessage(
  value: unknown,
): value is LimePluginBridgeClientMessage {
  return (
    isRecord(value) &&
    value.protocol === LIME_PLUGIN_BRIDGE_PROTOCOL &&
    value.version === LIME_PLUGIN_BRIDGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.appId === "string" &&
    (value.requestId === undefined || typeof value.requestId === "string") &&
    (value.entryKey === undefined || typeof value.entryKey === "string")
  );
}

export function normalizeHostResponsePayload(
  payload: unknown,
  context: {
    appId: string;
    entryKey?: string;
    request: LimeCapabilityInvokeRequest;
  },
): LimeCapabilityInvokeResponse {
  if (isRecord(payload) && payload.ok === false) {
    return {
      ok: false,
      error: toLimeCapabilityError(payload.error ?? payload, {
        appId: context.appId,
        entryKey: context.entryKey,
        capability: context.request.capability,
        method: context.request.method,
        requestId: context.request.requestId,
      }),
    };
  }

  if (isRecord(payload) && payload.ok === true) {
    const value = Object.prototype.hasOwnProperty.call(payload, "value")
      ? payload.value
      : Object.prototype.hasOwnProperty.call(payload, "result")
        ? payload.result
        : undefined;
    return attachOptional<LimeCapabilityInvokeResponse & Record<string, unknown>>(
      {
        ok: true,
        value,
      },
      {
        traceId: readString(payload.traceId),
        evidenceId: readString(payload.evidenceId),
      },
    ) as LimeCapabilityInvokeResponse;
  }

  if (isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return {
      ok: true,
      value: payload.result,
    };
  }

  return {
    ok: true,
    value: payload,
  };
}

export function buildBridgePayload(
  request: LimeCapabilityInvokeRequest,
): Record<string, unknown> {
  return attachOptional<Record<string, unknown>>(
    {
      capability: request.capability,
      method: request.method,
    },
    {
      input: request.args,
      idempotencyKey: request.idempotencyKey,
      expectedSchema: request.expectedSchema,
      provenance: request.provenance,
    },
  );
}
