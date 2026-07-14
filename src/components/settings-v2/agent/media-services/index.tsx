import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getConfig,
  updateConfig,
  type Config,
  type ServiceModelPreferenceConfig,
  type ServiceModelsConfig,
} from "@/lib/api/appConfig";
import { modelSupportsTaskFamily } from "@/lib/model/inferModelCapabilities";
import type { ModelTaskFamily } from "@/lib/types/modelRegistry";
import {
  buildPersistedServiceModelPreference,
  normalizeServiceModelPreference,
} from "@/lib/serviceModels";
import { cn } from "@/lib/utils";
import { ImageGenSettings } from "../image-gen";
import { SettingModelSelectorField } from "../shared/SettingModelSelectorField";
import { VideoGenSettings } from "../video-gen";
import { VoiceSettings } from "../voice";

const DEFAULT_IMAGE_COUNT = 2;
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 6;

type ServiceModelKey =
  | "responsive_chat"
  | "topic"
  | "generation_topic"
  | "translation"
  | "history_compress"
  | "agent_meta"
  | "input_completion"
  | "prompt_rewrite"
  | "resource_prompt_rewrite";

interface ServiceModelSectionDefinition {
  key: ServiceModelKey;
  title: string;
  description: string;
  modelHint: string;
  taskFamilies: ModelTaskFamily[];
  supportsModelSelection?: boolean;
  allowDisable?: boolean;
  allowCustomPrompt?: boolean;
  emptyHint?: string;
}

type MediaServicesTranslate = TFunction<"settings", undefined>;

function createServiceModelSections(
  t: MediaServicesTranslate,
): ServiceModelSectionDefinition[] {
  return [
    {
      key: "responsive_chat",
      title: t("settings.mediaServices.sections.responsiveChat.title"),
      description: t(
        "settings.mediaServices.sections.responsiveChat.description",
      ),
      modelHint: t("settings.mediaServices.sections.responsiveChat.modelHint"),
      taskFamilies: ["chat"],
    },
    {
      key: "topic",
      title: t("settings.mediaServices.sections.topic.title"),
      description: t("settings.mediaServices.sections.topic.description"),
      modelHint: t("settings.mediaServices.sections.topic.modelHint"),
      taskFamilies: ["chat", "reasoning"],
    },
    {
      key: "generation_topic",
      title: t("settings.mediaServices.sections.generationTopic.title"),
      description: t(
        "settings.mediaServices.sections.generationTopic.description",
      ),
      modelHint: t("settings.mediaServices.sections.generationTopic.modelHint"),
      taskFamilies: ["vision_understanding", "chat", "reasoning"],
    },
    {
      key: "translation",
      title: t("settings.mediaServices.sections.translation.title"),
      description: t("settings.mediaServices.sections.translation.description"),
      modelHint: t("settings.mediaServices.sections.translation.modelHint"),
      taskFamilies: ["chat", "reasoning"],
    },
    {
      key: "history_compress",
      title: t("settings.mediaServices.sections.historyCompress.title"),
      description: t(
        "settings.mediaServices.sections.historyCompress.description",
      ),
      modelHint: t("settings.mediaServices.sections.historyCompress.modelHint"),
      taskFamilies: ["chat", "reasoning"],
    },
    {
      key: "agent_meta",
      title: t("settings.mediaServices.sections.agentMeta.title"),
      description: t("settings.mediaServices.sections.agentMeta.description"),
      modelHint: t("settings.mediaServices.sections.agentMeta.modelHint"),
      taskFamilies: ["chat", "reasoning"],
    },
    {
      key: "input_completion",
      title: t("settings.mediaServices.sections.inputCompletion.title"),
      description: t(
        "settings.mediaServices.sections.inputCompletion.description",
      ),
      modelHint: t("settings.mediaServices.sections.inputCompletion.modelHint"),
      taskFamilies: ["chat", "reasoning"],
      supportsModelSelection: false,
      allowDisable: true,
    },
    {
      key: "prompt_rewrite",
      title: t("settings.mediaServices.sections.promptRewrite.title"),
      description: t(
        "settings.mediaServices.sections.promptRewrite.description",
      ),
      modelHint: t("settings.mediaServices.sections.promptRewrite.modelHint"),
      taskFamilies: ["chat", "reasoning"],
      allowDisable: true,
    },
    {
      key: "resource_prompt_rewrite",
      title: t("settings.mediaServices.sections.resourcePromptRewrite.title"),
      description: t(
        "settings.mediaServices.sections.resourcePromptRewrite.description",
      ),
      modelHint: t(
        "settings.mediaServices.sections.resourcePromptRewrite.modelHint",
      ),
      taskFamilies: ["chat", "reasoning"],
      allowDisable: true,
      allowCustomPrompt: true,
    },
  ];
}

function getSectionPreference(
  config: Config | null,
  key: ServiceModelKey,
): ServiceModelPreferenceConfig {
  return normalizeServiceModelPreference(
    config?.workspace_preferences?.service_models?.[key],
  );
}

function SettingCard({
  title,
  description,
  children,
  headerExtra,
  tipAriaLabel,
  dimmed = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  headerExtra?: ReactNode;
  tipAriaLabel: string;
  dimmed?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-visible rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-950/5",
        dimmed && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          <WorkbenchInfoTip
            ariaLabel={tipAriaLabel}
            content={description}
            tone="slate"
          />
        </div>
        {headerExtra}
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
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-slate-800">{label}</Label>
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function MediaServicesSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [promptEditors, setPromptEditors] = useState<
    Partial<Record<ServiceModelKey, boolean>>
  >({});
  const [promptDrafts, setPromptDrafts] = useState<
    Partial<Record<ServiceModelKey, string>>
  >({});
  const [imageCountDraft, setImageCountDraft] = useState(DEFAULT_IMAGE_COUNT);
  const [imageCountInput, setImageCountInput] = useState(
    String(DEFAULT_IMAGE_COUNT),
  );
  const configRef = useRef<Config | null>(null);
  const saveRevisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextConfig = await getConfig();
        if (cancelled) {
          return;
        }

        setConfig(nextConfig);
        configRef.current = nextConfig;
        const nextImageCount =
          nextConfig.image_gen?.default_count ?? DEFAULT_IMAGE_COUNT;
        setImageCountDraft(nextImageCount);
        setImageCountInput(String(nextImageCount));
        setPromptDrafts({
          resource_prompt_rewrite:
            nextConfig.workspace_preferences?.service_models
              ?.resource_prompt_rewrite?.customPrompt ?? "",
        });
      } catch (error) {
        console.error("加载服务模型配置失败:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const persistConfig = async (updater: (current: Config) => Config) => {
    if (!configRef.current) {
      return;
    }

    const nextRevision = saveRevisionRef.current + 1;
    saveRevisionRef.current = nextRevision;

    try {
      const nextConfig = await updateConfig(updater);
      configRef.current = nextConfig;
      setConfig(nextConfig);
      if (saveRevisionRef.current === nextRevision) {
        showMessage("success", t("settings.mediaServices.message.saved"));
      }
    } catch (error) {
      console.error("保存服务模型配置失败:", error);
      if (saveRevisionRef.current === nextRevision) {
        showMessage("error", t("settings.mediaServices.message.saveFailed"));
      }
    }
  };

  const updateServiceModelPreference = (
    key: ServiceModelKey,
    buildNextPreference: (
      currentPreference: ServiceModelPreferenceConfig,
    ) => ServiceModelPreferenceConfig,
  ) => {
    void persistConfig((currentConfig) => {
      const nextServiceModels: ServiceModelsConfig = {
        ...(currentConfig.workspace_preferences?.service_models ?? {}),
      };
      const currentPreference = getSectionPreference(currentConfig, key);
      const nextPreference = buildNextPreference(currentPreference);
      const persistedPreference =
        buildPersistedServiceModelPreference(nextPreference);

      if (persistedPreference) {
        nextServiceModels[key] = persistedPreference;
      } else {
        delete nextServiceModels[key];
      }

      return {
        ...currentConfig,
        workspace_preferences: {
          ...currentConfig.workspace_preferences,
          service_models: nextServiceModels,
        },
      };
    });
  };

  const updateImageGenConfig = (
    patch: Partial<NonNullable<Config["image_gen"]>>,
  ) => {
    void persistConfig((currentConfig) => ({
      ...currentConfig,
      image_gen: {
        ...currentConfig.image_gen,
        ...patch,
      },
    }));
  };

  const clampImageCount = (value: number) =>
    Math.min(MAX_IMAGE_COUNT, Math.max(MIN_IMAGE_COUNT, Math.round(value)));

  const commitImageCount = (rawValue: string | number) => {
    const parsed =
      typeof rawValue === "number" ? rawValue : Number.parseInt(rawValue, 10);
    const nextCount = Number.isFinite(parsed)
      ? clampImageCount(parsed)
      : (config?.image_gen?.default_count ?? DEFAULT_IMAGE_COUNT);

    setImageCountDraft(nextCount);
    setImageCountInput(String(nextCount));
    updateImageGenConfig({ default_count: nextCount });
  };

  const serviceModelSections = useMemo(
    () => createServiceModelSections(t),
    [t],
  );

  const sectionViews = useMemo(() => {
    return serviceModelSections.map((section) => {
      const preference = getSectionPreference(config, section.key);

      return {
        section,
        preference,
        disabled: Boolean(section.allowDisable && preference.enabled === false),
      };
    });
  }, [config, serviceModelSections]);

  return (
    <div className="max-w-[860px] space-y-5 pb-8">
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
            {t("settings.mediaServices.title")}
          </h1>
          <WorkbenchInfoTip
            ariaLabel={t("settings.mediaServices.hero.tipAria")}
            content={t("settings.mediaServices.hero.tip")}
            tone="mint"
          />
        </div>
        <p className="text-sm text-slate-500">
          {t("settings.mediaServices.description")}
        </p>
      </section>

      {sectionViews.map(({ section, preference, disabled }) => {
        const promptVisible =
          Boolean(section.allowCustomPrompt) &&
          (Boolean(preference.customPrompt) || promptEditors[section.key]);
        const promptDraft =
          promptDrafts[section.key] ?? preference.customPrompt ?? "";

        return (
          <SettingCard
            key={section.key}
            title={section.title}
            description={section.description}
            tipAriaLabel={t("settings.mediaServices.card.tipAria", {
              title: section.title,
            })}
            dimmed={disabled}
            headerExtra={
              section.allowDisable ? (
                <Switch
                  checked={preference.enabled ?? true}
                  disabled={!config}
                  onCheckedChange={(enabled) => {
                    updateServiceModelPreference(section.key, (current) => ({
                      ...current,
                      enabled,
                    }));
                  }}
                />
              ) : undefined
            }
          >
            {section.supportsModelSelection === false ? (
              <SettingRow
                label={t("settings.mediaServices.common.currentBehavior.label")}
                description={section.modelHint}
              >
                <div className="rounded-[18px] border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {t(
                    "settings.mediaServices.common.inputCompletion.currentBehavior",
                  )}
                </div>
              </SettingRow>
            ) : (
              <SettingModelSelectorField
                label={t("settings.mediaServices.common.model.label")}
                description={section.modelHint}
                disabled={!config || disabled}
                emptyStateTitle={t(
                  "settings.mediaServices.common.model.emptyTitle",
                )}
                emptyStateDescription={
                  section.emptyHint ??
                  t("settings.mediaServices.common.model.emptyDescription")
                }
                providerType={preference.preferredProviderId ?? ""}
                setProviderType={(value) => {
                  const preferredProviderId = value.trim() || undefined;
                  updateServiceModelPreference(section.key, (current) => ({
                    ...current,
                    preferredProviderId,
                    preferredModelId:
                      preferredProviderId &&
                      preferredProviderId === current.preferredProviderId
                        ? current.preferredModelId
                        : undefined,
                  }));
                }}
                model={preference.preferredModelId ?? ""}
                setModel={(value) => {
                  updateServiceModelPreference(section.key, (current) => ({
                    ...current,
                    preferredModelId: value.trim() || undefined,
                  }));
                }}
                modelFilter={(model) =>
                  section.taskFamilies.some((taskFamily) =>
                    modelSupportsTaskFamily(model, taskFamily),
                  )
                }
              />
            )}

            {section.allowCustomPrompt ? (
              <SettingRow
                label={t("settings.mediaServices.customPrompt.label")}
                description={t(
                  "settings.mediaServices.customPrompt.description",
                )}
              >
                {promptVisible ? (
                  <Textarea
                    value={promptDraft}
                    disabled={!config || disabled}
                    placeholder={t(
                      "settings.mediaServices.customPrompt.placeholder",
                    )}
                    className="min-h-[120px] rounded-2xl border-slate-200 bg-white text-sm text-slate-900 shadow-none focus-visible:ring-slate-300"
                    onChange={(event) => {
                      setPromptDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [section.key]: event.target.value,
                      }));
                    }}
                    onBlur={(event) => {
                      const nextPrompt = event.target.value.trim() || undefined;
                      updateServiceModelPreference(section.key, (current) => ({
                        ...current,
                        customPrompt: nextPrompt,
                      }));
                      setPromptEditors((currentEditors) => ({
                        ...currentEditors,
                        [section.key]: Boolean(nextPrompt),
                      }));
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!config || disabled}
                    className="h-11 w-full rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setPromptEditors((currentEditors) => ({
                        ...currentEditors,
                        [section.key]: true,
                      }));
                      setPromptDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [section.key]: preference.customPrompt ?? "",
                      }));
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("settings.mediaServices.customPrompt.add")}
                  </Button>
                )}
              </SettingRow>
            ) : null}
          </SettingCard>
        );
      })}

      <SettingCard
        title={t("settings.mediaServices.imageSettings.title")}
        description={t("settings.mediaServices.imageSettings.description")}
        tipAriaLabel={t("settings.mediaServices.card.tipAria", {
          title: t("settings.mediaServices.imageSettings.title"),
        })}
      >
        <SettingRow
          label={t("settings.mediaServices.imageSettings.count.label")}
          description={t(
            "settings.mediaServices.imageSettings.count.description",
          )}
        >
          <div className="flex items-center gap-4">
            <Slider
              value={[imageCountDraft]}
              min={MIN_IMAGE_COUNT}
              max={MAX_IMAGE_COUNT}
              step={1}
              disabled={!config}
              className="flex-1"
              onValueChange={(values) => {
                const nextCount = values[0] ?? DEFAULT_IMAGE_COUNT;
                setImageCountDraft(nextCount);
                setImageCountInput(String(nextCount));
              }}
              onValueCommit={(values) => {
                commitImageCount(values[0] ?? DEFAULT_IMAGE_COUNT);
              }}
            />
            <Input
              type="number"
              min={MIN_IMAGE_COUNT}
              max={MAX_IMAGE_COUNT}
              inputMode="numeric"
              value={imageCountInput}
              disabled={!config}
              className="h-11 w-20 rounded-2xl border-slate-200 bg-white text-center text-slate-900 shadow-none focus-visible:ring-slate-300"
              onChange={(event) => {
                const rawValue = event.target.value;
                setImageCountInput(rawValue);

                if (!rawValue.trim()) {
                  return;
                }

                const parsed = Number.parseInt(rawValue, 10);
                if (Number.isFinite(parsed)) {
                  setImageCountDraft(clampImageCount(parsed));
                }
              }}
              onBlur={(event) => {
                commitImageCount(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </SettingRow>
      </SettingCard>

      <ImageGenSettings />
      <VideoGenSettings />
      <VoiceSettings />

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
