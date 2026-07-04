import { useMemo } from "react";
import type { TFunction } from "i18next";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BUILT_IN_SOUL_STYLE_PACK,
  resolveSoulStyleProfile,
  type SoulStyleIntensity,
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
  intensity?: string | null;
  onChange: (
    profileId: SoulStyleProfileId,
    intensity: SoulStyleIntensity,
  ) => void;
}

export function StyleProfileSelector({
  value,
  intensity,
  onChange,
}: StyleProfileSelectorProps) {
  const { t } = useTranslation("settings");
  const resolved = useMemo(
    () =>
      resolveSoulStyleProfile({
        styleProfileId: value,
        styleIntensity: intensity,
      }),
    [intensity, value],
  );

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
        <p className="text-xs leading-5 text-slate-500">
          {settingsT(t, BUILT_IN_SOUL_STYLE_PACK.descriptionKey)}
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {BUILT_IN_SOUL_STYLE_PACK.profiles.map((profile) => {
          const selected = resolved.profile.id === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={selected}
              data-testid={`settings-memory-soul-style-profile-${profile.id}`}
              onClick={() => onChange(profile.id, profile.intensity)}
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
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {settingsT(t, "settings.memory.soul.styleProfile.seriousFallback")}
      </p>
    </div>
  );
}
