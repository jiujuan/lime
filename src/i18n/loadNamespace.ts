import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
  type SupportedLocale,
} from "./locales";
import {
  CORE_NAMESPACES,
  getBundledNamespaceResourceParts as getNamespaceResourceParts,
  type LimeNamespace,
} from "./bundledNamespaceParts";
export { CORE_NAMESPACES } from "./bundledNamespaceParts";

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

function resourceModuleKey(locale: SupportedLocale, namespace: string) {
  return `./resources/${locale}/${namespace}.json`;
}

export function getBundledNamespaceResourceParts(
  namespace: LimeNamespace,
): readonly string[] {
  return getNamespaceResourceParts(namespace);
}

export function hasBundledNamespace(
  locale: string | null | undefined,
  namespace: LimeNamespace,
): boolean {
  const normalizedLocale = normalizeLocale(locale);
  return getNamespaceResourceParts(namespace).some(
    (part) =>
      resourceModuleKey(normalizedLocale, part) in bundledResourceModules,
  );
}

export function loadNamespaceResource(
  locale: string | null | undefined,
  namespace: LimeNamespace,
): I18nNamespaceResource {
  const normalizedLocale = normalizeLocale(locale);
  return Object.assign(
    {},
    ...getNamespaceResourceParts(namespace).map((part) => {
      const resource =
        bundledResourceModules[resourceModuleKey(normalizedLocale, part)];
      if (resource) {
        return resource;
      }

      return (
        bundledResourceModules[resourceModuleKey(FALLBACK_LOCALE, part)] ?? {}
      );
    }),
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
