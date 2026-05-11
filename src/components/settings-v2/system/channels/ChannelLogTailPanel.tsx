import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Pause, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  clearLogs,
  getLogs,
  getPersistedLogsTail,
  type LogEntry,
} from "@/lib/api/logs";
import {
  type ChannelLogPreset,
  buildChannelLogRegex,
  filterChannelLogs,
} from "./channel-log-filter";

const POLL_INTERVAL_MS = 1000;
const TAIL_LINES = 800;
const MAX_DISPLAY_LINES = 500;

function mergeLogEntries(
  inMemoryEntries: LogEntry[],
  persistedEntries: LogEntry[],
): LogEntry[] {
  const merged = [...persistedEntries, ...inMemoryEntries];
  if (merged.length <= 1) {
    return merged;
  }

  const seen = new Set<string>();
  const deduped: LogEntry[] = [];

  for (const entry of merged) {
    const key = `${entry.timestamp}::${entry.level}::${entry.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  deduped.sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
      return left.timestamp.localeCompare(right.timestamp);
    }
    return leftTime - rightTime;
  });

  return deduped;
}

function formatTime(timestamp: string, locale: string): string {
  const hmsMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})/);
  if (hmsMatch) {
    return hmsMatch[1];
  }

  const date = new Date(timestamp);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString(locale || "zh-CN");
  }

  return timestamp;
}

function formatExportLine(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
}

export function ChannelLogTailPanel() {
  const { t, i18n } = useTranslation("settings");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [preset, setPreset] = useState<ChannelLogPreset>("all");
  const [customPattern, setCustomPattern] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyTip, setCopyTip] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { regex, error: regexError } = useMemo(
    () =>
      buildChannelLogRegex(
        preset,
        customPattern,
        t("settings.channels.logTail.error.invalidRegex"),
      ),
    [preset, customPattern, t],
  );

  const filteredLogs = useMemo(() => {
    const matched = filterChannelLogs(logs, regex);
    if (matched.length <= MAX_DISPLAY_LINES) {
      return matched;
    }
    return matched.slice(-MAX_DISPLAY_LINES);
  }, [logs, regex]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [inMemoryResult, persistedResult] = await Promise.allSettled([
          getLogs(),
          getPersistedLogsTail(TAIL_LINES),
        ]);
        if (
          inMemoryResult.status === "rejected" &&
          persistedResult.status === "rejected"
        ) {
          throw persistedResult.reason instanceof Error
            ? persistedResult.reason
            : inMemoryResult.reason instanceof Error
              ? inMemoryResult.reason
              : new Error(
                  t("settings.channels.logTail.error.sourcesUnavailable"),
                );
        }

        const entries = mergeLogEntries(
          inMemoryResult.status === "fulfilled" ? inMemoryResult.value : [],
          persistedResult.status === "fulfilled" ? persistedResult.value : [],
        );
        if (!active) return;
        setLogs(entries);
        setError(null);
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void poll();
    if (paused) {
      return () => {
        active = false;
      };
    }

    const timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paused, t]);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    const container = listRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [filteredLogs, autoScroll]);

  const handleCopy = async () => {
    const content = filteredLogs.map(formatExportLine).join("\n");
    if (!content) {
      setCopyTip(t("settings.channels.logTail.message.noCopyableLogs"));
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopyTip(t("settings.channels.logTail.message.copiedView"));
      window.setTimeout(() => setCopyTip(null), 1500);
    } catch {
      setCopyTip(t("settings.channels.logTail.message.copyPermissionFailed"));
    }
  };

  const handleClear = async () => {
    const confirmed = window.confirm(
      t("settings.channels.logTail.confirm.clear"),
    );
    if (!confirmed) {
      return;
    }

    try {
      await clearLogs();
      setLogs([]);
      setError(null);
      setCopyTip(t("settings.channels.logTail.message.cleared"));
      window.setTimeout(() => setCopyTip(null), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        t("settings.channels.logTail.error.clearFailed", {
          error: msg,
        }),
      );
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">
            {t("settings.channels.logTail.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.channels.logTail.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            {paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            {paused
              ? t("settings.channels.logTail.action.resume")
              : t("settings.channels.logTail.action.pause")}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            <Copy className="h-3.5 w-3.5" />
            {t("settings.channels.logTail.action.copyView")}
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("settings.channels.logTail.action.clearLogs")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">
            {t("settings.channels.logTail.filter.mode")}
          </span>
          <select
            value={preset}
            onChange={(event) =>
              setPreset(event.target.value as ChannelLogPreset)
            }
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">
              {t("settings.channels.logTail.filter.option.all")}
            </option>
            <option value="telegram">TelegramGateway</option>
            <option value="wechat">WechatGateway</option>
            <option value="rpc">RPC</option>
            <option value="feishu">FeishuGateway</option>
            <option value="custom">
              {t("settings.channels.logTail.filter.option.customRegex")}
            </option>
          </select>
        </label>

        {preset === "custom" ? (
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">
              {t("settings.channels.logTail.filter.regexLabel")}
            </span>
            <input
              value={customPattern}
              onChange={(event) => setCustomPattern(event.target.value)}
              placeholder="TelegramGateway|WechatGateway|RPC"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm font-mono"
            />
          </label>
        ) : (
          <label className="inline-flex items-center gap-2 mt-6 md:col-span-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <span className="text-xs text-muted-foreground">
              {t("settings.channels.logTail.filter.autoScroll")}
            </span>
          </label>
        )}
      </div>

      {preset === "custom" && (
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
            className="h-4 w-4 rounded border"
          />
          <span className="text-xs text-muted-foreground">
            {t("settings.channels.logTail.filter.autoScroll")}
          </span>
        </label>
      )}

      {(error || regexError || copyTip) && (
        <div className="space-y-1">
          {error && (
            <p className="text-xs text-destructive">
              {t("settings.channels.logTail.error.loadFailed", {
                error,
              })}
            </p>
          )}
          {regexError && <p className="text-xs text-amber-600">{regexError}</p>}
          {copyTip && (
            <p className="text-xs text-muted-foreground">{copyTip}</p>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="max-h-80 overflow-auto rounded-md border bg-muted/20 p-3 font-mono text-xs"
      >
        {loading ? (
          <p className="text-muted-foreground">
            {t("settings.channels.logTail.state.loading")}
          </p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-muted-foreground">
            {paused
              ? t("settings.channels.logTail.empty.paused")
              : t("settings.channels.logTail.empty.waiting")}
          </p>
        ) : (
          filteredLogs.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className="py-0.5 break-all"
            >
              <span className="text-muted-foreground">
                [{formatTime(entry.timestamp, i18n.language)}]
              </span>{" "}
              <span className="text-sky-600 dark:text-sky-400">
                [{entry.level.toUpperCase()}]
              </span>{" "}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
