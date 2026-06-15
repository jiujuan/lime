import type {
  AgentRuntimeClient,
  AgentSessionActionRespondParams,
  AgentSessionReadResponse,
  AgentSessionTurnStartParams,
  StructuredOutputContract,
} from "@limecloud/agent-runtime-client";

import type {
  AgentAppRuntimeStartTaskRequest,
  AgentAppRuntimeSubmitHostResponseRequest,
} from "@/lib/api/agentAppRuntime";
import type { AgentAppRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export type { AgentAppRuntimeCapabilityApi } from "./agentRuntimeCapabilityApi";

export interface AgentAppRuntimeClientApiOptions {
  now?: () => string;
  createId?: (prefix: string) => string;
}

export function createAgentAppRuntimeCapabilityApiFromClient(
  runtimeClient: Pick<
    AgentRuntimeClient,
    "startTurn" | "readThread" | "cancelTurn" | "respondAction"
  >,
  options: AgentAppRuntimeClientApiOptions = {},
): AgentAppRuntimeCapabilityApi {
  const now = options.now ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((prefix: string) => `${prefix}-${Date.now()}`);

  return {
    async startTask(request) {
      const sessionId = normalizeString(request.sessionId);
      if (!sessionId) {
        throw new Error(
          "AgentRuntimeClient adapter requires an existing sessionId for Agent App tasks.",
        );
      }
      const taskId =
        normalizeString(request.taskId) ??
        normalizeString(request.turnId) ??
        createId("agent-app-task");
      const eventName =
        normalizeString(request.eventName) ??
        `agent_app_runtime:${request.appId}:${taskId}`;
      const turnConfig = isRecord(request.turnConfig)
        ? request.turnConfig
        : {};
      const providerPreference =
        normalizeString(request.providerPreference) ??
        readString(turnConfig, "providerPreference") ??
        readString(turnConfig, "provider_preference");
      const modelPreference =
        normalizeString(request.modelPreference) ??
        readString(turnConfig, "modelPreference") ??
        readString(turnConfig, "model_preference");
      const queueIfBusy = request.queueIfBusy ?? true;
      const queuedTurnId = `agent-app-queued-${taskId}`;
      const message = buildAgentAppRuntimeTaskMessage(request);
      const metadata = {
        ...(request.metadata ?? {}),
        ...(isRecord(turnConfig.metadata) ? turnConfig.metadata : {}),
      };
      const structuredOutput = structuredOutputContractFromRequest(
        request.expectedOutput,
        turnConfig,
      );
      const outputSchema = outputSchemaFromStructuredOutput(
        structuredOutput,
        request.expectedOutput,
        turnConfig,
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
          providerPreference,
          modelPreference,
          metadata,
          queuedTurnId,
          expectedOutput: request.expectedOutput,
          structuredOutput,
          outputSchema,
          hostOptions: {
            asterChatRequest: buildAgentAppAsterChatRequest({
              request,
              sessionId,
              taskId,
              turnId: normalizeString(request.turnId),
              eventName,
              message,
              turnConfig,
              providerPreference,
              modelPreference,
              metadata,
              expectedOutput: request.expectedOutput,
              structuredOutput,
              outputSchema,
              queueIfBusy,
              queuedTurnId,
            }),
          },
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
        traceId: `agent-app-trace-${taskId}`,
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
        taskStatus: sessionStatusToAgentAppTaskStatus(
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

function buildAgentAppAsterChatRequest(params: {
  request: AgentAppRuntimeStartTaskRequest;
  sessionId: string;
  taskId: string;
  turnId?: string;
  eventName: string;
  message: string;
  turnConfig: Record<string, unknown>;
  providerPreference?: string;
  modelPreference?: string;
  metadata: Record<string, unknown>;
  expectedOutput?: unknown;
  structuredOutput?: StructuredOutputContract;
  outputSchema?: unknown;
  queueIfBusy: boolean;
  queuedTurnId: string;
}): Record<string, unknown> {
  const { request, turnConfig } = params;
  return {
    message: params.message,
    session_id: params.sessionId,
    event_name: params.eventName,
    images: null,
    provider_config:
      turnConfig.providerConfig ?? turnConfig.provider_config ?? null,
    provider_preference: params.providerPreference,
    model_preference: params.modelPreference,
    reasoning_effort:
      turnConfig.reasoningEffort ?? turnConfig.reasoning_effort ?? null,
    thinking_enabled:
      turnConfig.thinkingEnabled ?? turnConfig.thinking_enabled ?? null,
    approval_policy:
      turnConfig.approvalPolicy ?? turnConfig.approval_policy ?? null,
    sandbox_policy:
      turnConfig.sandboxPolicy ?? turnConfig.sandbox_policy ?? null,
    project_id: null,
    workspace_id: request.workspaceId ?? "",
    web_search: turnConfig.webSearch ?? turnConfig.web_search ?? null,
    search_mode: turnConfig.searchMode ?? turnConfig.search_mode ?? null,
    execution_strategy:
      turnConfig.executionStrategy ?? turnConfig.execution_strategy ?? null,
    auto_continue:
      turnConfig.autoContinue ?? turnConfig.auto_continue ?? null,
    system_prompt: turnConfig.systemPrompt ?? turnConfig.system_prompt ?? null,
    metadata: params.metadata,
    expected_output: params.expectedOutput,
    structured_output: params.structuredOutput,
    output_schema: params.outputSchema,
    turn_id: params.turnId,
    queue_if_busy: params.queueIfBusy,
    queued_turn_id: params.queuedTurnId,
    turn_config: turnConfig,
  };
}

function buildAgentAppRuntimeTaskMessage(
  request: AgentAppRuntimeStartTaskRequest,
): string {
  const prompt =
    normalizeString(request.prompt) ??
    normalizeString(request.title) ??
    request.taskKind;
  return [
    "[Agent App Runtime Task]",
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
  request: AgentAppRuntimeSubmitHostResponseRequest["runtimeRequest"],
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

function sessionStatusToAgentAppTaskStatus(status: string): string {
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
  return threadReadFromAgentSessionRead(response) ?? response.detail ?? sessionReadToLegacy(response);
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
  turnConfig: Record<string, unknown>,
): StructuredOutputContract | undefined {
  const explicit = recordValue(turnConfig, "structuredOutput") ??
    recordValue(turnConfig, "structured_output");
  if (explicit) {
    return omitUndefined({
      type: readString(explicit, "type"),
      schemaRef:
        readString(explicit, "schemaRef") ?? readString(explicit, "schema_ref"),
      schema:
        explicit.schema ??
        explicit.outputSchema ??
        explicit.output_schema,
      maxValidationRetries: readNumber(
        explicit,
        "maxValidationRetries",
        "max_validation_retries",
      ),
      failureSubtype:
        readString(explicit, "failureSubtype") ??
        readString(explicit, "failure_subtype"),
      materializer: explicit.materializer,
      metadata: explicit.metadata,
    });
  }

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
  turnConfig: Record<string, unknown>,
): unknown {
  const direct = turnConfig.outputSchema ?? turnConfig.output_schema;
  if (direct !== undefined) {
    return direct;
  }
  if (structuredOutput?.schema !== undefined) {
    return structuredOutput.schema;
  }
  const outputFormat = expectedOutputOutputFormat(expectedOutput);
  return outputFormat?.schema ?? outputFormat?.outputSchema ?? outputFormat?.output_schema;
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
