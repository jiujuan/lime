import { Download, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MCP_PAGE_PRIMARY_ACTION_BUTTON_CLASS_NAME } from "./mcpPageModel";

interface McpPageActionsProps {
  importing: boolean;
  showImportMenu: boolean;
  onToggleImportMenu: () => void;
  onImport: (appType?: string) => void;
  onSyncToLive: () => void;
}

export function McpPageActions({
  importing,
  showImportMenu,
  onToggleImportMenu,
  onImport,
  onSyncToLive,
}: McpPageActionsProps) {
  const { t } = useTranslation("settings");

  return (
    <>
      <div className="relative">
        <button
          onClick={onToggleImportMenu}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-muted text-sm"
          title={t(
            "settings.mcpPage.import.title",
            "从外部应用导入 MCP 配置",
          )}
        >
          <Download className={cn("h-4 w-4", importing && "animate-pulse")} />
          {importing
            ? t("settings.mcpPage.import.loading", "导入中...")
            : t("settings.mcpPage.import.action", "导入")}
        </button>
        {showImportMenu && (
          <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-popover border rounded-lg shadow-lg z-10">
            <button
              onClick={() => onImport()}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              {t("settings.mcpPage.import.all", "全部导入")}
            </button>
            <button
              onClick={() => onImport("claude")}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              {t("settings.mcpPage.import.claude", "从 Claude")}
            </button>
            <button
              onClick={() => onImport("codex")}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              {t("settings.mcpPage.import.localCli", "从本地 CLI")}
            </button>
            <button
              onClick={() => onImport("gemini")}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              {t("settings.mcpPage.import.gemini", "从 Gemini CLI")}
            </button>
          </div>
        )}
      </div>
      <button
        onClick={onSyncToLive}
        className={`flex items-center gap-1.5 ${MCP_PAGE_PRIMARY_ACTION_BUTTON_CLASS_NAME}`}
        title={t("settings.mcpPage.sync.title", "同步配置到所有外部应用")}
      >
        <Upload className="h-4 w-4" />
        {t("settings.mcpPage.sync.action", "同步")}
      </button>
    </>
  );
}
