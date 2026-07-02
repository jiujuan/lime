import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { normalizeManifest } from "@/features/agent-app/manifest/normalizeManifest";
import { parseManifest } from "@/features/agent-app/manifest/parseManifest";
import {
  buildPluginActivationMentionCatalog,
  buildPluginContractFromAgentAppManifest,
  projectPluginRegistryItem,
  type PluginActivationMentionCatalog,
  type PluginContract,
  type PluginRegistryItem,
} from "@/features/plugin";

export const CONTENT_FACTORY_PLUGIN_ID = "content-factory-app";
export const CONTENT_FACTORY_PLUGIN_ENTRY_KEY = "content_factory";
export const CONTENT_FACTORY_PLUGIN_GENERATE_ENTRY_KEY =
  "content_factory_generate";

export interface ContentFactoryPluginDogfoodContract {
  contract: PluginContract;
  registryItem: PluginRegistryItem;
  activationCatalog: PluginActivationMentionCatalog;
}

export interface BuildContentFactoryPluginContractParams {
  manifest: unknown;
  loadedAt?: string;
}

export function buildContentFactoryPluginContract({
  loadedAt = "2026-06-26T00:00:00.000Z",
  manifest,
}: BuildContentFactoryPluginContractParams): PluginContract {
  const parsedManifest = parseManifest(manifest);
  return buildPluginContractFromAgentAppManifest({
    manifest: normalizeManifest(parsedManifest),
    identity: buildPackageIdentity({
      manifest: parsedManifest,
      loadedAt,
    }),
  });
}

export function buildContentFactoryPluginDogfoodContract(
  params: BuildContentFactoryPluginContractParams,
): ContentFactoryPluginDogfoodContract {
  const contract = buildContentFactoryPluginContract(params);
  const registryItem = projectPluginRegistryItem({
    contract,
    installed: true,
    enabled: true,
    readinessStatus: "ready",
  });

  return {
    contract,
    registryItem,
    activationCatalog: buildPluginActivationMentionCatalog({
      contracts: [contract],
      registryItems: [registryItem],
    }),
  };
}
