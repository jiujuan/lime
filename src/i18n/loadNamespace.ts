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

const NAMESPACE_RESOURCE_PARTS = {
  agent: [
    "agent",
    "agentHome",
    "agentInputbar",
    "agentMessageList",
    "agentRuntime",
    "agentSkills",
    "agentTeamWorkspace",
  ],
} as const satisfies Partial<Record<LimeNamespace, readonly string[]>>;

function hasResourceParts(
  namespace: LimeNamespace,
): namespace is keyof typeof NAMESPACE_RESOURCE_PARTS {
  return namespace in NAMESPACE_RESOURCE_PARTS;
}

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

function resourcePartsForNamespace(
  namespace: LimeNamespace,
): readonly string[] {
  return hasResourceParts(namespace)
    ? NAMESPACE_RESOURCE_PARTS[namespace]
    : [namespace];
}

export function hasBundledNamespace(
  locale: string | null | undefined,
  namespace: LimeNamespace,
): boolean {
  const normalizedLocale = normalizeLocale(locale);
  return resourcePartsForNamespace(namespace).some(
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
    ...resourcePartsForNamespace(namespace).map((part) => {
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
