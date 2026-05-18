import type { AgentAppNativeShellRegistrationPlan } from "./nativeShellRegistration";

export interface AgentAppStandaloneTauriConfigMaterializerInput {
  baseConfig: Record<string, unknown>;
  registrationPlan: AgentAppNativeShellRegistrationPlan;
}

export interface AgentAppStandaloneTauriConfigMaterializerBlocker {
  code: "NATIVE_SHELL_REGISTRATION_BLOCKED";
  message: string;
  details?: unknown;
}

export type AgentAppStandaloneTauriConfigMaterializerResult =
  | {
      status: "ready";
      config: Record<string, unknown>;
      runtimeEnv: AgentAppNativeShellRegistrationPlan["runtimeEnv"];
      blockers: [];
    }
  | {
      status: "blocked";
      config?: never;
      runtimeEnv?: never;
      blockers: AgentAppStandaloneTauriConfigMaterializerBlocker[];
    };

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstWindow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length === 0) {
    return {};
  }
  return objectValue(value[0]);
}

export function materializeStandaloneTauriConfig(
  input: AgentAppStandaloneTauriConfigMaterializerInput,
): AgentAppStandaloneTauriConfigMaterializerResult {
  const { registrationPlan } = input;
  if (registrationPlan.status !== "ready") {
    return {
      status: "blocked",
      blockers: [
        {
          code: "NATIVE_SHELL_REGISTRATION_BLOCKED",
          message:
            "Standalone Tauri config cannot be materialized until native shell registration is ready.",
          details: registrationPlan.blockers,
        },
      ],
    };
  }

  const config = cloneConfig(input.baseConfig);
  config.productName = registrationPlan.tauriConfigPatch.productName;
  if (registrationPlan.tauriConfigPatch.identifier) {
    config.identifier = registrationPlan.tauriConfigPatch.identifier;
  }

  const app = objectValue(config.app);
  const window = firstWindow(app.windows);
  app.windows = [
    {
      ...window,
      title: registrationPlan.productName,
      visible: false,
    },
  ];
  config.app = app;

  const plugins = objectValue(config.plugins);
  const deepLink = objectValue(plugins["deep-link"]);
  deepLink.desktop = {
    ...objectValue(deepLink.desktop),
    schemes: registrationPlan.deepLinkSchemes,
  };
  plugins["deep-link"] = deepLink;
  config.plugins = plugins;

  return {
    status: "ready",
    config,
    runtimeEnv: registrationPlan.runtimeEnv,
    blockers: [],
  };
}
