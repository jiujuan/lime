import {
  parseSkillSlashCommand,
  tryExecuteSlashSkillCommand,
} from "./skillCommand";
import { extractExistingHarnessMetadata } from "../utils/harnessRequestMetadata";
import type { PreparedAgentStreamUserInputSend } from "./agentStreamUserInputSendPreparation";
import type { AgentStreamPreparedSendEnv } from "./agentStreamPreparedSendEnv";

type SlashSkillPreflightEnv = Pick<
  AgentStreamPreparedSendEnv,
  | "ensureSession"
  | "sessionIdRef"
  | "activeStreamRef"
  | "listenerMapRef"
  | "setMessages"
  | "setIsSending"
  | "setActiveStream"
  | "clearActiveStreamIfMatch"
  | "playTypewriterSound"
  | "playToolcallSound"
  | "onWriteFile"
  | "getRequiredWorkspaceId"
>;

interface MaybeHandleSlashSkillBeforeSendOptions {
  preparedSend: PreparedAgentStreamUserInputSend;
  env: SlashSkillPreflightEnv;
}

interface ResolvedSkillPreflightLaunch {
  skillName: string;
  userInput: string;
  requestContext?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasStructuredSlashLaunchMetadata(
  requestMetadata?: Record<string, unknown>,
): boolean {
  const harness = extractExistingHarnessMetadata(requestMetadata);
  if (!harness) {
    return false;
  }

  const launch =
    asRecord(harness.service_scene_launch) ??
    asRecord(harness.serviceSceneLaunch) ??
    asRecord(harness.service_skill_launch) ??
    asRecord(harness.serviceSkillLaunch);

  return Boolean(launch && Object.keys(launch).length > 0);
}

function resolveAnalysisSkillLaunch(
  requestMetadata: Record<string, unknown> | undefined,
): ResolvedSkillPreflightLaunch | undefined {
  const harness = extractExistingHarnessMetadata(requestMetadata);
  if (!harness) {
    return undefined;
  }

  const launch =
    asRecord(harness.analysis_skill_launch) ??
    asRecord(harness.analysisSkillLaunch);
  if (!launch) {
    return undefined;
  }

  const kind = readTrimmedString(launch.kind) ?? "analysis_request";
  if (kind !== "analysis_request") {
    return undefined;
  }

  const skillName =
    readTrimmedString(launch.skill_name) ??
    readTrimmedString(launch.skillName) ??
    "analysis";
  if (skillName !== "analysis") {
    return undefined;
  }

  const analysisRequest =
    asRecord(launch.analysis_request) ?? asRecord(launch.analysisRequest);
  if (!analysisRequest) {
    return undefined;
  }

  return {
    skillName,
    userInput:
      readTrimmedString(analysisRequest.raw_text) ??
      readTrimmedString(analysisRequest.rawText) ??
      readTrimmedString(analysisRequest.prompt) ??
      "",
    requestContext: launch,
  };
}

async function executeResolvedSkillPreflight(
  preparedSend: PreparedAgentStreamUserInputSend,
  env: SlashSkillPreflightEnv,
  launch: ResolvedSkillPreflightLaunch,
): Promise<boolean> {
  const { content, assistantMsgId, effectiveProviderType, effectiveModel } =
    preparedSend;

  const skillEventName = `skill-exec-${assistantMsgId}`;
  env.setActiveStream({
    assistantMsgId,
    eventName: skillEventName,
    sessionId: env.sessionIdRef.current || "",
  });

  const skillHandled = await tryExecuteSlashSkillCommand({
    command: {
      skillName: launch.skillName,
      userInput: launch.userInput || content,
    },
    rawContent: content,
    assistantMsgId,
    providerType: effectiveProviderType,
    model: effectiveModel || undefined,
    images: preparedSend.skillRequest?.images ?? preparedSend.images,
    requestContext:
      launch.requestContext ?? preparedSend.skillRequest?.requestContext,
    requestMetadata: preparedSend.requestMetadata,
    workspaceId: env.getRequiredWorkspaceId(),
    ensureSession: env.ensureSession,
    setMessages: env.setMessages,
    setIsSending: env.setIsSending,
    setCurrentAssistantMsgId: (id) => {
      if (!id) {
        env.clearActiveStreamIfMatch(skillEventName);
        return;
      }
      env.setActiveStream({
        assistantMsgId: id,
        eventName: skillEventName,
        sessionId:
          env.activeStreamRef.current?.sessionId ||
          env.sessionIdRef.current ||
          "",
      });
    },
    setStreamUnlisten: (unlistenFn) => {
      const previous = env.listenerMapRef.current.get(skillEventName);
      if (previous) {
        previous();
        env.listenerMapRef.current.delete(skillEventName);
      }
      if (unlistenFn) {
        env.listenerMapRef.current.set(skillEventName, unlistenFn);
      }
    },
    setActiveSessionIdForStop: (sessionIdForStop) => {
      if (!sessionIdForStop) {
        env.clearActiveStreamIfMatch(skillEventName);
        return;
      }
      env.setActiveStream({
        assistantMsgId:
          env.activeStreamRef.current?.assistantMsgId || assistantMsgId,
        eventName: skillEventName,
        sessionId: sessionIdForStop,
        pendingTurnKey: env.activeStreamRef.current?.pendingTurnKey,
        pendingItemKey: env.activeStreamRef.current?.pendingItemKey,
      });
    },
    isExecutionCancelled: () =>
      env.activeStreamRef.current?.assistantMsgId !== assistantMsgId,
    playTypewriterSound: env.playTypewriterSound,
    playToolcallSound: env.playToolcallSound,
    onWriteFile: env.onWriteFile,
  });

  if (skillHandled) {
    return true;
  }

  env.clearActiveStreamIfMatch(skillEventName);
  return false;
}

export async function maybeHandleSlashSkillBeforeSend(
  options: MaybeHandleSlashSkillBeforeSendOptions,
): Promise<boolean> {
  const { preparedSend, env } = options;
  const { skipUserMessage, expectingQueue } = preparedSend;

  if (skipUserMessage || expectingQueue) {
    return false;
  }

  if (hasStructuredSlashLaunchMetadata(preparedSend.requestMetadata)) {
    return false;
  }

  const analysisSkillLaunch = resolveAnalysisSkillLaunch(
    preparedSend.requestMetadata,
  );
  if (analysisSkillLaunch) {
    return executeResolvedSkillPreflight(
      preparedSend,
      env,
      analysisSkillLaunch,
    );
  }

  const parsedSkillCommand = parseSkillSlashCommand(preparedSend.content);
  if (!parsedSkillCommand) {
    return false;
  }

  return executeResolvedSkillPreflight(preparedSend, env, {
    skillName: parsedSkillCommand.skillName,
    userInput: parsedSkillCommand.userInput,
  });
}
