import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
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

export function buildContentFactoryPluginContract(): PluginContract {
  const parsedManifest = parseManifest(contentFactoryFixture);
  return buildPluginContractFromAgentAppManifest({
    manifest: normalizeManifest(parsedManifest),
    identity: buildPackageIdentity({
      manifest: parsedManifest,
      loadedAt: "2026-06-26T00:00:00.000Z",
    }),
  });
}

export function buildContentFactoryPluginDogfoodContract(): ContentFactoryPluginDogfoodContract {
  const contract = buildContentFactoryPluginContract();
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
