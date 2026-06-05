import {
  AppServerClient,
  type AppServerAgentAttachment,
  type AppServerAgentSessionActionRespondParams,
  type AppServerAgentSessionActionScope,
  type AppServerAgentSessionTurnCancelParams,
  type AppServerAgentSessionTurnStartParams,
} from "@/lib/api/appServer";
import { isElectronHostCommandAvailable } from "@/lib/electron-host";
import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import { normalizeThreadReadModel } from "./normalizers";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
import type {
  AgentRuntimeCompactSessionRequest,
  AgentRuntimeDiffFileCheckpointRequest,
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
  AgentRuntimeGetFileCheckpointRequest,
  AgentRuntimeInterruptTurnRequest,
  AgentRuntimeListFileCheckpointsRequest,
  AgentRuntimePromoteQueuedTurnRequest,
  AgentRuntimeRemoveQueuedTurnRequest,
  AgentRuntimeReplayRequestRequest,
  AgentRuntimeReplayedActionRequiredView,
  AgentRuntimeRespondActionRequest,
  AgentRuntimeRestoreFileCheckpointRequest,
  AgentRuntimeResumeThreadRequest,
  AgentRuntimeSubmitTurnRequest,
  AgentRuntimeThreadReadModel,
} from "./types";

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";

export type AgentRuntimeAppServerClient = Pick<
  AppServerClient,
  "startTurn" | "cancelTurn" | "respondAction"
>;

export interface AgentRuntimeThreadClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeAppServerClient;
  isAppServerTurnLifecycleAvailable?: () => boolean;
}

export function createThreadClient({
  invokeCommand = invokeAgentRuntimeCommand,
  appServerClient = new AppServerClient(),
  isAppServerTurnLifecycleAvailable = defaultIsAppServerTurnLifecycleAvailable,
}: AgentRuntimeThreadClientDeps = {}) {
  async function submitAgentRuntimeTurn(
    request: AgentRuntimeSubmitTurnRequest,
  ): Promise<void> {
    if (isAppServerTurnLifecycleAvailable()) {
      await appServerClient.startTurn(appServerTurnStartParamsFromRequest(request));
      return;
    }

    return await invokeCommand<void>(AGENT_RUNTIME_COMMANDS.submitTurn, {
      request,
    });
  }

  async function interruptAgentRuntimeTurn(
    request: AgentRuntimeInterruptTurnRequest,
  ): Promise<boolean> {
    if (isAppServerTurnLifecycleAvailable() && request.turn_id) {
      await appServerClient.cancelTurn(
        appServerTurnCancelParamsFromRequest(request),
      );
      return true;
    }

    return await invokeCommand<boolean>(AGENT_RUNTIME_COMMANDS.interruptTurn, {
      request,
    });
  }

  async function compactAgentRuntimeSession(
    request: AgentRuntimeCompactSessionRequest,
  ): Promise<void> {
    return await invokeCommand<void>(AGENT_RUNTIME_COMMANDS.compactSession, {
      request,
    });
  }

  async function resumeAgentRuntimeThread(
    request: AgentRuntimeResumeThreadRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(AGENT_RUNTIME_COMMANDS.resumeThread, {
      request,
    });
  }

  async function replayAgentRuntimeRequest(
    request: AgentRuntimeReplayRequestRequest,
  ): Promise<AgentRuntimeReplayedActionRequiredView | null> {
    return await invokeCommand<AgentRuntimeReplayedActionRequiredView | null>(
      AGENT_RUNTIME_COMMANDS.replayRequest,
      {
        request,
      },
    );
  }

  async function removeAgentRuntimeQueuedTurn(
    request: AgentRuntimeRemoveQueuedTurnRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(
      AGENT_RUNTIME_COMMANDS.removeQueuedTurn,
      {
        request,
      },
    );
  }

  async function promoteAgentRuntimeQueuedTurn(
    request: AgentRuntimePromoteQueuedTurnRequest,
  ): Promise<boolean> {
    return await invokeCommand<boolean>(
      AGENT_RUNTIME_COMMANDS.promoteQueuedTurn,
      { request },
    );
  }

  async function respondAgentRuntimeAction(
    request: AgentRuntimeRespondActionRequest,
  ): Promise<void> {
    if (isAppServerTurnLifecycleAvailable()) {
      await appServerClient.respondAction(
        appServerActionRespondParamsFromRequest(request),
      );
      return;
    }

    return await invokeCommand<void>(AGENT_RUNTIME_COMMANDS.respondAction, {
      request,
    });
  }

  async function getAgentRuntimeThreadRead(
    sessionId: string,
  ): Promise<AgentRuntimeThreadReadModel> {
    const threadRead = await invokeCommand<AgentRuntimeThreadReadModel>(
      AGENT_RUNTIME_COMMANDS.getThreadRead,
      { sessionId },
    );

    return normalizeThreadReadModel(
      threadRead as AgentRuntimeThreadReadModel | null | undefined,
    ) as AgentRuntimeThreadReadModel;
  }

  async function listAgentRuntimeFileCheckpoints(
    request: AgentRuntimeListFileCheckpointsRequest,
  ): Promise<AgentRuntimeFileCheckpointListResult> {
    return await invokeCommand<AgentRuntimeFileCheckpointListResult>(
      AGENT_RUNTIME_COMMANDS.listFileCheckpoints,
      { request },
    );
  }

  async function getAgentRuntimeFileCheckpoint(
    request: AgentRuntimeGetFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDetail> {
    return await invokeCommand<AgentRuntimeFileCheckpointDetail>(
      AGENT_RUNTIME_COMMANDS.getFileCheckpoint,
      { request },
    );
  }

  async function diffAgentRuntimeFileCheckpoint(
    request: AgentRuntimeDiffFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointDiffResult> {
    return await invokeCommand<AgentRuntimeFileCheckpointDiffResult>(
      AGENT_RUNTIME_COMMANDS.diffFileCheckpoint,
      { request },
    );
  }

  async function restoreAgentRuntimeFileCheckpoint(
    request: AgentRuntimeRestoreFileCheckpointRequest,
  ): Promise<AgentRuntimeFileCheckpointRestoreResult> {
    return await invokeCommand<AgentRuntimeFileCheckpointRestoreResult>(
      AGENT_RUNTIME_COMMANDS.restoreFileCheckpoint,
      { request },
    );
  }

  return {
    compactAgentRuntimeSession,
    diffAgentRuntimeFileCheckpoint,
    getAgentRuntimeFileCheckpoint,
    getAgentRuntimeThreadRead,
    interruptAgentRuntimeTurn,
    listAgentRuntimeFileCheckpoints,
    promoteAgentRuntimeQueuedTurn,
    removeAgentRuntimeQueuedTurn,
    replayAgentRuntimeRequest,
    respondAgentRuntimeAction,
    restoreAgentRuntimeFileCheckpoint,
    resumeAgentRuntimeThread,
    submitAgentRuntimeTurn,
  };
}

function defaultIsAppServerTurnLifecycleAvailable(): boolean {
  return isElectronHostCommandAvailable(APP_SERVER_HANDLE_JSON_LINES_COMMAND);
}

export function appServerTurnStartParamsFromRequest(
  request: AgentRuntimeSubmitTurnRequest,
): AppServerAgentSessionTurnStartParams {
  return omitUndefined({
    sessionId: request.session_id,
    turnId: request.turn_id,
    input: {
      text: request.message,
      attachments: appServerAttachmentsFromImages(request.images),
    },
    runtimeOptions: omitUndefined({
      stream: true,
      eventName: request.event_name,
      providerPreference: request.turn_config?.provider_preference,
      modelPreference: request.turn_config?.model_preference,
      metadata: request.turn_config?.metadata,
      queuedTurnId: request.queued_turn_id,
      hostOptions: {
        asterChatRequest: request,
      },
    }),
    queueIfBusy: request.queue_if_busy,
    skipPreSubmitResume: request.skip_pre_submit_resume,
  });
}

function appServerTurnCancelParamsFromRequest(
  request: AgentRuntimeInterruptTurnRequest & { turn_id: string },
): AppServerAgentSessionTurnCancelParams {
  return {
    sessionId: request.session_id,
    turnId: request.turn_id,
  };
}

export function appServerActionRespondParamsFromRequest(
  request: AgentRuntimeRespondActionRequest,
): AppServerAgentSessionActionRespondParams {
  return omitUndefined({
    sessionId: request.session_id,
    requestId: request.request_id,
    actionType: request.action_type,
    confirmed: request.confirmed,
    response: request.response,
    userData: request.user_data,
    metadata: request.metadata,
    eventName: request.event_name,
    actionScope: appServerActionScopeFromRequest(request.action_scope),
  });
}

function appServerAttachmentsFromImages(
  images?: AgentRuntimeSubmitTurnRequest["images"],
): AppServerAgentAttachment[] | undefined {
  if (!images?.length) {
    return undefined;
  }

  return images.map((image, index) => ({
    kind: "image",
    uri: image.data,
    metadata: {
      mediaType: image.media_type,
      index,
    },
  }));
}

function appServerActionScopeFromRequest(
  scope?: AgentRuntimeRespondActionRequest["action_scope"],
): AppServerAgentSessionActionScope | undefined {
  if (!scope) {
    return undefined;
  }

  return omitUndefined({
    sessionId: scope.session_id,
    threadId: scope.thread_id,
    turnId: scope.turn_id,
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export const {
  compactAgentRuntimeSession,
  diffAgentRuntimeFileCheckpoint,
  getAgentRuntimeFileCheckpoint,
  getAgentRuntimeThreadRead,
  interruptAgentRuntimeTurn,
  listAgentRuntimeFileCheckpoints,
  promoteAgentRuntimeQueuedTurn,
  removeAgentRuntimeQueuedTurn,
  replayAgentRuntimeRequest,
  respondAgentRuntimeAction,
  restoreAgentRuntimeFileCheckpoint,
  resumeAgentRuntimeThread,
  submitAgentRuntimeTurn,
} = createThreadClient();
