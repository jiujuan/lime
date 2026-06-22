/**
 * MCP 工具浏览器组件
 *
 * 按服务器分组显示所有可用的 MCP 工具，包括工具名称、描述和参数 schema。
 *
 * @module components/mcp/McpToolsBrowser
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMcpInnerToolName, McpToolDefinition } from "@/lib/api/mcp";
import {
  dedupeMcpTools,
  filterMcpToolsByServer,
  groupMcpToolsByServer,
} from "./mcpToolBrowserModel";

interface McpToolsBrowserProps {
  tools: McpToolDefinition[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  serverCount?: number;
  runningServerCount?: number;
  onOpenRuntimeTab?: () => void;
  onOpenConfigTab?: () => void;
  onCallTool?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<void>;
}

export function McpToolsBrowser({
  tools,
  loading,
  onRefresh,
  serverCount = 0,
  runningServerCount = 0,
  onOpenRuntimeTab,
  onOpenConfigTab,
  onCallTool,
}: McpToolsBrowserProps) {
  const { t } = useTranslation("settings");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const dedupedTools = useMemo(() => dedupeMcpTools(tools), [tools]);

  const toolsByServer = useMemo(
    () => groupMcpToolsByServer(dedupedTools),
    [dedupedTools],
  );

  const filteredToolsByServer = useMemo(
    () => filterMcpToolsByServer(toolsByServer, searchQuery),
    [searchQuery, toolsByServer],
  );
  const filteredToolEntries = Object.entries(filteredToolsByServer);

  useEffect(() => {
    const serverNames = Object.keys(filteredToolsByServer);
    setExpandedServers((prev) => {
      const next = new Set(
        [...prev].filter((serverName) => serverNames.includes(serverName)),
      );
      if (next.size > 0 || serverNames.length === 0) {
        return next;
      }
      return new Set(serverNames);
    });
  }, [filteredToolsByServer]);

  const emptyState = useMemo(() => {
    if (searchQuery) {
      return {
        title: t("settings.mcpPage.runtime.toolBrowser.emptySearchTitle"),
        description: t(
          "settings.mcpPage.runtime.toolBrowser.emptySearchDescription",
        ),
      };
    }

    if (serverCount === 0) {
      return {
        title: t("settings.mcpPage.runtime.toolBrowser.emptyNoServersTitle"),
        description: t(
          "settings.mcpPage.runtime.toolBrowser.emptyNoServersDescription",
        ),
        actionLabel: t("settings.mcpPage.runtime.toolBrowser.openConfig"),
        action: onOpenConfigTab,
      };
    }

    if (runningServerCount === 0) {
      return {
        title: t("settings.mcpPage.runtime.toolBrowser.emptyNoRunningTitle"),
        description: t(
          "settings.mcpPage.runtime.toolBrowser.emptyNoRunningDescription",
        ),
        actionLabel: t("settings.mcpPage.runtime.toolBrowser.openRuntime"),
        action: onOpenRuntimeTab,
      };
    }

    return {
      title: t("settings.mcpPage.runtime.toolBrowser.emptyNoToolsTitle"),
      description: t(
        "settings.mcpPage.runtime.toolBrowser.emptyNoToolsDescription",
      ),
      actionLabel: t("settings.mcpPage.runtime.toolBrowser.refreshTitle"),
      action: () => void onRefresh(),
    };
  }, [
    onOpenConfigTab,
    onOpenRuntimeTab,
    onRefresh,
    runningServerCount,
    searchQuery,
    serverCount,
    t,
  ]);

  const toggleServer = (serverName: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverName)) {
      newExpanded.delete(serverName);
    } else {
      newExpanded.add(serverName);
    }
    setExpandedServers(newExpanded);
  };

  const toggleTool = (toolName: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName);
    } else {
      newExpanded.add(toolName);
    }
    setExpandedTools(newExpanded);
  };

  const formatSchema = (schema: Record<string, unknown>) => {
    return JSON.stringify(schema, null, 2);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("settings.mcpPage.runtime.toolBrowser.title")}
          </span>
          <span className="text-xs text-muted-foreground">
            ({dedupedTools.length})
          </span>
        </div>
        <button
          onClick={() => onRefresh()}
          disabled={loading}
          className="rounded p-1.5 hover:bg-muted"
          title={t("settings.mcpPage.runtime.toolBrowser.refreshTitle")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(
              "settings.mcpPage.runtime.toolBrowser.searchPlaceholder",
            )}
            className="w-full rounded border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && dedupedTools.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredToolEntries.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Wrench className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium text-foreground">
              {emptyState.title}
            </p>
            <p className="mt-1 text-muted-foreground">
              {emptyState.description}
            </p>
            {emptyState.actionLabel && emptyState.action ? (
              <button
                type="button"
                onClick={emptyState.action}
                className="mt-4 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                {emptyState.actionLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredToolEntries.map(([serverName, serverTools]) => (
              <div key={serverName} className="rounded-lg border">
                <button
                  onClick={() => toggleServer(serverName)}
                  className="flex w-full items-center gap-2 rounded-t-lg p-2.5 hover:bg-muted/50"
                >
                  {expandedServers.has(serverName) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{serverName}</span>
                  <span className="text-xs text-muted-foreground">
                    {`(${t("settings.mcpPage.runtime.toolBrowser.toolCount", {
                      count: serverTools.length,
                    })})`}
                  </span>
                </button>

                {expandedServers.has(serverName) && (
                  <div className="border-t">
                    {serverTools.map((tool) => {
                      const displayName = getMcpInnerToolName(
                        tool.name,
                        tool.server_name,
                      );

                      return (
                        <div
                          key={`${tool.server_name}::${tool.name}`}
                          className="border-b last:border-b-0"
                        >
                          <button
                            onClick={() => toggleTool(tool.name)}
                            className="flex w-full items-start gap-2 p-2.5 pl-8 text-left hover:bg-muted/30"
                          >
                            {expandedTools.has(tool.name) ? (
                              <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Code className="h-3.5 w-3.5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                                <span
                                  className="font-mono text-sm text-emerald-700 dark:text-emerald-300"
                                  title={tool.name}
                                >
                                  {displayName}
                                </span>
                              </div>
                              {tool.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {tool.description}
                                </p>
                              )}
                            </div>
                          </button>

                          {expandedTools.has(tool.name) && (
                            <div className="px-8 pb-3">
                              <div className="rounded-lg bg-muted/50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t(
                                      "settings.mcpPage.runtime.toolBrowser.inputSchema",
                                    )}
                                  </span>
                                  {onCallTool && (
                                    <button
                                      onClick={() => onCallTool(tool.name, {})}
                                      className="rounded border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-2 py-1 text-xs text-white shadow-sm shadow-emerald-950/15 hover:opacity-95"
                                    >
                                      {t(
                                        "settings.mcpPage.runtime.toolBrowser.callTool",
                                      )}
                                    </button>
                                  )}
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-background p-2 font-mono text-xs">
                                  {formatSchema(tool.input_schema)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
