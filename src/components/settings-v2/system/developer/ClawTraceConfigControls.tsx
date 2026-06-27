import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import type { ClawTraceConfig } from "@/lib/api/appConfig";

interface ClawTraceConfigControlsProps {
  onAlertEnabledChange: (enabled: boolean) => void;
  onEnabledChange: (enabled: boolean) => void;
  onLevelChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSampleRateChange: (event: ChangeEvent<HTMLInputElement>) => void;
  saving: boolean;
  traceConfig: NonNullable<ClawTraceConfig>;
}

export function ClawTraceConfigControls({
  onAlertEnabledChange,
  onEnabledChange,
  onLevelChange,
  onSampleRateChange,
  saving,
  traceConfig,
}: ClawTraceConfigControlsProps) {
  const { t } = useTranslation("settings");

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">
            {t("settings.developer.debugSwitch.clawTrace.title")}
          </p>
          <p className="text-sm leading-6 text-slate-500">
            {saving
              ? t("settings.developer.action.saving")
              : t("settings.developer.debugSwitch.clawTrace.description")}
          </p>
        </div>
        <Switch
          aria-label={t("settings.developer.debugSwitch.clawTrace.aria")}
          checked={traceConfig.enabled === true}
          disabled={saving}
          onCheckedChange={(value) => onEnabledChange(Boolean(value))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">
            {t("settings.developer.debugSwitch.clawTrace.level.label")}
          </span>
          <select
            aria-label={t(
              "settings.developer.debugSwitch.clawTrace.level.aria",
            )}
            className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            disabled={saving}
            value={traceConfig.level}
            onChange={onLevelChange}
          >
            <option value="summary">
              {t("settings.developer.debugSwitch.clawTrace.level.summary")}
            </option>
            <option value="debug">
              {t("settings.developer.debugSwitch.clawTrace.level.debug")}
            </option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">
            {t("settings.developer.debugSwitch.clawTrace.sampleRate.label")}
          </span>
          <input
            aria-label={t(
              "settings.developer.debugSwitch.clawTrace.sampleRate.aria",
            )}
            className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            disabled={saving}
            max={1}
            min={0}
            step={0.05}
            type="number"
            value={traceConfig.sample_rate}
            onChange={onSampleRateChange}
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">
              {t(
                "settings.developer.debugSwitch.clawTrace.alertChannel.title",
              )}
            </p>
            <p className="text-xs leading-5 text-slate-500">
              {t(
                "settings.developer.debugSwitch.clawTrace.alertChannel.description",
              )}
            </p>
          </div>
          <Switch
            aria-label={t(
              "settings.developer.debugSwitch.clawTrace.alertChannel.aria",
            )}
            checked={traceConfig.alert_enabled === true}
            disabled={saving}
            onCheckedChange={(value) => onAlertEnabledChange(Boolean(value))}
          />
        </div>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        {t("settings.developer.debugSwitch.clawTrace.sampleRate.description")}
      </p>
    </>
  );
}
