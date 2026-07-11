import { useMemo, useRef } from "react";
import { buildCreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import { extractCreationReplayMetadata } from "../utils/creationReplayMetadata";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import { shouldAllowDetachedInitialAutoSend } from "./workspaceExpertMetadata";
import { buildPendingServiceSkillLaunchSignature } from "./pendingServiceSkillLaunchSignature";
import { resolveRuntimeWorkspaceId } from "./agentChatWorkspaceHelpers";

interface UseWorkspaceEntryProjectionRuntimeParams {
  initialAutoSendRequestMetadata: Parameters<
    typeof shouldAllowDetachedInitialAutoSend
  >[0];
  initialPendingServiceSkillLaunch: Parameters<
    typeof buildPendingServiceSkillLaunchSignature
  >[0];
  initialRequestMetadata: Parameters<typeof extractCreationReplayMetadata>[0];
  projectId?: string | null;
  resolvedProjectId?: string | null;
  taskCenterWorkspaceId?: string | null;
}

/** 入口 metadata、replay 与 runtime workspace 投影统一从此处派生。 */
export function useWorkspaceEntryProjectionRuntime({
  initialAutoSendRequestMetadata,
  initialPendingServiceSkillLaunch,
  initialRequestMetadata,
  projectId,
  resolvedProjectId,
  taskCenterWorkspaceId,
}: UseWorkspaceEntryProjectionRuntimeParams) {
  const handledInitialPendingServiceSkillLaunchSignatureRef = useRef("");
  const dismissedInitialPendingServiceSkillLaunchSignatureRef = useRef("");
  const initialCreationReplay = useMemo(
    () => extractCreationReplayMetadata(initialRequestMetadata),
    [initialRequestMetadata],
  );
  const initialCreationReplaySurface = useMemo(
    () => buildCreationReplaySurfaceModel(initialCreationReplay),
    [initialCreationReplay],
  );
  const initialPendingServiceSkillLaunchSignature = useMemo(
    () =>
      buildPendingServiceSkillLaunchSignature(initialPendingServiceSkillLaunch),
    [initialPendingServiceSkillLaunch],
  );
  const initialAutoSendAllowsDetachedSession = useMemo(
    () => shouldAllowDetachedInitialAutoSend(initialAutoSendRequestMetadata),
    [initialAutoSendRequestMetadata],
  );
  const validatedRuntimeProjectId =
    normalizeProjectId(resolvedProjectId) === normalizeProjectId(projectId)
      ? projectId
      : undefined;

  return {
    dismissedInitialPendingServiceSkillLaunchSignatureRef,
    handledInitialPendingServiceSkillLaunchSignatureRef,
    initialAutoSendAllowsDetachedSession,
    initialCreationReplay,
    initialCreationReplaySurface,
    initialPendingServiceSkillLaunchSignature,
    runtimeWorkspaceId: resolveRuntimeWorkspaceId(
      validatedRuntimeProjectId ?? taskCenterWorkspaceId,
    ),
    validatedRuntimeProjectId,
  };
}
