import { updateConfig, type Config } from "@/lib/api/appConfig";
import {
  buildPersistedMediaGenerationPreference,
  type MediaGenerationPreference,
} from "@/lib/mediaGeneration";

export type MediaPreferenceSlot = "image" | "video" | "voice";
export type MediaPreferenceUpdater = (
  current: MediaGenerationPreference,
) => MediaGenerationPreference;

export interface MediaPreferenceUpdateResult {
  config: Config;
  preference: MediaGenerationPreference;
}

export async function updateMediaPreference(
  slot: MediaPreferenceSlot,
  updater: MediaPreferenceUpdater,
): Promise<MediaPreferenceUpdateResult> {
  let nextPreference: MediaGenerationPreference | undefined;
  const config = await updateConfig((currentConfig) => {
    const currentPreference =
      currentConfig.workspace_preferences?.media_defaults?.[slot] ?? {};
    nextPreference = updater(currentPreference);
    const persistedPreference =
      buildPersistedMediaGenerationPreference(nextPreference);

    return {
      ...currentConfig,
      workspace_preferences: {
        ...currentConfig.workspace_preferences,
        media_defaults: {
          ...currentConfig.workspace_preferences?.media_defaults,
          [slot]: persistedPreference,
        },
      },
    };
  });

  if (!nextPreference) {
    throw new Error(`媒体服务偏好更新未执行: ${slot}`);
  }
  return { config, preference: nextPreference };
}
