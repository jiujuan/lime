import type {
  AgentRuntimeClient,
  AgentSessionActionRespondParams,
  AgentSessionTurnStartParams,
  StructuredOutputContract,
} from "@limecloud/agent-runtime-client";

import type {
  PluginRuntimeStartTaskRequest,
  PluginRuntimeSubmitHostResponseRequest,
} from "@/lib/api/pluginRuntime";
import type { PluginRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export type { PluginRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

type CanonicalThreadReadResult = Awaited<
  ReturnType<AgentRuntimeClient["readThread"]>
>["result"];
type CanonicalThread = CanonicalThreadReadResult["thread"];
type CanonicalTurn = NonNullable<CanonicalThread["turns"]>[number];

export interface PluginRuntimeClientApiOptions {
  now?: () => string;
  createId?: (prefix: string) => string;
}

export function createPluginRuntimeCapabilityApiFromClient(
  runtimeClient: Pick<
    AgentRuntimeClient,
    "startTurn" | "readThread" | "cancelTurn" | "respondAction"
  >,
  options: PluginRuntimeClientApiOptions = {},
): PluginRuntimeCapabilityApi {
  const now = options.now ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}-${Date.now()}`);

  return {
    async startTask(request) {
      const sessionId = normalizeString(request.sessionId);
      if (!sessionId) {
        throw new Error(
          "AgentRuntimeClient adapter requires an existing sessionId for Plugin tasks.",
        );
      }
      const taskId =
        normalizeString(request.taskId) ??
        normalizeString(request.turnId) ??
        createId("plugin-task");
      const eventName =
        normalizeString(request.eventName) ??
        `plugin_runtime:${request.appId}:${taskId}`;
      const queueIfBusy = request.queueIfBusy ?? true;
      const queuedTurnId = `plugin-queued-${taskId}`;
      const message = buildPluginRuntimeTaskMessage(request);
      const metadata = {
        ...(request.metadata ?? {}),
        ...(isRecord(request.runtimeRequest?.metadata)
          ? request.runtimeRequest.metadata
          : {}),
      };
      const structuredOutput = structuredOutputContractFromRequest(request.expectedOutput);
      const outputSchema = outputSchemaFromStructuredOutput(
        structuredOutput,
        request.expectedOutput,
      );
      const startParams: AgentSessionTurnStartParams = omitUndefined({
        sessionId,
        turnId: normalizeString(request.turnId),
        input: {
          text: message,
          attachments: [],
        },
        runtimeOptions: omitUndefined({
          stream: true,
          eventName,
          queuedTurnId,
          expectedOutput: request.expectedOutput,
          structuredOutput,
          outputSchema,
          runtimeRequest: mergePluginRuntimeRequest(
            request.runtimeRequest,
            request.workspaceId,
            metadata,
          ),
        }),
        queueIfBusy,
        skipPreSubmitResume: request.skipPreSubmitResume,
      });
      const response = await runtimeClient.startTurn(startParams);
      const turn = response.result.turn;
      const threadId = normalizeString(turn.threadId);
      if (!threadId) {
        throw new Error(
          "agentSession/turn/start did not return a canonical threadId",
        );
      }
      if (normalizeString(turn.sessionId) !== sessionId) {
        throw new Error(
          "agentSession/turn/start returned a sessionId different from the requested session",
        );
      }
      return {
        appId: request.appId,
        entryKey: request.entryKey,
        taskId,
        traceId: `plugin-trace-${taskId}`,
        taskKind: request.taskKind,
        sessionId,
        threadId,
        turnId: turn.turnId,
        eventName,
        status: "accepted",
        submittedAt: turn.startedAt ?? now(),
      };
    },
    async getTask(request) {
      const threadId = normalizeString(request.threadId);
      if (!threadId) {
        throw new Error("Plugin task read requires a canonical threadId");
      }
      const thread = await readCanonicalThread(runtimeClient, threadId);
      return {
        appId: request.appId,
        taskId: request.taskId,
        sessionId: thread.sessionId,
        threadId: thread.threadId,
        status: "thread_read_available",
        taskStatus: threadStatusToPluginTaskStatus(thread),
        taskEvents: [],
        threadRead: thread,
      };
    },
    async cancelTask(request) {
      const threadId = normalizeString(request.threadId);
      if (!threadId) {
        throw new Error("Plugin task cancel requires a canonical threadId");
      }
      const thread = await readCanonicalThread(runtimeClient, threadId);
      const activeTurn = activeThreadTurn(thread);
      const requestedTurnId = normalizeString(request.turnId);
      if (
        !activeTurn ||
        (requestedTurnId && requestedTurnId !== activeTurn.turnId)
      ) {
        return {
          appId: request.appId,
          taskId: request.taskId,
          sessionId: thread.sessionId,
          threadId: thread.threadId,
          cancelled: false,
          status: "not_running",
        };
      }
      const turnId = activeTurn.turnId;
      await runtimeClient.cancelTurn({
        sessionId: thread.sessionId,
        turnId,
      });
      return {
        appId: request.appId,
        taskId: request.taskId,
        sessionId: thread.sessionId,
        threadId: thread.threadId,
        cancelled: true,
        status: "cancelled",
      };
    },
    async submitHostResponse(request) {
      await runtimeClient.respondAction(
        actionRespondParamsFromRuntimeRequest(request.runtimeRequest),
      );
      return {
        appId: request.appId,
        taskId: request.taskId,
        status: "submitted",
      };
    },
  };
}

function mergePluginRuntimeRequest(
  runtimeRequest: PluginRuntimeStartTaskRequest["runtimeRequest"],
  workspaceId: string | undefined,
  metadata: Record<string, unknown>,
): PluginRuntimeStartTaskRequest["runtimeRequest"] {
  return {
    ...runtimeRequest,
    workspaceId: runtimeRequest?.workspaceId ?? workspaceId,
    metadata,
  };
}

function buildPluginRuntimeTaskMessage(
  request: PluginRuntimeStartTaskRequest,
): string {
  const prompt =
    normalizeString(request.prompt) ??
    normalizeString(request.title) ??
    request.taskKind;
  return [
    "[Plugin Runtime Task]",
    `App: ${request.appId}`,
    `Entry: ${request.entryKey ?? "default"}`,
    `TaskKind: ${request.taskKind}`,
    "",
    "Business Prompt:",
    prompt,
    "",
    "Runtime Boundary:",
    "- Complete this App business task through the Lime AgentRuntime main chain.",
    "- Do not ask the user to switch back to generic Chat; request missing context through auditable actions when needed.",
    "",
    "Input JSON:",
    stringifyJson(request.input),
    "",
    "Expected Output JSON:",
    stringifyJson(request.expectedOutput),
  ].join("\n");
}

function actionRespondParamsFromRuntimeRequest(
  request: PluginRuntimeSubmitHostResponseRequest["runtimeRequest"],
): AgentSessionActionRespondParams {
  return omitUndefined({
    sessionId: request.session_id,
    requestId: request.request_id,
    actionType: request.action_type,
    confirmed: request.confirmed,
    response: request.response,
    userData: request.user_data,
    metadata: request.metadata,
    eventName: request.event_name,
    actionScope: request.action_scope
      ? omitUndefined({
          sessionId: request.action_scope.session_id,
          threadId: request.action_scope.thread_id,
          turnId: request.action_scope.turn_id,
        })
      : undefined,
  });
}

function threadStatusToPluginTaskStatus(thread: CanonicalThread): string {
  // Validate active-turn uniqueness even when status projection only reads the latest turn.
  activeThreadTurn(thread);
  const latestTurn = thread.turns?.at(-1);
  if (latestTurn) {
    switch (latestTurn.status) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "interrupted":
        return "cancelled";
      case "inProgress":
        return latestTurn.approval === "pending" ||
          thread.status.type === "active" &&
            thread.status.activeFlags?.some((flag) =>
              ["waitingOnApproval", "waitingOnUserInput"].includes(flag),
            )
          ? "blocked"
          : "running";
    }
  }
  switch (thread.status.type) {
    case "idle":
      return "idle";
    case "active":
      return "running";
    case "systemError":
      return "failed";
    default:
      return "thread_read_available";
  }
}

function activeThreadTurn(thread: CanonicalThread): CanonicalTurn | undefined {
  const activeTurns = (thread.turns ?? []).filter(
    (turn) => turn.status === "inProgress" && turn.queue?.state !== "queued",
  );
  if (activeTurns.length > 1) {
    throw new Error(
      `Canonical thread ${thread.threadId} has multiple active turns`,
    );
  }
  return activeTurns[0];
}

async function readCanonicalThread(
  runtimeClient: Pick<AgentRuntimeClient, "readThread">,
  threadId: string,
): Promise<CanonicalThread> {
  const response = await runtimeClient.readThread({
    threadId,
    turnsView: "full",
  });
  const thread = response.result.thread;
  if (!thread || typeof thread !== "object") {
    throw new Error(`Canonical thread ${threadId} read returned no thread`);
  }
  if (thread.threadId !== threadId) {
    throw new Error(
      `Canonical thread read returned threadId ${thread.threadId} for ${threadId}`,
    );
  }
  if (thread.turnsView !== "full" || !Array.isArray(thread.turns)) {
    throw new Error(
      `Canonical thread ${threadId} read did not return full turns`,
    );
  }
  if (!normalizeString(thread.sessionId)) {
    throw new Error(`Canonical thread ${threadId} read returned no sessionId`);
  }
  const turnIds = new Set<string>();
  for (const turn of thread.turns) {
    const turnId = normalizeString(turn.turnId);
    if (!turnId || turnIds.has(turnId)) {
      throw new Error(
        `Canonical thread ${threadId} read returned invalid turn identity`,
      );
    }
    if (
      turn.threadId !== thread.threadId ||
      turn.sessionId !== thread.sessionId
    ) {
      throw new Error(
        `Canonical thread ${threadId} read returned mismatched turn identity`,
      );
    }
    turnIds.add(turnId);
  }
  return thread;
}

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function structuredOutputContractFromRequest(
  expectedOutput: unknown,
): StructuredOutputContract | undefined {
  const outputFormat = expectedOutputOutputFormat(expectedOutput);
  if (!outputFormat) {
    return undefined;
  }
  return omitUndefined({
    type:
      readString(outputFormat, "type") ??
      readString(outputFormat, "format") ??
      "json_schema",
    schemaRef:
      readString(outputFormat, "schemaRef") ??
      readString(outputFormat, "schema_ref"),
    schema:
      outputFormat.schema ??
      outputFormat.outputSchema ??
      outputFormat.output_schema,
    maxValidationRetries: readNumber(
      outputFormat,
      "maxValidationRetries",
      "max_validation_retries",
    ),
    failureSubtype:
      readString(outputFormat, "failureSubtype") ??
      readString(outputFormat, "failure_subtype"),
    materializer: outputFormat.materializer,
    metadata: outputFormat.metadata,
  });
}

function outputSchemaFromStructuredOutput(
  structuredOutput: StructuredOutputContract | undefined,
  expectedOutput: unknown,
): unknown {
  if (structuredOutput?.schema !== undefined) {
    return structuredOutput.schema;
  }
  const outputFormat = expectedOutputOutputFormat(expectedOutput);
  return (
    outputFormat?.schema ??
    outputFormat?.outputSchema ??
    outputFormat?.output_schema
  );
}

function expectedOutputOutputFormat(
  expectedOutput: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(expectedOutput)) {
    return undefined;
  }
  const outputFormat =
    recordValue(expectedOutput, "outputFormat") ??
    recordValue(expectedOutput, "output_format");
  if (outputFormat) {
    return outputFormat;
  }
  if (
    expectedOutput.schema !== undefined ||
    expectedOutput.outputSchema !== undefined ||
    expectedOutput.output_schema !== undefined
  ) {
    return expectedOutput;
  }
  return undefined;
}

function recordValue(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const item = value[key];
  return isRecord(item) ? item : undefined;
}

function readNumber(
  value: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "number" && Number.isFinite(item)) {
      return item;
    }
  }
  return undefined;
}

function stringifyJson(value: unknown): string {
  if (value === undefined) {
    return "{}";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
