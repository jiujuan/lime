import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type { ExperimentalFeatures } from "./experimentalFeatureTypes";

export type {
  WebMcpConfig,
  ExperimentalFeatures,
  ToolCallingConfig,
} from "./experimentalFeatureTypes";
export { DEFAULT_EXPERIMENTAL_FEATURES } from "./experimentalFeatureTypes";

export async function getExperimentalConfig(): Promise<ExperimentalFeatures> {
  const result =
    await safeInvoke<ExperimentalFeatures>("get_experimental_config");
  assertNotDiagnosticFacade(
    "get_experimental_config",
    result,
    "真实 Experimental config current 通道",
  );
  return result;
}

export async function saveExperimentalConfig(
  config: ExperimentalFeatures,
): Promise<void> {
  const result = await safeInvoke("save_experimental_config", {
    experimentalConfig: config,
  });
  assertNotDiagnosticFacade(
    "save_experimental_config",
    result,
    "真实 Experimental config current 通道",
  );
}
