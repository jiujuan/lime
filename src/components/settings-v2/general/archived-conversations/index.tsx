import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Clock3, FolderOpen, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  listAgentRuntimeSessions,
  updateAgentRuntimeSession,
  type AsterSessionInfo,
} from "@/lib/api/agentRuntime";
import { formatDate } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { resolveSidebarSessionTitle } from "@/components/app-sidebar/sidebarSessionFormatting";

const ARCHIVED_CONVERSATIONS_PAGE_SIZE = 80;

function resolveTimestampMs(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatSessionDate(
  value: number | null,
  locale: string | undefined,
): string | null {
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

function resolveWorkspaceLabel(session: AsterSessionInfo): string | null {
  const workspaceId = session.workspace_id?.trim();
  if (workspaceId) {
    return workspaceId;
  }

  const workingDir = session.working_dir?.trim();
  if (!workingDir) {
    return null;
  }

  const normalized = workingDir.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

export function ArchivedConversationsSettings() {
  const { t, i18n } = useTranslation("settings");
  const [sessions, setSessions] = useState<AsterSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringSessionId, setRestoringSessionId] = useState<string | null>(
    null,
  );
  const untitledLabel = t(
    "settings.archivedConversations.untitled",
    "未命名对话",
  );
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const leftTime = left.archived_at ?? left.updated_at ?? left.created_at;
        const rightTime =
          right.archived_at ?? right.updated_at ?? right.created_at;
        return rightTime - leftTime;
      }),
    [sessions],
  );

  const loadArchivedSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSessions = await listAgentRuntimeSessions({
        archivedOnly: true,
        limit: ARCHIVED_CONVERSATIONS_PAGE_SIZE,
      });
      setSessions(nextSessions.filter((session) => Boolean(session.archived_at)));
    } catch (loadError) {
      console.error("加载已归档对话失败:", loadError);
      setError(
        t(
          "settings.archivedConversations.error.load",
          "加载已归档对话失败",
        ),
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadArchivedSessions();
  }, [loadArchivedSessions]);

  const handleRestore = useCallback(
    async (session: AsterSessionInfo) => {
      setRestoringSessionId(session.id);
      try {
        await updateAgentRuntimeSession({
          session_id: session.id,
          archived: false,
        });
        setSessions((current) =>
          current.filter((item) => item.id !== session.id),
        );
        toast.success(
          t("settings.archivedConversations.toast.restored", "已恢复对话"),
        );
      } catch (restoreError) {
        console.error("恢复已归档对话失败:", restoreError);
        toast.error(
          t(
            "settings.archivedConversations.toast.restoreFailed",
            "恢复失败，请稍后重试",
          ),
        );
      } finally {
        setRestoringSessionId(null);
      }
    },
    [t],
  );

  return (
    <div
      className="space-y-5 pb-8"
      data-testid="settings-archived-conversations"
    >
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              <Archive className="h-3.5 w-3.5" />
              {t("settings.archivedConversations.eyebrow", "归档管理")}
            </div>
            <div className="space-y-1">
              <h1 className="text-[24px] font-semibold text-slate-900">
                {t("settings.archivedConversations.title", "已归档对话")}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-500">
                {t(
                  "settings.archivedConversations.description",
                  "归档后的对话不会出现在左侧导航中，可在这里查看并恢复。",
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
            onClick={() => void loadArchivedSessions()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("settings.archivedConversations.action.refresh", "刷新")}
          </button>
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200/80 bg-white shadow-sm shadow-slate-950/5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("settings.archivedConversations.list.title", "归档列表")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t(
                "settings.archivedConversations.list.count",
                "{{count}} 条归档对话",
                {
                  count: sortedSessions.length,
                },
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t(
              "settings.archivedConversations.status.loading",
              "正在加载已归档对话",
            )}
          </div>
        ) : error ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-rose-600">{error}</p>
            <button
              type="button"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => void loadArchivedSessions()}
            >
              <RefreshCw className="h-4 w-4" />
              {t("settings.archivedConversations.action.retry", "重试")}
            </button>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
              <Archive className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">
                {t(
                  "settings.archivedConversations.empty.title",
                  "暂无已归档对话",
                )}
              </p>
              <p className="max-w-md text-sm leading-6 text-slate-500">
                {t(
                  "settings.archivedConversations.empty.description",
                  "在左侧对话菜单中归档后，对话会从导航中移除，并集中显示在这里。",
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedSessions.map((session) => {
              const title = resolveSidebarSessionTitle(session, untitledLabel);
              const archivedAt = formatSessionDate(
                resolveTimestampMs(session.archived_at),
                i18n.language,
              );
              const updatedAt = formatSessionDate(
                resolveTimestampMs(session.updated_at),
                i18n.language,
              );
              const workspaceLabel = resolveWorkspaceLabel(session);
              const restoring = restoringSessionId === session.id;

              return (
                <article
                  key={session.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                      {title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {workspaceLabel ? (
                        <span className="inline-flex max-w-[240px] items-center gap-1 truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{workspaceLabel}</span>
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {archivedAt
                          ? t(
                              "settings.archivedConversations.meta.archivedAt",
                              "归档于 {{time}}",
                              {
                                time: archivedAt,
                              },
                            )
                          : t(
                              "settings.archivedConversations.meta.archivedUnknown",
                              "归档时间未知",
                            )}
                      </span>
                      {updatedAt ? (
                        <span>
                          {t(
                            "settings.archivedConversations.meta.updatedAt",
                            "更新于 {{time}}",
                            {
                              time: updatedAt,
                            },
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-default disabled:opacity-60"
                    disabled={restoring}
                    onClick={() => void handleRestore(session)}
                  >
                    <RotateCcw className={cn("h-4 w-4", restoring && "animate-spin")} />
                    {restoring
                      ? t(
                          "settings.archivedConversations.action.restoring",
                          "恢复中...",
                        )
                      : t(
                          "settings.archivedConversations.action.restore",
                          "恢复",
                        )}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
