import { normalizePluginManifest } from "../manifest/pluginContract";
import { projectPluginRegistry } from "../manifest/pluginRegistry";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import type {
  PluginContract,
  PluginArtifactRendererDeclaration,
  PluginHistoryRestoreDeclaration,
  PluginManifestInstallContract,
  PluginManifest,
  PluginManifestInterface,
  PluginRegistryItem,
  PluginRegistryProjectionInput,
  PluginSkillDeclaration,
  PluginSubagentDeclaration,
  PluginWorkflowDeclaration,
} from "../manifest/types";
import type {
  PluginMarketplaceItem,
  PluginMarketplaceListResponse,
} from "./types";

export interface PluginMarketplaceRegistryProjectionOptions {
  installedPluginKeys?: readonly string[];
  enabledPluginKeys?: readonly string[];
  historyWorkspacePluginKeys?: readonly string[];
}

export interface PluginMarketplaceInstalledAgentAppsProjectionOptions extends Omit<
  PluginMarketplaceRegistryProjectionOptions,
  "installedPluginKeys" | "enabledPluginKeys"
> {
  installedAgentApps?: readonly InstalledAgentAppState[];
}

export interface PluginMarketplaceInstalledKeyProjection {
  installedPluginKeys: string[];
  enabledPluginKeys: string[];
  disabledPluginKeys: string[];
  refreshablePluginKeys: string[];
  blockerCodesByPluginKey: Record<string, string[]>;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map(readString));
}

function marketplaceCategories(item: PluginMarketplaceItem): string[] {
  return uniqueStrings([item.category, ...(item.categories ?? [])]);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function runtimeTargetsInstallContract(
  item: PluginMarketplaceItem,
): PluginManifestInstallContract | undefined {
  const manifest = readRecord(item.manifestSummary);
  const install = readRecord(item.install) ?? readRecord(manifest?.install);
  if (!install) {
    return undefined;
  }
  const local = readBoolean(install.local);
  const cloud = readBoolean(install.cloud);
  const authentication = readString(install.authentication);
  const contract: PluginManifestInstallContract = {};
  if (typeof local === "boolean") {
    contract.local = local;
  }
  if (typeof cloud === "boolean") {
    contract.cloud = cloud;
  }
  if (authentication) {
    contract.authentication = authentication;
  }
  return Object.keys(contract).length > 0 ? contract : undefined;
}

export function projectPluginMarketplaceItemSkills(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginSkillDeclaration[] {
  const summary = readRecord(item.manifestSummary);
  const rawSkills = Array.isArray(summary?.skills) ? summary.skills : [];
  const seen = new Set<string>();

  return rawSkills.flatMap((entry): PluginSkillDeclaration[] => {
    const record = readRecord(entry);
    const id = readString(record?.id);
    if (!id || seen.has(id)) {
      return [];
    }
    seen.add(id);
    const title = readString(record?.title) ?? id;
    const description = readString(record?.description);
    return [
      {
        id,
        title,
        ...(description ? { description } : {}),
      },
    ];
  });
}

function projectPluginMarketplaceItemArtifactRenderers(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginArtifactRendererDeclaration[] {
  const summary = readRecord(item.manifestSummary);
  const rawRenderers = Array.isArray(summary?.artifactRenderers)
    ? summary.artifactRenderers
    : [];

  return rawRenderers.flatMap((entry): PluginArtifactRendererDeclaration[] => {
    const record = readRecord(entry);
    return record ? [record as unknown as PluginArtifactRendererDeclaration] : [];
  });
}

function projectPluginMarketplaceItemHistoryRestore(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginHistoryRestoreDeclaration | undefined {
  const summary = readRecord(item.manifestSummary);
  const historyRestore = readRecord(summary?.historyRestore);
  return historyRestore as PluginHistoryRestoreDeclaration | undefined;
}

function projectPluginMarketplaceItemSubagents(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginSubagentDeclaration[] {
  const summary = readRecord(item.manifestSummary);
  const rawSubagents = Array.isArray(summary?.subagents)
    ? summary.subagents
    : [];
  return rawSubagents.flatMap((entry): PluginSubagentDeclaration[] => {
    const record = readRecord(entry);
    const id = readString(record?.id);
    if (!record || !id) {
      return [];
    }
    return [
      {
        id,
        title: readString(record.title) ?? id,
        description: readString(record.description),
        activation: readString(record.activation),
        required: record.required === true,
        skills: readStringArray(record.skills),
      },
    ];
  });
}

function projectPluginMarketplaceItemWorkflows(
  item: Pick<PluginMarketplaceItem, "manifestSummary">,
): PluginWorkflowDeclaration[] {
  const summary = readRecord(item.manifestSummary);
  const rawWorkflows = Array.isArray(summary?.workflows)
    ? summary.workflows
    : [];
  return rawWorkflows.flatMap((entry): PluginWorkflowDeclaration[] => {
    const record = readRecord(entry);
    const key = readString(record?.key);
    if (!record || !key) {
      return [];
    }
    return [
      {
        key,
        title: readString(record.title),
        path: readString(record.path),
        taskKind: readString(record.taskKind),
        triggerIntents: readStringArray(record.triggerIntents),
        outputArtifactKind: readString(record.outputArtifactKind),
        steps: Array.isArray(record.steps)
          ? record.steps.flatMap((step) => {
              const stepRecord = readRecord(step);
              const id = readString(stepRecord?.id);
              return stepRecord && id
                ? [
                    {
                      id,
                      title: readString(stepRecord.title),
                      subagent: readString(stepRecord.subagent),
                      skillRefs: readStringArray(stepRecord.skillRefs),
                      expectedOutput: readString(stepRecord.expectedOutput),
                    },
                  ]
                : [];
            })
          : [],
        humanReview: record.humanReview === true,
        required: record.required === true,
      },
    ];
  });
}

function projectPluginMarketplaceItemInterface(
  item: PluginMarketplaceItem,
): PluginManifestInterface {
  const summary = readRecord(item.manifestSummary);
  const rawInterface = readRecord(summary?.interface);
  const defaultPrompt = readStringArray(rawInterface?.defaultPrompt);
  return {
    displayName: readString(rawInterface?.displayName) ?? item.displayName,
    shortDescription:
      readString(rawInterface?.shortDescription) ?? item.description,
    longDescription: readString(rawInterface?.longDescription),
    developerName: readString(rawInterface?.developerName),
    category: readString(rawInterface?.category) ?? item.category,
    capabilities: Array.isArray(rawInterface?.capabilities)
      ? readStringArray(rawInterface.capabilities)
      : item.capabilities ?? [],
    websiteUrl:
      readString(rawInterface?.websiteUrl) ??
      readString(rawInterface?.websiteURL),
    privacyPolicyUrl:
      readString(rawInterface?.privacyPolicyUrl) ??
      readString(rawInterface?.privacyPolicyURL),
    termsOfServiceUrl:
      readString(rawInterface?.termsOfServiceUrl) ??
      readString(rawInterface?.termsOfServiceURL),
    defaultPrompt,
    brandColor: readString(rawInterface?.brandColor),
    composerIcon: readString(rawInterface?.composerIcon),
    logo: readString(rawInterface?.logo),
    logoDark: readString(rawInterface?.logoDark),
    screenshots: readStringArray(rawInterface?.screenshots),
  };
}

function marketplaceManifest(item: PluginMarketplaceItem): PluginManifest {
  const artifactRenderers = projectPluginMarketplaceItemArtifactRenderers(item);
  const historyRestore = projectPluginMarketplaceItemHistoryRestore(item);
  const manifestInterface = projectPluginMarketplaceItemInterface(item);
  const install = runtimeTargetsInstallContract(item);
  return {
    id: item.pluginKey,
    name: item.pluginName,
    displayName: item.displayName,
    version: item.version ?? "0.0.0",
    description: item.description,
    categories: marketplaceCategories(item),
    capabilities: item.capabilities ?? [],
    skills: projectPluginMarketplaceItemSkills(item),
    subagents: projectPluginMarketplaceItemSubagents(item),
    workflows: projectPluginMarketplaceItemWorkflows(item),
    interface: manifestInterface,
    ...(install ? { install } : {}),
    artifactRenderers,
    ...(historyRestore ? { historyRestore } : {}),
    agentApps: item.appId
      ? [
          {
            id: item.appId,
            title: item.displayName,
            description: item.description,
            uiKind: "pane",
            entryKey: item.pluginName,
          },
        ]
      : [],
    activationEntries: [
      {
        key: item.pluginName,
        title: item.displayName,
        kind: item.appId ? "agentApp" : "plugin",
        intent: "manual",
      },
    ],
  };
}

function isMarketplaceItemAvailable(item: PluginMarketplaceItem): boolean {
  const install = runtimeTargetsInstallContract(item);
  const canInstallLocal = install?.local === true;
  const canInstallCloud =
    item.enabled &&
    item.installState === "available" &&
    item.activationState === "activatable" &&
    item.policy.installation !== "NOT_AVAILABLE" &&
    Boolean(item.package?.packageUrl);
  return canInstallLocal || canInstallCloud;
}

function setFrom(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

function normalizeToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token ? token : undefined;
}

export function marketplaceItemMatchesInstalledAgentAppPackage(
  item: PluginMarketplaceItem,
  state: InstalledAgentAppState,
): boolean {
  const expectedPackageHash = normalizeToken(item.package?.packageHash);
  const expectedManifestHash = normalizeToken(item.package?.manifestHash);
  if (!expectedPackageHash && !expectedManifestHash) {
    return true;
  }
  if (
    expectedPackageHash &&
    state.identity.packageHash !== expectedPackageHash
  ) {
    return false;
  }
  if (
    expectedManifestHash &&
    state.identity.manifestHash !== expectedManifestHash
  ) {
    return false;
  }
  return true;
}

function installedCloudReleaseEvidenceMissing(
  state: InstalledAgentAppState,
): boolean {
  const setup = readRecord(state.setup);
  return (
    state.identity.sourceKind === "cloud_release" &&
    state.identity.sourceUri.startsWith("https://seeded.local/") &&
    !setup?.cloudReleaseEvidence
  );
}

function installedStateForMarketplaceItem(
  item: PluginMarketplaceItem,
  statesByAppId: ReadonlyMap<string, InstalledAgentAppState>,
): InstalledAgentAppState | undefined {
  const appId = normalizeToken(item.appId);
  if (!appId) {
    return undefined;
  }
  return statesByAppId.get(appId);
}

export function projectPluginMarketplaceInstalledKeysFromAgentApps(
  marketplace: PluginMarketplaceListResponse,
  installedAgentApps: readonly InstalledAgentAppState[] = [],
): PluginMarketplaceInstalledKeyProjection {
  const statesByAppId = new Map(
    installedAgentApps.map((state) => [state.appId, state] as const),
  );
  const installedPluginKeys: string[] = [];
  const enabledPluginKeys: string[] = [];
  const disabledPluginKeys: string[] = [];
  const refreshablePluginKeys: string[] = [];
  const blockerCodesByPluginKey: Record<string, string[]> = {};

  marketplace.items.forEach((item) => {
    const state = installedStateForMarketplaceItem(item, statesByAppId);
    if (!state) {
      return;
    }
    if (installedCloudReleaseEvidenceMissing(state)) {
      refreshablePluginKeys.push(item.pluginKey);
      blockerCodesByPluginKey[item.pluginKey] = [
        "PLUGIN_CLOUD_RELEASE_EVIDENCE_MISSING",
      ];
      return;
    }
    if (!marketplaceItemMatchesInstalledAgentAppPackage(item, state)) {
      refreshablePluginKeys.push(item.pluginKey);
      blockerCodesByPluginKey[item.pluginKey] = [
        "PLUGIN_INSTALLED_PACKAGE_MISMATCH",
      ];
      return;
    }
    installedPluginKeys.push(item.pluginKey);
    if (state.disabled === true) {
      disabledPluginKeys.push(item.pluginKey);
    } else {
      enabledPluginKeys.push(item.pluginKey);
    }
  });

  return {
    installedPluginKeys,
    enabledPluginKeys,
    disabledPluginKeys,
    refreshablePluginKeys,
    blockerCodesByPluginKey,
  };
}

export function buildPluginContractFromMarketplaceItem(
  item: PluginMarketplaceItem,
): PluginContract {
  return normalizePluginManifest(marketplaceManifest(item), {
    provenance: {
      sourceKind: "plugin_marketplace",
      sourceId: item.pluginKey,
      sourceVersion: item.version ?? "0.0.0",
      packageHash: item.package?.packageHash,
      manifestHash: item.package?.manifestHash,
    },
  });
}

export function buildPluginContractsFromMarketplace(
  marketplace: PluginMarketplaceListResponse,
): PluginContract[] {
  return marketplace.items.map(buildPluginContractFromMarketplaceItem);
}

export function projectPluginMarketplaceRegistryInputs(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceRegistryProjectionOptions = {},
): PluginRegistryProjectionInput[] {
  const installed = setFrom(options.installedPluginKeys);
  const enabled = setFrom(options.enabledPluginKeys);
  const historyWorkspace = setFrom(options.historyWorkspacePluginKeys);

  return marketplace.items.map((item) => {
    const available = isMarketplaceItemAvailable(item);
    const installedByDefault =
      item.policy.installation === "INSTALLED_BY_DEFAULT";
    const isInstalled = installed.has(item.pluginKey) || installedByDefault;
    const hasExplicitEnabledSet = enabled.size > 0;
    const marketplaceBlocked = !available && !isInstalled;
    return {
      contract: buildPluginContractFromMarketplaceItem(item),
      installed: isInstalled,
      installable: available,
      enabled: hasExplicitEnabledSet
        ? enabled.has(item.pluginKey)
        : isInstalled,
      readinessStatus: available || isInstalled ? "ready" : "blocked",
      hasHistoryWorkspace: historyWorkspace.has(item.pluginKey),
      blockerCodes: marketplaceBlocked
        ? [
            item.blockedReason
              ? `PLUGIN_MARKETPLACE_BLOCKED:${item.blockedReason}`
              : "PLUGIN_MARKETPLACE_BLOCKED",
          ]
        : [],
    };
  });
}

export function projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceInstalledAgentAppsProjectionOptions = {},
): PluginRegistryProjectionInput[] {
  const installedProjection =
    projectPluginMarketplaceInstalledKeysFromAgentApps(
      marketplace,
      options.installedAgentApps,
    );
  const baseInputs = projectPluginMarketplaceRegistryInputs(marketplace, {
    installedPluginKeys: installedProjection.installedPluginKeys,
    enabledPluginKeys: installedProjection.enabledPluginKeys,
    historyWorkspacePluginKeys: options.historyWorkspacePluginKeys,
  });
  const disabled = setFrom(installedProjection.disabledPluginKeys);
  const refreshable = setFrom(installedProjection.refreshablePluginKeys);

  return baseInputs.map((input) => ({
    ...input,
    installable: input.installable || refreshable.has(input.contract.id),
    enabled: input.enabled && !disabled.has(input.contract.id),
    blockerCodes: [
      ...(input.blockerCodes ?? []),
      ...(installedProjection.blockerCodesByPluginKey[input.contract.id] ?? []),
    ],
  }));
}

export function projectPluginMarketplaceRegistry(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceRegistryProjectionOptions = {},
): PluginRegistryItem[] {
  return projectPluginRegistry(
    projectPluginMarketplaceRegistryInputs(marketplace, options),
  );
}

export function projectPluginMarketplaceRegistryFromInstalledAgentApps(
  marketplace: PluginMarketplaceListResponse,
  options: PluginMarketplaceInstalledAgentAppsProjectionOptions = {},
): PluginRegistryItem[] {
  return projectPluginRegistry(
    projectPluginMarketplaceRegistryInputsFromInstalledAgentApps(
      marketplace,
      options,
    ),
  );
}
