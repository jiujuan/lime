import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
  type SupportedLocale,
} from "./locales";

export const CORE_NAMESPACES = [
  "common",
  "navigation",
  "settings",
  "workspace",
  "agent",
  "errors",
] as const;

export type LimeNamespace = (typeof CORE_NAMESPACES)[number];
export type I18nNamespaceResource = Record<string, string>;
export type BundledI18nResources = Record<
  SupportedLocale,
  Record<LimeNamespace, I18nNamespaceResource>
>;

const bundledResourceModules = import.meta.glob<I18nNamespaceResource>(
  "./resources/*/*.json",
  {
    eager: true,
    import: "default",
  },
);

function resourceModuleKey(locale: SupportedLocale, namespace: LimeNamespace) {
  return `./resources/${locale}/${namespace}.json`;
}

export function hasBundledNamespace(
  locale: string | null | undefined,
  namespace: LimeNamespace,
): boolean {
  const normalizedLocale = normalizeLocale(locale);
  return resourceModuleKey(normalizedLocale, namespace) in bundledResourceModules;
}

export function loadNamespaceResource(
  locale: string | null | undefined,
  namespace: LimeNamespace,
): I18nNamespaceResource {
  const normalizedLocale = normalizeLocale(locale);
  const resource =
    bundledResourceModules[resourceModuleKey(normalizedLocale, namespace)];
  if (resource) {
    return resource;
  }

  return (
    bundledResourceModules[resourceModuleKey(FALLBACK_LOCALE, namespace)] ?? {}
  );
}

export function loadBundledI18nResources(
  namespaces: readonly LimeNamespace[] = CORE_NAMESPACES,
): BundledI18nResources {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      Object.fromEntries(
        namespaces.map((namespace) => [
          namespace,
          loadNamespaceResource(locale, namespace),
        ]),
      ),
    ]),
  ) as BundledI18nResources;
}
