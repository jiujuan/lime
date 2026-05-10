import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { CORE_NAMESPACES, loadBundledI18nResources } from "./loadNamespace";
import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveDocumentDirection,
  type SupportedLocale,
} from "./locales";

const resources = loadBundledI18nResources();

function syncDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = resolveDocumentDirection(locale);
}

export function initLimeI18n(initialLocale?: string | null): typeof i18n {
  const locale = normalizeLocale(initialLocale);

  if (i18n.isInitialized) {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    syncDocumentLocale(locale);
    return i18n;
  }

  i18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: "common",
    fallbackNS: "common",
    ns: [...CORE_NAMESPACES],
    resources,
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      bindI18nStore: "added",
      useSuspense: false,
    },
  });

  syncDocumentLocale(locale);
  return i18n;
}

export async function changeLimeLocale(
  nextLocale?: string | null,
): Promise<SupportedLocale> {
  const locale = normalizeLocale(nextLocale);
  initLimeI18n(locale);
  await i18n.changeLanguage(locale);
  syncDocumentLocale(locale);
  return locale;
}

export function getLimeI18n() {
  return initLimeI18n();
}

export { resources as limeI18nResources };
