import type {
  PluginStandaloneReleaseGate,
  PluginStandaloneReleasePlan,
} from "./releasePlan";
import { buildStandaloneNativeShellConfigWritePlan } from "./nativeShellConfigWritePlan";
import type { PluginStandaloneNativeShellConfigMaterializerResult } from "./nativeShellConfigMaterializer";
import type { PluginStandaloneNativeShellConfigWritePlan } from "./nativeShellConfigWritePlan";

export type PluginProductionArtifactAdapterKind =
  | "app_bundle_builder"
  | "electron_artifact_builder"
  | "macos_application_signer"
  | "macos_dmg_builder"
  | "macos_notarization_submitter"
  | "native_shell_config_writer"
  | "rollback_manifest_writer"
  | "updater_manifest_writer"
  | "windows_installer_builder"
  | "windows_signer";

export type PluginStandaloneArtifactBuildBlocker =
  | PluginStandaloneReleaseGate
  | {
      code:
        | "NATIVE_SHELL_CONFIG_MATERIALIZATION_BLOCKED"
        | "NATIVE_SHELL_CONFIG_WRITE_PLAN_BLOCKED";
      message: string;
      severity: "blocker";
      details?: unknown;
    };

export interface PluginStandaloneArtifactBuildInput {
  releasePlan: PluginStandaloneReleasePlan;
  outputDirectory: string;
  nativeShellConfig?: {
    materializerResult: PluginStandaloneNativeShellConfigMaterializerResult;
    configOutputPath: string;
    envOutputPath: string;
  };
}

type PluginStandaloneNativeShellRuntimeEnv = Extract<
  PluginStandaloneNativeShellConfigMaterializerResult,
  { status: "ready" }
>["runtimeEnv"];

export type PluginStandaloneNativeShellConfigBuildStep =
  | {
      status: "ready";
      configOutputPath: string;
      envOutputPath: string;
      runtimeEnv: PluginStandaloneNativeShellRuntimeEnv;
      writePlan: Extract<
        PluginStandaloneNativeShellConfigWritePlan,
        { status: "ready" }
      >;
    }
  | {
      status: "blocked";
      blockerCodes: string[];
    };

export interface PluginStandaloneArtifactBuildPlan {
  schemaVersion: 1;
  appId: string;
  descriptorHash: string;
  channel: PluginStandaloneReleasePlan["channel"];
  target: PluginStandaloneReleasePlan["target"];
  outputDirectory: string;
  status: "blocked";
  readyToBuild: false;
  requiredAdapters: PluginProductionArtifactAdapterKind[];
  blockers: PluginStandaloneArtifactBuildBlocker[];
  nativeShellConfig: PluginStandaloneNativeShellConfigBuildStep;
  artifactRefs: [];
}

export interface PluginProductionArtifactBuilderPort {
  build(
    input: PluginStandaloneArtifactBuildInput,
  ): Promise<PluginStandaloneArtifactBuildPlan>;
}

function requiredAdaptersForReleasePlan(
  releasePlan: PluginStandaloneReleasePlan,
): PluginProductionArtifactAdapterKind[] {
  const adapters: PluginProductionArtifactAdapterKind[] = [
    "native_shell_config_writer",
    "electron_artifact_builder",
  ];
  const target = releasePlan.target;
  if (target.platform === "macos") {
    adapters.push("app_bundle_builder", "macos_application_signer");
    if (target.packageFormat === "dmg") {
      adapters.push("macos_dmg_builder");
    }
    adapters.push("macos_notarization_submitter");
  } else if (target.platform === "windows") {
    adapters.push("windows_installer_builder", "windows_signer");
  } else {
    adapters.push("app_bundle_builder");
  }
  adapters.push("updater_manifest_writer");
  if (releasePlan.channel === "stable") {
    adapters.push("rollback_manifest_writer");
  }
  return [...new Set(adapters)];
}

function buildNativeShellConfigStep(input: PluginStandaloneArtifactBuildInput): {
  step: PluginStandaloneNativeShellConfigBuildStep;
  blocker?: PluginStandaloneArtifactBuildBlocker;
} {
  const nativeShellConfigInput = input.nativeShellConfig;
  const materializerResult = nativeShellConfigInput?.materializerResult;
  if (
    !nativeShellConfigInput ||
    !materializerResult ||
    materializerResult.status !== "ready"
  ) {
    const blockerCodes = materializerResult?.blockers.map(
      (blocker) => blocker.code,
    ) ?? ["NATIVE_SHELL_CONFIG_MATERIALIZER_MISSING"];
    return {
      step: {
        status: "blocked",
        blockerCodes,
      },
      blocker: {
        code: "NATIVE_SHELL_CONFIG_MATERIALIZATION_BLOCKED",
        message:
          "Standalone production artifact build requires a ready materialized native shell config.",
        severity: "blocker",
        details: materializerResult?.blockers ?? blockerCodes,
      },
    };
  }

  const writePlan = buildStandaloneNativeShellConfigWritePlan({
    materializerResult,
    configOutputPath: nativeShellConfigInput.configOutputPath,
    envOutputPath: nativeShellConfigInput.envOutputPath,
  });
  if (writePlan.status !== "ready") {
    return {
      step: {
        status: "blocked",
        blockerCodes: writePlan.blockers.map((blocker) => blocker.code),
      },
      blocker: {
        code: "NATIVE_SHELL_CONFIG_WRITE_PLAN_BLOCKED",
        message:
          "Standalone production artifact build requires a deterministic native shell config write plan.",
        severity: "blocker",
        details: writePlan.blockers,
      },
    };
  }

  return {
    step: {
      status: "ready",
      configOutputPath: nativeShellConfigInput.configOutputPath,
      envOutputPath: nativeShellConfigInput.envOutputPath,
      runtimeEnv: materializerResult.runtimeEnv,
      writePlan,
    },
  };
}

export function buildStandaloneArtifactBuildPlan(
  input: PluginStandaloneArtifactBuildInput,
): PluginStandaloneArtifactBuildPlan {
  const { releasePlan } = input;
  const nativeShellConfig = buildNativeShellConfigStep(input);
  const blockers: PluginStandaloneArtifactBuildBlocker[] = [
    ...releasePlan.blockers,
  ];
  if (nativeShellConfig.blocker) {
    blockers.push(nativeShellConfig.blocker);
  }
  return {
    schemaVersion: 1,
    appId: releasePlan.appId,
    descriptorHash: releasePlan.descriptorHash,
    channel: releasePlan.channel,
    target: releasePlan.target,
    outputDirectory: input.outputDirectory,
    status: "blocked",
    readyToBuild: false,
    requiredAdapters: requiredAdaptersForReleasePlan(releasePlan),
    blockers,
    nativeShellConfig: nativeShellConfig.step,
    artifactRefs: [],
  };
}

export class UnavailableProductionArtifactBuilder implements PluginProductionArtifactBuilderPort {
  async build(
    input: PluginStandaloneArtifactBuildInput,
  ): Promise<PluginStandaloneArtifactBuildPlan> {
    return buildStandaloneArtifactBuildPlan(input);
  }
}
