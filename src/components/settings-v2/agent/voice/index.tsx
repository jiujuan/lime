import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  Loader2,
  Mic,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { ShortcutSettings } from "@/components/smart-input/ShortcutSettings";
import { MicrophoneTest } from "@/components/voice/MicrophoneTest";
import { InstructionEditor } from "@/components/voice/InstructionEditor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getConfig, saveConfig, type Config } from "@/lib/api/appConfig";
import {
  getAsrCredentials,
  getVoiceInputConfig,
  saveVoiceInputConfig,
  type AsrCredentialEntry,
  type VoiceInputConfig,
  type VoiceInstruction,
} from "@/lib/api/asrProvider";
import { validateShortcut } from "@/lib/api/experimentalFeatures";
import {
  getVoiceShortcutRuntimeStatus,
  type VoiceShortcutRuntimeStatus,
} from "@/lib/api/hotkeys";
import {
  deleteVoiceModel,
  downloadVoiceModel,
  getVoiceModelInstallState,
  listenVoiceModelDownloadProgress,
  listVoiceModelCatalog,
  setDefaultVoiceModel,
  testTranscribeVoiceModelFile,
  type VoiceModelCatalogEntry,
  type VoiceModelDownloadProgressEvent,
  type VoiceModelInstallState,
  type VoiceModelTestTranscribeResult,
} from "@/lib/api/voiceModels";
import {
  consumeVoiceModelSettingsFocusRequest,
  VOICE_MODEL_SETTINGS_SECTION_ID,
} from "@/lib/voiceModelSettingsNavigation";
import {
  buildPersistedMediaGenerationPreference,
  getTtsModelsForProvider,
  hasMediaGenerationPreferenceOverride,
  isTtsProvider,
  type MediaGenerationPreference,
} from "@/lib/mediaGeneration";
import { modelSupportsTaskFamily } from "@/lib/model/inferModelCapabilities";
import { cn } from "@/lib/utils";
import {
  findConfiguredProviderBySelection,
  useConfiguredProviders,
} from "@/hooks/useConfiguredProviders";
import { MediaPreferenceSection } from "../shared/MediaPreferenceSection";
import { SettingModelSelectorField } from "../shared/SettingModelSelectorField";

const DEFAULT_MEDIA_PREFERENCE: MediaGenerationPreference = {
  allowFallback: true,
};

type PillTone = "neutral" | "success" | "warning";
type VoiceModelAction = "download" | "delete" | "default" | "test";
type VoiceSettingsTranslate = TFunction<"settings", undefined>;

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function ensureValidVoiceInstructionSelection(
  config: VoiceInputConfig,
): VoiceInputConfig {
  if (config.instructions.length === 0) {
    return config;
  }

  const hasInstruction = (id?: string | null) =>
    Boolean(
      id && config.instructions.some((instruction) => instruction.id === id),
    );

  const fallbackDefaultInstructionId = hasInstruction("default")
    ? "default"
    : (config.instructions[0]?.id ?? config.processor.default_instruction_id);

  const nextDefaultInstructionId = hasInstruction(
    config.processor.default_instruction_id,
  )
    ? config.processor.default_instruction_id
    : fallbackDefaultInstructionId;

  const fallbackTranslateInstructionId = hasInstruction("translate_en")
    ? "translate_en"
    : nextDefaultInstructionId;

  const nextTranslateInstructionId = hasInstruction(
    config.translate_instruction_id,
  )
    ? config.translate_instruction_id
    : fallbackTranslateInstructionId;

  if (
    nextDefaultInstructionId === config.processor.default_instruction_id &&
    nextTranslateInstructionId === config.translate_instruction_id
  ) {
    return config;
  }

  return {
    ...config,
    processor: {
      ...config.processor,
      default_instruction_id: nextDefaultInstructionId,
    },
    translate_instruction_id: nextTranslateInstructionId,
  };
}

function StatusPill({
  tone,
  children,
}: {
  tone: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}

function SettingCard({
  title,
  description,
  icon: Icon,
  children,
  sectionId,
  tipAriaLabel,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  sectionId?: string;
  tipAriaLabel: string;
}) {
  return (
    <section
      id={sectionId}
      tabIndex={sectionId ? -1 : undefined}
      className={cn(
        "overflow-visible rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-950/5",
        sectionId && "scroll-mt-6 outline-none",
      )}
    >
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-sky-600" />
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          <WorkbenchInfoTip
            ariaLabel={tipAriaLabel}
            content={description}
            tone="slate"
          />
        </div>
      </div>
      <div className="divide-y divide-slate-200/80 border-t border-slate-200/80">
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-slate-800">{label}</Label>
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-[820px] space-y-4">
      <div className="h-[220px] animate-pulse rounded-[24px] border border-slate-200/80 bg-slate-50" />
      <div className="h-[260px] animate-pulse rounded-[24px] border border-slate-200/80 bg-white" />
      <div className="h-[200px] animate-pulse rounded-[24px] border border-slate-200/80 bg-white" />
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 MB";
  }

  const mb = value / 1024 / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(0)} MB`;
  }
  return `${(mb / 1024).toFixed(1)} GB`;
}

function getVoiceModelDisplayName(entry: VoiceModelCatalogEntry): string {
  return entry.name.replace(/\s+INT8$/i, "").trim() || entry.name;
}

function getVoiceModelInstallStatusText(
  t: VoiceSettingsTranslate,
  entry: VoiceModelCatalogEntry,
  state: VoiceModelInstallState | null,
  action: VoiceModelAction | null,
  progress?: VoiceModelDownloadProgressEvent | null,
): string {
  if (action === "download") {
    return (
      progress?.message ||
      t("settings.voice.model.status.prepareDownload", "准备下载模型")
    );
  }

  const modelSize = entry.size_bytes
    ? t("settings.voice.model.status.approxSize", {
        size: formatBytes(entry.size_bytes),
        defaultValue: "约 {{size}}",
      })
    : t("settings.voice.model.status.sizePending", "大小待目录返回");

  if (state?.installed) {
    return t("settings.voice.model.status.installed", {
      size: modelSize,
      defaultValue: "已安装（ONNX int8 量化，{{size}}）",
    });
  }

  return t("settings.voice.model.status.notInstalled", {
    size: modelSize,
    defaultValue: "未安装（ONNX int8 量化，{{size}}）",
  });
}

function getVoiceModelDownloadPercent(
  progress?: VoiceModelDownloadProgressEvent | null,
): number {
  if (!progress || !Number.isFinite(progress.overall_progress)) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(progress.overall_progress * 100)),
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function buildPrimaryShortcutStatus(
  t: VoiceSettingsTranslate,
  voiceConfig: VoiceInputConfig | null,
  runtimeStatus: VoiceShortcutRuntimeStatus | null,
): { text: string; tone: PillTone } {
  if (!voiceConfig) {
    return {
      text: t("settings.voice.shortcut.status.loading", "加载中"),
      tone: "neutral",
    };
  }

  if (!voiceConfig.enabled) {
    return {
      text: t(
        "settings.voice.shortcut.status.primaryDisabled",
        "未启用，不会注册全局快捷键",
      ),
      tone: "neutral",
    };
  }

  if (
    runtimeStatus?.shortcut_registered &&
    runtimeStatus.registered_shortcut === voiceConfig.shortcut
  ) {
    return {
      text: t(
        "settings.voice.shortcut.status.primaryRegistered",
        "运行时已注册",
      ),
      tone: "success",
    };
  }

  return {
    text: t(
      "settings.voice.shortcut.status.primaryPending",
      "配置已保存，但运行时尚未注册",
    ),
    tone: "warning",
  };
}

function buildTranslateShortcutStatus(
  t: VoiceSettingsTranslate,
  voiceConfig: VoiceInputConfig | null,
  runtimeStatus: VoiceShortcutRuntimeStatus | null,
): { text: string; tone: PillTone } {
  if (!voiceConfig) {
    return {
      text: t("settings.voice.shortcut.status.loading", "加载中"),
      tone: "neutral",
    };
  }

  if (!voiceConfig.translate_shortcut) {
    return {
      text: t(
        "settings.voice.shortcut.status.translateUnset",
        "未设置翻译模式快捷键",
      ),
      tone: "neutral",
    };
  }

  if (!voiceConfig.enabled) {
    return {
      text: t(
        "settings.voice.shortcut.status.translateNeedsVoice",
        "需先启用语音输入",
      ),
      tone: "warning",
    };
  }

  const hasInstruction = voiceConfig.instructions.some(
    (instruction) => instruction.id === voiceConfig.translate_instruction_id,
  );
  if (!hasInstruction) {
    return {
      text: t(
        "settings.voice.shortcut.status.translateNeedsInstruction",
        "请先选择翻译模式指令",
      ),
      tone: "warning",
    };
  }

  if (
    runtimeStatus?.translate_shortcut_registered &&
    runtimeStatus.registered_translate_shortcut ===
      voiceConfig.translate_shortcut
  ) {
    return {
      text: t(
        "settings.voice.shortcut.status.translateRegistered",
        "翻译模式快捷键已注册",
      ),
      tone: "success",
    };
  }

  return {
    text: t(
      "settings.voice.shortcut.status.translatePending",
      "翻译模式配置已保存，但运行时尚未注册",
    ),
    tone: "warning",
  };
}

function buildFnShortcutStatus(
  t: VoiceSettingsTranslate,
  runtimeStatus: VoiceShortcutRuntimeStatus | null,
): { text: string; tone: PillTone } {
  if (!runtimeStatus) {
    return {
      text: t("settings.voice.shortcut.status.fnLoading", "Fn 状态加载中"),
      tone: "neutral",
    };
  }

  if (runtimeStatus.fn_registered) {
    return {
      text: t(
        "settings.voice.shortcut.status.fnRegistered",
        "Fn 按住录音已注册",
      ),
      tone: "success",
    };
  }

  if (runtimeStatus.fn_supported) {
    return {
      text: t(
        "settings.voice.shortcut.status.fnPending",
        "Fn 支持可用，等待运行时注册",
      ),
      tone: "warning",
    };
  }

  return {
    text: t(
      "settings.voice.shortcut.status.fnUnsupported",
      "当前平台不支持 Fn，已使用快捷键回退",
    ),
    tone: "warning",
  };
}

export function VoiceSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceInputConfig | null>(null);
  const [voiceShortcutStatus, setVoiceShortcutStatus] =
    useState<VoiceShortcutRuntimeStatus | null>(null);
  const [asrCredentials, setAsrCredentials] = useState<AsrCredentialEntry[]>(
    [],
  );
  const [voiceModelCatalog, setVoiceModelCatalog] = useState<
    VoiceModelCatalogEntry[]
  >([]);
  const [voiceModelState, setVoiceModelState] =
    useState<VoiceModelInstallState | null>(null);
  const [voiceModelAction, setVoiceModelAction] =
    useState<VoiceModelAction | null>(null);
  const [voiceModelDownloadProgress, setVoiceModelDownloadProgress] =
    useState<VoiceModelDownloadProgressEvent | null>(null);
  const [voiceModelTestPath, setVoiceModelTestPath] = useState("");
  const [voiceModelTestResult, setVoiceModelTestResult] =
    useState<VoiceModelTestTranscribeResult | null>(null);
  const [voiceModelTestError, setVoiceModelTestError] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalVoicePreference, setGlobalVoicePreference] =
    useState<MediaGenerationPreference>(DEFAULT_MEDIA_PREFERENCE);
  const { providers, loading: providersLoading } = useConfiguredProviders();

  const loadVoiceSettings = useCallback(async () => {
    setLoading(true);

    try {
      const [
        nextConfig,
        nextVoiceConfig,
        nextVoiceShortcutStatus,
        nextAsr,
        nextVoiceModelCatalog,
      ] = await Promise.all([
        getConfig(),
        getVoiceInputConfig(),
        getVoiceShortcutRuntimeStatus().catch(() => null),
        getAsrCredentials().catch(() => []),
        listVoiceModelCatalog().catch(() => []),
      ]);
      const primaryVoiceModel = nextVoiceModelCatalog[0] ?? null;
      const nextVoiceModelState = primaryVoiceModel
        ? await getVoiceModelInstallState(primaryVoiceModel.id).catch(
            () => null,
          )
        : null;

      const normalizedVoiceConfig =
        ensureValidVoiceInstructionSelection(nextVoiceConfig);

      setConfig(nextConfig);
      setVoiceConfig(normalizedVoiceConfig);
      setVoiceShortcutStatus(nextVoiceShortcutStatus);
      setAsrCredentials(nextAsr);
      setVoiceModelCatalog(nextVoiceModelCatalog);
      setVoiceModelState(nextVoiceModelState);
      setGlobalVoicePreference(
        nextConfig.workspace_preferences?.media_defaults?.voice ??
          DEFAULT_MEDIA_PREFERENCE,
      );
    } catch (error) {
      console.error("加载语音设置失败:", error);
      setMessage({
        type: "error",
        text: t("settings.voice.message.loadFailed", "加载语音设置失败"),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadVoiceSettings();
  }, [loadVoiceSettings]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const focusRequest = consumeVoiceModelSettingsFocusRequest();
    if (!focusRequest) {
      return;
    }

    const focusVoiceModelSection = () => {
      const target = document.getElementById(VOICE_MODEL_SETTINGS_SECTION_ID);
      if (!target) {
        return false;
      }
      target.scrollIntoView?.({ block: "start", behavior: "smooth" });
      target.focus?.({ preventScroll: true });
      return true;
    };

    if (focusVoiceModelSection()) {
      return;
    }

    let attempts = 0;
    const retryFocusVoiceModelSection = () => {
      if (focusVoiceModelSection()) {
        return;
      }
      if (attempts < 5) {
        attempts += 1;
        window.setTimeout(retryFocusVoiceModelSection, 0);
      }
    };

    window.requestAnimationFrame(retryFocusVoiceModelSection);
  }, [loading]);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const persistVoiceConfig = useCallback(
    async (updater: (current: VoiceInputConfig) => VoiceInputConfig) => {
      if (!voiceConfig) {
        return;
      }

      try {
        const nextVoiceConfig = ensureValidVoiceInstructionSelection(
          updater(voiceConfig),
        );
        await saveVoiceInputConfig(nextVoiceConfig);
        setVoiceConfig(nextVoiceConfig);
        const nextRuntimeStatus = await getVoiceShortcutRuntimeStatus().catch(
          () => null,
        );
        setVoiceShortcutStatus(nextRuntimeStatus);
        if (nextVoiceConfig.enabled !== voiceConfig.enabled) {
          await loadVoiceSettings();
        }
        showMessage(
          "success",
          t("settings.voice.message.saved", "语音设置已保存"),
        );
      } catch (error) {
        console.error("保存语音设置失败:", error);
        showMessage(
          "error",
          t("settings.voice.message.saveFailed", "保存语音设置失败"),
        );
      }
    },
    [loadVoiceSettings, showMessage, t, voiceConfig],
  );

  const persistGlobalVoicePreference = useCallback(
    async (nextPreference: MediaGenerationPreference) => {
      if (!config) {
        return;
      }

      try {
        const persistedPreference =
          buildPersistedMediaGenerationPreference(nextPreference);
        const nextConfig: Config = {
          ...config,
          workspace_preferences: {
            ...config.workspace_preferences,
            media_defaults: {
              ...config.workspace_preferences?.media_defaults,
              voice: persistedPreference,
            },
          },
        };
        await saveConfig(nextConfig);
        setConfig(nextConfig);
        setGlobalVoicePreference(nextPreference);
        showMessage(
          "success",
          t(
            "settings.voice.message.mediaPreferenceSaved",
            "语音生成偏好已保存",
          ),
        );
      } catch (error) {
        console.error("保存语音生成偏好失败:", error);
        showMessage(
          "error",
          t(
            "settings.voice.message.mediaPreferenceSaveFailed",
            "保存语音生成偏好失败",
          ),
        );
      }
    },
    [config, showMessage, t],
  );

  const enabledAsrCredentials = useMemo(
    () => asrCredentials.filter((credential) => !credential.disabled),
    [asrCredentials],
  );
  const defaultAsrCredential = useMemo(
    () =>
      enabledAsrCredentials.find((credential) => credential.is_default) ?? null,
    [enabledAsrCredentials],
  );

  const voiceProviders = useMemo(
    () =>
      providers.filter((provider) =>
        isTtsProvider(provider.providerId ?? provider.key, provider.type),
      ),
    [providers],
  );

  const polishProvider = useMemo(
    () =>
      voiceConfig
        ? findConfiguredProviderBySelection(
            providers,
            voiceConfig.processor.polish_provider,
          )
        : null,
    [providers, voiceConfig],
  );

  const polishProviderWarning = voiceConfig?.processor.polish_provider
    ? !polishProvider
      ? t("settings.voice.processing.warning.providerUnavailable", {
          provider: voiceConfig.processor.polish_provider,
          defaultValue: "当前润色 Provider 不可用：{{provider}}",
        })
      : undefined
    : undefined;

  const polishModelWarning =
    voiceConfig?.processor.polish_model &&
    polishProvider?.customModels?.length &&
    !polishProvider.customModels.includes(voiceConfig.processor.polish_model)
      ? t("settings.voice.processing.warning.modelUnavailable", {
          provider: polishProvider.label,
          model: voiceConfig.processor.polish_model,
          defaultValue:
            "当前润色模型不在 {{provider}} 的已配置模型中：{{model}}",
        })
      : undefined;

  const primaryShortcutStatus = useMemo(
    () => buildPrimaryShortcutStatus(t, voiceConfig, voiceShortcutStatus),
    [t, voiceConfig, voiceShortcutStatus],
  );

  const translateShortcutStatus = useMemo(
    () => buildTranslateShortcutStatus(t, voiceConfig, voiceShortcutStatus),
    [t, voiceConfig, voiceShortcutStatus],
  );

  const fnShortcutStatus = useMemo(
    () => buildFnShortcutStatus(t, voiceShortcutStatus),
    [t, voiceShortcutStatus],
  );

  const primaryVoiceModel = voiceModelCatalog[0] ?? null;
  const isVoiceModelDefault = Boolean(
    voiceModelState?.default_credential_id ||
    defaultAsrCredential?.provider === "sensevoice_local",
  );
  const voiceModelDownloadReady = Boolean(
    primaryVoiceModel?.download_url?.trim() &&
    primaryVoiceModel?.vad_download_url?.trim(),
  );
  const voiceModelDownloadPercent = getVoiceModelDownloadPercent(
    voiceModelDownloadProgress,
  );

  const voiceInstructions = voiceConfig?.instructions ?? [];
  const defaultInstructionId =
    voiceConfig?.processor.default_instruction_id ?? "";
  const translateInstructionId = voiceConfig?.translate_instruction_id ?? "";

  const defaultInstructionLabel =
    voiceInstructions.find(
      (instruction) => instruction.id === defaultInstructionId,
    )?.name ??
    t(
      "settings.voice.processing.instruction.defaultPlaceholder",
      "请选择默认润色指令",
    );

  const translateInstructionLabel =
    voiceInstructions.find(
      (instruction) => instruction.id === translateInstructionId,
    )?.name ??
    t(
      "settings.voice.processing.instruction.translatePlaceholder",
      "请选择翻译模式指令",
    );

  const providerHint = providersLoading
    ? t(
        "settings.voice.media.providerHint.loading",
        "正在识别当前可用于配音 / TTS 的 Provider。",
      )
    : voiceProviders.length === 0
      ? t(
          "settings.voice.media.providerHint.empty",
          "当前没有可用语音生成 Provider；请先在设置 -> AI 服务商中配置支持 TTS 的服务。",
        )
      : t(
          "settings.voice.media.providerHint.ready",
          "这里只配置配音 / 语音生成任务的默认 Provider、模型与回退策略。",
        );

  const llmModelHint = providersLoading
    ? t(
        "settings.voice.processing.modelHint.loading",
        "正在加载可用的润色模型。",
      )
    : providers.length === 0
      ? t(
          "settings.voice.processing.modelHint.empty",
          "当前没有可用的对话模型；请先配置至少一个 LLM Provider。",
        )
      : t(
          "settings.voice.processing.modelHint.ready",
          "默认润色和翻译模式共用同一组模型选择；统一复用聊天页的模型选择器。",
        );

  const handleVoiceEnabledChange = (enabled: boolean) => {
    void persistVoiceConfig((current) => ({
      ...current,
      enabled,
    }));
  };

  const handleSoundEnabledChange = (soundEnabled: boolean) => {
    void persistVoiceConfig((current) => ({
      ...current,
      sound_enabled: soundEnabled,
    }));
  };

  const handleDeviceChange = (selectedDeviceId?: string) => {
    void persistVoiceConfig((current) => ({
      ...current,
      selected_device_id: selectedDeviceId,
    }));
  };

  const handlePrimaryShortcutChange = async (shortcut: string) => {
    const normalizedShortcut = shortcut.trim();
    if (!normalizedShortcut) {
      return;
    }

    await persistVoiceConfig((current) => ({
      ...current,
      shortcut: normalizedShortcut,
    }));
  };

  const handleTranslateShortcutChange = async (shortcut: string) => {
    await persistVoiceConfig((current) => ({
      ...current,
      translate_shortcut: normalizeOptionalText(shortcut),
    }));
  };

  const handlePolishEnabledChange = (enabled: boolean) => {
    void persistVoiceConfig((current) => ({
      ...current,
      processor: {
        ...current.processor,
        polish_enabled: enabled,
      },
    }));
  };

  const handlePolishProviderChange = (value: string) => {
    const nextProviderId = normalizeOptionalText(value);

    void persistVoiceConfig((current) => ({
      ...current,
      processor: {
        ...current.processor,
        polish_provider: nextProviderId,
        polish_model:
          nextProviderId === current.processor.polish_provider
            ? current.processor.polish_model
            : undefined,
      },
    }));
  };

  const handlePolishModelChange = (value: string) => {
    void persistVoiceConfig((current) => ({
      ...current,
      processor: {
        ...current.processor,
        polish_model: normalizeOptionalText(value),
      },
    }));
  };

  const handleDefaultInstructionChange = (instructionId: string) => {
    void persistVoiceConfig((current) => ({
      ...current,
      processor: {
        ...current.processor,
        default_instruction_id: instructionId,
      },
    }));
  };

  const handleTranslateInstructionChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const instructionId = event.target.value;
    void persistVoiceConfig((current) => ({
      ...current,
      translate_instruction_id: instructionId,
    }));
  };

  const handleInstructionSnapshot = (instructions: VoiceInstruction[]) => {
    setVoiceConfig((current) => {
      if (!current) {
        return current;
      }

      return ensureValidVoiceInstructionSelection({
        ...current,
        instructions,
      });
    });
  };

  const handleDefaultInstructionSelect = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const instructionId = event.target.value;
    handleDefaultInstructionChange(instructionId);
  };

  const handleMediaProviderChange = (value: string) => {
    const preferredProviderId = normalizeOptionalText(value);
    const nextProvider = findConfiguredProviderBySelection(
      voiceProviders,
      preferredProviderId,
    );
    const nextModels = nextProvider
      ? getTtsModelsForProvider(nextProvider.customModels)
      : [];
    const preferredModelId = preferredProviderId
      ? nextModels.includes(globalVoicePreference.preferredModelId || "")
        ? globalVoicePreference.preferredModelId
        : undefined
      : undefined;

    void persistGlobalVoicePreference({
      preferredProviderId,
      preferredModelId,
      allowFallback: globalVoicePreference.allowFallback ?? true,
    });
  };

  const handleMediaModelChange = (value: string) => {
    void persistGlobalVoicePreference({
      ...globalVoicePreference,
      preferredModelId: normalizeOptionalText(value),
      allowFallback: globalVoicePreference.allowFallback ?? true,
    });
  };

  const handleFallbackChange = (value: boolean) => {
    void persistGlobalVoicePreference({
      ...globalVoicePreference,
      allowFallback: value,
    });
  };

  const handleResetPreference = () => {
    void persistGlobalVoicePreference(DEFAULT_MEDIA_PREFERENCE);
  };

  const handleDownloadVoiceModel = async () => {
    if (!primaryVoiceModel) {
      return;
    }

    setVoiceModelAction("download");
    setVoiceModelDownloadProgress({
      model_id: primaryVoiceModel.id,
      phase: "preparing",
      downloaded_bytes: 0,
      total_bytes: primaryVoiceModel.size_bytes || null,
      overall_progress: 0,
      message: t("settings.voice.model.status.prepareDownload", "准备下载模型"),
    });
    let unlistenProgress: (() => void) | null = null;
    try {
      unlistenProgress = await listenVoiceModelDownloadProgress((event) => {
        if (event.model_id !== primaryVoiceModel.id) {
          return;
        }
        setVoiceModelDownloadProgress(event);
      }).catch((error) => {
        console.warn("监听语音模型下载进度失败:", error);
        return null;
      });
      const result = await downloadVoiceModel(primaryVoiceModel.id);
      setVoiceModelState(result.state);
      setVoiceModelTestError(null);
      setVoiceModelTestResult(null);
      showMessage(
        "success",
        t("settings.voice.model.message.downloaded", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "{{model}} 模型已下载",
        }),
      );
    } catch (error) {
      console.error("下载 SenseVoice Small 模型失败:", error);
      showMessage(
        "error",
        t("settings.voice.model.message.downloadFailed", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "下载 {{model}} 模型失败",
        }),
      );
    } finally {
      unlistenProgress?.();
      setVoiceModelAction(null);
      setVoiceModelDownloadProgress(null);
    }
  };

  const handleDeleteVoiceModel = async () => {
    if (!primaryVoiceModel) {
      return;
    }

    setVoiceModelAction("delete");
    try {
      const state = await deleteVoiceModel(primaryVoiceModel.id);
      setVoiceModelState(state);
      setVoiceModelTestError(null);
      setVoiceModelTestResult(null);
      await loadVoiceSettings();
      showMessage(
        "success",
        t("settings.voice.model.message.deleted", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "{{model}} 模型已删除",
        }),
      );
    } catch (error) {
      console.error("删除 SenseVoice Small 模型失败:", error);
      showMessage(
        "error",
        t("settings.voice.model.message.deleteFailed", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "删除 {{model}} 模型失败",
        }),
      );
    } finally {
      setVoiceModelAction(null);
    }
  };

  const handleSetDefaultVoiceModel = async () => {
    if (!primaryVoiceModel) {
      return;
    }

    setVoiceModelAction("default");
    try {
      await setDefaultVoiceModel(primaryVoiceModel.id);
      await loadVoiceSettings();
      showMessage(
        "success",
        t("settings.voice.model.message.defaultSet", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "{{model}} 已设为默认识别服务",
        }),
      );
    } catch (error) {
      console.error("设置 SenseVoice Small 默认模型失败:", error);
      showMessage(
        "error",
        t("settings.voice.model.message.defaultSetFailed", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "设置 {{model}} 默认模型失败",
        }),
      );
    } finally {
      setVoiceModelAction(null);
    }
  };

  const handleSelectVoiceModelTestFile = async () => {
    if (!voiceModelState?.installed || voiceModelAction !== null) {
      return;
    }

    try {
      const selected = await openDialog({
        title: t("settings.voice.model.test.dialogTitle", "选择 WAV 测试音频"),
        multiple: false,
        directory: false,
        filters: [
          {
            name: t("settings.voice.model.test.dialogFilter", "WAV 音频"),
            extensions: ["wav"],
          },
        ],
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) {
        return;
      }
      setVoiceModelTestPath(filePath);
      setVoiceModelTestError(null);
      setVoiceModelTestResult(null);
    } catch (error) {
      console.error("选择 SenseVoice Small 测试文件失败:", error);
      const errorMessage = getErrorMessage(
        error,
        t("settings.voice.model.test.selectFailed", "选择 WAV 文件失败"),
      );
      setVoiceModelTestError(errorMessage);
      showMessage(
        "error",
        t("settings.voice.model.test.selectFailed", "选择 WAV 文件失败"),
      );
    }
  };

  const handleTestVoiceModel = async () => {
    if (!primaryVoiceModel || !voiceModelState?.installed) {
      return;
    }

    const filePath = voiceModelTestPath.trim();
    if (!filePath) {
      setVoiceModelTestError(
        t(
          "settings.voice.model.test.pathRequired",
          "请先输入本机 WAV 文件路径",
        ),
      );
      return;
    }

    setVoiceModelAction("test");
    setVoiceModelTestError(null);
    setVoiceModelTestResult(null);
    try {
      const result = await testTranscribeVoiceModelFile(
        primaryVoiceModel.id,
        filePath,
      );
      setVoiceModelTestResult(result);
      showMessage(
        "success",
        t("settings.voice.model.test.completed", {
          model: getVoiceModelDisplayName(primaryVoiceModel),
          defaultValue: "{{model}} 测试转写完成",
        }),
      );
    } catch (error) {
      console.error("SenseVoice Small 测试转写失败:", error);
      const errorMessage = getErrorMessage(
        error,
        t("settings.voice.model.test.failed", "测试转写失败"),
      );
      setVoiceModelTestError(errorMessage);
      showMessage(
        "error",
        t("settings.voice.model.test.failed", "测试转写失败"),
      );
    } finally {
      setVoiceModelAction(null);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="max-w-[820px] space-y-4">
      {voiceConfig?.enabled && !defaultAsrCredential ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-800">
          {t(
            "settings.voice.warning.noDefaultAsr",
            "语音输入已启用，但当前没有默认的语音识别凭证；请先在设置的“语音服务”里设置默认 ASR 服务。",
          )}
        </div>
      ) : null}

      <SettingCard
        title={t("settings.voice.input.title", "语音输入")}
        description={t(
          "settings.voice.input.description",
          "管理语音输入的启用状态、全局快捷键、麦克风设备和录音音效。这里的改动会直接影响输入栏听写、悬浮语音窗和翻译模式。",
        )}
        icon={Mic}
        tipAriaLabel={t("settings.voice.card.tipAria", {
          title: t("settings.voice.input.title", "语音输入"),
          defaultValue: "{{title}}说明",
        })}
      >
        <SettingRow
          label={t("settings.voice.input.shortcut.label", "语音输入快捷键")}
          description={t(
            "settings.voice.input.shortcut.description",
            "开启后可在输入栏或全局快捷键中按住录音、松开停止；macOS 优先使用 Fn，其他平台使用主快捷键回退。",
          )}
        >
          <div
            className={cn(
              "space-y-3 rounded-[20px] border px-4 py-4 transition-colors",
              voiceConfig?.enabled
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-slate-200/80 bg-slate-50/80",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {t("settings.voice.input.holdToRecord", "按住录音，松开识别")}
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  {defaultAsrCredential
                    ? t("settings.voice.input.defaultAsrCredential", {
                        name:
                          defaultAsrCredential.name ||
                          defaultAsrCredential.provider,
                        defaultValue: "{{name}}（默认识别服务）",
                      })
                    : t(
                        "settings.voice.input.noDefaultAsrCredential",
                        "尚未配置默认语音识别凭证",
                      )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {voiceConfig?.enabled ? (
                  <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-white px-2.5 text-xs font-semibold text-emerald-800 shadow-sm">
                    🌐 Fn
                  </span>
                ) : null}
                <Switch
                  checked={voiceConfig?.enabled ?? false}
                  onCheckedChange={handleVoiceEnabledChange}
                  disabled={!voiceConfig}
                  aria-label={t(
                    "settings.voice.input.toggleAria",
                    "切换语音输入",
                  )}
                  className={
                    voiceConfig?.enabled ? "!bg-emerald-800" : "!bg-slate-300"
                  }
                />
              </div>
            </div>
            {voiceConfig?.enabled ? (
              <div className="rounded-[16px] border border-slate-200/80 bg-slate-100/90 px-3 py-2.5 text-xs leading-5 text-slate-600">
                <span className="mr-2 inline-flex h-6 items-center rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-700">
                  Fn
                </span>
                {voiceShortcutStatus?.fn_note ??
                  t(
                    "settings.voice.input.fnHoldDescription",
                    "按住 Fn 开始录音，松开后停止并识别。",
                  )}
                {voiceShortcutStatus?.fn_fallback_shortcut ? (
                  <>
                    {" "}
                    {t("settings.voice.input.fnFallbackShortcut", {
                      shortcut: voiceShortcutStatus.fn_fallback_shortcut,
                      defaultValue: "回退快捷键：{{shortcut}}",
                    })}
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                {t(
                  "settings.voice.input.disabledHint",
                  "语音输入未开启，不会注册 Fn 或全局快捷键。",
                )}
              </p>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.voice.input.primaryShortcut.label", "主快捷键")}
          description={t(
            "settings.voice.input.primaryShortcut.description",
            "用于唤起语音输入的全局快捷键。保存时会同步更新运行时注册状态。",
          )}
        >
          <div className="space-y-3">
            <ShortcutSettings
              currentShortcut={voiceConfig?.shortcut ?? ""}
              onShortcutChange={handlePrimaryShortcutChange}
              onValidate={validateShortcut}
              disabled={!voiceConfig}
            />
            <StatusPill tone={primaryShortcutStatus.tone}>
              {primaryShortcutStatus.text}
            </StatusPill>
          </div>
        </SettingRow>

        <SettingRow
          label={t(
            "settings.voice.input.translateShortcut.label",
            "翻译模式快捷键",
          )}
          description={t(
            "settings.voice.input.translateShortcut.description",
            "可选。设置后会直接以翻译模式启动语音输入，并使用下方指定的翻译指令。",
          )}
        >
          <div className="space-y-3">
            <ShortcutSettings
              currentShortcut={voiceConfig?.translate_shortcut ?? ""}
              onShortcutChange={handleTranslateShortcutChange}
              onValidate={validateShortcut}
              disabled={!voiceConfig}
              emptyLabel={t(
                "settings.voice.input.translateShortcut.empty",
                "未设置翻译模式快捷键",
              )}
              allowClear
            />
            <StatusPill tone={translateShortcutStatus.tone}>
              {translateShortcutStatus.text}
            </StatusPill>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.voice.input.fn.label", "Fn 按住录音")}
          description={t(
            "settings.voice.input.fn.description",
            "macOS 下通过原生 FlagsChanged 监听 Fn 按住/松开；权限不足或第三方键盘不可用时继续使用主快捷键回退。",
          )}
        >
          <div className="space-y-3 rounded-[18px] bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">
                Fn
              </span>
              <StatusPill tone={fnShortcutStatus.tone}>
                {fnShortcutStatus.text}
              </StatusPill>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {voiceShortcutStatus?.fn_note ??
                t(
                  "settings.voice.input.fn.statusLoading",
                  "正在读取 Fn 快捷键运行时状态。",
                )}
              {voiceShortcutStatus?.fn_fallback_shortcut ? (
                <>
                  {" "}
                  {t("settings.voice.input.fnFallbackShortcut", {
                    shortcut: voiceShortcutStatus.fn_fallback_shortcut,
                    defaultValue: "回退快捷键：{{shortcut}}",
                  })}
                </>
              ) : null}
            </p>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.voice.input.microphone.label", "麦克风设备")}
          description={t(
            "settings.voice.input.microphone.description",
            "录音时优先使用这里选定的设备；如果留空则回退到系统默认输入设备。",
          )}
        >
          <MicrophoneTest
            selectedDeviceId={voiceConfig?.selected_device_id}
            onDeviceChange={handleDeviceChange}
            disabled={!voiceConfig}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.voice.input.sound.label", "交互音效")}
          description={t(
            "settings.voice.input.sound.description",
            "控制开始录音、结束录音等反馈音效；会同时影响输入栏和悬浮语音窗。",
          )}
        >
          <div className="flex items-center justify-end">
            <Switch
              checked={voiceConfig?.sound_enabled ?? true}
              onCheckedChange={handleSoundEnabledChange}
              disabled={!voiceConfig}
              aria-label={t(
                "settings.voice.input.sound.toggleAria",
                "切换交互音效",
              )}
            />
          </div>
        </SettingRow>
      </SettingCard>

      <SettingCard
        title={t("settings.voice.model.title", "语音模型")}
        description={t(
          "settings.voice.model.description",
          "管理本地 ASR 模型的按需下载、安装状态和默认识别服务；模型文件只写入用户数据目录，不进入应用安装包。",
        )}
        icon={HardDrive}
        sectionId={VOICE_MODEL_SETTINGS_SECTION_ID}
        tipAriaLabel={t("settings.voice.card.tipAria", {
          title: t("settings.voice.model.title", "语音模型"),
          defaultValue: "{{title}}说明",
        })}
      >
        <SettingRow
          label="SenseVoice Small"
          description={t(
            "settings.voice.model.senseVoice.description",
            "本地离线 ASR，按需下载。",
          )}
        >
          {primaryVoiceModel ? (
            <div className="space-y-4 rounded-[22px] bg-[#f7fbf7] px-4 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border",
                      voiceModelState?.installed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-500",
                    )}
                  >
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {getVoiceModelDisplayName(primaryVoiceModel)}
                      </p>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        {t("settings.voice.model.badge.local", "本地")}
                      </span>
                      {isVoiceModelDefault ? (
                        <StatusPill tone="success">
                          {t(
                            "settings.voice.model.badge.defaultAsr",
                            "默认识别服务",
                          )}
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      {primaryVoiceModel.description ||
                        t(
                          "settings.voice.model.senseVoice.fallbackDescription",
                          "本地离线 ASR，模型按需下载到用户数据目录。",
                        )}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-slate-500">
                      <span>
                        {getVoiceModelInstallStatusText(
                          t,
                          primaryVoiceModel,
                          voiceModelState,
                          voiceModelAction,
                          voiceModelDownloadProgress,
                        )}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{primaryVoiceModel.runtime}</span>
                      {primaryVoiceModel.version ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>{primaryVoiceModel.version}</span>
                        </>
                      ) : null}
                      {primaryVoiceModel.languages.length ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>{primaryVoiceModel.languages.join(" / ")}</span>
                        </>
                      ) : null}
                    </div>
                    {voiceModelAction === "download" ? (
                      <div className="space-y-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
                          <div
                            aria-label={t(
                              "settings.voice.model.progressAria",
                              "语音模型下载进度",
                            )}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={voiceModelDownloadPercent}
                            className="h-full rounded-full bg-emerald-700 transition-[width] duration-200"
                            role="progressbar"
                            style={{ width: `${voiceModelDownloadPercent}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] leading-4 text-slate-500">
                          <span>{voiceModelDownloadPercent}%</span>
                        </div>
                      </div>
                    ) : null}
                    <p className="break-all text-xs leading-5 text-slate-500">
                      {voiceModelState?.installed
                        ? voiceModelState.install_dir
                        : t(
                            "settings.voice.model.install.onDemand",
                            "按需下载，不内置。",
                          )}
                    </p>
                    {voiceModelState?.installed ? (
                      <p className="text-xs leading-5 text-slate-500">
                        {t("settings.voice.model.install.installedSize", {
                          size: formatBytes(voiceModelState.installed_bytes),
                          defaultValue: "已安装大小：{{size}}",
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  {voiceModelState?.installed ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleSetDefaultVoiceModel()}
                        disabled={
                          voiceModelAction !== null || isVoiceModelDefault
                        }
                      >
                        {t(
                          "settings.voice.model.action.setDefault",
                          "设为默认",
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteVoiceModel()}
                        disabled={voiceModelAction !== null}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        {t("settings.voice.model.action.delete", "删除")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleDownloadVoiceModel()}
                      disabled={
                        voiceModelAction !== null || !voiceModelDownloadReady
                      }
                      className="!h-10 !rounded-[10px] !border-cyan-500 !bg-gradient-to-r !from-sky-500 !to-emerald-500 !px-4 text-base font-semibold text-white shadow-md shadow-emerald-900/15 hover:!opacity-95 disabled:!border-slate-200 disabled:!bg-none disabled:!bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                    >
                      {voiceModelAction === "download" ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1 h-4 w-4" />
                      )}
                      {voiceModelAction === "download"
                        ? t("settings.voice.model.action.downloading", "下载中")
                        : t("settings.voice.model.action.download", "下载模型")}
                    </Button>
                  )}
                </div>
              </div>
              {!voiceModelDownloadReady && !voiceModelState?.installed ? (
                <p className="text-xs leading-5 text-amber-700">
                  {t(
                    "settings.voice.model.assetBaseMissing",
                    "下载地址未配置。请在 limecore 配置 server.voiceModelAssetBaseUrl 指向 CF R2 公开域名。",
                  )}
                </p>
              ) : null}

              <div className="space-y-3 border-t border-slate-200/80 pt-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-800">
                    {t("settings.voice.model.test.title", "测试转写")}
                  </p>
                  <p className="text-xs leading-5 text-slate-500">
                    {t(
                      "settings.voice.model.test.description",
                      "选择或输入本机 16-bit PCM WAV 文件路径，直接验证当前 SenseVoice Small 安装与本地推理链路；多声道音频仅使用第一声道。",
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleSelectVoiceModelTestFile()}
                    disabled={
                      !voiceModelState?.installed || voiceModelAction !== null
                    }
                  >
                    <FolderOpen className="mr-1 h-4 w-4" />
                    {t("settings.voice.model.test.selectWav", "选择 WAV")}
                  </Button>
                  <input
                    aria-label={t(
                      "settings.voice.model.test.pathAria",
                      "WAV 文件路径",
                    )}
                    className="h-10 min-w-0 flex-1 rounded-[14px] border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400"
                    value={voiceModelTestPath}
                    onChange={(event) =>
                      setVoiceModelTestPath(event.target.value)
                    }
                    placeholder={t(
                      "settings.voice.model.test.pathPlaceholder",
                      "选择或输入 /Users/me/audio.wav",
                    )}
                    disabled={
                      !voiceModelState?.installed || voiceModelAction !== null
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleTestVoiceModel()}
                    disabled={
                      !voiceModelState?.installed ||
                      voiceModelAction !== null ||
                      !voiceModelTestPath.trim()
                    }
                  >
                    {voiceModelAction === "test"
                      ? t("settings.voice.model.test.testing", "转写中")
                      : t("settings.voice.model.test.action", "测试转写")}
                  </Button>
                </div>
                {!voiceModelState?.installed ? (
                  <p className="text-xs leading-5 text-amber-700">
                    {t(
                      "settings.voice.model.test.needsInstall",
                      "请先下载并安装模型后再测试转写。",
                    )}
                  </p>
                ) : null}
                {voiceModelTestError ? (
                  <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                    {voiceModelTestError}
                  </div>
                ) : null}
                {voiceModelTestResult ? (
                  <div className="space-y-2 rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="success">
                        {t(
                          "settings.voice.model.test.completedBadge",
                          "转写完成",
                        )}
                      </StatusPill>
                      <span className="text-xs text-emerald-700">
                        {voiceModelTestResult.sample_rate} Hz ·{" "}
                        {t("settings.voice.model.test.durationSeconds", {
                          seconds:
                            voiceModelTestResult.duration_secs.toFixed(2),
                          defaultValue: "{{seconds}} 秒",
                        })}{" "}
                        · {voiceModelTestResult.language || "auto"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {voiceModelTestResult.text ||
                        t(
                          "settings.voice.model.test.emptyText",
                          "未识别到文本",
                        )}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
              {t(
                "settings.voice.model.emptyCatalog",
                "当前没有可用的本地语音模型清单。",
              )}
            </div>
          )}
        </SettingRow>
      </SettingCard>

      <SettingCard
        title={t("settings.voice.processing.title", "语音处理")}
        description={t(
          "settings.voice.processing.description",
          "统一管理默认润色、翻译模式和语音指令。润色与翻译共用同一组 LLM 模型选择，继续复用聊天页的模型选择器。",
        )}
        icon={Wand2}
        tipAriaLabel={t("settings.voice.card.tipAria", {
          title: t("settings.voice.processing.title", "语音处理"),
          defaultValue: "{{title}}说明",
        })}
      >
        <SettingRow
          label={t(
            "settings.voice.processing.polishEnabled.label",
            "默认启用 AI 润色",
          )}
          description={t(
            "settings.voice.processing.polishEnabled.description",
            "开启后，普通语音输入会自动按默认润色指令进行后处理；翻译模式不受这个开关影响。",
          )}
        >
          <div className="flex items-center justify-end">
            <Switch
              checked={voiceConfig?.processor.polish_enabled ?? true}
              onCheckedChange={handlePolishEnabledChange}
              disabled={!voiceConfig}
              aria-label={t(
                "settings.voice.processing.polishEnabled.toggleAria",
                "切换 AI 润色",
              )}
            />
          </div>
        </SettingRow>

        <SettingModelSelectorField
          label={t("settings.voice.processing.model.label", "润色与翻译模型")}
          description={llmModelHint}
          warningText={polishProviderWarning ?? polishModelWarning}
          providerType={voiceConfig?.processor.polish_provider ?? ""}
          setProviderType={handlePolishProviderChange}
          model={voiceConfig?.processor.polish_model ?? ""}
          setModel={handlePolishModelChange}
          providerFilter={() => true}
          modelFilter={(model) =>
            modelSupportsTaskFamily(model, "chat") ||
            modelSupportsTaskFamily(model, "reasoning")
          }
          emptyStateTitle={t(
            "settings.voice.processing.model.emptyTitle",
            "暂无可用润色模型",
          )}
          emptyStateDescription={llmModelHint}
          disabled={!voiceConfig}
        />

        <SettingRow
          label={t(
            "settings.voice.processing.defaultInstruction.label",
            "默认润色指令",
          )}
          description={t(
            "settings.voice.processing.defaultInstruction.description",
            "普通语音输入在开启 AI 润色时会使用这里指定的指令。",
          )}
        >
          <select
            aria-label={t(
              "settings.voice.processing.defaultInstruction.aria",
              "默认润色指令",
            )}
            className="h-11 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-400"
            value={defaultInstructionId}
            onChange={handleDefaultInstructionSelect}
            disabled={!voiceConfig || voiceInstructions.length === 0}
          >
            <option value="" disabled>
              {defaultInstructionLabel}
            </option>
            {voiceInstructions.map((instruction) => (
              <option key={instruction.id} value={instruction.id}>
                {instruction.name}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          label={t(
            "settings.voice.processing.translateInstruction.label",
            "翻译模式指令",
          )}
          description={t(
            "settings.voice.processing.translateInstruction.description",
            "翻译模式快捷键会执行这里选择的指令；建议指向“翻译为英文”或自定义翻译模板。",
          )}
        >
          <select
            aria-label={t(
              "settings.voice.processing.translateInstruction.aria",
              "翻译模式指令",
            )}
            className="h-11 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-400"
            value={translateInstructionId}
            onChange={handleTranslateInstructionChange}
            disabled={!voiceConfig || voiceInstructions.length === 0}
          >
            <option value="" disabled>
              {translateInstructionLabel}
            </option>
            {voiceInstructions.map((instruction) => (
              <option key={instruction.id} value={instruction.id}>
                {instruction.name}
              </option>
            ))}
          </select>
        </SettingRow>

        <div className="px-5 py-4">
          <InstructionEditor
            defaultInstructionId={defaultInstructionId}
            onDefaultChange={handleDefaultInstructionChange}
            onInstructionsChange={handleInstructionSnapshot}
            disabled={!voiceConfig}
          />
        </div>
      </SettingCard>

      <MediaPreferenceSection
        title={t("settings.voice.media.title", "语音服务模型")}
        description={t(
          "settings.voice.media.description",
          "这里只配置配音 / 语音生成任务的默认 Provider、模型与回退策略；语音输入本身的识别、快捷键和润色逻辑请在上方设置。",
        )}
        selectorLabel={t("settings.voice.media.selector.label", "默认模型")}
        selectorDescription={t(
          "settings.voice.media.selector.description",
          "统一使用聊天页同款模型选择器；未指定时沿用自动匹配策略。",
        )}
        providerType={globalVoicePreference.preferredProviderId ?? ""}
        setProviderType={handleMediaProviderChange}
        model={globalVoicePreference.preferredModelId ?? ""}
        setModel={handleMediaModelChange}
        providerFilter={(provider) =>
          isTtsProvider(provider.providerId ?? provider.key, provider.type)
        }
        modelFilter={(model, provider) =>
          getTtsModelsForProvider(provider.customModels).includes(model.id)
        }
        allowFallback={globalVoicePreference.allowFallback ?? true}
        onAllowFallbackChange={handleFallbackChange}
        fallbackTitle={t(
          "settings.voice.media.fallback.title",
          "Provider 不可用时自动回退",
        )}
        fallbackDescription={t(
          "settings.voice.media.fallback.description",
          "关闭后，若当前默认语音服务缺失、被禁用或无可用 Key，将直接提示错误。",
        )}
        emptyStateTitle={t(
          "settings.voice.media.emptyTitle",
          "暂无可用语音模型",
        )}
        emptyStateDescription={providerHint}
        disabled={!config}
        onReset={handleResetPreference}
        resetLabel={t("settings.voice.media.action.reset", "恢复默认")}
        resetDisabled={
          !hasMediaGenerationPreferenceOverride(globalVoicePreference)
        }
      />

      {message ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-[20px] border px-4 py-3",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700",
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
