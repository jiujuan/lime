import i18n from "i18next";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import { FALLBACK_LOCALE, normalizeLocale } from "@/i18n/locales";

function interpolateCopy(
  text: string,
  values: Record<string, unknown>,
): string {
  return Object.entries(values).reduce(
    (nextText, [name, value]) =>
      nextText.split(`{{${name}}}`).join(String(value ?? "")),
    text,
  );
}

function resolveCurrentLocale(): string {
  const documentLocale =
    typeof document !== "undefined" ? document.documentElement.lang : "";
  return normalizeLocale(
    documentLocale || (i18n.isInitialized ? i18n.language : "") || FALLBACK_LOCALE,
  );
}

function normalizeTranslatedCopy(value: unknown, fullKey: string): string | null {
  if (
    typeof value === "string" &&
    value.trim() &&
    value !== fullKey &&
    value !== "undefined"
  ) {
    return value;
  }

  return null;
}

export function resolveAgentChatCopy(
  key: string,
  defaultValue: string,
  values: Record<string, unknown> = {},
): string {
  const fullKey = `agentChat.${key}`;
  const locale = resolveCurrentLocale();
  const fallbackResource = loadNamespaceResource(locale, "agent");
  const translated = i18n.isInitialized
    ? (i18n.t(fullKey as never, {
        ...values,
        defaultValue,
        ns: "agent",
      } as never) as unknown)
    : fallbackResource[fullKey as keyof typeof fallbackResource];
  const text = normalizeTranslatedCopy(translated, fullKey) ?? defaultValue;
  return interpolateCopy(text, values);
}

export function resolveRequiredAgentChatCopy(
  key: string,
  values: Record<string, unknown> = {},
): string {
  const fullKey = `agentChat.${key}`;
  const locale = resolveCurrentLocale();
  const localeResource = loadNamespaceResource(locale, "agent");
  const sourceResource =
    locale === FALLBACK_LOCALE
      ? localeResource
      : loadNamespaceResource(FALLBACK_LOCALE, "agent");
  const resourceFallback =
    localeResource[fullKey] ?? sourceResource[fullKey] ?? fullKey;
  const translated = i18n.isInitialized
    ? (i18n.t(fullKey as never, {
        ...values,
        defaultValue: resourceFallback,
        ns: "agent",
      } as never) as unknown)
    : resourceFallback;
  const text =
    normalizeTranslatedCopy(translated, fullKey) ??
    normalizeTranslatedCopy(resourceFallback, fullKey) ??
    fullKey;
  return interpolateCopy(text, values);
}
