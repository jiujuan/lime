import { type MouseEvent } from "react";
import { AlertCircle, LogIn, Play, RefreshCw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { McpServerInfo } from "@/lib/api/mcp";
import type { McpServerConnectionState } from "@/hooks/useMcp";
import {
  getMcpServerCapabilityBadges,
  getMcpServerConnectionPhaseLabelKey,
  getMcpServerOAuthViewModel,
  getMcpServerStatusText,
  type McpServerCapabilityBadge,
} from "./mcpServerListModel";

interface McpServerRowProps {
  server: McpServerInfo;
  connectionState?: McpServerConnectionState;
  isSelected: boolean;
  isInteractive: boolean;
  isOperating: boolean;
  isOAuthOperating: boolean;
  onSelectServer?: (server: McpServerInfo) => void;
  onStartServer: (name: string) => Promise<void>;
  onStopServer: (name: string) => Promise<void>;
  onReconnectServer: (name: string) => Promise<void>;
  onLoginOAuthServer?: (server: McpServerInfo) => Promise<void>;
}

type CapabilityBadgeLabelKey =
  | "settings.mcpPage.runtime.serverList.tools"
  | "settings.mcpPage.runtime.serverList.prompts"
  | "settings.mcpPage.runtime.serverList.resources";

const capabilityBadgeMeta = {
  tools: {
    labelKey: "settings.mcpPage.runtime.serverList.tools",
    className: "border-emerald-100 bg-emerald-50 text-emerald-700",
  },
  prompts: {
    labelKey: "settings.mcpPage.runtime.serverList.prompts",
    className: "border-sky-100 bg-sky-50 text-sky-700",
  },
  resources: {
    labelKey: "settings.mcpPage.runtime.serverList.resources",
    className: "border-amber-100 bg-amber-50 text-amber-700",
  },
} as const satisfies Record<
  McpServerCapabilityBadge,
  { labelKey: CapabilityBadgeLabelKey; className: string }
>;

export function McpServerRow({
  server,
  connectionState,
  isSelected,
  isInteractive,
  isOperating,
  isOAuthOperating,
  onSelectServer,
  onStartServer,
  onStopServer,
  onReconnectServer,
  onLoginOAuthServer,
}: McpServerRowProps) {
  const { t } = useTranslation("settings");
  const statusText = getMcpServerStatusText(server);
  const connectionPhaseLabelKey = getMcpServerConnectionPhaseLabelKey(
    connectionState?.phase,
  );
  const oauth = getMcpServerOAuthViewModel(server);
  const capabilityBadges = getMcpServerCapabilityBadges(server);

  const handleReconnect = async (event: MouseEvent) => {
    event.stopPropagation();
    await onReconnectServer(server.name);
  };

  const handleStart = async (event: MouseEvent) => {
    event.stopPropagation();
    await onStartServer(server.name);
  };

  const handleStop = async (event: MouseEvent) => {
    event.stopPropagation();
    await onStopServer(server.name);
  };

  const handleOAuthLogin = async (event: MouseEvent) => {
    event.stopPropagation();
    await onLoginOAuthServer?.(server);
  };

  return (
    <div
      onClick={() => onSelectServer?.(server)}
      className={cn(
        "rounded-[22px] border p-4 transition",
        isInteractive && "cursor-pointer",
        isSelected
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
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
            {statusText.values
              ? t(statusText.key, statusText.values)
              : t(statusText.key)}
          </p>
          {server.description && (
            <p className="mt-1 truncate text-xs text-slate-500">
              {server.description}
            </p>
          )}
          {connectionPhaseLabelKey && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {t(connectionPhaseLabelKey)}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleReconnect}
            disabled={isOperating}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={t("settings.mcpPage.runtime.serverList.reconnectTitle")}
            aria-label={t("settings.mcpPage.runtime.serverList.reconnectAria", {
              name: server.name,
            })}
          >
            <RefreshCw
              className={cn("h-4 w-4", isOperating && "animate-spin")}
            />
          </button>
          {server.is_running ? (
            <button
              type="button"
              onClick={handleStop}
              disabled={isOperating}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-700 transition hover:border-rose-200 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("settings.mcpPage.runtime.serverList.stopTitle")}
              aria-label={t("settings.mcpPage.runtime.serverList.stopAria", {
                name: server.name,
              })}
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
              onClick={handleStart}
              disabled={isOperating}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("settings.mcpPage.runtime.serverList.startTitle")}
              aria-label={t("settings.mcpPage.runtime.serverList.startAria", {
                name: server.name,
              })}
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

      {oauth.state !== "none" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {oauth.state === "login-required" && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("settings.mcpPage.runtime.auth.oauthRequired", "需要授权")}
              </span>
              <button
                type="button"
                onClick={handleOAuthLogin}
                disabled={isOAuthOperating || !onLoginOAuthServer}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={t("settings.mcpPage.runtime.auth.oauthLoginTitle", {
                  name: server.name,
                })}
                aria-label={t("settings.mcpPage.runtime.auth.oauthLoginAria", {
                  name: server.name,
                })}
              >
                {isOAuthOperating ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogIn className="h-3.5 w-3.5" />
                )}
                {t("settings.mcpPage.runtime.auth.oauthLoginAction")}
              </button>
            </>
          )}
          {oauth.state === "unsupported" && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
              title={t("settings.mcpPage.runtime.auth.oauthUnsupportedTitle")}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {t("settings.mcpPage.runtime.auth.oauthUnsupported")}
            </span>
          )}
          {oauth.state === "authorized" && (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {t("settings.mcpPage.runtime.auth.oauthAuthorized")}
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

      {capabilityBadges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {capabilityBadges.map((badge) => {
            const meta = capabilityBadgeMeta[badge];
            return (
              <span
                key={badge}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs",
                  meta.className,
                )}
              >
                {t(meta.labelKey)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
