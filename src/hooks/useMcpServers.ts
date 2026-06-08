import { useState, useEffect, useCallback } from "react";
import { mcpApi, McpServer } from "@/lib/api/mcp";

export function useMcpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await mcpApi.getServers();
      setServers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 从指定应用导入 MCP 配置
  const importFromApp = async (appType: string): Promise<number> => {
    setImporting(true);
    try {
      const count = await mcpApi.importFromApp(appType);
      await fetchServers();
      return count;
    } finally {
      setImporting(false);
    }
  };

  // 从所有应用导入 MCP 配置
  const importFromAllApps = useCallback(async (): Promise<number> => {
    setImporting(true);
    try {
      let total = 0;
      for (const app of ["claude", "codex", "gemini"]) {
        const count = await mcpApi.importFromApp(app);
        total += count;
      }
      await fetchServers();
      return total;
    } finally {
      setImporting(false);
    }
  }, [fetchServers]);

  // 同步所有配置到实际配置文件
  const syncAllToLive = async () => {
    await mcpApi.syncAllToLive();
  };

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const addServer = async (server: Omit<McpServer, "id" | "created_at">) => {
    const newServer: McpServer = {
      ...server,
      id: crypto.randomUUID(),
      created_at: Date.now(),
    };
    await mcpApi.addServer(newServer);
    await fetchServers();
  };

  const updateServer = async (server: McpServer) => {
    await mcpApi.updateServer(server);
    await fetchServers();
  };

  const deleteServer = async (id: string) => {
    await mcpApi.deleteServer(id);
    await fetchServers();
  };

  const toggleServer = async (
    id: string,
    appType: string,
    enabled: boolean,
  ) => {
    await mcpApi.toggleServer(id, appType, enabled);
    await fetchServers();
  };

  return {
    servers,
    loading,
    importing,
    error,
    addServer,
    updateServer,
    deleteServer,
    toggleServer,
    importFromApp,
    importFromAllApps,
    syncAllToLive,
    refresh: fetchServers,
  };
}
