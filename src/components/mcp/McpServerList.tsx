/**
 * MCP 服务器列表组件
 *
 * 显示所有 MCP 服务器及其运行状态，支持启动/停止操作。
 *
 * @module components/mcp/McpServerList
 */

import { useState, type MouseEvent } from "react";
import {
  AlertCircle,
  LogIn,
  Play,
  RefreshCw,
  Server,
  Settings2,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { McpServerInfo, McpServerOAuthLoginOptions } from "@/lib/api/mcp";
import type { McpServerConnectionState } from "@/hooks/useMcp";

interface McpServerListProps {
  servers: McpServerInfo[];
  loading: boolean;
  error: string | null;
  onStartServer: (name: string) => Promise<void>;
  onStopServer: (name: string) => Promise<void>;
  onReconnectServer: (name: string) => Promise<void>;
  onLoginOAuthServer?: (
    name: string,
    options?: McpServerOAuthLoginOptions,
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectServer?: (server: McpServerInfo) => void;
  selectedServerName?: string;
  serverConnectionStates: Record<string, McpServerConnectionState>;
}

export function McpServerList({
  servers,
  loading,
  error,
  onStartServer,
  onStopServer,
  onReconnectServer,
  onLoginOAuthServer,
  onRefresh,
  onSelectServer,
  selectedServerName,
  serverConnectionStates,
}: McpServerListProps) {
  const { t } = useTranslation("settings");
  const [operatingServer, setOperatingServer] = useState<string | null>(null);
  const [oauthLoginServer, setOAuthLoginServer] = useState<string | null>(null);

  const handleStart = async (name: string, e: MouseEvent) => {
    e.stopPropagation();
    setOperatingServer(name);
    try {
      await onStartServer(name);
    } finally {
      setOperatingServer(null);
    }
  };

  const handleStop = async (name: string, e: MouseEvent) => {
    e.stopPropagation();
    setOperatingServer(name);
    try {
      await onStopServer(name);
    } finally {
      setOperatingServer(null);
    }
  };

  const handleReconnect = async (name: string, e: MouseEvent) => {
    e.stopPropagation();
    setOperatingServer(name);
    try {
      await onReconnectServer(name);
    } finally {
      setOperatingServer(null);
    }
  };

  const handleOAuthLogin = async (server: McpServerInfo, e: MouseEvent) => {
    e.stopPropagation();
    if (!onLoginOAuthServer) {
      return;
    }
    setOAuthLoginServer(server.name);
    try {
      await onLoginOAuthServer(server.name, {
        scopes: server.runtime_status?.auth_status.action_plan?.scopes,
      });
    } finally {
      setOAuthLoginServer(null);
    }
  };

  // 获取服务器状态文本
  const getStatusText = (server: McpServerInfo) => {
    if (server.is_running && server.server_info) {
      return t("settings.mcpPage.runtime.serverList.status.runningVersion", {
        name: server.server_info.name,
        version: server.server_info.version,
      });
    }
    return server.is_running
      ? t("settings.mcpPage.runtime.serverList.status.running")
      : t("settings.mcpPage.runtime.serverList.status.stopped");
  };

  const hasInteractiveSelection = Boolean(onSelectServer);

  return (
    <div className="flex min-h-[464px] flex-col bg-white">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {t("settings.mcpPage.runtime.serverList.title")}
            </p>
            <p className="text-xs text-slate-500">
              {t("settings.mcpPage.runtime.serverList.summary", {
                total: servers.length,
                running: servers.filter((server) => server.is_running).length,
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={loading}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          title={t("settings.mcpPage.runtime.serverList.refreshTitle")}
          aria-label={t("settings.mcpPage.runtime.serverList.refreshAria")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-3">
          <div className="flex items-start gap-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 服务器列表 */}
      <div className="flex-1 overflow-auto p-4">
        {loading && servers.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin" />
              {t("settings.mcpPage.runtime.serverList.loading")}
            </div>
          </div>
        ) : servers.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center text-center">
            <div className="max-w-sm space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-slate-500">
                <Settings2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.mcpPage.runtime.serverList.emptyTitle")}
                </p>
                <p className="text-sm leading-6 text-slate-500">
                  {t("settings.mcpPage.runtime.serverList.emptyDescription")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {servers.map((server) => {
              const connectionState = serverConnectionStates[server.name];
              const isOperating = operatingServer === server.name;
              const isOAuthOperating = oauthLoginServer === server.name;
              const authStatus = server.runtime_status?.auth_status;
              const authPlan = authStatus?.action_plan;
              const needsOAuthLogin =
                authStatus?.mode === "oauth" &&
                authStatus.reason_code === "oauth_login_required" &&
                authPlan?.kind === "oauth_login";
              const oauthUnsupported =
                authStatus?.mode === "oauth" &&
                authStatus.reason_code === "oauth_runtime_not_implemented";
              const oauthAuthorized =
                authStatus?.mode === "oauth" &&
                authStatus.available &&
                !authStatus.reason_code;

              return (
                <div
                  key={server.id}
                  onClick={() => onSelectServer?.(server)}
                  className={cn(
                    "rounded-[22px] border p-4 transition",
                    hasInteractiveSelection && "cursor-pointer",
                    selectedServerName === server.name
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {/* 状态指示灯 */}
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full ring-4",
                            server.is_running
                              ? "bg-emerald-500 ring-emerald-100"
                              : "bg-slate-300 ring-slate-100",
                          )}
                        />
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {server.name}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {getStatusText(server)}
                      </p>
                      {server.description && (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {server.description}
                        </p>
                      )}
                      {connectionState?.phase &&
                        connectionState.phase !== "idle" && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            {connectionState.phase === "starting"
                              ? t(
                                  "settings.mcpPage.runtime.serverList.connectionPhase.starting",
                                )
                              : connectionState.phase === "stopping"
                                ? t(
                                    "settings.mcpPage.runtime.serverList.connectionPhase.stopping",
                                  )
                                : t(
                                    "settings.mcpPage.runtime.serverList.connectionPhase.reconnecting",
                                  )}
                          </span>
                        )}
                    </div>

                    {/* 启动/停止按钮 */}
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleReconnect(server.name, e)}
                        disabled={isOperating}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={t(
                          "settings.mcpPage.runtime.serverList.reconnectTitle",
                        )}
                        aria-label={t(
                          "settings.mcpPage.runtime.serverList.reconnectAria",
                          { name: server.name },
                        )}
                      >
                        <RefreshCw
                          className={cn(
                            "h-4 w-4",
                            isOperating && "animate-spin",
                          )}
                        />
                      </button>
                      {server.is_running ? (
                        <button
                          type="button"
                          onClick={(e) => handleStop(server.name, e)}
                          disabled={isOperating}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-700 transition hover:border-rose-200 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={t(
                            "settings.mcpPage.runtime.serverList.stopTitle",
                          )}
                          aria-label={t(
                            "settings.mcpPage.runtime.serverList.stopAria",
                            { name: server.name },
                          )}
                        >
                          {isOperating ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleStart(server.name, e)}
                          disabled={isOperating}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title={t(
                            "settings.mcpPage.runtime.serverList.startTitle",
                          )}
                          aria-label={t(
                            "settings.mcpPage.runtime.serverList.startAria",
                            { name: server.name },
                          )}
                        >
                          {isOperating ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {(needsOAuthLogin || oauthUnsupported || oauthAuthorized) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {needsOAuthLogin && (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {t(
                              "settings.mcpPage.runtime.auth.oauthRequired",
                              "需要授权",
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleOAuthLogin(server, e)}
                            disabled={isOAuthOperating || !onLoginOAuthServer}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title={t(
                              "settings.mcpPage.runtime.auth.oauthLoginTitle",
                              {
                                name: server.name,
                              },
                            )}
                            aria-label={t(
                              "settings.mcpPage.runtime.auth.oauthLoginAria",
                              {
                                name: server.name,
                              },
                            )}
                          >
                            {isOAuthOperating ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <LogIn className="h-3.5 w-3.5" />
                            )}
                            {t(
                              "settings.mcpPage.runtime.auth.oauthLoginAction",
                            )}
                          </button>
                        </>
                      )}
                      {oauthUnsupported && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                          title={t(
                            "settings.mcpPage.runtime.auth.oauthUnsupportedTitle",
                          )}
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t(
                            "settings.mcpPage.runtime.auth.oauthUnsupported",
                          )}
                        </span>
                      )}
                      {oauthAuthorized && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {t(
                            "settings.mcpPage.runtime.auth.oauthAuthorized",
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  {connectionState?.error && (
                    <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                      {t("settings.mcpPage.runtime.serverList.latestError", {
                        message: connectionState.error,
                      })}
                    </p>
                  )}

                  {/* 能力标签 */}
                  {server.is_running && server.server_info && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {server.server_info.supports_tools && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          {t("settings.mcpPage.runtime.serverList.tools")}
                        </span>
                      )}
                      {server.server_info.supports_prompts && (
                        <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                          {t("settings.mcpPage.runtime.serverList.prompts")}
                        </span>
                      )}
                      {server.server_info.supports_resources && (
                        <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          {t("settings.mcpPage.runtime.serverList.resources")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
