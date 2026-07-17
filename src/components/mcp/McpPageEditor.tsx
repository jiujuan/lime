import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { McpServer } from "@/lib/api/mcp";
import { cn } from "@/lib/utils";
import {
  addMcpServerConfigEnvHeaderRef,
  MCP_PAGE_PRESETS,
  MCP_PAGE_PRIMARY_ACTION_BUTTON_CLASS_NAME,
  removeMcpServerConfigEnvHeaderRef,
  summarizeMcpServerConfigJson,
  updateMcpServerConfigEnvHeaderRef,
  updateMcpServerConfigTextField,
  type McpPageConfigTextField,
} from "./mcpPageModel";

interface McpPageEditorProps {
  selectedServer: McpServer | null;
  isCreating: boolean;
  editName: string;
  editDescription: string;
  editConfig: string;
  enabledLime: boolean;
  enabledClaude: boolean;
  enabledCodex: boolean;
  enabledGemini: boolean;
  saving: boolean;
  configError: string | null;
  selectedPreset: string | null;
  onEditNameChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditConfigChange: (value: string) => void;
  onEnabledLimeChange: (value: boolean) => void;
  onEnabledClaudeChange: (value: boolean) => void;
  onEnabledCodexChange: (value: boolean) => void;
  onEnabledGeminiChange: (value: boolean) => void;
  onPresetSelect: (presetId: string) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}

const MCP_PAGE_AUTHORIZATION_HEADER = "Authorization";

export function McpPageEditor({
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
  onEditNameChange,
  onEditDescriptionChange,
  onEditConfigChange,
  onEnabledLimeChange,
  onEnabledClaudeChange,
  onEnabledCodexChange,
  onEnabledGeminiChange,
  onPresetSelect,
  onDelete,
  onCancel,
  onSave,
}: McpPageEditorProps) {
  const { t } = useTranslation("settings");
  const configSummary = summarizeMcpServerConfigJson(editConfig);
  const showHttpConfig = configSummary?.transport === "streamable_http";
  const showStdioConfig = configSummary
    ? configSummary.transport !== "streamable_http"
    : false;
  const appToggles = [
    {
      key: "lime",
      checked: enabledLime,
      label: t("settings.mcpPage.app.lime", "Lime"),
      onChange: onEnabledLimeChange,
    },
    {
      key: "claude",
      checked: enabledClaude,
      label: t("settings.mcpPage.app.claude", "Claude"),
      onChange: onEnabledClaudeChange,
    },
    {
      key: "localCli",
      checked: enabledCodex,
      label: t("settings.mcpPage.app.localCli", "本地 CLI"),
      onChange: onEnabledCodexChange,
    },
    {
      key: "gemini",
      checked: enabledGemini,
      label: t("settings.mcpPage.app.gemini", "Gemini CLI"),
      onChange: onEnabledGeminiChange,
    },
  ];
  const handleConfigTextFieldChange = (
    field: McpPageConfigTextField,
    value: string,
  ) => {
    onEditConfigChange(
      updateMcpServerConfigTextField(editConfig, field, value),
    );
  };
  const handleEnvHeaderRefChange = (
    index: number,
    patch: Partial<{ headerName: string; envVar: string }>,
  ) => {
    onEditConfigChange(
      updateMcpServerConfigEnvHeaderRef(editConfig, index, patch),
    );
  };
  const handleAddEnvHeaderRef = () => {
    onEditConfigChange(addMcpServerConfigEnvHeaderRef(editConfig));
  };
  const handleRemoveEnvHeaderRef = (index: number) => {
    onEditConfigChange(removeMcpServerConfigEnvHeaderRef(editConfig, index));
  };

  if (!selectedServer && !isCreating) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p>
            {t(
              "settings.mcpPage.noSelection.title",
              "选择一个 MCP 服务器进行编辑",
            )}
          </p>
          <p className="text-sm mt-1">
            {t(
              "settings.mcpPage.noSelection.description",
              "或点击 + 添加新的服务器",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {isCreating
              ? t("settings.mcpPage.editor.createTitle", "添加 MCP 服务器")
              : t("settings.mcpPage.editor.editTitle", "编辑 MCP 服务器")}
          </h3>
          {selectedServer && (
            <button
              onClick={() => onDelete(selectedServer.id)}
              data-testid="mcp-config-delete"
              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
              title={t("settings.mcpPage.action.delete", "删除")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {isCreating && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t("settings.mcpPage.preset.label", "预设：")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MCP_PAGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onPresetSelect(preset.id)}
                  data-testid={`mcp-config-preset-${preset.id}`}
                  className={cn(
                    "rounded border px-2.5 py-1 text-xs transition-colors",
                    selectedPreset === preset.id
                      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                      : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {t(preset.nameKey, preset.defaultName)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              {t("settings.mcpPage.form.name", "名称")}{" "}
              <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={editName}
              onChange={(event) => onEditNameChange(event.target.value)}
              data-testid="mcp-config-name"
              className="w-full px-2.5 py-1.5 rounded border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm"
              placeholder={t(
                "settings.mcpPage.form.namePlaceholder",
                "服务器名称",
              )}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              {t("settings.mcpPage.form.description", "描述")}
            </label>
            <input
              type="text"
              value={editDescription}
              onChange={(event) => onEditDescriptionChange(event.target.value)}
              data-testid="mcp-config-description"
              className="w-full px-2.5 py-1.5 rounded border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm"
              placeholder={t(
                "settings.mcpPage.form.descriptionPlaceholder",
                "可选描述",
              )}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.mcpPage.form.syncTo", "同步到：")}
          </span>
          {appToggles.map((toggle) => (
            <label
              key={toggle.key}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                data-testid={`mcp-config-enabled-${toggle.key}`}
                checked={toggle.checked}
                onChange={(event) => toggle.onChange(event.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300"
              />
              <span className="text-xs">{toggle.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col min-h-0 gap-3">
        {!configError && configSummary && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-700">
                  {t("settings.mcpPage.form.configSummary.title")}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600">
                  {configSummary.transport}
                </span>
              </div>
              {configSummary.staticHeaderNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {configSummary.staticHeaderNames.map((headerName) => (
                    <span
                      key={headerName}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600"
                    >
                      {headerName}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {showHttpConfig && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    {t("settings.mcpPage.form.connection.url")}
                  </span>
                  <input
                    type="url"
                    value={configSummary.url ?? ""}
                    onChange={(event) =>
                      handleConfigTextFieldChange("url", event.target.value)
                    }
                    data-testid="mcp-config-connection-url"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={t(
                      "settings.mcpPage.form.connection.urlPlaceholder",
                    )}
                  />
                </label>
              )}

              {showStdioConfig && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    {t("settings.mcpPage.form.connection.command")}
                  </span>
                  <input
                    type="text"
                    value={configSummary.command ?? ""}
                    onChange={(event) =>
                      handleConfigTextFieldChange("command", event.target.value)
                    }
                    data-testid="mcp-config-connection-command"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={t(
                      "settings.mcpPage.form.connection.commandPlaceholder",
                    )}
                  />
                </label>
              )}

              {showHttpConfig && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">
                    {t("settings.mcpPage.form.connection.bearerEnv")}
                  </span>
                  <input
                    type="text"
                    value={configSummary.bearerTokenEnvVar ?? ""}
                    onChange={(event) =>
                      handleConfigTextFieldChange(
                        "bearer_token_env_var",
                        event.target.value,
                      )
                    }
                    data-testid="mcp-config-bearer-env"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={t(
                      "settings.mcpPage.form.connection.bearerEnvPlaceholder",
                    )}
                  />
                </label>
              )}

              {showHttpConfig && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-700">
                      {t("settings.mcpPage.form.configSummary.envHeaders")}
                    </p>
                    <button
                      type="button"
                      onClick={handleAddEnvHeaderRef}
                      data-testid="mcp-config-add-env-header"
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-100 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("settings.mcpPage.form.connection.addEnvHeader")}
                    </button>
                  </div>
                  {configSummary.envHeaderRefs.map((ref, index) => (
                    <div
                      key={`${ref.headerName}:${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2"
                    >
                      <input
                        type="text"
                        value={ref.headerName}
                        onChange={(event) =>
                          handleEnvHeaderRefChange(index, {
                            headerName: event.target.value,
                          })
                        }
                        data-testid="mcp-config-env-header-name"
                        aria-label={t(
                          "settings.mcpPage.form.connection.headerName",
                        )}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder={t(
                          "settings.mcpPage.form.connection.headerName",
                        )}
                      />
                      <input
                        type="text"
                        value={ref.envVar}
                        onChange={(event) =>
                          handleEnvHeaderRefChange(index, {
                            envVar: event.target.value,
                          })
                        }
                        data-testid="mcp-config-env-header-env-var"
                        aria-label={t(
                          "settings.mcpPage.form.connection.envVar",
                        )}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder={t(
                          "settings.mcpPage.form.connection.envVar",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEnvHeaderRef(index)}
                        data-testid="mcp-config-remove-env-header"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        title={t(
                          "settings.mcpPage.form.connection.removeEnvHeader",
                        )}
                        aria-label={t(
                          "settings.mcpPage.form.connection.removeEnvHeader",
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="leading-5 text-slate-500">
                    {t("settings.mcpPage.form.configSummary.envHeaderHint")}
                  </p>
                </div>
              )}
            </div>

            {(configSummary.bearerTokenEnvVar ||
              configSummary.envHeaderRefs.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {configSummary.bearerTokenEnvVar && (
                  <span className="rounded-full border border-amber-100 bg-white px-2 py-0.5 font-mono text-[11px] text-amber-700">
                    {MCP_PAGE_AUTHORIZATION_HEADER} ←{" "}
                    {configSummary.bearerTokenEnvVar}
                  </span>
                )}
                {configSummary.envHeaderRefs.map((ref) => (
                  <span
                    key={`${ref.headerName}:${ref.envVar}`}
                    className="rounded-full border border-sky-100 bg-white px-2 py-0.5 font-mono text-[11px] text-sky-700"
                  >
                    {ref.headerName} ← {ref.envVar}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="block text-xs font-medium text-muted-foreground">
          {t("settings.mcpPage.form.configAdvanced")}
        </label>
        <textarea
          value={editConfig}
          onChange={(event) => onEditConfigChange(event.target.value)}
          data-testid="mcp-config-json"
          className={cn(
            "min-h-[10rem] flex-1 w-full px-3 py-2 rounded-lg border bg-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono text-sm resize-none",
            configError && "border-destructive",
          )}
          placeholder={t(
            "settings.mcpPage.form.configPlaceholder",
            '{"command": "npx", "args": [...], "env": {...}}',
          )}
        />
        {configError && (
          <p className="text-xs text-destructive">{configError}</p>
        )}
      </div>

      <div className="p-3 border-t flex justify-end gap-2">
        <button
          onClick={onCancel}
          data-testid="mcp-config-cancel"
          className="px-3 py-1.5 rounded border hover:bg-muted text-sm"
        >
          {t("settings.mcpPage.action.cancel", "取消")}
        </button>
        <button
          onClick={onSave}
          disabled={saving || !editName.trim() || !!configError}
          data-testid="mcp-config-save"
          className={`${MCP_PAGE_PRIMARY_ACTION_BUTTON_CLASS_NAME} disabled:opacity-50`}
        >
          {saving
            ? t("settings.mcpPage.action.saving", "保存中...")
            : t("settings.mcpPage.action.save", "保存")}
        </button>
      </div>
    </>
  );
}
