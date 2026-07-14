import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  FileJson,
  FileText,
  Folder,
  FolderTree,
  GitCompare,
  Loader2,
  RotateCcw,
} from "lucide-react";

import {
  diffAgentRuntimeFileCheckpoint,
  getAgentRuntimeFileCheckpoint,
  listAgentRuntimeFileCheckpoints,
  restoreAgentRuntimeFileCheckpoint,
} from "@/lib/api/agentRuntime/threadClient";
import type {
  AgentRuntimeFileCheckpointDetail,
  AgentRuntimeFileCheckpointDiffResult,
  AgentRuntimeFileCheckpointListResult,
  AgentRuntimeFileCheckpointRestoreResult,
} from "@/lib/api/agentRuntime/sessionTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentI18nKey } from "@/i18n/agentResources";
import { cn } from "@/lib/utils";
import {
  buildDiffReviewFileTreeItems,
  buildDiffReviewScopeItems,
  buildDiffReviewSideBySideRows,
  resolveDiffReviewSummaryFromCandidates,
} from "../utils/diffReview";

interface AsyncState<T> {
  status: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: string | null;
}

interface AgentThreadFileCheckpointDialogProps {
  open: boolean;
  sessionId: string;
  workingDir?: string | null;
  defaultCheckpointId?: string | null;
  onOpenChange: (open: boolean) => void;
}

interface BatchRestoreResultItem {
  backupPath?: string | null;
  checkpointId: string;
  error?: string | null;
  path: string;
  status: "success" | "error";
}

function createAsyncState<T>(
  status: AsyncState<T>["status"],
  data: T | null = null,
  error: string | null = null,
): AsyncState<T> {
  return {
    status,
    data,
    error,
  };
}

function parseDiagnosticDate(value?: string | number | null): Date | null {
  if (typeof value === "number") {
    const normalizedValue = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatDiagnosticDateTime(
  value?: string | number | null,
  locale = "zh-CN",
): string | null {
  const date = parseDiagnosticDate(value);
  if (!date) {
    return null;
  }

  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePreviewText(
  value?: string | null,
  maxLength = 140,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function serializePreviewValue(value: unknown, emptyLabel: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return emptyLabel;
  }

  return JSON.stringify(
    value,
    (_key, item) => (item instanceof Date ? item.toISOString() : item),
    2,
  );
}

function resolveCheckpointVersionLabel(versionNo?: number): string | null {
  return typeof versionNo === "number" ? `v${versionNo}` : null;
}

export function AgentThreadFileCheckpointDialog({
  open,
  sessionId,
  workingDir,
  defaultCheckpointId,
  onOpenChange,
}: AgentThreadFileCheckpointDialogProps) {
  const { t, i18n } = useTranslation("agent");
  const text = useCallback(
    (key: AgentI18nKey, values?: Record<string, number | string>) =>
      t(key, values ?? {}),
    [t],
  );
  const locale = i18n.language || "zh-CN";
  const [listState, setListState] = useState<
    AsyncState<AgentRuntimeFileCheckpointListResult>
  >(createAsyncState<AgentRuntimeFileCheckpointListResult>("idle"));
  const [detailState, setDetailState] = useState<
    AsyncState<AgentRuntimeFileCheckpointDetail>
  >(createAsyncState<AgentRuntimeFileCheckpointDetail>("idle"));
  const [diffState, setDiffState] = useState<
    AsyncState<AgentRuntimeFileCheckpointDiffResult>
  >(createAsyncState<AgentRuntimeFileCheckpointDiffResult>("idle"));
  const [restoreState, setRestoreState] = useState<
    AsyncState<AgentRuntimeFileCheckpointRestoreResult>
  >(createAsyncState<AgentRuntimeFileCheckpointRestoreResult>("idle"));
  const [batchRestoreState, setBatchRestoreState] = useState<
    AsyncState<BatchRestoreResultItem[]>
  >(createAsyncState<BatchRestoreResultItem[]>("idle"));
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
  const [selectedRestoreCheckpointIds, setSelectedRestoreCheckpointIds] =
    useState<string[]>([]);
  const [restoreConfirmationOpen, setRestoreConfirmationOpen] = useState(false);
  const [batchRestoreConfirmationOpen, setBatchRestoreConfirmationOpen] =
    useState(false);

  const applyCheckpointLoadResults = useCallback(
    (
      detailResult: PromiseSettledResult<AgentRuntimeFileCheckpointDetail>,
      diffResult: PromiseSettledResult<AgentRuntimeFileCheckpointDiffResult>,
    ) => {
      if (detailResult.status === "fulfilled") {
        setDetailState(
          createAsyncState<AgentRuntimeFileCheckpointDetail>(
            "ready",
            detailResult.value,
          ),
        );
      } else {
        setDetailState(
          createAsyncState<AgentRuntimeFileCheckpointDetail>(
            "error",
            null,
            detailResult.reason instanceof Error
              ? detailResult.reason.message
              : text("agentChat.threadFileCheckpointDialog.error.detailFailed"),
          ),
        );
      }

      if (diffResult.status === "fulfilled") {
        setDiffState(
          createAsyncState<AgentRuntimeFileCheckpointDiffResult>(
            "ready",
            diffResult.value,
          ),
        );
      } else {
        setDiffState(
          createAsyncState<AgentRuntimeFileCheckpointDiffResult>(
            "error",
            null,
            diffResult.reason instanceof Error
              ? diffResult.reason.message
              : text("agentChat.threadFileCheckpointDialog.error.diffFailed"),
          ),
        );
      }
    },
    [text],
  );

  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    let cancelled = false;
    setListState(
      createAsyncState<AgentRuntimeFileCheckpointListResult>("loading"),
    );
    setDetailState(createAsyncState<AgentRuntimeFileCheckpointDetail>("idle"));
    setDiffState(
      createAsyncState<AgentRuntimeFileCheckpointDiffResult>("idle"),
    );
    setRestoreState(
      createAsyncState<AgentRuntimeFileCheckpointRestoreResult>("idle"),
    );
    setBatchRestoreState(createAsyncState<BatchRestoreResultItem[]>("idle"));
    setRestoreConfirmationOpen(false);
    setBatchRestoreConfirmationOpen(false);
    setSelectedCheckpointId("");
    setSelectedRestoreCheckpointIds([]);

    void listAgentRuntimeFileCheckpoints({
      session_id: sessionId,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const checkpoints = result.checkpoints || [];
        const defaultCheckpoint =
          checkpoints.find(
            (checkpoint) => checkpoint.checkpoint_id === defaultCheckpointId,
          ) ||
          checkpoints[0] ||
          null;

        setListState(
          createAsyncState<AgentRuntimeFileCheckpointListResult>(
            "ready",
            result,
          ),
        );
        setSelectedCheckpointId(defaultCheckpoint?.checkpoint_id || "");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setListState(
          createAsyncState<AgentRuntimeFileCheckpointListResult>(
            "error",
            null,
            error instanceof Error
              ? error.message
              : text("agentChat.threadFileCheckpointDialog.error.listFailed"),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [defaultCheckpointId, open, sessionId, text]);

  useEffect(() => {
    if (!open || !sessionId || !selectedCheckpointId) {
      return;
    }

    let cancelled = false;
    setDetailState(
      createAsyncState<AgentRuntimeFileCheckpointDetail>("loading"),
    );
    setDiffState(
      createAsyncState<AgentRuntimeFileCheckpointDiffResult>("loading"),
    );
    setRestoreState(
      createAsyncState<AgentRuntimeFileCheckpointRestoreResult>("idle"),
    );
    setRestoreConfirmationOpen(false);

    void Promise.allSettled([
      getAgentRuntimeFileCheckpoint({
        session_id: sessionId,
        checkpoint_id: selectedCheckpointId,
      }),
      diffAgentRuntimeFileCheckpoint({
        session_id: sessionId,
        checkpoint_id: selectedCheckpointId,
      }),
    ]).then(([detailResult, diffResult]) => {
      if (cancelled) {
        return;
      }

      applyCheckpointLoadResults(detailResult, diffResult);
    });

    return () => {
      cancelled = true;
    };
  }, [applyCheckpointLoadResults, open, selectedCheckpointId, sessionId]);

  const checkpoints = useMemo(
    () => listState.data?.checkpoints ?? [],
    [listState.data?.checkpoints],
  );
  const selectedCheckpoint =
    checkpoints.find(
      (checkpoint) => checkpoint.checkpoint_id === selectedCheckpointId,
    ) || null;
  const selectedRestoreCheckpointSet = useMemo(
    () => new Set(selectedRestoreCheckpointIds),
    [selectedRestoreCheckpointIds],
  );
  const selectedRestoreCheckpoints = useMemo(
    () =>
      checkpoints.filter((checkpoint) =>
        selectedRestoreCheckpointSet.has(checkpoint.checkpoint_id),
      ),
    [checkpoints, selectedRestoreCheckpointSet],
  );
  const batchRestoreSuccessCount =
    batchRestoreState.data?.filter((item) => item.status === "success")
      .length ?? 0;
  const batchRestoreFailedCount =
    batchRestoreState.data?.filter((item) => item.status === "error").length ??
    0;
  const allCheckpointsSelected =
    checkpoints.length > 0 &&
    selectedRestoreCheckpointIds.length === checkpoints.length;
  const documentPreviewTitle = detailState.data?.checkpoint_document
    ? text("agentChat.threadFileCheckpointDialog.documentTitle.snapshotJson")
    : detailState.data?.live_document
      ? text("agentChat.threadFileCheckpointDialog.documentTitle.liveJson")
      : detailState.data?.content
        ? text("agentChat.threadFileCheckpointDialog.documentTitle.raw")
        : text("agentChat.threadFileCheckpointDialog.documentTitle.content");
  const documentPreviewValue =
    detailState.data?.checkpoint_document ??
    detailState.data?.live_document ??
    detailState.data?.content ??
    null;
  const batchRestoreTargetPreview = selectedRestoreCheckpoints
    .map((checkpoint) => checkpoint.path)
    .slice(0, 4);
  const batchRestoreExtraCount = Math.max(
    selectedRestoreCheckpoints.length - batchRestoreTargetPreview.length,
    0,
  );
  const diffPreviewValue = diffState.data?.diff ?? null;
  const diffReviewSummary = useMemo(
    () =>
      resolveDiffReviewSummaryFromCandidates(
        [
          diffState.data?.diff,
          detailState.data?.metadata,
          detailState.data?.content,
        ],
        {
          fallbackPath:
            detailState.data?.live_path || selectedCheckpoint?.path || null,
        },
      ),
    [
      detailState.data?.content,
      detailState.data?.live_path,
      detailState.data?.metadata,
      diffState.data?.diff,
      selectedCheckpoint?.path,
    ],
  );
  const diffReviewScopeItems = useMemo(
    () =>
      diffReviewSummary
        ? buildDiffReviewScopeItems(diffReviewSummary.files)
        : [],
    [diffReviewSummary],
  );
  const diffReviewFileTreeItems = useMemo(
    () =>
      diffReviewSummary
        ? buildDiffReviewFileTreeItems(diffReviewSummary.files)
        : [],
    [diffReviewSummary],
  );
  const detailLoading =
    detailState.status === "loading" || diffState.status === "loading";
  const restoreLoading = restoreState.status === "loading";
  const batchRestoreLoading = batchRestoreState.status === "loading";
  const restoreBusy = restoreLoading || batchRestoreLoading;
  const restoreTargetPath =
    selectedCheckpoint?.path ||
    detailState.data?.live_path ||
    selectedCheckpointId;

  useEffect(() => {
    if (selectedRestoreCheckpointIds.length === 0) {
      return;
    }

    const checkpointIds = new Set(
      checkpoints.map((checkpoint) => checkpoint.checkpoint_id),
    );
    setSelectedRestoreCheckpointIds((previous) => {
      const next = previous.filter((checkpointId) =>
        checkpointIds.has(checkpointId),
      );
      return next.length === previous.length ? previous : next;
    });
  }, [checkpoints, selectedRestoreCheckpointIds.length]);

  const handleToggleBatchCheckpoint = useCallback(
    (checkpointId: string, checked: boolean) => {
      setSelectedRestoreCheckpointIds((previous) => {
        if (checked) {
          return previous.includes(checkpointId)
            ? previous
            : [...previous, checkpointId];
        }
        return previous.filter((item) => item !== checkpointId);
      });
    },
    [],
  );

  const handleToggleAllBatchCheckpoints = useCallback(
    (checked: boolean) => {
      setSelectedRestoreCheckpointIds(
        checked
          ? checkpoints.map((checkpoint) => checkpoint.checkpoint_id)
          : [],
      );
    },
    [checkpoints],
  );

  const handleRequestRestoreSelectedCheckpoint = useCallback(() => {
    if (!selectedCheckpointId || restoreBusy) {
      return;
    }

    setBatchRestoreConfirmationOpen(false);
    setRestoreConfirmationOpen(true);
  }, [restoreBusy, selectedCheckpointId]);

  const handleRestoreSelectedCheckpoint = useCallback(async () => {
    if (!selectedCheckpointId || restoreBusy) {
      return;
    }

    setRestoreConfirmationOpen(false);
    setRestoreState(
      createAsyncState<AgentRuntimeFileCheckpointRestoreResult>("loading"),
    );

    try {
      const result = await restoreAgentRuntimeFileCheckpoint({
        session_id: sessionId,
        checkpoint_id: selectedCheckpointId,
        confirm_restore: true,
        create_backup: true,
      });
      setRestoreState(
        createAsyncState<AgentRuntimeFileCheckpointRestoreResult>(
          "ready",
          result,
        ),
      );

      const [detailResult, diffResult] = await Promise.allSettled([
        getAgentRuntimeFileCheckpoint({
          session_id: sessionId,
          checkpoint_id: selectedCheckpointId,
        }),
        diffAgentRuntimeFileCheckpoint({
          session_id: sessionId,
          checkpoint_id: selectedCheckpointId,
        }),
      ]);
      applyCheckpointLoadResults(detailResult, diffResult);
    } catch (error) {
      setRestoreState(
        createAsyncState<AgentRuntimeFileCheckpointRestoreResult>(
          "error",
          null,
          error instanceof Error
            ? error.message
            : text("agentChat.threadFileCheckpointDialog.error.restoreFailed"),
        ),
      );
    }
  }, [
    applyCheckpointLoadResults,
    restoreBusy,
    selectedCheckpointId,
    sessionId,
    text,
  ]);

  const handleRequestRestoreSelectedBatch = useCallback(() => {
    if (selectedRestoreCheckpoints.length === 0 || restoreBusy) {
      return;
    }

    setRestoreConfirmationOpen(false);
    setBatchRestoreConfirmationOpen(true);
  }, [restoreBusy, selectedRestoreCheckpoints.length]);

  const handleRestoreSelectedBatch = useCallback(async () => {
    if (selectedRestoreCheckpoints.length === 0 || restoreBusy) {
      return;
    }

    setBatchRestoreConfirmationOpen(false);
    setRestoreState(
      createAsyncState<AgentRuntimeFileCheckpointRestoreResult>("idle"),
    );
    setBatchRestoreState(createAsyncState<BatchRestoreResultItem[]>("loading"));

    const results = await Promise.all(
      selectedRestoreCheckpoints.map(async (checkpoint) => {
        try {
          const result = await restoreAgentRuntimeFileCheckpoint({
            session_id: sessionId,
            checkpoint_id: checkpoint.checkpoint_id,
            confirm_restore: true,
            create_backup: true,
          });
          return {
            backupPath: result.backup_path,
            checkpointId: checkpoint.checkpoint_id,
            path: result.live_path || checkpoint.path,
            status: "success" as const,
          };
        } catch (error) {
          return {
            checkpointId: checkpoint.checkpoint_id,
            error:
              error instanceof Error
                ? error.message
                : text(
                    "agentChat.threadFileCheckpointDialog.error.restoreFailed",
                  ),
            path: checkpoint.path,
            status: "error" as const,
          };
        }
      }),
    );

    setBatchRestoreState(
      createAsyncState<BatchRestoreResultItem[]>("ready", results),
    );

    if (selectedCheckpointId) {
      const [detailResult, diffResult] = await Promise.allSettled([
        getAgentRuntimeFileCheckpoint({
          session_id: sessionId,
          checkpoint_id: selectedCheckpointId,
        }),
        diffAgentRuntimeFileCheckpoint({
          session_id: sessionId,
          checkpoint_id: selectedCheckpointId,
        }),
      ]);
      applyCheckpointLoadResults(detailResult, diffResult);
    }
  }, [
    applyCheckpointLoadResults,
    restoreBusy,
    selectedCheckpointId,
    selectedRestoreCheckpoints,
    sessionId,
    text,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-6xl" className="p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8">
            {text("agentChat.threadFileCheckpointDialog.title")}
          </DialogTitle>
          <DialogDescription className="space-y-1 text-xs leading-5">
            <span className="block">
              {text("agentChat.threadFileCheckpointDialog.description")}
            </span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              {text("agentChat.threadFileCheckpointDialog.runtime.session", {
                value: sessionId,
              })}
            </span>
            {workingDir ? (
              <span className="block font-mono text-[11px] text-muted-foreground">
                {text(
                  "agentChat.threadFileCheckpointDialog.runtime.workspace",
                  {
                    value: workingDir,
                  },
                )}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]"
          data-testid="agent-thread-file-checkpoint-dialog"
        >
          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-slate-900">
                  {text("agentChat.threadFileCheckpointDialog.list.title")}
                </div>
                {typeof listState.data?.checkpoint_count === "number" ? (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-700"
                  >
                    {text("agentChat.threadFileCheckpointDialog.list.count", {
                      count: listState.data.checkpoint_count,
                    })}
                  </Badge>
                ) : null}
                {listState.status === "loading" ? (
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-white text-sky-700"
                  >
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    {text("agentChat.threadFileCheckpointDialog.list.loading")}
                  </Badge>
                ) : null}
              </div>

              {listState.status === "error" ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm leading-6 text-rose-700">
                  {listState.error}
                </div>
              ) : checkpoints.length > 0 ? (
                <>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
                        <Checkbox
                          checked={allCheckpointsSelected}
                          disabled={restoreBusy}
                          onCheckedChange={handleToggleAllBatchCheckpoints}
                          data-testid="agent-thread-file-checkpoint-select-all"
                        />
                        <span>
                          {text(
                            "agentChat.threadFileCheckpointDialog.batch.selectAll",
                          )}
                        </span>
                      </label>
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-slate-700"
                      >
                        {text(
                          "agentChat.threadFileCheckpointDialog.batch.selected",
                          { count: selectedRestoreCheckpoints.length },
                        )}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {text(
                        "agentChat.threadFileCheckpointDialog.batch.hint",
                      )}
                    </div>
                  </div>
                  <div
                    className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1"
                    data-testid="agent-thread-file-checkpoint-list"
                  >
                    {checkpoints.map((checkpoint) => {
                      const versionLabel = resolveCheckpointVersionLabel(
                        checkpoint.version_no,
                      );
                      const updatedAtLabel = formatDiagnosticDateTime(
                        checkpoint.updated_at,
                      );
                      const previewText = normalizePreviewText(
                        checkpoint.preview_text,
                      );
                      const isSelected =
                        checkpoint.checkpoint_id === selectedCheckpointId;
                      const isChecked = selectedRestoreCheckpointSet.has(
                        checkpoint.checkpoint_id,
                      );

                      return (
                        <div
                          key={checkpoint.checkpoint_id}
                          className={cn(
                            "flex gap-2 rounded-2xl border px-3 py-3 transition-colors",
                            isSelected
                              ? "border-sky-300 bg-sky-50"
                              : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/60",
                          )}
                          data-testid={`agent-thread-file-checkpoint-row-${checkpoint.checkpoint_id}`}
                        >
                          <Checkbox
                            checked={isChecked}
                            disabled={restoreBusy}
                            className="mt-1"
                            onCheckedChange={(checked) =>
                              handleToggleBatchCheckpoint(
                                checkpoint.checkpoint_id,
                                checked,
                              )
                            }
                            aria-label={text(
                              "agentChat.threadFileCheckpointDialog.batch.selectItemAria",
                              { path: checkpoint.path },
                            )}
                            data-testid={`agent-thread-file-checkpoint-select-${checkpoint.checkpoint_id}`}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() =>
                              setSelectedCheckpointId(checkpoint.checkpoint_id)
                            }
                            data-testid={`agent-thread-file-checkpoint-item-${checkpoint.checkpoint_id}`}
                          >
                            <div className="break-all text-sm font-medium leading-6 text-slate-900">
                              {checkpoint.path}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {versionLabel ? (
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-700"
                                >
                                  {versionLabel}
                                </Badge>
                              ) : null}
                              {checkpoint.validation_issue_count > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-200 bg-amber-50 text-amber-700"
                                >
                                  {text(
                                    "agentChat.threadFileCheckpointDialog.validationIssues",
                                    {
                                      count:
                                        checkpoint.validation_issue_count,
                                    },
                                  )}
                                </Badge>
                              ) : null}
                              {checkpoint.status ? (
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-700"
                                >
                                  {checkpoint.status}
                                </Badge>
                              ) : null}
                            </div>
                            {previewText ? (
                              <div className="mt-2 text-xs leading-5 text-slate-600">
                                {previewText}
                              </div>
                            ) : null}
                            <div className="mt-2 text-[11px] leading-5 text-slate-500">
                              {updatedAtLabel
                                ? text(
                                    "agentChat.threadFileCheckpointDialog.updatedAt",
                                    {
                                      value: updatedAtLabel,
                                    },
                                  )
                                : text(
                                    "agentChat.threadFileCheckpointDialog.updatedAtUnknown",
                                  )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : listState.status === "ready" ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm leading-6 text-slate-600">
                  {text("agentChat.threadFileCheckpointDialog.emptyList")}
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <FileText className="h-4 w-4 text-sky-700" />
                      <span>
                        {text(
                          "agentChat.threadFileCheckpointDialog.currentSnapshot",
                        )}
                      </span>
                    </div>
                    {selectedCheckpoint ? (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-slate-700"
                      >
                        {resolveCheckpointVersionLabel(
                          selectedCheckpoint.version_no,
                        ) ||
                          text(
                            "agentChat.threadFileCheckpointDialog.version.unlabeled",
                          )}
                      </Badge>
                    ) : null}
                    {detailLoading ? (
                      <Badge
                        variant="outline"
                        className="border-sky-200 bg-sky-50 text-sky-700"
                      >
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        {text(
                          "agentChat.threadFileCheckpointDialog.syncingDetail",
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 break-all text-sm leading-6 text-slate-900">
                    {selectedCheckpoint?.path ||
                      text(
                        "agentChat.threadFileCheckpointDialog.selectSnapshot",
                      )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {selectedCheckpoint?.title ? (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {text("agentChat.threadFileCheckpointDialog.meta.title", {
                      value: selectedCheckpoint.title,
                    })}
                  </Badge>
                ) : null}
                {selectedCheckpoint?.source ? (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {text("agentChat.threadFileCheckpointDialog.meta.source", {
                      value: selectedCheckpoint.source,
                    })}
                  </Badge>
                ) : null}
                {selectedCheckpoint?.kind ? (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {text("agentChat.threadFileCheckpointDialog.meta.kind", {
                      value: selectedCheckpoint.kind,
                    })}
                  </Badge>
                ) : null}
                {selectedCheckpoint?.status ? (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {text("agentChat.threadFileCheckpointDialog.meta.status", {
                      value: selectedCheckpoint.status,
                    })}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                data-testid="agent-thread-file-checkpoint-detail"
              >
                <div className="text-sm font-medium text-slate-900">
                  {text("agentChat.threadFileCheckpointDialog.detail.title")}
                </div>
                {detailState.status === "error" ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm leading-6 text-rose-700">
                    {detailState.error}
                  </div>
                ) : detailState.data ? (
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.detail.livePath",
                        { value: detailState.data.live_path },
                      )}
                    </div>
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.detail.snapshotPath",
                        { value: detailState.data.snapshot_path },
                      )}
                    </div>
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.detail.versionHistory",
                        { count: detailState.data.version_history.length },
                      )}
                    </div>
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.detail.requestId",
                        {
                          value:
                            detailState.data.checkpoint.request_id ||
                            text("agentChat.threadFileCheckpointDialog.none"),
                        },
                      )}
                    </div>
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.detail.updatedAtLabel",
                      )}
                      {formatDiagnosticDateTime(
                        detailState.data.checkpoint.updated_at,
                        locale,
                      ) || text("agentChat.threadFileCheckpointDialog.unknown")}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    {text("agentChat.threadFileCheckpointDialog.detail.empty")}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  "rounded-2xl border px-4 py-3",
                  restoreState.status === "error" ||
                    (batchRestoreState.status === "ready" &&
                      batchRestoreFailedCount > 0)
                    ? "border-rose-200 bg-rose-50"
                    : restoreState.status === "ready" ||
                        (batchRestoreState.status === "ready" &&
                          batchRestoreSuccessCount > 0)
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50",
                )}
                data-testid="agent-thread-file-checkpoint-restore-state"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <RotateCcw
                    className={cn(
                      "h-4 w-4",
                      restoreState.status === "error"
                        ? "text-rose-600"
                        : restoreState.status === "ready"
                          ? "text-emerald-700"
                          : "text-slate-600",
                    )}
                  />
                  <span>
                    {text(
                      batchRestoreLoading
                        ? "agentChat.threadFileCheckpointDialog.batch.loading"
                        : restoreLoading
                        ? "agentChat.threadFileCheckpointDialog.restore.loading"
                        : "agentChat.threadFileCheckpointDialog.restore.action",
                    )}
                  </span>
                </div>
                {restoreState.status === "ready" && restoreState.data ? (
                  <div className="mt-3 space-y-2 text-sm leading-6 text-emerald-800">
                    <div>
                      {text(
                        "agentChat.threadFileCheckpointDialog.restore.success",
                        { path: restoreState.data.live_path },
                      )}
                    </div>
                    <div className="break-all font-mono text-xs">
                      {restoreState.data.backup_path
                        ? text(
                            "agentChat.threadFileCheckpointDialog.restore.backup",
                            { path: restoreState.data.backup_path },
                          )
                        : text(
                            "agentChat.threadFileCheckpointDialog.restore.noBackup",
                          )}
                    </div>
                  </div>
                ) : restoreState.status === "error" ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm leading-6 text-rose-700">
                    {restoreState.error}
                  </div>
                ) : restoreConfirmationOpen ? (
                  <div
                    className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-white px-3 py-3"
                    data-testid="agent-thread-file-checkpoint-restore-confirmation"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-slate-900">
                          {text(
                            "agentChat.threadFileCheckpointDialog.restore.confirmTitle",
                          )}
                        </div>
                        <div className="text-sm leading-6 text-slate-700">
                          {text(
                            "agentChat.threadFileCheckpointDialog.restore.confirm",
                            {
                              path: restoreTargetPath,
                            },
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      <div className="break-all font-mono text-slate-900">
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.confirmPath",
                          {
                            path: restoreTargetPath,
                          },
                        )}
                      </div>
                      <div>
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.confirmRisk",
                        )}
                      </div>
                      <div>
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.confirmBackup",
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRestoreConfirmationOpen(false)}
                        data-testid="agent-thread-file-checkpoint-restore-cancel"
                      >
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.cancel",
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          void handleRestoreSelectedCheckpoint();
                        }}
                        data-testid="agent-thread-file-checkpoint-restore-confirm"
                      >
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.confirmAction",
                        )}
                      </Button>
                    </div>
                  </div>
                ) : batchRestoreConfirmationOpen ? (
                  <div
                    className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-white px-3 py-3"
                    data-testid="agent-thread-file-checkpoint-batch-restore-confirmation"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-medium text-slate-900">
                          {text(
                            "agentChat.threadFileCheckpointDialog.batch.confirmTitle",
                          )}
                        </div>
                        <div className="text-sm leading-6 text-slate-700">
                          {text(
                            "agentChat.threadFileCheckpointDialog.batch.confirm",
                            {
                              count: selectedRestoreCheckpoints.length,
                            },
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      <div className="font-medium text-slate-900">
                        {text(
                          "agentChat.threadFileCheckpointDialog.batch.targetTitle",
                        )}
                      </div>
                      <div className="space-y-1">
                        {batchRestoreTargetPreview.map((path) => (
                          <div
                            key={path}
                            className="break-all font-mono text-slate-800"
                          >
                            {path}
                          </div>
                        ))}
                        {batchRestoreExtraCount > 0 ? (
                          <div className="text-slate-500">
                            {text(
                              "agentChat.threadFileCheckpointDialog.batch.moreTargets",
                              { count: batchRestoreExtraCount },
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        {text(
                          "agentChat.threadFileCheckpointDialog.batch.confirmRisk",
                        )}
                      </div>
                      <div>
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.confirmBackup",
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBatchRestoreConfirmationOpen(false)}
                        data-testid="agent-thread-file-checkpoint-batch-restore-cancel"
                      >
                        {text(
                          "agentChat.threadFileCheckpointDialog.restore.cancel",
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          void handleRestoreSelectedBatch();
                        }}
                        data-testid="agent-thread-file-checkpoint-batch-restore-confirm"
                      >
                        {text(
                          "agentChat.threadFileCheckpointDialog.batch.confirmAction",
                        )}
                      </Button>
                    </div>
                  </div>
                ) : batchRestoreLoading ? (
                  <div
                    className="mt-3 flex items-center gap-2 text-sm leading-6 text-slate-600"
                    data-testid="agent-thread-file-checkpoint-batch-restore-loading"
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    {text(
                      "agentChat.threadFileCheckpointDialog.batch.loading",
                    )}
                  </div>
                ) : batchRestoreState.status === "ready" &&
                  batchRestoreState.data ? (
                  <div
                    className="mt-3 space-y-3 text-sm leading-6"
                    data-testid="agent-thread-file-checkpoint-batch-restore-result"
                  >
                    <div
                      className={cn(
                        "font-medium",
                        batchRestoreFailedCount > 0
                          ? "text-rose-800"
                          : "text-emerald-800",
                      )}
                    >
                      {text(
                        "agentChat.threadFileCheckpointDialog.batch.resultSummary",
                        {
                          failed: batchRestoreFailedCount,
                          success: batchRestoreSuccessCount,
                        },
                      )}
                    </div>
                    <div className="space-y-2">
                      {batchRestoreState.data.map((item) => (
                        <div
                          key={item.checkpointId}
                          className={cn(
                            "rounded-xl border bg-white px-3 py-2",
                            item.status === "success"
                              ? "border-emerald-200"
                              : "border-rose-200",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "bg-white text-[11px]",
                                item.status === "success"
                                  ? "border-emerald-200 text-emerald-800"
                                  : "border-rose-200 text-rose-800",
                              )}
                            >
                              {text(
                                item.status === "success"
                                  ? "agentChat.threadFileCheckpointDialog.batch.item.success"
                                  : "agentChat.threadFileCheckpointDialog.batch.item.failed",
                              )}
                            </Badge>
                            <code className="min-w-0 break-all font-mono text-xs text-slate-800">
                              {item.path}
                            </code>
                          </div>
                          {item.backupPath ? (
                            <div className="mt-1 break-all font-mono text-xs text-emerald-800">
                              {text(
                                "agentChat.threadFileCheckpointDialog.restore.backup",
                                { path: item.backupPath },
                              )}
                            </div>
                          ) : item.error ? (
                            <div className="mt-1 text-xs text-rose-700">
                              {item.error}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    {text(
                      selectedRestoreCheckpoints.length > 0
                        ? "agentChat.threadFileCheckpointDialog.batch.description"
                        : "agentChat.threadFileCheckpointDialog.restore.description",
                      {
                        count: selectedRestoreCheckpoints.length,
                      },
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>
                    {text(
                      "agentChat.threadFileCheckpointDialog.versionValidation",
                    )}
                  </span>
                </div>
                {detailState.status === "error" ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm leading-6 text-rose-700">
                    {detailState.error}
                  </div>
                ) : detailState.data || diffState.data ? (
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                    <div className="flex flex-wrap gap-2">
                      {diffState.data?.previous_version_id ? (
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-700"
                        >
                          {text(
                            "agentChat.threadFileCheckpointDialog.version.previous",
                            { value: diffState.data.previous_version_id },
                          )}
                        </Badge>
                      ) : null}
                      {diffState.data?.current_version_id ? (
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-700"
                        >
                          {text(
                            "agentChat.threadFileCheckpointDialog.version.current",
                            { value: diffState.data.current_version_id },
                          )}
                        </Badge>
                      ) : null}
                    </div>
                    {detailState.data?.validation_issues.length ? (
                      <div className="space-y-2">
                        {detailState.data.validation_issues.map((issue) => (
                          <div
                            key={issue}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"
                          >
                            {issue}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-600">
                        {text(
                          "agentChat.threadFileCheckpointDialog.noValidationIssues",
                        )}
                      </div>
                    )}
                    {diffState.status === "error" ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-700">
                        {diffState.error}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 text-sm leading-6 text-slate-600">
                    {text(
                      "agentChat.threadFileCheckpointDialog.versionValidationEmpty",
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
                <FileJson className="h-4 w-4 text-sky-700" />
                <span>{documentPreviewTitle}</span>
              </div>
              <div className="max-h-[24vh] overflow-y-auto px-4 py-4">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-700">
                  {serializePreviewValue(
                    documentPreviewValue,
                    text("agentChat.threadFileCheckpointDialog.emptyPreview"),
                  )}
                </pre>
              </div>
            </div>

            <div
              className="rounded-2xl border border-slate-200 bg-white"
              data-testid="agent-thread-file-checkpoint-diff"
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
                <GitCompare className="h-4 w-4 text-sky-700" />
                <span>{text("agentChat.threadFileCheckpointDialog.diff")}</span>
              </div>
              <div className="max-h-[44vh] overflow-y-auto px-4 py-4">
                {diffReviewSummary ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>
                        {text("agentChat.toolCall.diffReview.files", {
                          count: diffReviewSummary.files.length,
                        })}
                      </span>
                      <span className="text-emerald-700">
                        {text("agentChat.toolCall.diffReview.additions", {
                          count: diffReviewSummary.additions,
                        })}
                      </span>
                      <span className="text-rose-700">
                        {text("agentChat.toolCall.diffReview.deletions", {
                          count: diffReviewSummary.deletions,
                        })}
                      </span>
                      <span>
                        {text("agentChat.toolCall.diffReview.hunks", {
                          count: diffReviewSummary.hunks,
                        })}
                      </span>
                    </div>

                    {diffReviewScopeItems.length > 0 ? (
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                        data-testid="agent-thread-file-checkpoint-diff-scope"
                      >
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <FileText className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            {text("agentChat.toolCall.diffReview.scopeTitle")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {diffReviewScopeItems.map((scope) => (
                            <div
                              key={scope.id}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                            >
                              <code className="max-w-56 truncate font-mono text-slate-800">
                                {scope.label ||
                                  text(
                                    "agentChat.toolCall.diffReview.scopeRoot",
                                  )}
                              </code>
                              <span>
                                {text("agentChat.toolCall.diffReview.files", {
                                  count: scope.fileCount,
                                })}
                              </span>
                              <span className="text-emerald-700">
                                +{scope.additions}
                              </span>
                              <span className="text-rose-700">
                                -{scope.deletions}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {diffReviewFileTreeItems.length > 0 ? (
                      <div
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        data-testid="agent-thread-file-checkpoint-file-tree"
                      >
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <FolderTree className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            {text(
                              "agentChat.threadFileCheckpointDialog.fileTree.title",
                            )}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {diffReviewFileTreeItems.map((item) => (
                            <div
                              key={item.id}
                              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-2 py-1 text-[11px] leading-5 text-slate-600"
                              style={{
                                paddingLeft: `${8 + item.depth * 14}px`,
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                {item.kind === "directory" ? (
                                  <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                )}
                                <code className="font-mono text-slate-800">
                                  {item.label}
                                </code>
                                <span className="ml-2 text-slate-500">
                                  {text(
                                    item.kind === "directory"
                                      ? "agentChat.threadFileCheckpointDialog.fileTree.directory"
                                      : "agentChat.threadFileCheckpointDialog.fileTree.file",
                                    { count: item.fileCount },
                                  )}
                                </span>
                              </div>
                              <span className="text-emerald-700">
                                +{item.additions}
                              </span>
                              <span className="text-rose-700">
                                -{item.deletions}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {diffReviewSummary.files.map((file) => {
                        const sideBySideRows = buildDiffReviewSideBySideRows(
                          file,
                          { maxRows: 28 },
                        );

                        return (
                          <div
                            key={file.id}
                            className="rounded-xl border border-slate-200 bg-slate-50"
                            data-testid="agent-thread-file-checkpoint-diff-file"
                          >
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "bg-white text-[10px]",
                                  file.status === "added" &&
                                    "border-emerald-200 text-emerald-800",
                                  file.status === "deleted" &&
                                    "border-rose-200 text-rose-800",
                                  file.status === "modified" &&
                                    "border-sky-200 text-sky-800",
                                  file.status === "unknown" &&
                                    "border-slate-200 text-slate-700",
                                )}
                              >
                                {t(
                                  `agentChat.toolCall.diffReview.status.${file.status}`,
                                )}
                              </Badge>
                              <code className="min-w-0 break-all font-mono text-xs text-slate-800">
                                {file.path}
                              </code>
                              <span className="text-xs text-emerald-700">
                                +{file.additions}
                              </span>
                              <span className="text-xs text-rose-700">
                                -{file.deletions}
                              </span>
                            </div>
                            {sideBySideRows.length > 0 ? (
                              <div
                                className="overflow-x-auto"
                                data-testid="agent-thread-file-checkpoint-side-by-side"
                              >
                                <div className="grid min-w-[720px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200 bg-white text-[11px] font-medium text-slate-600">
                                  <div className="border-r border-slate-200 px-3 py-2">
                                    {text(
                                      "agentChat.threadFileCheckpointDialog.sideBySide.before",
                                    )}
                                  </div>
                                  <div className="px-3 py-2">
                                    {text(
                                      "agentChat.threadFileCheckpointDialog.sideBySide.after",
                                    )}
                                  </div>
                                </div>
                                <div className="min-w-[720px] font-mono text-[11px] leading-relaxed">
                                  {sideBySideRows.map((row) => (
                                    <div
                                      key={row.id}
                                      className={cn(
                                        "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-100 last:border-b-0",
                                        row.kind === "hunk" &&
                                          "bg-sky-50 text-sky-900",
                                        row.kind === "change" &&
                                          "bg-amber-50 text-slate-900",
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "min-w-0 break-all border-r border-slate-200 px-3 py-1.5",
                                          row.kind === "remove" &&
                                            "bg-rose-50 text-rose-900",
                                          row.kind === "add" && "text-slate-400",
                                          row.kind === "change" &&
                                            "bg-rose-50 text-rose-900",
                                        )}
                                      >
                                        {row.before || " "}
                                      </div>
                                      <div
                                        className={cn(
                                          "min-w-0 break-all px-3 py-1.5",
                                          row.kind === "add" &&
                                            "bg-emerald-50 text-emerald-900",
                                          row.kind === "remove" &&
                                            "text-slate-400",
                                          row.kind === "change" &&
                                            "bg-emerald-50 text-emerald-900",
                                        )}
                                      >
                                        {row.after || " "}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-700">
                    {serializePreviewValue(
                      diffPreviewValue,
                      text("agentChat.threadFileCheckpointDialog.emptyPreview"),
                    )}
                  </pre>
                )}
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!selectedCheckpointId || restoreBusy}
                onClick={() => {
                  handleRequestRestoreSelectedCheckpoint();
                }}
                aria-label={text(
                  "agentChat.threadFileCheckpointDialog.restore.actionAria",
                )}
                data-testid="agent-thread-file-checkpoint-restore"
              >
                {restoreLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {text(
                  restoreLoading
                    ? "agentChat.threadFileCheckpointDialog.restore.loading"
                    : "agentChat.threadFileCheckpointDialog.restore.action",
                )}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={selectedRestoreCheckpoints.length === 0 || restoreBusy}
                onClick={() => {
                  handleRequestRestoreSelectedBatch();
                }}
                aria-label={text(
                  "agentChat.threadFileCheckpointDialog.batch.actionAria",
                  { count: selectedRestoreCheckpoints.length },
                )}
                data-testid="agent-thread-file-checkpoint-batch-restore"
              >
                {batchRestoreLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {text(
                  batchRestoreLoading
                    ? "agentChat.threadFileCheckpointDialog.batch.loading"
                    : "agentChat.threadFileCheckpointDialog.batch.action",
                  { count: selectedRestoreCheckpoints.length },
                )}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {text("agentChat.threadFileCheckpointDialog.close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
