/**
 * MCP 提示词浏览器组件
 *
 * 按服务器分组显示所有可用的 MCP 提示词，支持参数输入和内容获取。
 *
 * @module components/mcp/McpPromptsBrowser
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { McpPromptDefinition, McpPromptResult } from "@/lib/api/mcp";
import {
  buildMcpPromptArguments,
  filterMcpPromptsByServer,
  groupMcpPromptsByServer,
} from "./mcpPromptBrowserModel";
import { McpPromptServerGroup } from "./McpPromptServerGroup";

interface McpPromptsBrowserProps {
  prompts: McpPromptDefinition[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onGetPrompt: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<McpPromptResult>;
}

export function McpPromptsBrowser({
  prompts,
  loading,
  onRefresh,
  onGetPrompt,
}: McpPromptsBrowserProps) {
  const { t } = useTranslation("settings");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({});
  const [promptResult, setPromptResult] = useState<McpPromptResult | null>(
    null,
  );
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const promptsByServer = useMemo(
    () => groupMcpPromptsByServer(prompts),
    [prompts],
  );
  const filteredByServer = useMemo(
    () => filterMcpPromptsByServer(promptsByServer, searchQuery),
    [promptsByServer, searchQuery],
  );
  const filteredPromptEntries = Object.entries(filteredByServer);

  const toggleServer = (name: string) => {
    const s = new Set(expandedServers);
    if (s.has(name)) {
      s.delete(name);
    } else {
      s.add(name);
    }
    setExpandedServers(s);
  };

  const handleOpenPrompt = (prompt: McpPromptDefinition) => {
    setActivePrompt(prompt.name);
    setPromptArgs({});
    setPromptResult(null);
    setCallError(null);
  };

  const handleTogglePrompt = (prompt: McpPromptDefinition) => {
    if (activePrompt === prompt.name) {
      setActivePrompt(null);
      return;
    }

    handleOpenPrompt(prompt);
  };

  const handlePromptArgChange = (name: string, value: string) => {
    setPromptArgs((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCallPrompt = async (prompt: McpPromptDefinition) => {
    setCalling(true);
    setCallError(null);
    try {
      const args = buildMcpPromptArguments(prompt, promptArgs);
      const result = await onGetPrompt(prompt.name, args);
      setPromptResult(result);
    } catch (e) {
      setCallError(e instanceof Error ? e.message : String(e));
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("settings.mcpPage.runtime.promptBrowser.title")}
          </span>
          <span className="text-xs text-muted-foreground">
            ({prompts.length})
          </span>
        </div>
        <button
          onClick={() => onRefresh()}
          disabled={loading}
          className="p-1.5 rounded hover:bg-muted"
          title={t("settings.mcpPage.runtime.promptBrowser.refreshTitle")}
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
              "settings.mcpPage.runtime.promptBrowser.searchPlaceholder",
            )}
            className="w-full pl-8 pr-3 py-1.5 rounded border bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* 提示词列表 */}
      <div className="flex-1 overflow-auto">
        {loading && prompts.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPromptEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {searchQuery
              ? t("settings.mcpPage.runtime.promptBrowser.empty.filtered")
              : t("settings.mcpPage.runtime.promptBrowser.empty.noPrompts")}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredPromptEntries.map(([serverName, serverPrompts]) => (
              <McpPromptServerGroup
                key={serverName}
                serverName={serverName}
                prompts={serverPrompts}
                expanded={expandedServers.has(serverName)}
                activePrompt={activePrompt}
                promptArgs={promptArgs}
                promptResult={promptResult}
                calling={calling}
                callError={callError}
                onToggleServer={toggleServer}
                onTogglePrompt={handleTogglePrompt}
                onPromptArgChange={handlePromptArgChange}
                onCallPrompt={handleCallPrompt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
