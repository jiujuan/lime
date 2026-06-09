import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type { ExperimentalFeatures } from "./experimentalFeatureTypes";

export type {
  WebMcpConfig,
  ExperimentalFeatures,
  ToolCallingConfig,
} from "./experimentalFeatureTypes";
export { DEFAULT_EXPERIMENTAL_FEATURES } from "./experimentalFeatureTypes";

function isExperimentalFeatures(value: unknown): value is ExperimentalFeatures {
  if (!value || typeof value !== "object") {
    return false;
  }
  const config = value as Partial<ExperimentalFeatures>;
  return (
    Boolean(config.webmcp) &&
    typeof config.webmcp === "object" &&
    typeof config.webmcp.enabled === "boolean"
  );
}

function assertVoidResult(command: string, value: unknown): void {
  if (value !== null && value !== undefined) {
    throw new Error(`${command} did not return void result`);
  }
}

export async function getExperimentalConfig(): Promise<ExperimentalFeatures> {
  const result = await safeInvoke<unknown>("get_experimental_config");
  assertNotDiagnosticFacade(
    "get_experimental_config",
    result,
    "真实 Experimental config current 通道",
  );
  if (!isExperimentalFeatures(result)) {
    throw new Error("get_experimental_config did not return experimental config");
  }
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
  assertVoidResult("save_experimental_config", result);
}
