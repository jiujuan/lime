import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileInput,
  Loader2,
  MessageSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import {
  commitConversationImportThread,
  previewConversationImportThread,
  scanConversationImportSource,
  type ConversationImportThreadCommitResponse,
  type ConversationImportThreadPreviewResponse,
  type ImportedThreadSummary,
} from "@/lib/api/conversationImport";
import { formatDate, formatNumber } from "@/i18n/format";

const SCAN_LIMIT = 40;
const PREVIEW_LIMIT = 12;

interface AppSidebarConversationImportDialogProps {
  isOpen: boolean;
  workspaceId?: string | null;
  projectPath?: string | null;
  projectName?: string | null;
  onClose: () => void;
  onImported: (response: ConversationImportThreadCommitResponse) => void;
}

type ImportStage = "idle" | "scanning" | "previewing" | "committing";

function normalizeOptional(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveThreadTitle(thread?: ImportedThreadSummary | null) {
  return (
    normalizeOptional(thread?.title) ||
    normalizeOptional(thread?.sourceThreadId) ||
    "Codex"
  );
}

function firstImportableThread(threads: ImportedThreadSummary[]) {
  return (
    threads.find((thread) => thread.importStatus === "not_imported") ??
    threads[0] ??
    null
  );
}

function formatOptionalDate(value: string | undefined, locale: string) {
  if (!value) {
    return null;
  }
  return formatDate(value, {
    locale,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceClientLabel(sourceClient: string | undefined) {
  return sourceClient === "claude_code" ? "Claude Code" : "Codex";
}

function truncatePreviewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 220)}...`;
}

export function AppSidebarConversationImportDialog({
  isOpen,
  workspaceId,
  projectPath,
  projectName,
  onClose,
  onImported,
}: AppSidebarConversationImportDialogProps) {
  const { t, i18n } = useTranslation("navigation");
  const [stage, setStage] = useState<ImportStage>("idle");
  const [sourceRootInput, setSourceRootInput] = useState("");
  const [threads, setThreads] = useState<ImportedThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [preview, setPreview] =
    useState<ConversationImportThreadPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceRoot = normalizeOptional(sourceRootInput);
  const sourceRootRef = useRef<string | undefined>(sourceRoot);
  const selectedThread = useMemo(
    () =>
      threads.find((thread) => thread.sourceThreadId === selectedThreadId) ??
      null,
    [selectedThreadId, threads],
  );
  const loading = stage === "scanning" || stage === "previewing";
  const committing = stage === "committing";
  const threadTitle = resolveThreadTitle(preview?.thread ?? selectedThread);
  const dryRun = preview?.summary.dryRun;
  const fidelity = preview?.summary.fidelity;
  const targetLabel =
    normalizeOptional(projectName) ||
    normalizeOptional(workspaceId) ||
    t("navigation.sidebar.importDialog.target.standalone", "独立对话");
  const selectedUpdatedAt = formatOptionalDate(
    preview?.thread.updatedAt ?? selectedThread?.updatedAt,
    i18n.language,
  );

  const loadPreview = useCallback(
    async (thread: ImportedThreadSummary, nextSourceRoot?: string) => {
      setStage("previewing");
      setError(null);
      const result = await previewConversationImportThread({
        sourceClient: "codex",
        sourceRoot: nextSourceRoot,
        sourceThreadId: thread.sourceThreadId,
        sourcePath: thread.sourcePath,
        limit: PREVIEW_LIMIT,
      });
      setPreview(result);
    },
    [],
  );

  const loadThreads = useCallback(async (nextSourceRoot?: string) => {
    setStage("scanning");
    setError(null);
    setPreview(null);
    try {
      const result = await scanConversationImportSource({
        sourceClient: "codex",
        sourceRoot: nextSourceRoot,
        projectPath: normalizeOptional(projectPath),
        includeArchived: false,
        limit: SCAN_LIMIT,
      });
      const nextThreads = result.threads;
      setThreads(nextThreads);
      const nextSelected = firstImportableThread(nextThreads);
      setSelectedThreadId(nextSelected?.sourceThreadId ?? null);
      if (nextSelected) {
        await loadPreview(
          nextSelected,
          result.source.sourceRoot ?? nextSourceRoot,
        );
      }
    } catch (scanError) {
      setThreads([]);
      setSelectedThreadId(null);
      setError(
        scanError instanceof Error && scanError.message.trim()
          ? scanError.message.trim()
          : t(
              "navigation.sidebar.importDialog.error.scan",
              "读取 Codex 对话失败",
            ),
      );
    } finally {
      setStage("idle");
    }
  }, [loadPreview, projectPath, t]);

  useEffect(() => {
    sourceRootRef.current = sourceRoot;
  }, [sourceRoot]);

  useEffect(() => {
    if (!isOpen) {
      setStage("idle");
      setError(null);
      setPreview(null);
      return;
    }
    void loadThreads(sourceRootRef.current);
  }, [isOpen, loadThreads]);

  const handleSelectThread = useCallback(
    async (thread: ImportedThreadSummary) => {
      if (committing || loading) {
        return;
      }
      setSelectedThreadId(thread.sourceThreadId);
      try {
        await loadPreview(thread, preview?.source.sourceRoot ?? sourceRoot);
      } catch (previewError) {
        setPreview(null);
        setError(
          previewError instanceof Error && previewError.message.trim()
            ? previewError.message.trim()
            : t(
                "navigation.sidebar.importDialog.error.preview",
                "读取对话预览失败",
              ),
        );
      } finally {
        setStage("idle");
      }
    },
    [committing, loadPreview, loading, preview?.source.sourceRoot, sourceRoot, t],
  );

  const handleCommit = useCallback(async () => {
    const thread = preview?.thread ?? selectedThread;
    if (!thread) {
      return;
    }

    setStage("committing");
    setError(null);
    try {
      const result = await commitConversationImportThread({
        sourceClient: "codex",
        sourceRoot: preview?.source.sourceRoot ?? sourceRoot,
        sourceThreadId: thread.sourceThreadId,
        sourcePath: thread.sourcePath,
        workspaceId: normalizeOptional(workspaceId),
        confirmed: true,
      });
      onImported(result);
    } catch (commitError) {
      setError(
        commitError instanceof Error && commitError.message.trim()
          ? commitError.message.trim()
          : t(
              "navigation.sidebar.importDialog.error.commit",
              "导入 Codex 对话失败",
            ),
      );
    } finally {
      setStage("idle");
    }
  }, [
    onImported,
    preview?.source.sourceRoot,
    preview?.thread,
    selectedThread,
    sourceRoot,
    t,
    workspaceId,
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="p-0"
      maxWidth="max-w-[920px]"
      showCloseButton={false}
      closeOnOverlayClick={!committing}
    >
      <div
        className="relative flex max-h-[calc(100vh-4rem)] min-h-[560px] flex-col overflow-hidden bg-white text-slate-900"
        data-testid="app-sidebar-conversation-import-dialog"
      >
        <button
          type="button"
          aria-label={t(
            "navigation.sidebar.importDialog.close",
            "关闭导入弹窗",
          )}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={committing}
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>

        <header className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <FileInput className="h-3.5 w-3.5" />
            {t("navigation.sidebar.importDialog.eyebrow", "Codex 对话导入")}
          </div>
          <div className="mt-3 max-w-3xl">
            <h2 className="text-xl font-semibold text-slate-950">
              {t("navigation.sidebar.importDialog.title", "导入 Codex 对话")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t(
                "navigation.sidebar.importDialog.description",
                "先读取 Codex 本地对话并生成预览，确认后写入 Lime 当前会话主链。",
              )}
            </p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70">
            <div className="space-y-3 border-b border-slate-200 p-4">
              <label className="block text-xs font-semibold text-slate-600">
                {t(
                  "navigation.sidebar.importDialog.sourceRoot.label",
                  "Codex 数据目录",
                )}
                <input
                  value={sourceRootInput}
                  onChange={(event) => setSourceRootInput(event.target.value)}
                  placeholder={t(
                    "navigation.sidebar.importDialog.sourceRoot.placeholder",
                    "自动使用 CODEX_HOME 或 ~/.codex",
                  )}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-300"
                  disabled={committing}
                />
              </label>
              <button
                type="button"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || committing}
                onClick={() => void loadThreads(sourceRoot)}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                {loading
                  ? t(
                      "navigation.sidebar.importDialog.action.loading",
                      "正在读取",
                    )
                  : t(
                      "navigation.sidebar.importDialog.action.refresh",
                      "重新扫描",
                    )}
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500">
                  {t(
                    "navigation.sidebar.importDialog.threadList.title",
                    "可导入对话 {{count}}",
                    {
                      count: threads.length,
                    },
                  )}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {threads.length > 0 ? (
                  threads.map((thread) => {
                    const active = selectedThreadId === thread.sourceThreadId;
                    const title = resolveThreadTitle(thread);
                    const updatedAt = formatOptionalDate(
                      thread.updatedAt,
                      i18n.language,
                    );
                    return (
                      <button
                        key={thread.sourceThreadId}
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          active
                            ? "border-emerald-200 bg-white shadow-sm"
                            : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                        }`}
                        disabled={loading || committing}
                        title={title}
                        onClick={() => void handleSelectThread(thread)}
                      >
                        <span className="flex items-start gap-2">
                          <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {updatedAt ||
                                thread.cwd ||
                                thread.sourceThreadId}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 text-center text-sm font-medium text-slate-500">
                    {loading
                      ? t(
                          "navigation.sidebar.importDialog.empty.loading",
                          "正在读取 Codex 对话",
                        )
                      : t(
                          "navigation.sidebar.importDialog.empty.noThreads",
                          "没有找到可导入的 Codex 对话",
                        )}
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 flex-col">
            <div className="grid grid-cols-3 gap-3 border-b border-slate-200 p-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="text-xs font-semibold text-slate-500">
                  {t(
                    "navigation.sidebar.importDialog.meta.source",
                    "来源",
                  )}
                </span>
                <strong className="mt-1 block text-sm text-slate-950">
                  {sourceClientLabel(preview?.source.sourceClient)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="text-xs font-semibold text-slate-500">
                  {t(
                    "navigation.sidebar.importDialog.meta.target",
                    "导入到",
                  )}
                </span>
                <strong className="mt-1 block truncate text-sm text-slate-950">
                  {targetLabel}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="text-xs font-semibold text-slate-500">
                  {t(
                    "navigation.sidebar.importDialog.meta.messages",
                    "消息",
                  )}
                </span>
                <strong className="mt-1 block text-sm text-slate-950">
                  {preview
                    ? formatNumber(
                        dryRun?.willImportMessages ??
                          preview.summary.messageCount,
                        {
                          locale: i18n.language,
                        },
                      )
                    : "-"}
                </strong>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {error ? (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {preview ? (
                <div className="space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-slate-950">
                          {threadTitle}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {t("navigation.sidebar.importDialog.preview.meta", {
                            threadId: preview.thread.sourceThreadId,
                            updatedAt:
                              selectedUpdatedAt ||
                              t(
                                "navigation.sidebar.importDialog.preview.unknownTime",
                                "未知时间",
                              ),
                            defaultValue:
                              "Codex thread {{threadId}} · {{updatedAt}}",
                          })}
                        </p>
                      </div>
                      {preview.thread.importStatus === "imported" ? (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t(
                            "navigation.sidebar.importDialog.status.imported",
                            "已导入",
                          )}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {[
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.messages",
                            "消息",
                          ),
                          dryRun?.willImportMessages ??
                            preview.summary.messageCount,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.turns",
                            "回合",
                          ),
                          dryRun?.willImportTurns ?? 0,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.attachments",
                            "附件",
                          ),
                          dryRun?.willImportAttachments ?? 0,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.timeline",
                            "时间线",
                          ),
                          dryRun?.willImportTimelineItems ??
                            preview.summary.messageCount +
                              preview.summary.rolloutEventItems,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl bg-slate-50 p-3"
                        >
                          <span className="block text-xs font-semibold text-slate-500">
                            {label}
                          </span>
                          <strong className="mt-1 block text-base text-slate-950">
                            {formatNumber(Number(value), {
                              locale: i18n.language,
                            })}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.lines",
                            "行数",
                          ),
                          preview.summary.lineCount,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.events",
                            "事件",
                          ),
                          preview.summary.rolloutEventItems,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.unsupported",
                            "未映射",
                          ),
                          dryRun?.unsupportedItems ??
                            preview.summary.unsupportedCount,
                        ],
                        [
                          t(
                            "navigation.sidebar.importDialog.summary.preview",
                            "预览",
                          ),
                          preview.messages.length,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl bg-slate-50 p-3"
                        >
                          <span className="block text-xs font-semibold text-slate-500">
                            {label}
                          </span>
                          <strong className="mt-1 block text-base text-slate-950">
                            {formatNumber(Number(value), {
                              locale: i18n.language,
                            })}
                          </strong>
                        </div>
                      ))}
                    </div>

                    {fidelity ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-600">
                            {t(
                              "navigation.sidebar.importDialog.fidelity.title",
                              "Codex 细节还原",
                            )}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {t(
                              "navigation.sidebar.importDialog.fidelity.provenance",
                              "保留来源序号与调用 ID",
                            )}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.tools",
                                "工具",
                              ),
                              fidelity.tools,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.commands",
                                "命令",
                              ),
                              fidelity.commands,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.patches",
                                "补丁",
                              ),
                              fidelity.patches,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.approvals",
                                "审批",
                              ),
                              fidelity.approvals,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.reasoning",
                                "推理",
                              ),
                              fidelity.reasoning,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.mcp",
                                "MCP",
                              ),
                              fidelity.mcp,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.webSearch",
                                "搜索",
                              ),
                              fidelity.webSearch,
                            ],
                            [
                              t(
                                "navigation.sidebar.importDialog.fidelity.dropped",
                                "预算裁剪",
                              ),
                              fidelity.budgetDropped,
                            ],
                          ].map(([label, value]) => (
                            <div
                              key={String(label)}
                              className="rounded-lg bg-white px-3 py-2"
                            >
                              <span className="block text-[11px] font-semibold text-slate-500">
                                {label}
                              </span>
                              <strong className="mt-1 block text-sm text-slate-950">
                                {formatNumber(Number(value), {
                                  locale: i18n.language,
                                })}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  {preview.summary.warnings.length > 0 ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      <div className="mb-2 flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        {t(
                          "navigation.sidebar.importDialog.warnings.title",
                          "导入提示",
                        )}
                      </div>
                      <ul className="space-y-1">
                        {preview.summary.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700">
                      {t(
                        "navigation.sidebar.importDialog.messages.title",
                        "消息预览",
                      )}
                    </h4>
                    <div className="space-y-2">
                      {preview.messages.map((message, index) => (
                        <article
                          key={`${message.role}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {message.role === "assistant"
                                ? t(
                                    "navigation.sidebar.importDialog.role.assistant",
                                    "Codex",
                                  )
                                : t(
                                    "navigation.sidebar.importDialog.role.user",
                                    "用户",
                                  )}
                            </span>
                            <span className="flex flex-wrap justify-end gap-2">
                              {message.truncated ? (
                                <span className="text-xs font-medium text-amber-700">
                                  {t(
                                    "navigation.sidebar.importDialog.messages.truncated",
                                    "已截断",
                                  )}
                                </span>
                              ) : null}
                              {(message.attachments ?? []).length > 0 ? (
                                <span className="text-xs font-medium text-emerald-700">
                                  {t(
                                    "navigation.sidebar.importDialog.messages.attachments",
                                    "附件 {{count}}",
                                    {
                                      count: (message.attachments ?? []).length,
                                    },
                                  )}
                                </span>
                              ) : null}
                            </span>
                          </div>
                          {message.provenance ? (
                            <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                              <span>
                                {message.provenance.sourceEventType}
                                {message.provenance.sourceEventSeq
                                  ? ` #${message.provenance.sourceEventSeq}`
                                  : ""}
                              </span>
                              {message.provenance.sourcePayloadType ? (
                                <span>
                                  {message.provenance.sourcePayloadType}
                                </span>
                              ) : null}
                              {message.provenance.sourceCallId ? (
                                <span>{message.provenance.sourceCallId}</span>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {truncatePreviewText(message.text)}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t(
                        "navigation.sidebar.importDialog.preview.loading",
                        "正在生成预览",
                      )}
                    </span>
                  ) : (
                    t(
                      "navigation.sidebar.importDialog.preview.empty",
                      "请选择一条 Codex 对话查看预览",
                    )
                  )}
                </div>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                {t(
                  "navigation.sidebar.importDialog.confirmNotice",
                  "确认后只写入 Lime 会话，不修改 Codex 本地数据；后续继续对话仍走 Lime 多模型运行时。",
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={committing}
                  onClick={onClose}
                >
                  {t("navigation.sidebar.importDialog.action.cancel", "取消")}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!preview || loading || committing}
                  onClick={() => void handleCommit()}
                  data-testid="app-sidebar-conversation-import-confirm"
                >
                  {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {committing
                    ? t(
                        "navigation.sidebar.importDialog.action.importing",
                        "正在导入",
                      )
                    : t(
                        "navigation.sidebar.importDialog.action.confirm",
                        "确认导入",
                      )}
                </button>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </Modal>
  );
}
