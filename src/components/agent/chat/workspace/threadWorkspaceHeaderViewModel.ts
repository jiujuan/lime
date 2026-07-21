import type { TaskStatus, Topic } from "../hooks/agentChatShared";
import { resolveTaskCenterTopicTitle } from "./taskCenterTabProjection";

export interface ThreadWorkspaceHeaderViewModel {
  sessionId: string;
  title: string;
  status: TaskStatus | null;
  workingDirectory: string | null;
}

interface BuildThreadWorkspaceHeaderViewModelParams {
  sessionId?: string | null;
  currentSessionTitle?: string | null;
  initialSessionId?: string | null;
  initialSessionName?: string | null;
  topic?: Topic | null;
  sessionWorkingDirectory?: string | null;
  projectRootPath?: string | null;
  isSending?: boolean;
  pendingActionCount?: number;
  untitledTaskLabel: string;
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveThreadWorkspaceStatus({
  topicStatus,
  isSending,
  pendingActionCount,
}: {
  topicStatus?: TaskStatus | null;
  isSending?: boolean;
  pendingActionCount?: number;
}): TaskStatus | null {
  if ((pendingActionCount ?? 0) > 0) {
    return "waiting";
  }
  if (isSending) {
    return "running";
  }
  return topicStatus ?? null;
}

export function buildThreadWorkspaceHeaderViewModel({
  sessionId,
  currentSessionTitle,
  initialSessionId,
  initialSessionName,
  topic,
  sessionWorkingDirectory,
  projectRootPath,
  isSending,
  pendingActionCount,
  untitledTaskLabel,
}: BuildThreadWorkspaceHeaderViewModelParams): ThreadWorkspaceHeaderViewModel | null {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  const initialTitleFallback =
    normalizedSessionId === normalizeText(initialSessionId)
      ? normalizeText(initialSessionName)
      : null;
  const title = resolveTaskCenterTopicTitle(
    normalizeText(topic?.title) ?? normalizeText(currentSessionTitle),
    initialTitleFallback ?? untitledTaskLabel,
  );
  const workingDirectory =
    normalizeText(sessionWorkingDirectory) ??
    normalizeText(topic?.workingDir) ??
    normalizeText(projectRootPath);

  return {
    sessionId: normalizedSessionId,
    title,
    status: resolveThreadWorkspaceStatus({
      topicStatus: topic?.status,
      isSending,
      pendingActionCount,
    }),
    workingDirectory,
  };
}
