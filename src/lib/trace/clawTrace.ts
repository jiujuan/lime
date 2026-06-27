export const CLAW_TRACE_SCHEMA_VERSION = 1;

const DEFAULT_MAX_EVENTS = 500;
const MAX_ATTRIBUTE_STRING_LENGTH = 160;

export type ClawTraceCheckpointName =
  | "provider.request.started"
  | "provider.first_event.received"
  | "provider.first_text_delta.received"
  | "provider.failed"
  | "provider.canceled"
  | "renderer.submit"
  | "app_server.turn.received"
  | "app_server.message_delta.emitted"
  | "app_server.turn.terminal"
  | "renderer.event.received"
  | "renderer.text_delta.applied"
  | "renderer.text.flush"
  | "renderer.text.first_paint";

export type ClawTraceAttribute = string | number | boolean | null;

export interface ClawTraceContext {
  traceId?: string | null;
  runId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  workspaceId?: string | null;
}

export interface W3cTraceContextCarrier {
  traceparent: string;
  tracestate: string | null;
  traceId: string;
}

export interface ClawTraceCheckpointInput {
  checkpoint: ClawTraceCheckpointName;
  attributes?: Record<string, unknown> | null;
  context?: ClawTraceContext | null;
  monotonicMs?: number | null;
  wallTimeUnixMs?: number | null;
}

export interface ClawTraceEventEnvelope extends Required<ClawTraceContext> {
  attributes: Record<string, ClawTraceAttribute>;
  checkpoint: ClawTraceCheckpointName;
  monotonicMs: number | null;
  schemaVersion: typeof CLAW_TRACE_SCHEMA_VERSION;
  seq: number;
  wallTimeUnixMs: number;
}

export interface ClawTraceRecorder {
  readonly enabled: boolean;
  clear(): void;
  recordCheckpoint(
    input: ClawTraceCheckpointInput,
  ): ClawTraceEventEnvelope | null;
  snapshot(): readonly ClawTraceEventEnvelope[];
}

export interface CreateClawTraceRecorderOptions {
  enabled?: boolean;
  maxEvents?: number;
  now?: () => number;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isLowercaseHex(value: string): boolean {
  return /^[0-9a-f]+$/.test(value);
}

function isNonZeroHex(value: string): boolean {
  return isLowercaseHex(value) && !/^0+$/.test(value);
}

function randomUuidHex(): string | null {
  const randomUuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : null;
  const hex =
    typeof randomUuid === "string"
      ? randomUuid.replaceAll("-", "").toLowerCase()
      : null;
  return hex && hex.length >= 32 && isLowercaseHex(hex)
    ? hex.slice(0, 32)
    : null;
}

function fallbackRandomHex(length: number): string {
  let value = "";
  while (value.length < length) {
    value += Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  }
  return value.slice(0, length);
}

function randomNonZeroHex(length: number): string {
  const uuidHex = randomUuidHex();
  const candidate =
    uuidHex && length <= uuidHex.length
      ? length === 16 && isNonZeroHex(uuidHex.slice(16, 32))
        ? uuidHex.slice(16, 32)
        : uuidHex.slice(0, length)
      : fallbackRandomHex(length);
  if (isNonZeroHex(candidate)) {
    return candidate;
  }
  return `${"0".repeat(Math.max(0, length - 1))}1`;
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeTraceAttribute(
  value: unknown,
): ClawTraceAttribute | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    return normalized.length > MAX_ATTRIBUTE_STRING_LENGTH
      ? normalized.slice(0, MAX_ATTRIBUTE_STRING_LENGTH)
      : normalized;
  }
  return undefined;
}

export function sanitizeClawTraceAttributes(
  attributes?: Record<string, unknown> | null,
): Record<string, ClawTraceAttribute> {
  if (!attributes) {
    return {};
  }

  const sanitized: Record<string, ClawTraceAttribute> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }
    const sanitizedValue = sanitizeTraceAttribute(value);
    if (sanitizedValue !== undefined) {
      sanitized[normalizedKey] = sanitizedValue;
    }
  }
  return sanitized;
}

export function createClawTraceId(prefix = "trace"): string {
  const normalizedPrefix = prefix.trim() || "trace";
  const randomUuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replaceAll("-", "")
      : null;

  if (randomUuid) {
    return `${normalizedPrefix}_${randomUuid}`;
  }

  return `${normalizedPrefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function normalizeW3cTraceContextCarrier(
  value: unknown,
): W3cTraceContextCarrier | null {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const traceparent =
    typeof record?.traceparent === "string"
      ? normalizeW3cTraceparent(record.traceparent)
      : null;
  if (!traceparent) {
    return null;
  }
  const tracestate =
    typeof record?.tracestate === "string"
      ? normalizeW3cTracestate(record.tracestate)
      : null;
  return {
    traceparent: traceparent.traceparent,
    tracestate,
    traceId: traceparent.traceId,
  };
}

export function createW3cTraceContextCarrier(): W3cTraceContextCarrier {
  const traceId = randomNonZeroHex(32);
  const parentId = randomNonZeroHex(16);
  return {
    traceparent: `00-${traceId}-${parentId}-01`,
    tracestate: null,
    traceId,
  };
}

function normalizeW3cTraceparent(
  value: string,
): Pick<W3cTraceContextCarrier, "traceparent" | "traceId"> | null {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("-");
  if (parts.length !== 4) {
    return null;
  }
  const [version, traceId, parentId, flags] = parts;
  if (
    version !== "00" ||
    traceId.length !== 32 ||
    parentId.length !== 16 ||
    flags.length !== 2 ||
    !isNonZeroHex(traceId) ||
    !isNonZeroHex(parentId) ||
    !isLowercaseHex(flags)
  ) {
    return null;
  }
  return {
    traceparent: `${version}-${traceId}-${parentId}-${flags}`,
    traceId,
  };
}

function normalizeW3cTracestate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) {
    return null;
  }
  return /^[\x20-\x7e]+$/.test(normalized) ? normalized : null;
}

function normalizeClawTraceContext(
  context?: ClawTraceContext | null,
): Required<ClawTraceContext> {
  return {
    traceId: normalizeOptionalString(context?.traceId),
    runId: normalizeOptionalString(context?.runId),
    requestId: normalizeOptionalString(context?.requestId),
    sessionId: normalizeOptionalString(context?.sessionId),
    threadId: normalizeOptionalString(context?.threadId),
    turnId: normalizeOptionalString(context?.turnId),
    workspaceId: normalizeOptionalString(context?.workspaceId),
  };
}

class NoopClawTraceRecorder implements ClawTraceRecorder {
  readonly enabled = false;

  clear(): void {
    return undefined;
  }

  recordCheckpoint(): ClawTraceEventEnvelope | null {
    return null;
  }

  snapshot(): readonly ClawTraceEventEnvelope[] {
    return [];
  }
}

class InMemoryClawTraceRecorder implements ClawTraceRecorder {
  readonly enabled = true;
  #events: ClawTraceEventEnvelope[] = [];
  #seq = 0;

  constructor(
    private readonly context: Required<ClawTraceContext>,
    private readonly options: Required<
      Pick<CreateClawTraceRecorderOptions, "maxEvents" | "now">
    >,
  ) {}

  clear(): void {
    this.#events = [];
    this.#seq = 0;
  }

  recordCheckpoint(
    input: ClawTraceCheckpointInput,
  ): ClawTraceEventEnvelope | null {
    const inputContext = normalizeClawTraceContext(input.context);
    const event: ClawTraceEventEnvelope = {
      ...this.context,
      ...inputContext,
      traceId: inputContext.traceId ?? this.context.traceId,
      runId: inputContext.runId ?? this.context.runId,
      requestId: inputContext.requestId ?? this.context.requestId,
      sessionId: inputContext.sessionId ?? this.context.sessionId,
      threadId: inputContext.threadId ?? this.context.threadId,
      turnId: inputContext.turnId ?? this.context.turnId,
      workspaceId: inputContext.workspaceId ?? this.context.workspaceId,
      attributes: sanitizeClawTraceAttributes(input.attributes),
      checkpoint: input.checkpoint,
      monotonicMs: normalizeFiniteNumber(input.monotonicMs),
      schemaVersion: CLAW_TRACE_SCHEMA_VERSION,
      seq: ++this.#seq,
      wallTimeUnixMs:
        normalizeFiniteNumber(input.wallTimeUnixMs) ?? this.options.now(),
    };

    this.#events.push(event);
    if (this.#events.length > this.options.maxEvents) {
      this.#events.shift();
    }
    return event;
  }

  snapshot(): readonly ClawTraceEventEnvelope[] {
    return [...this.#events];
  }
}

export function createNoopClawTraceRecorder(): ClawTraceRecorder {
  return new NoopClawTraceRecorder();
}

export function createClawTraceRecorder(
  context: ClawTraceContext = {},
  options: CreateClawTraceRecorderOptions = {},
): ClawTraceRecorder {
  if (options.enabled !== true) {
    return createNoopClawTraceRecorder();
  }

  const baseContext = normalizeClawTraceContext({
    ...context,
    traceId: context.traceId ?? createClawTraceId("claw_trace"),
    runId: context.runId ?? createClawTraceId("claw_run"),
  });
  return new InMemoryClawTraceRecorder(baseContext, {
    maxEvents: Math.max(1, Math.floor(options.maxEvents ?? DEFAULT_MAX_EVENTS)),
    now: options.now ?? Date.now,
  });
}
