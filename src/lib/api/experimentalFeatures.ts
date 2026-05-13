import { safeInvoke } from "@/lib/dev-bridge";
import type { ExperimentalFeatures } from "./experimentalFeatureTypes";

export type {
  WebMcpConfig,
  ExperimentalFeatures,
  ToolCallingConfig,
} from "./experimentalFeatureTypes";
export { DEFAULT_EXPERIMENTAL_FEATURES } from "./experimentalFeatureTypes";

export async function getExperimentalConfig(): Promise<ExperimentalFeatures> {
  return safeInvoke("get_experimental_config");
}

export async function saveExperimentalConfig(
  config: ExperimentalFeatures,
): Promise<void> {
  return safeInvoke("save_experimental_config", {
    experimentalConfig: config,
  });
}
