import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  apiKeyProviderApi,
  type ProviderWithKeysDisplay,
} from "@/lib/api/apiKeyProvider";
import { getConfig, saveConfig, type Config } from "@/lib/api/appConfig";
import {
  canUseCompanionQuickActionProvider,
  getCompanionDefaultsFromConfig,
} from "@/lib/companion/preferences";
import {
  buildPersistedMediaGenerationPreference,
  hasMediaGenerationPreferenceOverride,
  type MediaGenerationPreference,
} from "@/lib/mediaGeneration";
import { subscribeProviderDataChanged } from "@/lib/providerDataEvents";
import { cn } from "@/lib/utils";
import { MediaPreferenceSection } from "../shared/MediaPreferenceSection";

const CARD_CLASS_NAME =
  "rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5";
const DEFAULT_MEDIA_PREFERENCE: MediaGenerationPreference = {
  allowFallback: true,
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function PreferenceMessage(props: {
  tone: "success" | "error";
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[18px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
        props.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      {props.tone === "success" ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
      )}
      <span>{props.message}</span>
    </div>
  );
}

function buildUpdatedCompanionDefaults(
  currentConfig: Config,
  nextPreference: MediaGenerationPreference,
) {
  const persistedPreference =
    buildPersistedMediaGenerationPreference(nextPreference);
  const nextCompanionDefaults = {
    general: persistedPreference,
  };

  if (!nextCompanionDefaults.general) {
    delete nextCompanionDefaults.general;
  }

  return {
    ...currentConfig,
    workspace_preferences: {
      ...currentConfig.workspace_preferences,
      companion_defaults: nextCompanionDefaults,
    },
  };
}

function findProviderById(
  providers: ProviderWithKeysDisplay[],
  providerId?: string,
): ProviderWithKeysDisplay | null {
  const normalizedProviderId = providerId?.trim().toLowerCase();
  if (!normalizedProviderId) {
    return null;
  }

  return (
    providers.find(
      (provider) => provider.id.trim().toLowerCase() === normalizedProviderId,
    ) ?? null
  );
}

function normalizeProviderSelection(value?: string | null): string {
  return value?.trim().toLowerCase() || "";
}

export function CompanionCapabilityPreferencesCard() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [providers, setProviders] = useState<ProviderWithKeysDisplay[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [generalPreference, setGeneralPreference] =
    useState<MediaGenerationPreference>(DEFAULT_MEDIA_PREFERENCE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const showMessage = (tone: "success" | "error", text: string) => {
      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
      setMessage({ tone, text });
      messageTimerRef.current = window.setTimeout(() => {
        setMessage(null);
        messageTimerRef.current = null;
      }, 3200);
    };

    const loadConfigState = async () => {
      setConfigLoading(true);
      try {
        const nextConfig = await getConfig();
        if (cancelled) {
          return;
        }
        const defaults = getCompanionDefaultsFromConfig(nextConfig);
        setConfig(nextConfig);
        setGeneralPreference(defaults.general ?? DEFAULT_MEDIA_PREFERENCE);
      } catch (error) {
        if (!cancelled) {
          showMessage(
            "error",
            t("settings.providers.companion.preference.message.loadFailed", {
              error: getErrorMessage(
                error,
                t(
                  "settings.providers.companion.preference.message.unknownError",
                ),
              ),
            }),
          );
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    };

    const loadProvidersState = async (forceRefresh = false) => {
      if (!cancelled) {
        setProvidersLoading(true);
      }
      try {
        const nextProviders = await apiKeyProviderApi.getProviders(
          forceRefresh ? { forceRefresh: true } : undefined,
        );
        if (!cancelled) {
          setProviders(nextProviders);
        }
      } catch (error) {
        if (!cancelled) {
          showMessage(
            "error",
            t(
              "settings.providers.companion.preference.message.providersFailed",
              {
                error: getErrorMessage(
                  error,
                  t(
                    "settings.providers.companion.preference.message.unknownError",
                  ),
                ),
              },
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setProvidersLoading(false);
        }
      }
    };

    void loadConfigState();
    void loadProvidersState();

    const unsubscribeProviderData = subscribeProviderDataChanged(() => {
      void loadProvidersState(true);
    });

    return () => {
      cancelled = true;
      unsubscribeProviderData();
    };
  }, [t]);

  const showMessage = (tone: "success" | "error", text: string) => {
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
    }
    setMessage({ tone, text });
    messageTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimerRef.current = null;
    }, 3200);
  };

  const savePreference = async (nextPreference: MediaGenerationPreference) => {
    if (!config) {
      return;
    }

    setSaving(true);
    try {
      const nextConfig = buildUpdatedCompanionDefaults(config, nextPreference);
      await saveConfig(nextConfig);
      setConfig(nextConfig);
      setGeneralPreference(nextPreference);
      showMessage(
        "success",
        t("settings.providers.companion.preference.message.saved"),
      );
    } catch (error) {
      showMessage(
        "error",
        t("settings.providers.companion.preference.message.saveFailed", {
          error: getErrorMessage(
            error,
            t("settings.providers.companion.preference.message.unknownError"),
          ),
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const generalProviders = useMemo(
    () =>
      providers.filter((provider) =>
        canUseCompanionQuickActionProvider(provider),
      ),
    [providers],
  );

  const selectedGeneralProvider = useMemo(
    () =>
      findProviderById(generalProviders, generalPreference.preferredProviderId),
    [generalPreference.preferredProviderId, generalProviders],
  );
  const generalProviderIds = useMemo(
    () =>
      new Set(
        generalProviders.map((provider) =>
          normalizeProviderSelection(provider.id),
        ),
      ),
    [generalProviders],
  );

  const generalProviderUnavailableLabel =
    generalPreference.preferredProviderId && !selectedGeneralProvider
      ? t("settings.providers.companion.preference.warning.unavailable", {
          provider: generalPreference.preferredProviderId,
        })
      : undefined;

  const handleGeneralProviderChange = (value: string) => {
    const preferredProviderId = value.trim() || undefined;
    const preferredModelId =
      preferredProviderId === generalPreference.preferredProviderId
        ? generalPreference.preferredModelId
        : undefined;

    void savePreference({
      preferredProviderId,
      preferredModelId,
      allowFallback: generalPreference.allowFallback ?? true,
    });
  };

  return (
    <article
      className={CARD_CLASS_NAME}
      data-testid="companion-capability-preferences-card"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
              <Bot className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">
                {t("settings.providers.companion.preference.title")}
              </h3>
              <p className="text-sm leading-6 text-slate-600">
                {t("settings.providers.companion.preference.description")}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[18px] border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-800">
            {t("settings.providers.companion.preference.currentChain.title")}
          </p>
          <p>
            {t(
              "settings.providers.companion.preference.currentChain.description",
            )}
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-5">
          <PreferenceMessage tone={message.tone} message={message.text} />
        </div>
      ) : null}

      <div className="mt-5">
        <MediaPreferenceSection
          title={t("settings.providers.companion.preference.general.title")}
          description={t(
            "settings.providers.companion.preference.general.description",
          )}
          selectorLabel={t(
            "settings.providers.companion.preference.general.selector.label",
          )}
          selectorDescription={t(
            "settings.providers.companion.preference.general.selector.description",
          )}
          selectionWarningText={generalProviderUnavailableLabel}
          activeTheme="general"
          providerType={generalPreference.preferredProviderId ?? ""}
          setProviderType={handleGeneralProviderChange}
          model={generalPreference.preferredModelId ?? ""}
          setModel={(value) =>
            void savePreference({
              ...generalPreference,
              preferredModelId: value.trim() || undefined,
              allowFallback: generalPreference.allowFallback ?? true,
            })
          }
          providerFilter={(provider) =>
            generalProviderIds.has(
              normalizeProviderSelection(provider.providerId),
            )
          }
          allowFallback={generalPreference.allowFallback ?? true}
          onAllowFallbackChange={(value) =>
            void savePreference({
              ...generalPreference,
              allowFallback: value,
            })
          }
          fallbackTitle={t(
            "settings.providers.companion.preference.general.fallback.title",
          )}
          fallbackDescription={t(
            "settings.providers.companion.preference.general.fallback.description",
          )}
          emptyStateTitle={t(
            "settings.providers.companion.preference.general.empty.title",
          )}
          emptyStateDescription={
            providersLoading
              ? t(
                  "settings.providers.companion.preference.general.empty.loading",
                )
              : generalProviders.length === 0
                ? t(
                    "settings.providers.companion.preference.general.empty.noProvider",
                  )
                : t(
                    "settings.providers.companion.preference.general.empty.ready",
                  )
          }
          disabled={!config || configLoading || saving}
          onReset={() => void savePreference(DEFAULT_MEDIA_PREFERENCE)}
          resetLabel={t(
            "settings.providers.companion.preference.general.action.reset",
          )}
          resetDisabled={
            !hasMediaGenerationPreferenceOverride(generalPreference)
          }
        />
      </div>

      <div className="mt-5 rounded-[18px] border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600">
        <div className="flex items-center gap-2 text-slate-800">
          <Volume2 className="h-4 w-4 text-slate-500" />
          <span className="font-medium">
            {t("settings.providers.companion.preference.fallbackNote.title")}
          </span>
        </div>
        <p className="mt-2">
          {t(
            "settings.providers.companion.preference.fallbackNote.description",
          )}
        </p>
      </div>
    </article>
  );
}
