import React, { useCallback, useEffect, useState } from "react";

import {
  getAgentRuntimeObjective,
  type ManagedObjective,
} from "@/lib/api/agentRuntime";
import { ManagedObjectivePanel } from "../../ManagedObjectivePanel";

interface InputbarObjectiveInlinePanelProps {
  runtimeBusy?: boolean;
  sessionId: string;
  workspaceId?: string | null;
  onObjectiveLoaded?: (objective: ManagedObjective | null) => void;
}

export function InputbarObjectiveInlinePanel({
  runtimeBusy,
  sessionId,
  workspaceId,
  onObjectiveLoaded,
}: InputbarObjectiveInlinePanelProps) {
  const [objective, setObjective] = useState<ManagedObjective | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshObjective = useCallback(async () => {
    setLoading(true);
    try {
      const nextObjective = await getAgentRuntimeObjective(sessionId);
      setObjective(nextObjective);
      onObjectiveLoaded?.(nextObjective);
    } catch (error) {
      console.warn("[InputbarObjectiveInlinePanel] 加载追求目标失败:", error);
      setObjective(null);
      onObjectiveLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [onObjectiveLoaded, sessionId]);

  useEffect(() => {
    void refreshObjective();
  }, [refreshObjective]);

  return (
    <div
      className="rounded-lg border border-slate-100 bg-white p-1"
      aria-busy={loading}
    >
      <ManagedObjectivePanel
        sessionId={sessionId}
        workspaceId={workspaceId}
        objective={objective}
        runtimeBusy={runtimeBusy}
        onObjectiveChanged={refreshObjective}
        className="border-slate-200 bg-slate-50/70"
      />
    </div>
  );
}
