import { Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { McpServer } from "@/lib/api/mcp";
import { cn } from "@/lib/utils";
import { getEnabledMcpApps } from "./mcpPageModel";

interface McpPageServerListProps {
  servers: McpServer[];
  loading: boolean;
  selectedServerId: string | null;
  onRefresh: () => void | Promise<void>;
  onCreateNew: () => void;
  onSelectServer: (server: McpServer) => void;
}

export function McpPageServerList({
  servers,
  loading,
  selectedServerId,
  onRefresh,
  onCreateNew,
  onSelectServer,
}: McpPageServerListProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="w-64 flex flex-col border rounded-lg">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="text-sm font-medium">
          {t("settings.mcpPage.serverList.title", "服务器列表")}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onRefresh}
            className="p-1.5 rounded hover:bg-muted"
            title={t("settings.mcpPage.action.refresh", "刷新")}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={onCreateNew}
            className="p-1.5 rounded hover:bg-muted text-primary"
            title={t("settings.mcpPage.action.create", "新建")}
            data-testid="mcp-config-create-server"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>{t("settings.mcpPage.empty.title", "暂无 MCP 服务器")}</p>
            <button
              onClick={onCreateNew}
              className="text-primary hover:underline mt-1"
              data-testid="mcp-config-empty-create-server"
            >
              {t("settings.mcpPage.empty.action", "添加第一个")}
            </button>
          </div>
        ) : (
          servers.map((server) => (
            <div
              key={server.id}
              onClick={() => onSelectServer(server)}
              data-testid="mcp-config-server"
              className={cn(
                "p-2.5 rounded-lg cursor-pointer transition-colors",
                selectedServerId === server.id
                  ? "border border-emerald-200 bg-emerald-50"
                  : "hover:bg-muted border border-transparent",
              )}
            >
              <span className="font-medium text-sm truncate block">
                {server.name}
              </span>
              {server.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {server.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {getEnabledMcpApps(server).map((app) => (
                  <span
                    key={app}
                    className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
                  >
                    {app}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
