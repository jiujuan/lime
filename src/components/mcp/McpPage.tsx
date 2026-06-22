import { useState } from "react";
import { useMcpServers } from "@/hooks/useMcpServers";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HelpTip } from "@/components/HelpTip";
import { useTranslation } from "react-i18next";
import { McpPageActions } from "./McpPageActions";
import { McpPageEditor } from "./McpPageEditor";
import { McpPageServerList } from "./McpPageServerList";
import { useMcpPageEditorState } from "./useMcpPageEditorState";

interface McpPageProps {
  hideHeader?: boolean;
}

export function McpPage({ hideHeader = false }: McpPageProps) {
  const { t } = useTranslation("settings");
  const {
    servers,
    loading,
    importing,
    error,
    addServer,
    updateServer,
    deleteServer,
    importFromApp,
    importFromAllApps,
    syncAllToLive,
    refresh,
  } = useMcpServers();

  const [showImportMenu, setShowImportMenu] = useState(false);
  const {
    selectedServer,
    isCreating,
    editName,
    editDescription,
    editConfig,
    enabledLime,
    enabledClaude,
    enabledCodex,
    enabledGemini,
    saving,
    configError,
    selectedPreset,
    deleteConfirm,
    setEditName,
    setEditDescription,
    setEnabledLime,
    setEnabledClaude,
    setEnabledCodex,
    setEnabledGemini,
    handleSelectServer,
    handleCreateNew,
    handlePresetSelect,
    handleConfigChange,
    handleCancelEdit,
    handleSave,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
  } = useMcpPageEditorState({
    addServer,
    updateServer,
    deleteServer,
  });

  const handleImport = async (appType?: string) => {
    setShowImportMenu(false);
    try {
      const count = appType
        ? await importFromApp(appType)
        : await importFromAllApps();
      if (count > 0) {
        alert(
          t("settings.mcpPage.toast.importSuccess", {
            count,
            defaultValue: "成功导入/更新 {{count}} 个 MCP 服务器配置",
          }),
        );
      } else {
        alert(
          t("settings.mcpPage.toast.importEmpty", "没有找到 MCP 配置可导入"),
        );
      }
    } catch (e) {
      alert(
        t("settings.mcpPage.toast.importFailed", {
          message: e instanceof Error ? e.message : String(e),
          defaultValue: "导入失败：{{message}}",
        }),
      );
    }
  };

  const handleSyncToLive = async () => {
    try {
      await syncAllToLive();
      alert(t("settings.mcpPage.toast.syncSuccess", "同步完成"));
    } catch (e) {
      alert(
        t("settings.mcpPage.toast.syncFailed", {
          message: e instanceof Error ? e.message : String(e),
          defaultValue: "同步失败：{{message}}",
        }),
      );
    }
  };

  return (
    <div className="h-full flex flex-col" data-testid="mcp-config-page">
      {!hideHeader && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {t("settings.mcpPage.title", "MCP 服务器")}
            </h2>
            <p className="text-muted-foreground">
              {t(
                "settings.mcpPage.description",
                "管理 Model Context Protocol 服务器配置，同步到外部应用",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <McpPageActions
              importing={importing}
              showImportMenu={showImportMenu}
              onToggleImportMenu={() => setShowImportMenu(!showImportMenu)}
              onImport={handleImport}
              onSyncToLive={handleSyncToLive}
            />
          </div>
        </div>
      )}

      {hideHeader && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <McpPageActions
            importing={importing}
            showImportMenu={showImportMenu}
            onToggleImportMenu={() => setShowImportMenu(!showImportMenu)}
            onImport={handleImport}
            onSyncToLive={handleSyncToLive}
          />
        </div>
      )}

      <HelpTip
        title={t("settings.mcpPage.help.title", "什么是 MCP？")}
        variant="blue"
      >
        <ul className="list-disc list-inside space-y-1 text-sm text-emerald-700 dark:text-emerald-300">
          <li>
            {t(
              "settings.mcpPage.help.protocol",
              "MCP (Model Context Protocol) 是 AI 工具扩展协议，让 AI 能访问文件系统、数据库等外部资源",
            )}
          </li>
          <li>
            {t(
              "settings.mcpPage.help.sync",
              "在此添加 MCP 服务器后，可同步到 Claude、本地 CLI、Gemini CLI",
            )}
          </li>
          <li>
            {t(
              "settings.mcpPage.help.import",
              "也可从这些工具导入已有的 MCP 配置，统一管理",
            )}
          </li>
        </ul>
      </HelpTip>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 mb-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        <McpPageServerList
          servers={servers}
          loading={loading}
          selectedServerId={selectedServer?.id ?? null}
          onRefresh={refresh}
          onCreateNew={handleCreateNew}
          onSelectServer={handleSelectServer}
        />
        <div className="flex-1 border rounded-lg flex flex-col min-w-0">
          <McpPageEditor
            selectedServer={selectedServer}
            isCreating={isCreating}
            editName={editName}
            editDescription={editDescription}
            editConfig={editConfig}
            enabledLime={enabledLime}
            enabledClaude={enabledClaude}
            enabledCodex={enabledCodex}
            enabledGemini={enabledGemini}
            saving={saving}
            configError={configError}
            selectedPreset={selectedPreset}
            onEditNameChange={setEditName}
            onEditDescriptionChange={setEditDescription}
            onEditConfigChange={handleConfigChange}
            onEnabledLimeChange={setEnabledLime}
            onEnabledClaudeChange={setEnabledClaude}
            onEnabledCodexChange={setEnabledCodex}
            onEnabledGeminiChange={setEnabledGemini}
            onPresetSelect={handlePresetSelect}
            onDelete={handleDeleteClick}
            onCancel={handleCancelEdit}
            onSave={handleSave}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title={t("settings.mcpPage.delete.title", "删除确认")}
        message={t(
          "settings.mcpPage.delete.message",
          "确定要删除这个 MCP 服务器吗？",
        )}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
