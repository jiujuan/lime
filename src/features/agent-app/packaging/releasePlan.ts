import type { MacOsSigningCertificateKind } from "./macosIdentity";
import { validateMacOsStandaloneIdentity } from "./macosIdentity";
import type { AgentAppPackageDescriptor } from "./packageTarget";

export type AgentAppReleaseChannel = "dev" | "internal" | "stable";

export interface AgentAppStandaloneReleaseInput {
  descriptor: AgentAppPackageDescriptor;
  channel: AgentAppReleaseChannel;
  signing?: {
    applicationCertificateKind?: MacOsSigningCertificateKind;
    notarizationConfigured?: boolean;
    notarizationProfileRef?: string;
  };
  updater?: {
    enabled: boolean;
    endpoint?: string;
  };
  rollback?: {
    strategy?: "disable_new_release" | "restore_previous_package";
    previousDescriptorHash?: string;
    previousPackageHash?: string;
  };
  productionArtifactBuilderAvailable?: boolean;
}

export interface AgentAppStandaloneReleaseGate {
  code:
    | "APPLICATION_SIGNING_MISSING"
    | "MACOS_IDENTITY_INVALID"
    | "MACOS_NOTARIZATION_MISSING"
    | "PACKAGE_DESCRIPTOR_NON_PRODUCTION"
    | "PRODUCTION_ARTIFACT_BUILDER_MISSING"
    | "ROLLBACK_PLAN_MISSING"
    | "TARGET_NOT_STANDALONE"
    | "TARGET_PACKAGE_FORMAT_MISSING"
    | "TARGET_PLATFORM_MISSING"
    | "UPDATER_CONFIG_MISSING";
  message: string;
  severity: "blocker" | "warning";
  details?: unknown;
}

export interface AgentAppStandaloneReleasePlan {
  schemaVersion: 1;
  appId: string;
  channel: AgentAppReleaseChannel;
  target: AgentAppPackageDescriptor["target"];
  descriptorHash: string;
  signing: {
    applicationCertificateKind?: MacOsSigningCertificateKind;
    notarizationConfigured: boolean;
    notarizationProfileRef?: string;
  };
  updater: {
    enabled: boolean;
    endpointConfigured: boolean;
    endpoint?: string;
  };
  rollback: {
    required: boolean;
    configured: boolean;
    strategy?: "disable_new_release" | "restore_previous_package";
    previousDescriptorHash?: string;
    previousPackageHash?: string;
  };
  productionReady: false;
  gates: AgentAppStandaloneReleaseGate[];
  blockers: AgentAppStandaloneReleaseGate[];
  warnings: AgentAppStandaloneReleaseGate[];
}

function gate(
  code: AgentAppStandaloneReleaseGate["code"],
  message: string,
  severity: AgentAppStandaloneReleaseGate["severity"] = "blocker",
  details?: unknown,
): AgentAppStandaloneReleaseGate {
  return { code, message, severity, details };
}

function hasUpdaterConfig(input: AgentAppStandaloneReleaseInput): boolean {
  if (!input.updater?.enabled) return false;
  return Boolean(input.updater.endpoint?.trim());
}

function hasRollbackPlan(input: AgentAppStandaloneReleaseInput): boolean {
  if (input.channel !== "stable") return true;
  return Boolean(
    input.rollback?.strategy &&
    (input.rollback.previousDescriptorHash ||
      input.rollback.previousPackageHash),
  );
}

export function buildStandaloneReleasePlan(
  input: AgentAppStandaloneReleaseInput,
): AgentAppStandaloneReleasePlan {
  const descriptor = input.descriptor;
  const target = descriptor.target;
  const gates: AgentAppStandaloneReleaseGate[] = [];

  if (target.kind !== "standalone") {
    gates.push(
      gate(
        "TARGET_NOT_STANDALONE",
        "Only standalone package targets can enter standalone release planning.",
      ),
    );
  }
  if (!target.platform) {
    gates.push(
      gate(
        "TARGET_PLATFORM_MISSING",
        "Standalone release must select a target platform.",
      ),
    );
  }
  if (!target.packageFormat) {
    gates.push(
      gate(
        "TARGET_PACKAGE_FORMAT_MISSING",
        "Standalone release must select app or dmg package format for macOS Forge current.",
      ),
    );
  }
  if (!descriptor.productionReady) {
    gates.push(
      gate(
        "PACKAGE_DESCRIPTOR_NON_PRODUCTION",
        "Current package descriptor is explicitly non-production and cannot be released as final.",
      ),
    );
  }
  if (!input.productionArtifactBuilderAvailable) {
    gates.push(
      gate(
        "PRODUCTION_ARTIFACT_BUILDER_MISSING",
        "Production artifact builder adapter is not available yet.",
      ),
    );
  }

  if (target.platform === "macos") {
    if (!target.macosIdentity) {
      gates.push(
        gate(
          "MACOS_IDENTITY_INVALID",
          "macOS standalone release requires an independent Bundle ID / App ID identity.",
        ),
      );
    } else {
      const identityIssues = validateMacOsStandaloneIdentity(
        target.macosIdentity,
      );
      if (identityIssues.length > 0) {
        gates.push(
          gate(
            "MACOS_IDENTITY_INVALID",
            "macOS standalone identity does not pass release validation.",
            "blocker",
            identityIssues,
          ),
        );
      }
      if (
        input.signing?.applicationCertificateKind !==
        target.macosIdentity.signingCertificateKind
      ) {
        gates.push(
          gate(
            "APPLICATION_SIGNING_MISSING",
            "macOS release must bind the expected application signing identity before packaging.",
          ),
        );
      }
      if (
        target.macosIdentity.notarizationRequired &&
        !input.signing?.notarizationConfigured
      ) {
        gates.push(
          gate(
            "MACOS_NOTARIZATION_MISSING",
            "macOS Developer ID release must configure notarization before release.",
          ),
        );
      }
    }
  }

  if (!hasUpdaterConfig(input)) {
    gates.push(
      gate(
        "UPDATER_CONFIG_MISSING",
        "Standalone release must include an Electron update feed endpoint before production release.",
      ),
    );
  }
  if (!hasRollbackPlan(input)) {
    gates.push(
      gate(
        "ROLLBACK_PLAN_MISSING",
        "Stable standalone release must include a rollback strategy and previous release reference.",
      ),
    );
  }

  const blockers = gates.filter((item) => item.severity === "blocker");
  const warnings = gates.filter((item) => item.severity === "warning");

  return {
    schemaVersion: 1,
    appId: descriptor.shell.appId,
    channel: input.channel,
    target,
    descriptorHash: descriptor.descriptorHash,
    signing: {
      applicationCertificateKind: input.signing?.applicationCertificateKind,
      notarizationConfigured: Boolean(input.signing?.notarizationConfigured),
      notarizationProfileRef: input.signing?.notarizationProfileRef,
    },
    updater: {
      enabled: Boolean(input.updater?.enabled),
      endpointConfigured: Boolean(input.updater?.endpoint?.trim()),
      endpoint: input.updater?.endpoint,
    },
    rollback: {
      required: input.channel === "stable",
      configured: hasRollbackPlan(input),
      strategy: input.rollback?.strategy,
      previousDescriptorHash: input.rollback?.previousDescriptorHash,
      previousPackageHash: input.rollback?.previousPackageHash,
    },
    productionReady: false,
    gates,
    blockers,
    warnings,
  };
}
