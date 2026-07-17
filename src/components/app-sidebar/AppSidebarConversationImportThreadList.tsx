import {
  CheckSquare2,
  FolderOpen,
  Loader2,
  MessageSquare,
  RefreshCw,
  Square,
} from "lucide-react";
import type { ImportedThreadSummary } from "@/lib/api/conversationImport";
import {
  formatImportOptionalDate,
  isImportedThread,
  isImportingThread,
  isSelectableImportThread,
  resolveImportThreadSecondaryText,
  resolveImportThreadTitle,
  type ConversationImportDialogTranslate,
  type ImportThreadArchiveFilter,
  type ImportThreadGroup,
  type ImportThreadGroupMode,
} from "./conversationImportDialogViewModel";

const GROUP_MODES: readonly ImportThreadGroupMode[] = ["day", "month"];
const ARCHIVE_FILTERS: readonly ImportThreadArchiveFilter[] = [
  "all",
  "active",
  "archived",
];

interface AppSidebarConversationImportThreadListProps {
  allSelectableChecked: boolean;
  archiveFilter: ImportThreadArchiveFilter;
  checkedThreadIds: ReadonlySet<string>;
  committing: boolean;
  groupMode: ImportThreadGroupMode;
  importGroups: ImportThreadGroup[];
  loading: boolean;
  locale: string;
  emptyMessage?: string | null;
  selectableThreadCount: number;
  selectedThreadId: string | null;
  selectingSourceRoot: boolean;
  sourceRoot: string | undefined;
  sourceRootInput: string;
  t: ConversationImportDialogTranslate;
  visibleThreads: ImportedThreadSummary[];
  onArchiveFilterChange: (filter: ImportThreadArchiveFilter) => void;
  onGroupModeChange: (mode: ImportThreadGroupMode) => void;
  onPickSourceRoot: () => void | Promise<void>;
  onRefresh: (sourceRoot: string | undefined) => void;
  onSelectThread: (thread: ImportedThreadSummary) => void | Promise<void>;
  onSourceRootInputChange: (value: string) => void;
  onToggleAll: () => void;
  onToggleGroup: (threads: ImportedThreadSummary[]) => void;
  onToggleThread: (thread: ImportedThreadSummary) => void;
}

export function AppSidebarConversationImportThreadList({
  allSelectableChecked,
  archiveFilter,
  checkedThreadIds,
  committing,
  groupMode,
  importGroups,
  loading,
  locale,
  emptyMessage,
  selectableThreadCount,
  selectedThreadId,
  selectingSourceRoot,
  sourceRoot,
  sourceRootInput,
  t,
  visibleThreads,
  onArchiveFilterChange,
  onGroupModeChange,
  onPickSourceRoot,
  onRefresh,
  onSelectThread,
  onSourceRootInputChange,
  onToggleAll,
  onToggleGroup,
  onToggleThread,
}: AppSidebarConversationImportThreadListProps) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="space-y-3 border-b border-slate-200 p-4">
        <label className="block text-xs font-semibold text-slate-600">
          {t(
            "navigation.sidebar.importDialog.sourceRoot.label",
            "Local history data directory",
          )}
          <input
            value={sourceRootInput}
            onChange={(event) => onSourceRootInputChange(event.target.value)}
            placeholder={t(
              "navigation.sidebar.importDialog.sourceRoot.placeholder",
              "Use the default history directory automatically",
            )}
            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-300"
            disabled={committing}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || committing || selectingSourceRoot}
            onClick={() => void onPickSourceRoot()}
            data-testid="app-sidebar-conversation-import-choose-directory"
          >
            <FolderOpen className="h-4 w-4" />
            {t(
              "navigation.sidebar.importDialog.action.chooseDirectory",
              "Choose folder",
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || committing || selectingSourceRoot}
            onClick={() => onRefresh(sourceRoot)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? t("navigation.sidebar.importDialog.action.loading", "Reading")
              : t(
                  "navigation.sidebar.importDialog.action.refresh",
                  "Scan again",
                )}
          </button>
          <button
            type="button"
            className="col-span-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={selectableThreadCount === 0 || loading || committing}
            onClick={onToggleAll}
          >
            {allSelectableChecked
              ? t("navigation.sidebar.importDialog.selection.clearAll", "Clear")
              : t(
                  "navigation.sidebar.importDialog.selection.selectAll",
                  "Select all",
                )}
          </button>
        </div>
        <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-white p-1">
          {GROUP_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`inline-flex flex-1 items-center justify-center rounded-md px-3 text-xs font-semibold transition ${
                groupMode === mode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              disabled={committing}
              onClick={() => onGroupModeChange(mode)}
            >
              {mode === "day"
                ? t("navigation.sidebar.importDialog.group.day", "Day")
                : t("navigation.sidebar.importDialog.group.month", "Month")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-white p-1">
          {ARCHIVE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`inline-flex min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-semibold transition ${
                archiveFilter === filter
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              disabled={committing}
              onClick={() => onArchiveFilterChange(filter)}
            >
              {filter === "all"
                ? t("navigation.sidebar.importDialog.archive.all", "All")
                : filter === "active"
                  ? t(
                      "navigation.sidebar.importDialog.archive.active",
                      "Active",
                    )
                  : t(
                      "navigation.sidebar.importDialog.archive.archived",
                      "Archived",
                    )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-500">
            {t(
              "navigation.sidebar.importDialog.threadList.title",
              "Importable conversations {{count}}",
              {
                count: visibleThreads.length,
              },
            )}
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {visibleThreads.length > 0 ? (
            importGroups.map((group) => {
              const groupSelectable = group.threads.filter(
                isSelectableImportThread,
              );
              const groupChecked =
                groupSelectable.length > 0 &&
                groupSelectable.every((thread) =>
                  checkedThreadIds.has(thread.sourceThreadId),
                );
              return (
                <section key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
                    <span>{group.label}</span>
                    <button
                      type="button"
                      className="text-slate-600 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        groupSelectable.length === 0 || loading || committing
                      }
                      onClick={() => onToggleGroup(group.threads)}
                    >
                      {groupChecked
                        ? t(
                            "navigation.sidebar.importDialog.selection.clearGroup",
                            "Clear group",
                          )
                        : t(
                            "navigation.sidebar.importDialog.selection.selectGroup",
                            "Select group",
                          )}
                    </button>
                  </div>
                  {group.threads.map((thread) => {
                    const active = selectedThreadId === thread.sourceThreadId;
                    const checked = checkedThreadIds.has(thread.sourceThreadId);
                    const title = resolveImportThreadTitle(thread, t);
                    const updatedAt = formatImportOptionalDate(
                      thread.updatedAt,
                      locale,
                    );
                    return (
                      <button
                        key={thread.sourceThreadId}
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          active
                            ? "border-emerald-200 bg-white shadow-sm"
                            : checked
                              ? "border-slate-200 bg-white"
                              : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                        }`}
                        disabled={loading || committing}
                        title={title}
                        onClick={() => void onSelectThread(thread)}
                      >
                        <span className="flex items-start gap-2">
                          <span
                            role="checkbox"
                            aria-checked={checked}
                            tabIndex={-1}
                            className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center text-slate-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleThread(thread);
                            }}
                          >
                            {checked ? (
                              <CheckSquare2 className="h-4 w-4 text-emerald-700" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </span>
                          <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {resolveImportThreadSecondaryText(
                                thread,
                                updatedAt,
                                t,
                              )}
                            </span>
                          </span>
                          {isImportedThread(thread) ? (
                            <span className="mt-0.5 flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              {t(
                                "navigation.sidebar.importDialog.status.imported",
                                "Imported",
                              )}
                            </span>
                          ) : null}
                          {isImportingThread(thread) ? (
                            <span className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {t(
                                "navigation.sidebar.importDialog.status.importing",
                                "Importing",
                              )}
                            </span>
                          ) : null}
                          {thread.archived ? (
                            <span className="mt-0.5 flex-shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              {t(
                                "navigation.sidebar.importDialog.status.archived",
                                "Archived",
                              )}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 text-center text-sm font-medium text-slate-500">
              {loading
                ? t(
                    "navigation.sidebar.importDialog.empty.loading",
                    "Reading local history",
                  )
                : t(
                    "navigation.sidebar.importDialog.empty.noThreads",
                    "No importable local history found",
                  )}
              {!loading && emptyMessage ? (
                <span className="mt-2 block text-xs font-medium leading-5 text-slate-400">
                  {emptyMessage}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
