export const SOURCE_LOCALE = "zh-CN";
export const FALLBACK_LOCALE = SOURCE_LOCALE;

export const SUPPORTED_LOCALES = [
  "zh-CN",
  "en-US",
  "zh-TW",
  "ja-JP",
  "ko-KR",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = "auto" | SupportedLocale;
export type DocumentDirection = "ltr" | "rtl";
export type LegacyPatchLanguage = "zh" | "en";

export interface UiLocaleOption {
  id: LocalePreference;
  label: string;
  hintKey: string;
  fallbackHint: string;
}

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export const UI_LOCALE_OPTIONS: UiLocaleOption[] = [
  {
    id: "auto",
    label: "跟随系统",
    hintKey: "settings.language.auto.hint",
    fallbackHint: "跟随系统语言，无法识别时使用简体中文。",
  },
  {
    id: "zh-CN",
    label: "简体中文",
    hintKey: "settings.language.zh-CN.hint",
    fallbackHint: "适合主要中文工作流。",
  },
  {
    id: "en-US",
    label: "English",
    hintKey: "settings.language.en-US.hint",
    fallbackHint: "适合英文界面与术语环境。",
  },
  {
    id: "zh-TW",
    label: "繁體中文",
    hintKey: "settings.language.zh-TW.hint",
    fallbackHint: "适合繁体中文阅读环境。",
  },
  {
    id: "ja-JP",
    label: "日本語",
    hintKey: "settings.language.ja-JP.hint",
    fallbackHint: "适合日文界面和日本市场任务。",
  },
  {
    id: "ko-KR",
    label: "한국어",
    hintKey: "settings.language.ko-KR.hint",
    fallbackHint: "适合韩文界面和韩国市场任务。",
  },
];

function normalizeLocaleCode(value: string): string {
  return value.trim().replace(/_/g, "-");
}

function getBrowserLocale(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator.languages?.[0] || navigator.language || undefined;
}

export function normalizeLocale(input?: string | null): SupportedLocale {
  const raw = normalizeLocaleCode(input || "");

  if (!raw || raw.toLowerCase() === "auto") {
    return normalizeLocale(getBrowserLocale() || FALLBACK_LOCALE);
  }

  if (SUPPORTED_LOCALE_SET.has(raw)) {
    return raw as SupportedLocale;
  }

  const lower = raw.toLowerCase();

  if (
    lower === "zh" ||
    lower === "cn" ||
    lower === "zh-hans" ||
    lower.startsWith("zh-hans-") ||
    lower.startsWith("zh-cn")
  ) {
    return "zh-CN";
  }

  if (
    lower === "zh-hant" ||
    lower.startsWith("zh-hant-") ||
    lower.startsWith("zh-tw") ||
    lower.startsWith("zh-hk") ||
    lower.startsWith("zh-mo")
  ) {
    return "zh-TW";
  }

  if (lower === "en" || lower.startsWith("en-")) {
    return "en-US";
  }

  if (lower === "ja" || lower.startsWith("ja-")) {
    return "ja-JP";
  }

  if (lower === "ko" || lower.startsWith("ko-")) {
    return "ko-KR";
  }

  return FALLBACK_LOCALE;
}

export function normalizeLocalePreference(
  input?: string | null,
): LocalePreference {
  const raw = normalizeLocaleCode(input || "");
  if (!raw || raw.toLowerCase() === "auto") {
    return "auto";
  }

  return normalizeLocale(raw);
}

export function toLegacyPatchLanguage(
  preference?: string | null,
): LegacyPatchLanguage {
  return normalizeLocale(preference).startsWith("en") ? "en" : "zh";
}

export function resolveDocumentDirection(
  _locale: SupportedLocale,
): DocumentDirection {
  return "ltr";
}

export function resolveLocaleOptionLabel(
  preference?: string | null,
): string {
  const normalized = normalizeLocalePreference(preference);
  return (
    UI_LOCALE_OPTIONS.find((option) => option.id === normalized)?.label ||
    "简体中文"
  );
}
