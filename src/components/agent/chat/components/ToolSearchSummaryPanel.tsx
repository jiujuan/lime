import { useTranslation } from "react-i18next";
import {
  type ToolSearchResultSummary,
  resolveUserFacingToolSearchItemLabel,
} from "../utils/toolSearchResultSummary";

interface ToolSearchSummaryPanelProps {
  summary: ToolSearchResultSummary;
  testId?: string;
}

function shouldShowUserFacingQuery(query: string | undefined): boolean {
  const normalized = query?.trim();
  if (!normalized) {
    return false;
  }

  return !/^(?:select|tool|tools|name|tag):/i.test(normalized);
}

function resolveUserFacingToolSearchNote(
  note: string,
  t: (key: string, values?: Record<string, unknown>) => string,
): string | null {
  const trimmed = note.trim();
  if (!trimmed) {
    return null;
  }

  if (/未命中.*deferred/i.test(trimmed)) {
    return t("agentChat.toolCall.toolSearch.note.noMoreMatches");
  }

  if (/tools\[\*\]\.call_name|不要继续用\s*ToolSearch/i.test(trimmed)) {
    return t("agentChat.toolCall.toolSearch.note.ready");
  }

  if (
    /(?:always[_\s-]?visible|native[_\s-]?registry|extension[_\s-]?name|total[_\s-]?deferred|caller)/i.test(
      trimmed,
    )
  ) {
    return null;
  }

  return trimmed
    .replace(
      /\bdeferred\b/gi,
      t("agentChat.toolCall.toolSearch.note.deferredLabel"),
    )
    .trim();
}

function resolveUserFacingToolSearchNotes(
  notes: string[],
  t: (key: string, values?: Record<string, unknown>) => string,
): string[] {
  const userFacingNotes: string[] = [];
  notes.forEach((note) => {
    const userFacingNote = resolveUserFacingToolSearchNote(note, t);
    if (userFacingNote) {
      userFacingNotes.push(userFacingNote);
    }
  });
  return userFacingNotes;
}

function formatPendingMcpServers(
  servers: string[],
  locale: string | undefined,
): string {
  const separator = /^(?:zh|ja)/i.test(locale || "") ? "、" : ", ";
  return servers.join(separator);
}

export function ToolSearchSummaryPanel({
  summary,
  testId,
}: ToolSearchSummaryPanelProps) {
  const { i18n, t } = useTranslation("agent");
  const translateToolSearch = (
    key: string,
    values?: Record<string, unknown>,
  ): string => String(t(key as never, values as never));
  const pendingServersText =
    summary.pendingMcpServers && summary.pendingMcpServers.length > 0
      ? translateToolSearch("agentChat.toolCall.toolSearch.pendingServers", {
          servers: formatPendingMcpServers(
            summary.pendingMcpServers,
            i18n.language,
          ),
        })
      : null;
  const userFacingNotes = resolveUserFacingToolSearchNotes(
    summary.notes,
    translateToolSearch,
  );

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          {translateToolSearch("agentChat.toolCall.toolSearch.foundTools", {
            count: summary.count,
          })}
        </span>
        {shouldShowUserFacingQuery(summary.query) ? (
          <span className="break-all">
            {translateToolSearch("agentChat.toolCall.toolSearch.query", {
              query: summary.query,
            })}
          </span>
        ) : null}
      </div>

      {pendingServersText ? (
        <div className="space-y-1 text-[11px] text-sky-700">
          <div>{pendingServersText}</div>
        </div>
      ) : null}

      {userFacingNotes.length > 0 ? (
        <div className="space-y-1 text-[11px] text-amber-700">
          {userFacingNotes.map((note, index) => (
            <div key={`${note}-${index}`}>{note}</div>
          ))}
        </div>
      ) : null}

      {summary.tools.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.tools.map((item) => {
            const label = resolveUserFacingToolSearchItemLabel(item.name);
            const rawName = item.name.trim();

            return (
              <div
                key={item.name}
                title={label !== rawName ? rawName : undefined}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
              >
                <span className="font-medium text-slate-900">{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
