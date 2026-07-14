import {
  normalizeThemeType,
  type ThemeType,
} from "@/lib/workspace/workbenchContract";
import type { ProjectType } from "@/lib/api/project";

export function normalizeInitialTheme(value?: string): ThemeType {
  return normalizeThemeType(value);
}

export function projectTypeToTheme(projectType: ProjectType): ThemeType {
  return normalizeThemeType(projectType);
}
