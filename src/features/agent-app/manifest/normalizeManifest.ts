import type {
  AppEntry,
  AppManifest,
  NormalizedAppEntry,
  NormalizedAppManifest,
  NormalizedRequires,
  RuntimeTarget,
} from "../types";

function slugifyAppId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "agent-app";
}

function normalizeManifestVersion(version: string): "0.2" | "0.3" {
  if (version.startsWith("0.3")) {
    return "0.3";
  }
  if (version.startsWith("0.2")) {
    return "0.2";
  }
  throw new Error(`Unsupported Agent App manifest version: ${version}`);
}

function normalizeCapabilities(
  capabilities: NormalizedRequires["capabilities"] | string[] | undefined,
): Record<string, string> {
  if (!capabilities) {
    return {};
  }

  if (Array.isArray(capabilities)) {
    return Object.fromEntries(capabilities.map((capability) => [capability, "*"]));
  }

  return Object.fromEntries(
    Object.entries(capabilities).filter(([capability]) => capability.trim().length > 0),
  );
}

function normalizeEntry(entry: AppEntry): NormalizedAppEntry {
  const requiredCapabilities = Array.from(
    new Set([...(entry.requiredCapabilities ?? []), ...(entry.capabilities ?? [])]),
  );

  return {
    key: entry.key,
    kind: entry.kind,
    title: entry.title ?? entry.key,
    description: entry.description,
    route: entry.route,
    workflow: entry.workflow,
    persona: entry.persona,
    requiredCapabilities,
    permissions: entry.permissions ?? [],
    enabledByDefault: entry.enabledByDefault ?? true,
  };
}

export function normalizeManifest(manifest: AppManifest): NormalizedAppManifest {
  const appId = slugifyAppId(manifest.name);
  const requiresCapabilities = normalizeCapabilities(manifest.requires?.capabilities);
  const topLevelCapabilities = Object.fromEntries(
    Object.entries(normalizeCapabilities(manifest.capabilities)).filter(([capability]) =>
      capability.startsWith("lime."),
    ),
  );
  const storageRetention =
    manifest.storage?.retention ?? manifest.storage?.uninstallPolicy ?? "ask";

  return {
    manifestVersion: normalizeManifestVersion(manifest.manifestVersion),
    appId,
    displayName: manifest.displayName ?? manifest.title ?? manifest.name,
    version: manifest.version,
    status: manifest.status ?? "draft",
    appType: manifest.appType ?? "domain-app",
    description: manifest.description ?? "",
    runtimeTargets: manifest.runtimeTargets?.length
      ? manifest.runtimeTargets
      : (["local"] satisfies RuntimeTarget[]),
    requires: {
      appRuntime: manifest.requires?.lime?.appRuntime ?? ">=0.3.0 <1.0.0",
      sdk: manifest.requires?.sdk ?? manifest.requires?.lime?.sdk,
      capabilities: {
        ...topLevelCapabilities,
        ...requiresCapabilities,
      },
    },
    runtimePackage: manifest.runtimePackage ?? {},
    permissions: manifest.permissions ?? [],
    entries: manifest.entries.map(normalizeEntry),
    storage: manifest.storage
      ? {
          namespace: manifest.storage.namespace ?? appId,
          schema: manifest.storage.schema,
          migrations: manifest.storage.migrations,
          retention: storageRetention,
        }
      : undefined,
    knowledgeTemplates: manifest.knowledgeTemplates ?? [],
    artifacts: manifest.artifactTypes ?? manifest.artifacts ?? [],
    policies: manifest.policies ?? [],
    services: manifest.services ?? [],
    workflows: manifest.workflows ?? [],
    skillRefs: manifest.skillRefs ?? [],
    toolRefs: manifest.toolRefs ?? [],
    evals: manifest.evals ?? [],
    events: manifest.events ?? [],
    secrets: manifest.secrets ?? [],
    overlayTemplates: manifest.overlayTemplates ?? [],
    ui: manifest.ui,
    lifecycle: manifest.lifecycle ?? {},
  };
}
