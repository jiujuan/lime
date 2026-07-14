import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  readCanonicalThreadFamily,
  type CanonicalThreadListClient,
} from "@/lib/api/agentRuntime/canonicalThreadClient";
import {
  selectCanonicalChildThreadSummaries,
  summarizeCanonicalChildThreads,
  type CanonicalChildThreadSummary,
} from "../projection/canonicalChildThreadSummary";

interface UseCanonicalChildThreadsParams {
  client?: CanonicalThreadListClient;
  parentThreadId?: string | null;
  referencedChildThreadIds?: readonly string[];
  refreshKey?: string | number | null;
}

export function useCanonicalChildThreads({
  client,
  parentThreadId: parentThreadIdInput,
  referencedChildThreadIds = [],
  refreshKey,
}: UseCanonicalChildThreadsParams) {
  const parentThreadId = parentThreadIdInput?.trim() ?? "";
  const referencedChildThreadKey = canonicalReferenceKey(
    referencedChildThreadIds,
  );
  const stableReferencedChildThreadIds = useMemo(
    () => splitCanonicalReferenceKey(referencedChildThreadKey),
    [referencedChildThreadKey],
  );
  const [children, setChildren] = useState<CanonicalChildThreadSummary[]>([]);
  const [resolvedParentThreadId, setResolvedParentThreadId] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    if (!parentThreadId) {
      setChildren([]);
      setResolvedParentThreadId(undefined);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const family = await readCanonicalThreadFamily({
        ...(client ? { client } : {}),
        threadId: parentThreadId,
      });
      if (requestVersionRef.current !== requestVersion) {
        return;
      }
      setChildren(
        selectCanonicalChildThreadSummaries({
          parentThreadId,
          referencedChildThreadIds: stableReferencedChildThreadIds,
          threads: family.children,
        }),
      );
      setResolvedParentThreadId(family.parentThreadId);
    } catch (loadError) {
      if (requestVersionRef.current !== requestVersion) {
        return;
      }
      setChildren([]);
      setResolvedParentThreadId(undefined);
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setLoading(false);
      }
    }
  }, [client, parentThreadId, stableReferencedChildThreadIds]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const counts = useMemo(
    () => summarizeCanonicalChildThreads(children),
    [children],
  );

  return {
    children,
    counts,
    error,
    hasParentThread: Boolean(resolvedParentThreadId),
    loading,
    refresh,
  };
}

function canonicalReferenceKey(values: readonly string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort()
    .join("\0");
}

function splitCanonicalReferenceKey(value: string): string[] {
  return value ? value.split("\0") : [];
}
