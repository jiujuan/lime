import type {
  AgentAppStandaloneReleaseGate,
  AgentAppStandaloneReleasePlan,
} from "./releasePlan";
import { buildStandaloneNativeShellConfigWritePlan } from "./nativeShellConfigWritePlan";
import type { AgentAppStandaloneNativeShellConfigMaterializerResult } from "./nativeShellConfigMaterializer";
import type { AgentAppStandaloneNativeShellConfigWritePlan } from "./nativeShellConfigWritePlan";

export type AgentAppProductionArtifactAdapterKind =
  | "app_bundle_builder"
  | "electron_artifact_builder"
  | "macos_application_signer"
  | "macos_dmg_builder"
  | "macos_installer_signer"
  | "macos_notarization_submitter"
  | "macos_pkg_builder"
  | "native_shell_config_writer"
  | "rollback_manifest_writer"
  | "updater_manifest_writer"
  | "windows_installer_builder"
  | "windows_signer";

export type AgentAppStandaloneArtifactBuildBlocker =
  | AgentAppStandaloneReleaseGate
  | {
      code:
        | "NATIVE_SHELL_CONFIG_MATERIALIZATION_BLOCKED"
        | "NATIVE_SHELL_CONFIG_WRITE_PLAN_BLOCKED";
      message: string;
      severity: "blocker";
      details?: unknown;
    };

export interface AgentAppStandaloneArtifactBuildInput {
  releasePlan: AgentAppStandaloneReleasePlan;
  outputDirectory: string;
  nativeShellConfig?: {
    materializerResult: AgentAppStandaloneNativeShellConfigMaterializerResult;
    configOutputPath: string;
    envOutputPath: string;
  };
}

type AgentAppStandaloneNativeShellRuntimeEnv = Extract<
  AgentAppStandaloneNativeShellConfigMaterializerResult,
  { status: "ready" }
>["runtimeEnv"];

export type AgentAppStandaloneNativeShellConfigBuildStep =
  | {
      status: "ready";
      configOutputPath: string;
      envOutputPath: string;
      runtimeEnv: AgentAppStandaloneNativeShellRuntimeEnv;
      writePlan: Extract<
        AgentAppStandaloneNativeShellConfigWritePlan,
        { status: "ready" }
      >;
    }
  | {
      status: "blocked";
      blockerCodes: string[];
    };

export interface AgentAppStandaloneArtifactBuildPlan {
  schemaVersion: 1;
  appId: string;
  descriptorHash: string;
  channel: AgentAppStandaloneReleasePlan["channel"];
  target: AgentAppStandaloneReleasePlan["target"];
  outputDirectory: string;
  status: "blocked";
  readyToBuild: false;
  requiredAdapters: AgentAppProductionArtifactAdapterKind[];
  blockers: AgentAppStandaloneArtifactBuildBlocker[];
  nativeShellConfig: AgentAppStandaloneNativeShellConfigBuildStep;
  artifactRefs: [];
}

export interface AgentAppProductionArtifactBuilderPort {
  build(
    input: AgentAppStandaloneArtifactBuildInput,
  ): Promise<AgentAppStandaloneArtifactBuildPlan>;
}

function requiredAdaptersForReleasePlan(
  releasePlan: AgentAppStandaloneReleasePlan,
): AgentAppProductionArtifactAdapterKind[] {
  const adapters: AgentAppProductionArtifactAdapterKind[] = [
    "native_shell_config_writer",
    "electron_artifact_builder",
  ];
  const target = releasePlan.target;
  if (target.platform === "macos") {
    adapters.push("app_bundle_builder", "macos_application_signer");
    if (target.packageFormat === "dmg") {
      adapters.push("macos_dmg_builder");
    }
    if (target.packageFormat === "pkg") {
      adapters.push("macos_pkg_builder", "macos_installer_signer");
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

function buildNativeShellConfigStep(input: AgentAppStandaloneArtifactBuildInput): {
  step: AgentAppStandaloneNativeShellConfigBuildStep;
  blocker?: AgentAppStandaloneArtifactBuildBlocker;
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
  input: AgentAppStandaloneArtifactBuildInput,
): AgentAppStandaloneArtifactBuildPlan {
  const { releasePlan } = input;
  const nativeShellConfig = buildNativeShellConfigStep(input);
  const blockers: AgentAppStandaloneArtifactBuildBlocker[] = [
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

export class UnavailableProductionArtifactBuilder implements AgentAppProductionArtifactBuilderPort {
  async build(
    input: AgentAppStandaloneArtifactBuildInput,
  ): Promise<AgentAppStandaloneArtifactBuildPlan> {
    return buildStandaloneArtifactBuildPlan(input);
  }
}
