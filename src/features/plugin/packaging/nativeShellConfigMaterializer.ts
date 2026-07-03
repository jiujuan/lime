import type { PluginNativeShellRegistrationPlan } from "./nativeShellRegistration";

export interface PluginStandaloneNativeShellConfigMaterializerInput {
  baseConfig: Record<string, unknown>;
  registrationPlan: PluginNativeShellRegistrationPlan;
}

export interface PluginStandaloneNativeShellConfigMaterializerBlocker {
  code: "NATIVE_SHELL_REGISTRATION_BLOCKED";
  message: string;
  details?: unknown;
}

export type PluginStandaloneNativeShellConfigMaterializerResult =
  | {
      status: "ready";
      config: Record<string, unknown>;
      runtimeEnv: PluginNativeShellRegistrationPlan["runtimeEnv"];
      blockers: [];
    }
  | {
      status: "blocked";
      config?: never;
      runtimeEnv?: never;
      blockers: PluginStandaloneNativeShellConfigMaterializerBlocker[];
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

export function materializeStandaloneNativeShellConfig(
  input: PluginStandaloneNativeShellConfigMaterializerInput,
): PluginStandaloneNativeShellConfigMaterializerResult {
  const { registrationPlan } = input;
  if (registrationPlan.status !== "ready") {
    return {
      status: "blocked",
      blockers: [
        {
          code: "NATIVE_SHELL_REGISTRATION_BLOCKED",
          message:
            "Standalone native shell config cannot be materialized until native shell registration is ready.",
          details: registrationPlan.blockers,
        },
      ],
    };
  }

  const config = cloneConfig(input.baseConfig);
  config.productName = registrationPlan.nativeShellConfigPatch.productName;
  if (registrationPlan.nativeShellConfigPatch.identifier) {
    config.identifier = registrationPlan.nativeShellConfigPatch.identifier;
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
