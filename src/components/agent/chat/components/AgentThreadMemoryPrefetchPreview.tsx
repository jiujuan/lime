import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { TurnMemoryPrefetchResult } from "@/lib/api/memoryRuntime";
import { cn } from "@/lib/utils";
import { normalizeTeamMemoryDisplayText } from "../utils/teamMemoryDisplay";

type RuntimeMemoryPrefetchStatus = "idle" | "loading" | "ready" | "error";

interface AgentThreadMemoryPrefetchPreviewProps {
  status: RuntimeMemoryPrefetchStatus;
  result: TurnMemoryPrefetchResult | null;
  error: string | null;
  actions?: ReactNode;
  className?: string;
}

const EMERALD_PANEL_CLASS_NAME = "border-emerald-200 bg-emerald-50/60";
const EMERALD_TITLE_CLASS_NAME = "text-emerald-900";
const EMERALD_OUTLINE_BADGE_CLASS_NAME =
  "border-emerald-200 bg-white text-emerald-700";
const SLATE_PANEL_CLASS_NAME = "border-slate-200/80 bg-white";
const SLATE_TITLE_CLASS_NAME = "text-slate-700";
const MEMORY_PROMPT_SURFACE_CLASS_NAME =
  "overflow-x-auto rounded-lg border border-sky-100 bg-[linear-gradient(180deg,rgba(248,255,254,0.98)_0%,rgba(255,255,255,0.98)_55%,rgba(240,249,255,0.96)_100%)] px-3 py-2 text-xs leading-6 text-slate-700 shadow-sm shadow-sky-950/5";

const DURABLE_CATEGORY_KEY_SUFFIX: Record<string, string> = {
  identity: "identity",
  context: "context",
  preference: "preference",
  experience: "experience",
  activity: "activity",
};

function normalizeText(value?: string | null): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function truncateText(value?: string | null, maxLength = 240): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDate(value?: string | number | null): Date | null {
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

function formatDateTime(
  value?: string | number | null,
  locale?: string | null,
): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  return date.toLocaleString(locale || undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMemoryLayerStatusLabel(
  label: string,
  text: (key: string, options?: Record<string, unknown>) => string,
  count?: number | null,
  active?: boolean,
): string {
  if (typeof count === "number") {
    return text("layerCount", { label, count });
  }
  return text("layerHitStatus", {
    label,
    status: active ? text("hit") : text("miss"),
  });
}

function formatDurableCategoryLabel(
  category: string,
  text: (key: string, options?: Record<string, unknown>) => string,
): string {
  const suffix = DURABLE_CATEGORY_KEY_SUFFIX[category];
  return suffix ? text(`durableCategory.${suffix}`) : category;
}

function DetailPanel(props: {
  title: string;
  emptyText: string;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn("rounded-xl border px-3 py-3", SLATE_PANEL_CLASS_NAME)}
    >
      <div className={cn("text-xs font-medium", SLATE_TITLE_CLASS_NAME)}>
        {props.title}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-700">
        {props.children || (
          <div className="text-sm leading-6 text-slate-500">
            {props.emptyText}
          </div>
        )}
      </div>
    </article>
  );
}

export function AgentThreadMemoryPrefetchPreview({
  status,
  result,
  error,
  actions,
  className,
}: AgentThreadMemoryPrefetchPreviewProps) {
  const { t, i18n } = useTranslation("agent");
  const text = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      String(
        t(
          `agentChat.threadReliability.memoryPrefetchPreview.${key}` as never,
          options as never,
        ),
      ),
    [t],
  );
  const locale = i18n.resolvedLanguage || i18n.language;
  const formatPreviewDateTime = useCallback(
    (value?: string | number | null) => formatDateTime(value, locale),
    [locale],
  );

  return (
    <div
      className={cn(
        "mt-4 rounded-2xl border px-4 py-3",
        status === "error"
          ? "border-amber-200 bg-amber-50"
          : EMERALD_PANEL_CLASS_NAME,
        className,
      )}
      data-testid="agent-thread-reliability-memory-prefetch"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "text-sm font-medium",
              status === "error" ? "text-amber-900" : EMERALD_TITLE_CLASS_NAME,
            )}
          >
            {text("title")}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                status === "error"
                  ? "border-amber-300 bg-white text-amber-700"
                  : EMERALD_OUTLINE_BADGE_CLASS_NAME,
              )}
            >
              {status === "loading"
                ? text("status.loading")
                : status === "ready"
                  ? text("status.ready")
                  : status === "error"
                    ? text("status.error")
                    : text("status.idle")}
            </Badge>
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-2 text-sm leading-6",
          status === "error" ? "text-amber-900" : "text-slate-700",
        )}
      >
        {status === "loading"
          ? text("description.loading")
          : status === "error"
            ? error
            : text("description.default")}
      </div>

      {result ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={EMERALD_OUTLINE_BADGE_CLASS_NAME}
            >
              {formatMemoryLayerStatusLabel(
                text("layer.rules"),
                text,
                result.rules_source_paths.length,
              )}
            </Badge>
            <Badge
              variant="outline"
              className={EMERALD_OUTLINE_BADGE_CLASS_NAME}
            >
              {formatMemoryLayerStatusLabel(
                text("layer.working"),
                text,
                null,
                Boolean(result.working_memory_excerpt),
              )}
            </Badge>
            <Badge
              variant="outline"
              className={EMERALD_OUTLINE_BADGE_CLASS_NAME}
            >
              {formatMemoryLayerStatusLabel(
                text("layer.durable"),
                text,
                result.durable_memories.length,
              )}
            </Badge>
            <Badge
              variant="outline"
              className={EMERALD_OUTLINE_BADGE_CLASS_NAME}
            >
              {formatMemoryLayerStatusLabel(
                text("layer.team"),
                text,
                result.team_memory_entries.length,
              )}
            </Badge>
            <Badge
              variant="outline"
              className={EMERALD_OUTLINE_BADGE_CLASS_NAME}
            >
              {formatMemoryLayerStatusLabel(
                text("layer.compaction"),
                text,
                null,
                Boolean(result.latest_compaction),
              )}
            </Badge>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <DetailPanel
              title={text("sections.ruleSources")}
              emptyText={text("empty.ruleSources")}
            >
              {result.rules_source_paths.length > 0 ? (
                <div className="space-y-2">
                  {result.rules_source_paths.slice(0, 3).map((path) => (
                    <div
                      key={path}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                    >
                      {path}
                    </div>
                  ))}
                  {result.rules_source_paths.length > 3 ? (
                    <div className="text-xs text-slate-500">
                      {text("more.ruleSources", {
                        count: result.rules_source_paths.length - 3,
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title={text("sections.workingExcerpt")}
              emptyText={text("empty.workingExcerpt")}
            >
              {result.working_memory_excerpt ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  {truncateText(result.working_memory_excerpt, 320)}
                </div>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title={text("sections.durable")}
              emptyText={text("empty.durable")}
            >
              {result.durable_memories.length > 0 ? (
                <div className="space-y-2">
                  {result.durable_memories.slice(0, 3).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-700"
                        >
                          {formatDurableCategoryLabel(entry.category, text)}
                        </Badge>
                        <span className="text-sm font-medium text-slate-900">
                          {entry.title}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {truncateText(entry.summary, 220)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        {entry.tags.length > 0 ? (
                          <span>
                            {text("durableTags", {
                              value: entry.tags.join(text("listSeparator")),
                            })}
                          </span>
                        ) : null}
                        {formatPreviewDateTime(entry.updated_at) ? (
                          <span>
                            {text("updatedAt", {
                              value: formatPreviewDateTime(entry.updated_at),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {result.durable_memories.length > 3 ? (
                    <div className="text-xs text-slate-500">
                      {text("more.durable", {
                        count: result.durable_memories.length - 3,
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title={text("sections.team")}
              emptyText={text("empty.team")}
            >
              {result.team_memory_entries.length > 0 ? (
                <div className="space-y-2">
                  {result.team_memory_entries.slice(0, 3).map((entry) => (
                    <div
                      key={entry.key}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {entry.key}
                        </span>
                        {formatPreviewDateTime(entry.updated_at) ? (
                          <span className="text-xs text-slate-500">
                            {formatPreviewDateTime(entry.updated_at)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {truncateText(
                          normalizeTeamMemoryDisplayText(entry.content),
                          220,
                        )}
                      </div>
                    </div>
                  ))}
                  {result.team_memory_entries.length > 3 ? (
                    <div className="text-xs text-slate-500">
                      {text("more.team", {
                        count: result.team_memory_entries.length - 3,
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title={text("sections.compaction")}
              emptyText={text("empty.compaction")}
            >
              {result.latest_compaction ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {result.latest_compaction.trigger ? (
                      <span>
                        {text("compaction.trigger", {
                          value: result.latest_compaction.trigger,
                        })}
                      </span>
                    ) : null}
                    {typeof result.latest_compaction.turn_count === "number" ? (
                      <span>
                        {text("compaction.turnCount", {
                          count: result.latest_compaction.turn_count,
                        })}
                      </span>
                    ) : null}
                    {formatPreviewDateTime(
                      result.latest_compaction.created_at,
                    ) ? (
                      <span>
                        {text("compaction.createdAt", {
                          value: formatPreviewDateTime(
                            result.latest_compaction.created_at,
                          ),
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {truncateText(
                      result.latest_compaction.summary_preview,
                      260,
                    )}
                  </div>
                </div>
              ) : null}
            </DetailPanel>

            <DetailPanel
              title={text("sections.runtimeSnippet")}
              emptyText={text("empty.runtimeSnippet")}
            >
              {result.prompt ? (
                <pre className={MEMORY_PROMPT_SURFACE_CLASS_NAME}>
                  {truncateText(result.prompt, 500)}
                </pre>
              ) : null}
            </DetailPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
