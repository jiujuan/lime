import { useEffect, useRef } from "react";
import { executionRunList, type AgentRun } from "@/lib/api/executionRun";
import {
  buildRemoteTaskAgentUiProjectionInputFromAgentRun,
  recordRemoteTaskAgentUiProjectionFromAgentRun,
} from "./remoteTaskAgentUiProjection";

interface UseRemoteTaskExecutionRunProjectionOptions {
  enabled?: boolean;
  sessionId?: string | null;
  limit?: number;
  pollMs?: number;
}

function normalizeText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildRunSignature(run: AgentRun): string {
  return JSON.stringify([
    run.id,
    run.status,
    run.updated_at,
    run.finished_at,
    run.metadata,
  ]);
}

export function useRemoteTaskExecutionRunProjection({
  enabled = true,
  sessionId,
  limit = 50,
  pollMs = 10_000,
}: UseRemoteTaskExecutionRunProjectionOptions): void {
  const signatureByRunIdRef = useRef<Map<string, string>>(new Map());
  const normalizedSessionId = normalizeText(sessionId);

  useEffect(() => {
    signatureByRunIdRef.current.clear();
  }, [normalizedSessionId]);

  useEffect(() => {
    if (!enabled || !normalizedSessionId) {
      return;
    }

    let disposed = false;
    let inFlight = false;
    let timer: number | null = null;

    const scheduleNext = () => {
      if (disposed) {
        return;
      }
      timer = window.setTimeout(() => {
        void fetchRuns();
      }, pollMs);
    };

    const fetchRuns = async () => {
      if (disposed || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const runs = await executionRunList(limit, 0);
        if (disposed) {
          return;
        }

        runs.forEach((run) => {
          const projectionInput =
            buildRemoteTaskAgentUiProjectionInputFromAgentRun(run);
          if (
            !projectionInput ||
            normalizeText(projectionInput.sessionId) !== normalizedSessionId
          ) {
            return;
          }

          const signature = buildRunSignature(run);
          if (signatureByRunIdRef.current.get(run.id) === signature) {
            return;
          }

          signatureByRunIdRef.current.set(run.id, signature);
          recordRemoteTaskAgentUiProjectionFromAgentRun(run);
        });
      } catch (error) {
        console.warn("[AgentUI] 拉取 remote task execution runs 失败:", error);
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };

    void fetchRuns();

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [enabled, limit, normalizedSessionId, pollMs]);
}
