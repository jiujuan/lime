import type { CanonicalThreadListClient } from "@/lib/api/agentRuntime/canonicalThreadClient";
import type { CanonicalChildThreadSummary } from "../projection/canonicalChildThreadSummary";
import { useCanonicalChildThreads } from "./useCanonicalChildThreads";

interface WorkspaceSessionTopicSummary {
  id: string;
  title: string;
}

interface UseWorkspaceTeamRuntimeParams {
  canonicalClient?: CanonicalThreadListClient;
  canonicalRefreshKey?: string | number | null;
  referencedChildThreadIds?: readonly string[];
  session: {
    currentTopicId?: string | null;
    parentThreadId?: string | null;
    topics: WorkspaceSessionTopicSummary[];
    subagentEnabled: boolean;
  };
  stopSending: () => Promise<void>;
}

export function deriveWorkspaceSubagentRuntime(input: {
  canonicalChildren: CanonicalChildThreadSummary[];
  currentTopicId?: string | null;
  hasParentThread: boolean;
  subagentEnabled: boolean;
  topics: WorkspaceSessionTopicSummary[];
}) {
  const hasRuntimeSessions =
    input.canonicalChildren.length > 0 || input.hasParentThread;
  return {
    currentSessionTitle:
      input.topics.find((topic) => topic.id === input.currentTopicId)?.title ??
      null,
    hasRuntimeSessions,
    subagentsRuntimeVisible: input.subagentEnabled || hasRuntimeSessions,
  };
}

export function useWorkspaceTeamRuntime({
  canonicalClient,
  canonicalRefreshKey,
  referencedChildThreadIds,
  session,
  stopSending,
}: UseWorkspaceTeamRuntimeParams) {
  const canonical = useCanonicalChildThreads({
    client: canonicalClient,
    parentThreadId: session.parentThreadId,
    referencedChildThreadIds,
    refreshKey: canonicalRefreshKey,
  });
  return {
    ...deriveWorkspaceSubagentRuntime({
      canonicalChildren: canonical.children,
      currentTopicId: session.currentTopicId,
      hasParentThread: canonical.hasParentThread,
      subagentEnabled: session.subagentEnabled,
      topics: session.topics,
    }),
    canonicalChildCounts: canonical.counts,
    canonicalChildren: canonical.children,
    canonicalChildrenError: canonical.error,
    canonicalChildrenLoading: canonical.loading,
    handleStopSending: stopSending,
    refreshCanonicalChildren: canonical.refresh,
  };
}
