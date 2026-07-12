import type {
  AgentRuntimeClient,
  AgentSessionActionRespondParams,
  AgentSessionReadResponse,
  AgentSessionTurnStartParams,
  StructuredOutputContract,
} from "@limecloud/agent-runtime-client";

import type {
  PluginRuntimeStartTaskRequest,
  PluginRuntimeSubmitHostResponseRequest,
} from "@/lib/api/pluginRuntime";
import type { PluginRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export type { PluginRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

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
      return {
        appId: request.appId,
        entryKey: request.entryKey,
        taskId,
        traceId: `plugin-trace-${taskId}`,
        taskKind: request.taskKind,
        sessionId: turn.sessionId || sessionId,
        turnId: turn.turnId,
        eventName,
        status: "accepted",
        submittedAt: turn.startedAt ?? now(),
      };
    },
    async getTask(request) {
      const response = await runtimeClient.readThread({
        sessionId: request.sessionId,
      });
      return {
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
        status: "thread_read_available",
        taskStatus: sessionStatusToPluginTaskStatus(
          response.result.session.status,
        ),
        taskEvents: [],
        threadRead: readThreadReadPayload(response.result),
      };
    },
    async cancelTask(request) {
      const turnId =
        normalizeString(request.turnId) ??
        activeAgentSessionTurnId(
          (await runtimeClient.readThread({ sessionId: request.sessionId }))
            .result,
        );
      if (!turnId) {
        return {
          appId: request.appId,
          taskId: request.taskId,
          sessionId: request.sessionId,
          cancelled: false,
          status: "not_running",
        };
      }
      await runtimeClient.cancelTurn({
        sessionId: request.sessionId,
        turnId,
      });
      return {
        appId: request.appId,
        taskId: request.taskId,
        sessionId: request.sessionId,
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

function sessionStatusToPluginTaskStatus(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "waitingAction":
      return "blocked";
    case "idle":
      return "idle";
    case "running":
      return "running";
    default:
      return "thread_read_available";
  }
}

function activeAgentSessionTurnId(
  response: AgentSessionReadResponse,
): string | undefined {
  for (let index = response.turns.length - 1; index >= 0; index -= 1) {
    const turn = response.turns[index];
    if (
      turn &&
      (turn.status === "accepted" ||
        turn.status === "queued" ||
        turn.status === "running" ||
        turn.status === "waitingAction")
    ) {
      return turn.turnId;
    }
  }
  return undefined;
}

function sessionReadToLegacy(
  response: AgentSessionReadResponse,
): Record<string, unknown> {
  return {
    id: response.session.sessionId,
    thread_id: response.session.threadId,
    name: response.session.sessionId,
    created_at: timestampMillis(response.session.createdAt),
    updated_at: timestampMillis(response.session.updatedAt),
    model: undefined,
    workspace_id: response.session.workspaceId,
    messages: [],
    turns: response.turns,
    items: [],
    queued_turns: [],
    thread_read: threadReadFromAgentSessionRead(response),
    todo_items: [],
    child_subagent_sessions: [],
  };
}

function readThreadReadPayload(response: AgentSessionReadResponse): unknown {
  return (
    threadReadFromAgentSessionRead(response) ??
    response.detail ??
    sessionReadToLegacy(response)
  );
}

function threadReadFromAgentSessionRead(
  response: AgentSessionReadResponse,
): Record<string, unknown> | null {
  const detail = isRecord(response.detail) ? response.detail : null;
  const threadRead =
    (isRecord(detail?.thread_read) && detail.thread_read) ||
    (isRecord(detail?.threadRead) && detail.threadRead) ||
    null;
  return threadRead;
}

function timestampMillis(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
