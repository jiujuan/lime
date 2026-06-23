import type {
  AgentAppProjection,
  AgentAppProvenance,
  CapabilityDeclaredBy,
  CapabilityRequirement,
  NormalizedAppManifest,
  PackageIdentity,
  ProjectedEntry,
} from "../types";
import { projectInstallContract } from "../install-mode";

function createProvenance(
  identity: PackageIdentity,
  entryKey?: string,
): AgentAppProvenance {
  return {
    sourceKind: "agent_app",
    appId: identity.appId,
    appVersion: identity.appVersion,
    packageHash: identity.packageHash,
    manifestHash: identity.manifestHash,
    entryKey,
  };
}

function capabilityKey(capability: string, entryKey?: string): string {
  return `${capability}::${entryKey ?? "app"}`;
}

function upsertRequirement(
  requirements: Map<string, CapabilityRequirement>,
  params: {
    capability: string;
    requestedRange?: string;
    required?: boolean;
    declaredBy: CapabilityDeclaredBy;
    entryKey?: string;
  },
): void {
  const key = capabilityKey(params.capability, params.entryKey);
  const existing = requirements.get(key);
  if (!existing) {
    requirements.set(key, {
      capability: params.capability,
      requestedRange: params.requestedRange ?? "*",
      required: params.required ?? true,
      declaredBy: [params.declaredBy],
      entryKey: params.entryKey,
    });
    return;
  }

  if (!existing.declaredBy.includes(params.declaredBy)) {
    existing.declaredBy.push(params.declaredBy);
  }
  existing.required = existing.required || (params.required ?? true);
}

function collectGlobalRequirements(
  manifest: NormalizedAppManifest,
): CapabilityRequirement[] {
  const requirements = new Map<string, CapabilityRequirement>();

  Object.entries(manifest.requires.capabilities).forEach(([capability, range]) => {
    upsertRequirement(requirements, {
      capability,
      requestedRange: range,
      declaredBy: "requires",
    });
  });

  if (manifest.storage) {
    upsertRequirement(requirements, {
      capability: "lime.storage",
      requestedRange: manifest.requires.capabilities["lime.storage"] ?? "*",
      declaredBy: "storage",
    });
  }

  if (manifest.runtimePackage.ui) {
    upsertRequirement(requirements, {
      capability: "lime.ui",
      requestedRange: manifest.requires.capabilities["lime.ui"] ?? "*",
      declaredBy: "runtimePackage",
      required: false,
    });
  }

  if (manifest.runtimePackage.worker) {
    upsertRequirement(requirements, {
      capability: "lime.workflow",
      requestedRange: manifest.requires.capabilities["lime.workflow"] ?? "*",
      declaredBy: "runtimePackage",
      required: false,
    });
  }

  return Array.from(requirements.values()).sort((left, right) =>
    left.capability.localeCompare(right.capability),
  );
}

function collectEntryRequirements(
  manifest: NormalizedAppManifest,
  entryKey: string,
  entryCapabilities: string[],
): CapabilityRequirement[] {
  const requirements = new Map<string, CapabilityRequirement>();

  entryCapabilities.forEach((capability) => {
    upsertRequirement(requirements, {
      capability,
      requestedRange: manifest.requires.capabilities[capability] ?? "*",
      declaredBy: "entry",
      entryKey,
    });
  });

  return Array.from(requirements.values()).sort((left, right) =>
    left.capability.localeCompare(right.capability),
  );
}

export function projectApp(params: {
  manifest: NormalizedAppManifest;
  identity: PackageIdentity;
}): AgentAppProjection {
  const { manifest, identity } = params;
  const appProvenance = createProvenance(identity);
  const requiredCapabilities = collectGlobalRequirements(manifest);
  const entries: ProjectedEntry[] = manifest.entries.map((entry) => ({
    appId: manifest.appId,
    key: entry.key,
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    route: entry.route,
    presentation: "lab-only",
    readiness: "unknown",
    requiredCapabilities: collectEntryRequirements(
      manifest,
      entry.key,
      entry.requiredCapabilities,
    ),
    provenance: createProvenance(identity, entry.key),
  }));

  return {
    app: {
      appId: manifest.appId,
      displayName: manifest.displayName,
      version: manifest.version,
      status: manifest.status,
      appType: manifest.appType,
      description: manifest.description,
      presentation: manifest.presentation,
    },
    package: identity,
    entries,
    requiredCapabilities,
    runtimePackage: {
      hasUiBundle: Boolean(manifest.runtimePackage.ui),
      hasWorkerBundle: Boolean(manifest.runtimePackage.worker),
      uiPath: manifest.runtimePackage.ui?.path,
      workerPath:
        manifest.runtimePackage.worker?.entrypoint ??
        manifest.runtimePackage.worker?.path,
    },
    storage: manifest.storage
      ? {
          namespace: manifest.storage.namespace,
          schema: manifest.storage.schema,
          migrations: manifest.storage.migrations,
          retention: manifest.storage.retention,
        }
      : undefined,
    knowledgeBindings: manifest.knowledgeTemplates.map((template) => ({
      key: template.key,
      standard: template.standard,
      type: template.type,
      required: template.required ?? false,
    })),
    artifactTypes: manifest.artifacts.map((artifact) => ({
      key: artifact.key,
      title: artifact.title,
      type: artifact.type,
      required: artifact.required ?? false,
    })),
    policies: manifest.policies.map((policy) => ({
      key: policy.key,
      title: policy.title,
      required: policy.required ?? false,
    })),
    services: manifest.services.map((service) => ({
      key: service.key,
      kind: service.kind,
      path: service.path,
      required: service.required ?? false,
    })),
    workflows: manifest.workflows.map((workflow) => ({
      key: workflow.key,
      path: workflow.path,
      humanReview: workflow.humanReview ?? false,
      required: workflow.required ?? false,
    })),
    skillRequirements: manifest.skillRefs.map((skill) => ({
      id: skill.id,
      standard: skill.standard,
      activation: skill.activation,
      required: skill.required ?? false,
    })),
    toolRequirements: manifest.toolRefs.map((tool) => ({
      key: tool.key,
      provider: tool.provider,
      capabilities: tool.capabilities ?? [],
      required: tool.required ?? false,
    })),
    evals: manifest.evals.map((evalRule) => ({
      key: evalRule.key,
      kind: evalRule.kind,
      evidenceRequired: evalRule.evidenceRequired ?? false,
      required: evalRule.required ?? false,
    })),
    events: manifest.events.map((event) => ({
      key: event.key,
      direction: event.direction ?? "both",
      required: event.required ?? false,
    })),
    secrets: manifest.secrets.map((secret) => ({
      key: secret.key,
      provider: secret.provider,
      scope: secret.scope,
      required: secret.required ?? false,
    })),
    overlayTemplates: manifest.overlayTemplates.map((overlay) => ({
      key: overlay.key,
      scope: overlay.scope,
      required: overlay.required ?? false,
    })),
    ui: manifest.ui,
    lifecycle: manifest.lifecycle,
    install: projectInstallContract(manifest.install),
    readinessHints: [
      {
        code: "LAB_ONLY",
        message: "P0 projection is lab-only and must not be registered into the main product path.",
        severity: "info",
      },
    ],
    provenance: appProvenance,
  };
}
