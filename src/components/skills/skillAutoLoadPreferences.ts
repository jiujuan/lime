import type { Skill } from "@/lib/api/skills";

const SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY =
  "lime.skills.autoLoadPreferences.v1";

export type SkillAutoLoadPreferences = Record<string, boolean>;

export function getSkillAutoLoadPreferenceKey(
  skill: Pick<Skill, "directory" | "key">,
) {
  return skill.directory || skill.key;
}

export function readSkillAutoLoadPreferences(): SkillAutoLoadPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY,
    );
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<SkillAutoLoadPreferences>(
      (preferences, [key, value]) => {
        if (typeof key === "string" && typeof value === "boolean") {
          preferences[key] = value;
        }
        return preferences;
      },
      {},
    );
  } catch {
    return {};
  }
}

export function writeSkillAutoLoadPreferences(
  preferences: SkillAutoLoadPreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SKILL_AUTO_LOAD_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // 偏好保存失败不应阻断用户继续使用技能。
  }
}

export function isSkillAutoLoadEnabled(
  skill: Pick<Skill, "directory" | "key">,
  preferences: SkillAutoLoadPreferences,
): boolean {
  return preferences[getSkillAutoLoadPreferenceKey(skill)] ?? true;
}
