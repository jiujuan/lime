import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { McpServer, McpServerConfig } from "@/lib/api/mcp";
import { DEFAULT_MCP_SERVER_CONFIG, MCP_PAGE_PRESETS } from "./mcpPageModel";

interface UseMcpPageEditorStateOptions {
  addServer: (server: Omit<McpServer, "id" | "created_at">) => Promise<void>;
  updateServer: (server: McpServer) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
}

export function useMcpPageEditorState({
  addServer,
  updateServer,
  deleteServer,
}: UseMcpPageEditorStateOptions) {
  const { t } = useTranslation("settings");
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editConfig, setEditConfig] = useState("");
  const [enabledLime, setEnabledLime] = useState(true);
  const [enabledClaude, setEnabledClaude] = useState(true);
  const [enabledCodex, setEnabledCodex] = useState(true);
  const [enabledGemini, setEnabledGemini] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleSelectServer = (server: McpServer) => {
    setSelectedServer(server);
    setIsCreating(false);
    setEditName(server.name);
    setEditDescription(server.description || "");
    setEditConfig(JSON.stringify(server.server_config, null, 2));
    setEnabledLime(server.enabled_lime);
    setEnabledClaude(server.enabled_claude);
    setEnabledCodex(server.enabled_codex);
    setEnabledGemini(server.enabled_gemini);
    setConfigError(null);
    setSelectedPreset(null);
  };

  const handleCreateNew = () => {
    setSelectedServer(null);
    setIsCreating(true);
    setEditName("");
    setEditDescription("");
    setEditConfig(DEFAULT_MCP_SERVER_CONFIG);
    setEnabledLime(true);
    setEnabledClaude(true);
    setEnabledCodex(true);
    setEnabledGemini(true);
    setConfigError(null);
    setSelectedPreset("custom");
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = MCP_PAGE_PRESETS.find(
      (candidate) => candidate.id === presetId,
    );
    if (!preset) {
      return;
    }

    setSelectedPreset(presetId);
    if (presetId !== "custom") {
      setEditName(t(preset.nameKey, preset.defaultName));
      setEditDescription(t(preset.descriptionKey, preset.defaultDescription));
    }
    setEditConfig(JSON.stringify(preset.server_config, null, 2));
    setConfigError(null);
  };

  const handleConfigChange = (value: string) => {
    setEditConfig(value);
    try {
      JSON.parse(value);
      setConfigError(null);
    } catch {
      setConfigError(t("settings.mcpPage.error.invalidJson", "JSON 格式错误"));
    }
  };

  const handleCancelEdit = () => {
    setSelectedServer(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      alert(t("settings.mcpPage.toast.nameRequired", "请输入服务器名称"));
      return;
    }

    let serverConfig: McpServerConfig;
    try {
      serverConfig = JSON.parse(editConfig) as McpServerConfig;
    } catch {
      setConfigError(
        t(
          "settings.mcpPage.error.invalidJsonCannotSave",
          "JSON 格式错误，无法保存",
        ),
      );
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        await addServer({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          server_config: serverConfig,
          enabled_lime: enabledLime,
          enabled_claude: enabledClaude,
          enabled_codex: enabledCodex,
          enabled_gemini: enabledGemini,
        });
        setIsCreating(false);
        setSelectedServer(null);
      } else if (selectedServer) {
        await updateServer({
          ...selectedServer,
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          server_config: serverConfig,
          enabled_lime: enabledLime,
          enabled_claude: enabledClaude,
          enabled_codex: enabledCodex,
          enabled_gemini: enabledGemini,
        });
      }
    } catch (error) {
      alert(
        t("settings.mcpPage.toast.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
          defaultValue: "保存失败：{{message}}",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) {
      return;
    }
    await deleteServer(deleteConfirm);
    if (selectedServer?.id === deleteConfirm) {
      setSelectedServer(null);
    }
    setDeleteConfirm(null);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  return {
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
  };
}
