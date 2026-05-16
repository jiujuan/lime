import type {
  AgentAppCapabilityErrorCode,
  AgentAppCapabilityErrorPayload,
} from "../types";

export const LIME_CAPABILITY_ERROR_CODES = [
  "capability_unavailable",
  "readiness_blocked",
  "permission_denied",
  "policy_denied",
  "schema_invalid",
  "source_unverified",
  "secret_required",
  "timeout",
  "cancelled",
  "conflict",
  "upstream_failed",
] as const;

export type LimeCapabilityErrorCode =
  (typeof LIME_CAPABILITY_ERROR_CODES)[number];

export interface LimeCapabilityError {
  code: LimeCapabilityErrorCode;
  message: string;
  appId?: string;
  entryKey?: string;
  capability?: string;
  method?: string;
  requestId?: string;
  traceId?: string;
  causeCode?: string;
  retryable?: boolean;
  details?: unknown;
}

export interface LimeCapabilityErrorContext {
  appId?: string;
  entryKey?: string;
  capability?: string;
  method?: string;
  requestId?: string;
  traceId?: string;
  retryable?: boolean;
  details?: unknown;
}

export interface AgentAppCapabilityErrorInit
  extends AgentAppCapabilityErrorPayload {
  stableCode?: LimeCapabilityErrorCode;
  method?: string;
  requestId?: string;
  traceId?: string;
  retryable?: boolean;
  details?: unknown;
}

const LEGACY_CAPABILITY_ERROR_MAP: Record<
  string,
  LimeCapabilityErrorCode
> = {
  APP_RUNTIME_UNSUPPORTED: "capability_unavailable",
  CAPABILITY_BLOCKED: "capability_unavailable",
  CAPABILITY_NOT_DECLARED: "capability_unavailable",
  ENTRY_NOT_FOUND: "readiness_blocked",
  FEATURE_DISABLED: "capability_unavailable",
  HOST_ACTION_FAILED: "upstream_failed",
  INVALID_CAPABILITY_INPUT: "schema_invalid",
  INVALID_PAYLOAD: "schema_invalid",
  PERMISSION_DENIED: "permission_denied",
  POLICY_DENIED: "policy_denied",
  READINESS_BLOCKED: "readiness_blocked",
  SECRET_REQUIRED: "secret_required",
  SOURCE_UNVERIFIED: "source_unverified",
  STORAGE_KEY_NOT_FOUND: "conflict",
  TASK_NOT_FOUND: "conflict",
  TIMEOUT: "timeout",
  UNTRUSTED_URL: "policy_denied",
  UNSUPPORTED_CAPABILITY: "capability_unavailable",
  UNSUPPORTED_CAPABILITY_METHOD: "capability_unavailable",
  UI_ENTRY_UNSUPPORTED: "capability_unavailable",
  WORKFLOW_POLICY_VIOLATION: "policy_denied",
  WORKFLOW_RUNTIME_DISABLED: "capability_unavailable",
};

export function isLimeCapabilityErrorCode(
  value: unknown,
): value is LimeCapabilityErrorCode {
  return (
    typeof value === "string" &&
    LIME_CAPABILITY_ERROR_CODES.includes(value as LimeCapabilityErrorCode)
  );
}

export function normalizeLimeCapabilityErrorCode(
  code: string | undefined,
): LimeCapabilityErrorCode {
  if (isLimeCapabilityErrorCode(code)) {
    return code;
  }
  if (!code) {
    return "upstream_failed";
  }
  return LEGACY_CAPABILITY_ERROR_MAP[code] ?? "upstream_failed";
}

function readErrorField(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  return (error as Record<string, unknown>)[key];
}

function readStringField(error: unknown, key: string): string | undefined {
  const value = readErrorField(error, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBooleanField(error: unknown, key: string): boolean | undefined {
  const value = readErrorField(error, key);
  return typeof value === "boolean" ? value : undefined;
}

function mergeOptional<T extends object>(
  target: T,
  values: Partial<T>,
): T {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  });
  return target;
}

export class AgentAppCapabilityError extends Error {
  readonly code: AgentAppCapabilityErrorCode;
  readonly stableCode: LimeCapabilityErrorCode;
  readonly appId?: string;
  readonly entryKey?: string;
  readonly capability?: string;
  readonly method?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly retryable?: boolean;
  readonly details?: unknown;

  constructor(payload: AgentAppCapabilityErrorInit) {
    super(payload.message);
    this.name = "AgentAppCapabilityError";
    this.code = payload.code;
    this.stableCode =
      payload.stableCode ?? normalizeLimeCapabilityErrorCode(payload.code);
    this.appId = payload.appId;
    this.entryKey = payload.entryKey;
    this.capability = payload.capability;
    this.method = payload.method;
    this.requestId = payload.requestId;
    this.traceId = payload.traceId;
    this.retryable = payload.retryable;
    this.details = payload.details;
  }

  toStableError(context: LimeCapabilityErrorContext = {}): LimeCapabilityError {
    return mergeOptional<LimeCapabilityError>(
      {
        code: this.stableCode,
        message: this.message,
        causeCode: this.code,
      },
      {
        appId: context.appId ?? this.appId,
        entryKey: context.entryKey ?? this.entryKey,
        capability: context.capability ?? this.capability,
        method: context.method ?? this.method,
        requestId: context.requestId ?? this.requestId,
        traceId: context.traceId ?? this.traceId,
        retryable: context.retryable ?? this.retryable,
        details: context.details ?? this.details,
      },
    );
  }
}

export function toLimeCapabilityError(
  error: unknown,
  context: LimeCapabilityErrorContext = {},
): LimeCapabilityError {
  if (error instanceof AgentAppCapabilityError) {
    return error.toStableError(context);
  }

  const stableCode =
    readStringField(error, "stableCode") ?? readStringField(error, "code");
  const causeCode = readStringField(error, "code");
  const message =
    error instanceof Error
      ? error.message
      : readStringField(error, "message") ?? "Lime capability call failed.";

  return mergeOptional<LimeCapabilityError>(
    {
      code: normalizeLimeCapabilityErrorCode(stableCode),
      message,
    },
    {
      appId: context.appId ?? readStringField(error, "appId"),
      entryKey: context.entryKey ?? readStringField(error, "entryKey"),
      capability: context.capability ?? readStringField(error, "capability"),
      method: context.method ?? readStringField(error, "method"),
      requestId: context.requestId ?? readStringField(error, "requestId"),
      traceId: context.traceId ?? readStringField(error, "traceId"),
      retryable: context.retryable ?? readBooleanField(error, "retryable"),
      causeCode,
      details: context.details ?? readErrorField(error, "details"),
    },
  );
}
