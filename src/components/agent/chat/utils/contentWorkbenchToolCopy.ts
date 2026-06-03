import i18n from "i18next";
import { agentEnUSResource, agentZhCNResource } from "@/i18n/agentResources";
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

export function resolveContentWorkbenchToolCopy(
  key: string,
  defaultValue: string,
  values: Record<string, unknown> = {},
): string {
  const fullKey = `agentChat.contentWorkbenchTools.${key}`;
  const documentLocale =
    typeof document !== "undefined" ? document.documentElement.lang : "";
  const locale = normalizeLocale(
    i18n.isInitialized ? i18n.language : documentLocale || FALLBACK_LOCALE,
  );
  const fallbackResource =
    locale === "en-US" ? agentEnUSResource : agentZhCNResource;
  const translated = i18n.isInitialized
    ? (i18n.t(fullKey as never, {
        ...values,
        defaultValue,
        ns: "agent",
      } as never) as unknown)
    : fallbackResource[fullKey as keyof typeof fallbackResource];
  const text =
    typeof translated === "string" &&
    translated.trim() &&
    translated !== fullKey &&
    translated !== "undefined"
      ? translated
      : defaultValue;
  return interpolateCopy(text, values);
}
