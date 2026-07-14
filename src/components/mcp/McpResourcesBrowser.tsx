/**
 * MCP 资源浏览器组件
 *
 * 按服务器分组显示所有可用的 MCP 资源，支持资源内容预览。
 *
 * @module components/mcp/McpResourcesBrowser
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpResourceDefinition, McpResourceContent } from "@/lib/api/mcp";
import { McpResourceContentPreview } from "./McpResourceContentPreview";
import {
  filterMcpResourcesByServer,
  groupMcpResourcesByServer,
} from "./mcpResourceBrowserModel";

interface McpResourcesBrowserProps {
  resources: McpResourceDefinition[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onReadResource: (server: string, uri: string) => Promise<McpResourceContent>;
  onSubscribeResource: (server: string, uri: string) => Promise<void>;
  onUnsubscribeResource: (server: string, uri: string) => Promise<void>;
}

interface McpResourceTarget {
  server: string;
  uri: string;
}

function resourceTargetKey(target: McpResourceTarget): string {
  return `${target.server}\u0000${target.uri}`;
}

export function McpResourcesBrowser({
  resources,
  loading,
  onRefresh,
  onReadResource,
  onSubscribeResource,
  onUnsubscribeResource,
}: McpResourcesBrowserProps) {
  const { t } = useTranslation("settings");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );
  const [activeResource, setActiveResource] =
    useState<McpResourceTarget | null>(null);
  const [resourceContent, setResourceContent] =
    useState<McpResourceContent | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const subscribedResourceRef = useRef<McpResourceTarget | null>(null);
  const requestIdRef = useRef(0);
  const resourcesByServer = useMemo(
    () => groupMcpResourcesByServer(resources),
    [resources],
  );
  const filteredByServer = useMemo(
    () => filterMcpResourcesByServer(resourcesByServer, searchQuery),
    [resourcesByServer, searchQuery],
  );
  const filteredServerEntries = Object.entries(filteredByServer);

  const toggleServer = (name: string) => {
    const s = new Set(expandedServers);
    if (s.has(name)) {
      s.delete(name);
    } else {
      s.add(name);
    }
    setExpandedServers(s);
  };

  const unsubscribeResource = useCallback(
    async (target: McpResourceTarget) => {
      try {
        await onUnsubscribeResource(target.server, target.uri);
      } catch (e) {
        console.error("[McpResourcesBrowser] 取消订阅资源失败:", e);
      }
    },
    [onUnsubscribeResource],
  );

  const unsubscribePreviewResource = useCallback(
    async (target: McpResourceTarget) => {
      if (
        !subscribedResourceRef.current ||
        resourceTargetKey(subscribedResourceRef.current) !==
          resourceTargetKey(target)
      ) {
        return;
      }
      subscribedResourceRef.current = null;
      await unsubscribeResource(target);
    },
    [unsubscribeResource],
  );

  const handleReadResource = async (target: McpResourceTarget) => {
    const targetKey = resourceTargetKey(target);
    if (activeResource && resourceTargetKey(activeResource) === targetKey) {
      requestIdRef.current += 1;
      void unsubscribePreviewResource(target);
      setActiveResource(null);
      setResourceContent(null);
      setReadError(null);
      setReading(false);
      return;
    }
    const previousResource = activeResource;
    if (previousResource) {
      void unsubscribePreviewResource(previousResource);
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setActiveResource(target);
    setReading(true);
    setReadError(null);
    setResourceContent(null);
    try {
      try {
        await onSubscribeResource(target.server, target.uri);
        if (requestIdRef.current !== requestId) {
          await unsubscribeResource(target);
          return;
        }
        subscribedResourceRef.current = target;
      } catch (e) {
        console.error("[McpResourcesBrowser] 订阅资源失败:", e);
      }
      if (requestIdRef.current !== requestId) {
        return;
      }
      const content = await onReadResource(target.server, target.uri);
      if (requestIdRef.current === requestId) {
        setResourceContent(content);
      }
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setReadError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setReading(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      const subscribedResource = subscribedResourceRef.current;
      if (subscribedResource) {
        void unsubscribePreviewResource(subscribedResource);
      }
    };
  }, [unsubscribePreviewResource]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("settings.mcpPage.runtime.resourceBrowser.title")}
          </span>
          <span className="text-xs text-muted-foreground">
            ({resources.length})
          </span>
        </div>
        <button
          onClick={() => onRefresh()}
          disabled={loading}
          className="p-1.5 rounded hover:bg-muted"
          title={t("settings.mcpPage.runtime.resourceBrowser.refreshTitle")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(
              "settings.mcpPage.runtime.resourceBrowser.searchPlaceholder",
            )}
            className="w-full pl-8 pr-3 py-1.5 rounded border bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* 资源列表 */}
      <div className="flex-1 overflow-auto">
        {loading && resources.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredServerEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {searchQuery
              ? t("settings.mcpPage.runtime.resourceBrowser.empty.filtered")
              : t("settings.mcpPage.runtime.resourceBrowser.empty.noResources")}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredServerEntries.map(([serverName, serverResources]) => (
              <div key={serverName} className="border rounded-lg">
                <button
                  onClick={() => toggleServer(serverName)}
                  className="w-full p-2.5 flex items-center gap-2 hover:bg-muted/50 rounded-t-lg"
                >
                  {expandedServers.has(serverName) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{serverName}</span>
                  <span className="text-xs text-muted-foreground">
                    {`(${t(
                      "settings.mcpPage.runtime.resourceBrowser.resourceCount",
                      { count: serverResources.length },
                    )})`}
                  </span>
                </button>

                {expandedServers.has(serverName) && (
                  <div className="border-t">
                    {serverResources.map((resource) => (
                      <div
                        key={resource.uri}
                        className="border-b last:border-b-0"
                      >
                        <div className="p-2.5 pl-8 flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                              <span className="font-medium text-sm truncate">
                                {resource.name}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                              {resource.uri}
                            </p>
                            {resource.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {resource.description}
                              </p>
                            )}
                            {resource.mime_type && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
                                {resource.mime_type}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              handleReadResource({
                                server: resource.server_name,
                                uri: resource.uri,
                              })
                            }
                            className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"
                            title={t(
                              "settings.mcpPage.runtime.resourceBrowser.readTitle",
                            )}
                          >
                            {activeResource &&
                            resourceTargetKey(activeResource) ===
                              resourceTargetKey({
                                server: resource.server_name,
                                uri: resource.uri,
                              }) ? (
                              <X className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {/* 资源内容预览 */}
                        {activeResource &&
                          resourceTargetKey(activeResource) ===
                            resourceTargetKey({
                              server: resource.server_name,
                              uri: resource.uri,
                            }) && (
                            <div className="px-8 pb-3">
                              {reading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  {t(
                                    "settings.mcpPage.runtime.resourceBrowser.reading",
                                  )}
                                </div>
                              ) : readError ? (
                                <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                                  {readError}
                                </div>
                              ) : resourceContent ? (
                                <McpResourceContentPreview
                                  content={resourceContent}
                                />
                              ) : null}
                            </div>
                          )}
                      </div>
                    ))}
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
