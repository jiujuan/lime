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

const STRUCTURED_SERVICE_LAUNCH_KEYS = new Set([
  "service_scene_launch",
  "serviceSceneLaunch",
  "service_skill_launch",
  "serviceSkillLaunch",
]);

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

function isStructuredModelSkillLaunchKey(key: string): boolean {
  if (STRUCTURED_SERVICE_LAUNCH_KEYS.has(key)) {
    return false;
  }

  return key.endsWith("_skill_launch") || key.endsWith("SkillLaunch");
}

function resolveLaunchScopedContext(
  launch: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const explicitRequestContext =
    asRecord(launch.request_context) ?? asRecord(launch.requestContext);
  if (explicitRequestContext) {
    return explicitRequestContext;
  }

  const kind = readTrimmedString(launch.kind);
  if (kind) {
    const kindScopedContext = asRecord(launch[kind]);
    if (kindScopedContext) {
      return kindScopedContext;
    }
  }

  for (const [key, value] of Object.entries(launch)) {
    if (
      key.endsWith("_request") ||
      key.endsWith("_task") ||
      key.endsWith("Request") ||
      key.endsWith("Task")
    ) {
      const scopedContext = asRecord(value);
      if (scopedContext) {
        return scopedContext;
      }
    }
  }

  return undefined;
}

function resolveLaunchUserInput(
  launch: Record<string, unknown>,
  scopedContext?: Record<string, unknown>,
): string {
  return (
    readTrimmedString(scopedContext?.raw_text) ??
    readTrimmedString(scopedContext?.rawText) ??
    readTrimmedString(scopedContext?.user_input) ??
    readTrimmedString(scopedContext?.userInput) ??
    readTrimmedString(scopedContext?.prompt) ??
    readTrimmedString(scopedContext?.content) ??
    readTrimmedString(launch.raw_text) ??
    readTrimmedString(launch.rawText) ??
    readTrimmedString(launch.user_input) ??
    readTrimmedString(launch.userInput) ??
    readTrimmedString(launch.prompt) ??
    ""
  );
}

function resolveStructuredModelSkillLaunch(
  requestMetadata: Record<string, unknown> | undefined,
): ResolvedSkillPreflightLaunch | undefined {
  const harness = extractExistingHarnessMetadata(requestMetadata);
  if (!harness) {
    return undefined;
  }

  for (const [key, value] of Object.entries(harness)) {
    if (!isStructuredModelSkillLaunchKey(key)) {
      continue;
    }

    const launch = asRecord(value);
    if (!launch) {
      continue;
    }

    const skillName =
      readTrimmedString(launch.skill_name) ??
      readTrimmedString(launch.skillName);
    if (!skillName) {
      continue;
    }

    const explicitRequestContext =
      asRecord(launch.request_context) ?? asRecord(launch.requestContext);
    const scopedContext = resolveLaunchScopedContext(launch);

    return {
      skillName,
      userInput: resolveLaunchUserInput(launch, scopedContext),
      requestContext: explicitRequestContext,
    };
  }

  return undefined;
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

  const structuredSkillLaunch = resolveStructuredModelSkillLaunch(
    preparedSend.requestMetadata,
  );
  if (structuredSkillLaunch) {
    return executeResolvedSkillPreflight(
      preparedSend,
      env,
      structuredSkillLaunch,
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
