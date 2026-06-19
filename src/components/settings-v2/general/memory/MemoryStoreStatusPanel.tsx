import { useCallback, useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getMemoryStoreHealth,
  resetMemoryStore,
  type MemoryStoreHealthResponse,
} from "@/lib/api/memoryStore";
import { cn } from "@/lib/utils";

interface MemoryStoreStatusPanelProps {
  vectorSearchEnabled: boolean;
  memoryStatusDescriptionKey: string;
  setMessage: (message: string | null) => void;
}

function memoryPanelT(
  t: TFunction<"settings">,
  key: string,
  values: Record<string, string | number | boolean> = {},
): string {
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string | number | boolean>,
  ) => string;
  return String(translate(key, values));
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function healthRootScope(
  t: TFunction<"settings">,
  health: MemoryStoreHealthResponse | null,
): string {
  if (!health) {
    return memoryPanelT(t, "settings.memory.store.statusUnknown");
  }
  return health.rootScope === "workspace"
    ? memoryPanelT(t, "settings.memory.store.scope.workspace")
    : memoryPanelT(t, "settings.memory.store.scope.global");
}

export function MemoryStoreStatusPanel({
  vectorSearchEnabled,
  memoryStatusDescriptionKey,
  setMessage,
}: MemoryStoreStatusPanelProps) {
  const { t } = useTranslation("settings");
  const [health, setHealth] = useState<MemoryStoreHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const showMessage = useCallback(
    (message: string) => {
      setMessage(message);
      window.setTimeout(() => setMessage(null), 2500);
    },
    [setMessage],
  );

  const refreshHealth = useCallback(
    async (showSuccess = false) => {
      setHealthLoading(true);
      try {
        const response = await getMemoryStoreHealth({ scope: "global" });
        setHealth(response);
        if (showSuccess) {
          showMessage(
            memoryPanelT(t, "settings.memory.store.message.healthRefreshed"),
          );
        }
      } catch (error) {
        console.error("加载记忆文件状态失败:", error);
        showMessage(memoryPanelT(t, "settings.memory.store.message.healthFailed"));
      } finally {
        setHealthLoading(false);
      }
    },
    [showMessage, t],
  );

  useEffect(() => {
    void refreshHealth(false);
  }, [refreshHealth]);

  const handleReset = async () => {
    const confirmed = window.confirm(
      memoryPanelT(t, "settings.memory.store.resetConfirm"),
    );
    if (!confirmed) {
      return;
    }
    setResetting(true);
    try {
      const response = await resetMemoryStore({ scope: "global" });
      await refreshHealth(false);
      showMessage(
        memoryPanelT(t, "settings.memory.store.message.resetDone", {
          files: response.removedFiles,
          directories: response.removedDirectories,
        }),
      );
    } catch (error) {
      console.error("重置记忆文件失败:", error);
      showMessage(memoryPanelT(t, "settings.memory.store.message.resetFailed"));
    } finally {
      setResetting(false);
    }
  };

  const summaryStatus =
    health?.summaryExists && health.memoryExists
      ? memoryPanelT(t, "settings.memory.store.summaryReady")
      : memoryPanelT(t, "settings.memory.store.summaryMissing");

  return (
    <section className="rounded-md border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">
              {memoryPanelT(t, "settings.memory.everyday.title")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {memoryPanelT(t, "settings.memory.everyday.description")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshHealth(true)}
            disabled={healthLoading || resetting}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
          >
            {healthLoading
              ? memoryPanelT(t, "settings.memory.store.loading")
              : memoryPanelT(t, "settings.memory.action.refresh")}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
          >
            {resetting
              ? memoryPanelT(t, "settings.memory.store.resetting")
              : memoryPanelT(t, "settings.memory.store.reset")}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {memoryPanelT(t, "settings.memory.embedding.status.vectorSearch")}
          </p>
          <p
            className={cn(
              "mt-2 text-base font-semibold",
              vectorSearchEnabled ? "text-emerald-700" : "text-slate-500",
            )}
          >
            {vectorSearchEnabled
              ? memoryPanelT(t, "settings.memory.embedding.status.enabled")
              : memoryPanelT(t, "settings.memory.embedding.status.disabled")}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {memoryPanelT(t, "settings.memory.embedding.status.config")}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-950">
            {vectorSearchEnabled
              ? memoryPanelT(t, "settings.memory.embedding.status.configured")
              : memoryPanelT(
                  t,
                  "settings.memory.embedding.status.fullTextOnly",
                )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {memoryPanelT(t, memoryStatusDescriptionKey)}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {memoryPanelT(t, "settings.memory.store.files")}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-950">
            {memoryPanelT(t, "settings.memory.store.filesValue", {
              count: health?.fileCount ?? 0,
              size: formatStorageSize(health?.totalBytes ?? 0),
            })}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">
            {memoryPanelT(t, "settings.memory.store.notes")}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-950">
            {memoryPanelT(t, "settings.memory.store.notesValue", {
              count: health?.notesCount ?? 0,
            })}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {memoryPanelT(t, "settings.memory.store.summary")}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {summaryStatus}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">
              {memoryPanelT(t, "settings.memory.store.scope")}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {healthRootScope(t, health)}
            </p>
          </div>
        </div>
        <p className="mt-3 truncate rounded-md bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          {health?.rootPath ??
            memoryPanelT(t, "settings.memory.store.pathUnavailable")}
        </p>
      </div>
    </section>
  );
}
