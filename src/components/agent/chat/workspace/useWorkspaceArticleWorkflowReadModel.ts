import { useEffect, useState } from "react";
import { createAppServerClient } from "@/lib/api/appServer";
import {
  readWorkspaceArticleWorkflowRunsFromUnknown,
  type WorkspaceArticleWorkflowRun,
} from "./workspaceArticleWorkspaceWorkflowFacts";

interface UseWorkspaceArticleWorkflowReadModelParams {
  enabled: boolean;
  sessionId?: string | null;
}

export function useWorkspaceArticleWorkflowReadModel({
  enabled,
  sessionId,
}: UseWorkspaceArticleWorkflowReadModelParams) {
  const [workflowRuns, setWorkflowRuns] = useState<
    WorkspaceArticleWorkflowRun[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const normalizedSessionId = sessionId?.trim();
    if (!enabled || !normalizedSessionId) {
      setWorkflowRuns([]);
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    createAppServerClient()
      .readWorkflow({ sessionId: normalizedSessionId })
      .then((response) => {
        if (disposed) {
          return;
        }
        setWorkflowRuns(readWorkspaceArticleWorkflowRunsFromUnknown(response.result));
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        setWorkflowRuns([]);
        console.warn("[ArticleWorkspace] 加载 Workflow Read Model 失败:", error);
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [enabled, sessionId]);

  return {
    loading,
    workflowRuns,
  };
}
