import { useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Power,
  PowerOff,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  SoulStylePackListEntry,
  SoulStylePackMutableStatus,
} from "@/lib/api/soulStylePacks";
import {
  DEFAULT_SOUL_STYLE_PROFILE_REGISTRY,
  normalizeSoulStyleProfileId,
  resolveSoulStyleProfile,
  type SoulStyleProfileRegistry,
  type SoulStyleProfileId,
} from "@/lib/soul/style-profiles";
import { cn } from "@/lib/utils";

function settingsT(
  t: TFunction<"settings">,
  key: string,
  values: Record<string, string | number | boolean> = {},
): string {
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string | number | boolean>,
  ) => string;
  return String(translate(key, values));
}

interface StyleProfileSelectorProps {
  value?: string | null;
  registry?: SoulStyleProfileRegistry;
  installedPacks?: readonly SoulStylePackListEntry[];
  loadingPacks?: boolean;
  packsError?: string | null;
  packBusyId?: string | null;
  onChange: (profileId: SoulStyleProfileId) => void;
  onInstallPack?: (draft: StylePackInstallDraft) => Promise<void> | void;
  onSetPackStatus?: (
    packId: string,
    status: SoulStylePackMutableStatus,
  ) => Promise<void> | void;
  onUninstallPack?: (packId: string) => Promise<void> | void;
}

export const STYLE_PACK_INSTALL_BUSY_ID = "__install__";

const REQUIRED_STYLE_PACK_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
] as const;

export interface StylePackInstallDraft {
  manifestSource: string;
  localeSources: Record<(typeof REQUIRED_STYLE_PACK_LOCALES)[number], string>;
  enableAfterInstall: boolean;
}

export function StyleProfileSelector({
  value,
  registry = DEFAULT_SOUL_STYLE_PROFILE_REGISTRY,
  installedPacks = [],
  loadingPacks = false,
  packsError = null,
  packBusyId = null,
  onChange,
  onInstallPack,
  onSetPackStatus,
  onUninstallPack,
}: StyleProfileSelectorProps) {
  const { t } = useTranslation("settings");
  const manifestInputRef = useRef<HTMLInputElement | null>(null);
  const localeInputRef = useRef<HTMLInputElement | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const resolved = useMemo(
    () =>
      resolveSoulStyleProfile(
        {
          styleProfileId: value,
        },
        registry,
      ),
    [registry, value],
  );
  const requestedProfileId = useMemo(
    () => normalizeSoulStyleProfileId(value),
    [value],
  );
  const missingSelectedProfile = Boolean(
    requestedProfileId && !registry.findProfile(requestedProfileId),
  );
  const selectedProfileId = requestedProfileId ?? resolved.profile.id;
  const profiles = registry.profiles;
  const installBusy = packBusyId === STYLE_PACK_INSTALL_BUSY_ID;

  const handleInstallClick = async () => {
    if (!onInstallPack) {
      return;
    }
    const manifestFile = manifestInputRef.current?.files?.[0];
    const localeFiles = Array.from(localeInputRef.current?.files ?? []);
    if (!manifestFile || localeFiles.length === 0) {
      setInstallError(
        settingsT(t, "settings.memory.soul.stylePacks.import.missingFiles"),
      );
      return;
    }

    const localeFileMap = new Map<string, File>();
    for (const file of localeFiles) {
      const locale = localeFromFileName(file.name);
      if (locale) {
        localeFileMap.set(locale, file);
      }
    }
    const missingLocales = REQUIRED_STYLE_PACK_LOCALES.filter(
      (locale) => !localeFileMap.has(locale),
    );
    if (missingLocales.length > 0) {
      setInstallError(
        settingsT(t, "settings.memory.soul.stylePacks.import.missingLocales", {
          locales: missingLocales.join(", "),
        }),
      );
      return;
    }

    try {
      const manifestSource = await manifestFile.text();
      const localeSources = Object.fromEntries(
        await Promise.all(
          REQUIRED_STYLE_PACK_LOCALES.map(async (locale) => [
            locale,
            await localeFileMap.get(locale)!.text(),
          ]),
        ),
      ) as StylePackInstallDraft["localeSources"];
      setInstallError(null);
      await onInstallPack({
        manifestSource,
        localeSources,
        enableAfterInstall: true,
      });
      if (manifestInputRef.current) {
        manifestInputRef.current.value = "";
      }
      if (localeInputRef.current) {
        localeInputRef.current.value = "";
      }
    } catch (error) {
      console.error("读取 Soul Style Pack 文件失败:", error);
      setInstallError(
        settingsT(t, "settings.memory.soul.stylePacks.import.readFailed"),
      );
    }
  };

  return (
    <div
      className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4"
      data-testid="settings-memory-soul-style-profile"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-950">
          {settingsT(t, "settings.memory.soul.styleProfile.title")}
        </p>
        <p className="text-xs leading-5 text-slate-500">
          {settingsT(t, "settings.memory.soul.styleProfile.description")}
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {profiles.map((profile) => {
          const selected = selectedProfileId === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={selected}
              data-testid={`settings-memory-soul-style-profile-${profile.id}`}
              onClick={() => onChange(profile.id)}
              className={cn(
                "flex min-h-[132px] flex-col rounded-md border bg-white p-3 text-left transition",
                selected
                  ? "border-emerald-300 ring-2 ring-emerald-100"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-950">
                  {settingsT(t, profile.nameKey)}
                </span>
                {selected ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : null}
              </span>
              <span className="mt-2 text-xs leading-5 text-slate-500">
                {settingsT(t, profile.descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>
      {missingSelectedProfile && requestedProfileId ? (
        <div
          className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
          data-testid="settings-memory-soul-style-profile-missing"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {settingsT(t, "settings.memory.soul.styleProfile.missing.title")}
            </p>
            <p className="mt-1">
              {settingsT(
                t,
                "settings.memory.soul.styleProfile.missing.detail",
                {
                  profileId: requestedProfileId,
                  fallbackProfileId: resolved.profile.id,
                },
              )}
            </p>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {settingsT(t, "settings.memory.soul.styleProfile.seriousFallback")}
      </p>

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">
                {settingsT(t, "settings.memory.soul.stylePacks.title")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {settingsT(t, "settings.memory.soul.stylePacks.description")}
              </p>
            </div>
          </div>
          {onInstallPack ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:min-w-[480px]">
              <input
                ref={manifestInputRef}
                type="file"
                accept="application/json,.json"
                aria-label={settingsT(
                  t,
                  "settings.memory.soul.stylePacks.import.manifestAria",
                )}
                className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700"
              />
              <input
                ref={localeInputRef}
                type="file"
                multiple
                accept="application/json,.json"
                aria-label={settingsT(
                  t,
                  "settings.memory.soul.stylePacks.import.localesAria",
                )}
                className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700"
              />
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installBusy}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {installBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {settingsT(t, "settings.memory.soul.stylePacks.import.action")}
              </button>
            </div>
          ) : null}
        </div>

        {installError ? (
          <p className="mt-2 text-xs leading-5 text-rose-700">{installError}</p>
        ) : null}
        {packsError ? (
          <p className="mt-2 text-xs leading-5 text-rose-700">{packsError}</p>
        ) : null}

        <div className="mt-3 space-y-2">
          {loadingPacks ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {settingsT(t, "settings.memory.soul.stylePacks.loading")}
            </div>
          ) : installedPacks.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
              {settingsT(t, "settings.memory.soul.stylePacks.empty")}
            </div>
          ) : (
            installedPacks.map((pack) => {
              const busy = packBusyId === pack.packId;
              const canEnable =
                pack.status === "disabled" || pack.status === "installed";
              const canDisable = pack.status === "enabled";
              const canUninstall =
                pack.status === "disabled" || pack.status === "installed";
              return (
                <div
                  key={pack.packId}
                  className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 md:flex-row md:items-center md:justify-between"
                  data-testid={`settings-memory-soul-style-pack-${pack.packId}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {pack.packId}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {settingsT(t, "settings.memory.soul.stylePacks.meta", {
                        source: settingsT(
                          t,
                          `settings.memory.soul.stylePacks.source.${pack.source}`,
                        ),
                        status: settingsT(
                          t,
                          `settings.memory.soul.stylePacks.status.${pack.status}`,
                        ),
                        count: pack.profileIds?.length ?? 0,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {canEnable ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSetPackStatus?.(pack.packId, "enabled")
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 disabled:opacity-60"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {settingsT(
                          t,
                          "settings.memory.soul.stylePacks.action.enable",
                        )}
                      </button>
                    ) : null}
                    {canDisable ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSetPackStatus?.(pack.packId, "disabled")
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition hover:border-amber-300 disabled:opacity-60"
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        {settingsT(
                          t,
                          "settings.memory.soul.stylePacks.action.disable",
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onUninstallPack?.(pack.packId)}
                      disabled={!canUninstall || busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {settingsT(
                        t,
                        "settings.memory.soul.stylePacks.action.uninstall",
                      )}
                    </button>
                  </div>
                  {!canUninstall && pack.status === "enabled" ? (
                    <p className="text-xs leading-5 text-slate-500 md:max-w-[180px]">
                      {settingsT(
                        t,
                        "settings.memory.soul.stylePacks.uninstallDisabledHint",
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function localeFromFileName(
  fileName: string,
): (typeof REQUIRED_STYLE_PACK_LOCALES)[number] | null {
  const normalized = fileName.trim();
  return (
    REQUIRED_STYLE_PACK_LOCALES.find(
      (locale) => normalized === `${locale}.json`,
    ) ?? null
  );
}
