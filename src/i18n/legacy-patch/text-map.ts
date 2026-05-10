/**
 * Text Map Registry
 *
 * Centralized registry for all patch definitions.
 * Loads patch files and provides type-safe access to translations.
 */

import patchesZh from "./patches/zh.json";
import patchesEn from "./patches/en.json";

/**
 * Available languages
 */
export type Language = "zh" | "en";

/**
 * Text maps for all supported languages
 * Keys are Chinese text (original), values are translated text
 */
export const TEXT_MAPS = {
  zh: patchesZh,
  en: patchesEn,
} as const;

/**
 * Get the patch map for a specific language
 */
export function getTextMap(language: Language): Record<string, string> {
  return TEXT_MAPS[language] || TEXT_MAPS.zh;
}

/**
 * Validate if a language code is supported
 */
export function isValidLanguage(code: string): code is Language {
  return code === "zh" || code === "en";
}
