import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getConfig, saveConfig, type Config } from "@/lib/api/appConfig";
import {
  findConfiguredProviderBySelection,
  type ConfiguredProvider,
  useConfiguredProviders,
} from "@/hooks/useConfiguredProviders";
import { cn } from "@/lib/utils";
import {
  buildPersistedMediaGenerationPreference,
  hasMediaGenerationPreferenceOverride,
  type MediaGenerationPreference,
} from "@/lib/mediaGeneration";
import {
  getImageModelIdsForProvider,
  isImageProvider,
} from "@/lib/imageGeneration";
import { buildProviderModelsFromBackendModelIds } from "@/lib/model/providerModelsCatalog";
import { MediaPreferenceSection } from "../shared/MediaPreferenceSection";

const DEFAULT_MEDIA_PREFERENCE: MediaGenerationPreference = {
  allowFallback: true,
};

export function ImageGenSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [globalImagePreference, setGlobalImagePreference] =
    useState<MediaGenerationPreference>(DEFAULT_MEDIA_PREFERENCE);
  const { providers, loading: providersLoading } = useConfiguredProviders();

  useEffect(() => {
    void (async () => {
      try {
        const nextConfig = await getConfig();
        setConfig(nextConfig);
        setGlobalImagePreference(
          nextConfig.workspace_preferences?.media_defaults?.image ??
            DEFAULT_MEDIA_PREFERENCE,
        );
      } catch (error) {
        console.error("加载图片服务配置失败:", error);
      }
    })();
  }, []);

  const imageProviders = useMemo(
    () =>
      providers.filter(
        (provider) =>
          provider.authStatus === "login_required" ||
          isImageProvider(
            provider.providerId ?? provider.key,
            provider.type,
            provider.customModels,
          ),
      ),
    [providers],
  );

  const selectedProvider = useMemo(
    () =>
      findConfiguredProviderBySelection(
        imageProviders,
        globalImagePreference.preferredProviderId,
      ),
    [globalImagePreference.preferredProviderId, imageProviders],
  );

  const availableModelIds = useMemo(() => {
    if (!selectedProvider) {
      return [];
    }

    return getImageModelIdsForProvider(
      selectedProvider.providerId ?? selectedProvider.key,
      selectedProvider.type,
      selectedProvider.customModels,
      selectedProvider.apiHost,
    );
  }, [selectedProvider]);

  const providerUnavailableLabel =
    globalImagePreference.preferredProviderId && !selectedProvider
      ? t("settings.mediaGeneration.warning.unavailable", {
          id: globalImagePreference.preferredProviderId,
        })
      : undefined;

  const modelUnavailableLabel =
    globalImagePreference.preferredModelId &&
    !availableModelIds.includes(globalImagePreference.preferredModelId)
      ? t("settings.mediaGeneration.warning.unavailable", {
          id: globalImagePreference.preferredModelId,
        })
      : undefined;

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const savePreference = async (nextPreference: MediaGenerationPreference) => {
    if (!config) {
      return;
    }

    try {
      const persistedPreference =
        buildPersistedMediaGenerationPreference(nextPreference);
      const updatedConfig: Config = {
        ...config,
        workspace_preferences: {
          ...config.workspace_preferences,
          media_defaults: {
            ...config.workspace_preferences?.media_defaults,
            image: persistedPreference,
          },
        },
      };
      await saveConfig(updatedConfig);
      setConfig(updatedConfig);
      setGlobalImagePreference(nextPreference);
      showMessage("success", t("settings.mediaGeneration.message.saved"));
    } catch (error) {
      console.error("保存图片服务配置失败:", error);
      showMessage("error", t("settings.mediaGeneration.message.saveFailed"));
    }
  };

  const handleProviderChange = (value: string) => {
    const preferredProviderId = value.trim() || undefined;
    const nextProvider = findConfiguredProviderBySelection(
      imageProviders,
      preferredProviderId,
    );
    const nextModelIds = nextProvider
      ? getImageModelIdsForProvider(
          nextProvider.providerId ?? nextProvider.key,
          nextProvider.type,
          nextProvider.customModels,
          nextProvider.apiHost,
        )
      : [];
    const preferredModelId = preferredProviderId
      ? nextModelIds.includes(globalImagePreference.preferredModelId || "")
        ? globalImagePreference.preferredModelId
        : undefined
      : undefined;

    void savePreference({
      preferredProviderId,
      preferredModelId,
      allowFallback: globalImagePreference.allowFallback ?? true,
    });
  };

  const handleModelChange = (value: string) => {
    void savePreference({
      ...globalImagePreference,
      preferredModelId: value.trim() || undefined,
      allowFallback: globalImagePreference.allowFallback ?? true,
    });
  };

  const handleFallbackChange = (value: boolean) => {
    void savePreference({
      ...globalImagePreference,
      allowFallback: value,
    });
  };

  const handleResetPreference = () => {
    void savePreference(DEFAULT_MEDIA_PREFERENCE);
  };

  const getImageFallbackModels = useCallback(
    (provider: ConfiguredProvider) =>
      buildProviderModelsFromBackendModelIds(
        provider,
        [],
        getImageModelIdsForProvider(
          provider.providerId ?? provider.key,
          provider.type,
          provider.customModels,
          provider.apiHost,
        ),
      ),
    [],
  );

  const providerHint = providersLoading
    ? t("settings.mediaGeneration.image.hint.loading")
    : imageProviders.length === 0
      ? t("settings.mediaGeneration.image.hint.empty")
      : t("settings.mediaGeneration.image.hint.ready");

  return (
    <div className="max-w-[820px] space-y-4">
      <MediaPreferenceSection
        title={t("settings.mediaGeneration.image.title")}
        description={t("settings.mediaGeneration.image.description")}
        selectorLabel={t("settings.mediaGeneration.selector.label")}
        selectorDescription={t("settings.mediaGeneration.selector.description")}
        selectionWarningText={providerUnavailableLabel ?? modelUnavailableLabel}
        providerType={globalImagePreference.preferredProviderId ?? ""}
        setProviderType={handleProviderChange}
        model={globalImagePreference.preferredModelId ?? ""}
        setModel={handleModelChange}
        providerFilter={(provider) =>
          provider.authStatus === "login_required" ||
          isImageProvider(
            provider.providerId ?? provider.key,
            provider.type,
            provider.customModels,
          )
        }
        modelFilter={(model, provider) =>
          getImageModelIdsForProvider(
            provider.providerId ?? provider.key,
            provider.type,
            provider.customModels,
            provider.apiHost,
          ).includes(model.id)
        }
        getFallbackModels={getImageFallbackModels}
        allowFallback={globalImagePreference.allowFallback ?? true}
        onAllowFallbackChange={handleFallbackChange}
        fallbackTitle={t("settings.mediaGeneration.fallback.title")}
        fallbackDescription={t(
          "settings.mediaGeneration.image.fallback.description",
        )}
        emptyStateTitle={t("settings.mediaGeneration.image.empty.title")}
        emptyStateDescription={providerHint}
        disabled={!config}
        onReset={handleResetPreference}
        resetLabel={t("settings.mediaGeneration.action.reset")}
        resetDisabled={
          !hasMediaGenerationPreferenceOverride(globalImagePreference)
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
