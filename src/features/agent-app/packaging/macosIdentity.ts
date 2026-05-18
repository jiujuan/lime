export type MacOsSigningCertificateKind =
  | "developer_id_application"
  | "apple_distribution"
  | "ad_hoc"
  | "unsigned";

export interface MacOsStandaloneIdentity {
  platform: "macos";
  teamId: string;
  bundleId: string;
  appId: string;
  appGroups: string[];
  keychainAccessGroups: string[];
  signingCertificateKind: MacOsSigningCertificateKind;
  installerCertificateKind?: "developer_id_installer";
  notarizationRequired: boolean;
}

export interface MacOsStandaloneIdentityInput {
  teamId: string;
  bundleId: string;
  appGroups?: string[];
  keychainAccessGroups?: string[];
  signingCertificateKind?: MacOsSigningCertificateKind;
  installerCertificateKind?: "developer_id_installer";
  notarizationRequired?: boolean;
}

export interface MacOsIdentityValidationOptions {
  desktopBundleIds?: string[];
  requiresInstallerCertificate?: boolean;
}

export interface MacOsIdentityValidationIssue {
  code:
    | "MACOS_APP_ID_MISMATCH"
    | "MACOS_APP_GROUP_INVALID"
    | "MACOS_BUNDLE_ID_INVALID"
    | "MACOS_BUNDLE_ID_REUSES_DESKTOP"
    | "MACOS_INSTALLER_CERTIFICATE_MISSING"
    | "MACOS_KEYCHAIN_GROUP_TEAM_MISMATCH"
    | "MACOS_NOTARIZATION_REQUIRED"
    | "MACOS_SHARED_GROUP_TEAM_MISMATCH"
    | "MACOS_SIGNING_CERTIFICATE_UNSAFE"
    | "MACOS_TEAM_ID_MISSING";
  message: string;
}

export const DEFAULT_LIME_DESKTOP_BUNDLE_IDS = [
  "com.limecloud.lime",
  "com.limecloud.lime.headless",
];

const BUNDLE_ID_PATTERN = /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/;

export function buildMacOsStandaloneIdentity(
  input: MacOsStandaloneIdentityInput,
): MacOsStandaloneIdentity {
  const teamId = input.teamId.trim();
  const bundleId = input.bundleId.trim();
  return {
    platform: "macos",
    teamId,
    bundleId,
    appId: teamId && bundleId ? `${teamId}.${bundleId}` : "",
    appGroups: input.appGroups ?? [],
    keychainAccessGroups: input.keychainAccessGroups ?? [],
    signingCertificateKind:
      input.signingCertificateKind ?? "developer_id_application",
    installerCertificateKind: input.installerCertificateKind,
    notarizationRequired: input.notarizationRequired ?? true,
  };
}

export function validateMacOsStandaloneIdentity(
  identity: MacOsStandaloneIdentity,
  options: MacOsIdentityValidationOptions = {},
): MacOsIdentityValidationIssue[] {
  const issues: MacOsIdentityValidationIssue[] = [];
  const desktopBundleIds =
    options.desktopBundleIds ?? DEFAULT_LIME_DESKTOP_BUNDLE_IDS;
  const expectedAppId =
    identity.teamId && identity.bundleId
      ? `${identity.teamId}.${identity.bundleId}`
      : "";

  if (!identity.teamId.trim()) {
    issues.push({
      code: "MACOS_TEAM_ID_MISSING",
      message: "macOS standalone identity must include the Apple Developer Team ID.",
    });
  }
  if (!BUNDLE_ID_PATTERN.test(identity.bundleId)) {
    issues.push({
      code: "MACOS_BUNDLE_ID_INVALID",
      message: "macOS standalone identity must use a reverse-DNS bundle id.",
    });
  }
  if (desktopBundleIds.includes(identity.bundleId)) {
    issues.push({
      code: "MACOS_BUNDLE_ID_REUSES_DESKTOP",
      message:
        "Standalone Agent App must not reuse the Lime Desktop bundle id.",
    });
  }
  if (identity.appId !== expectedAppId) {
    issues.push({
      code: "MACOS_APP_ID_MISMATCH",
      message: "macOS App ID must be Team ID + Bundle ID.",
    });
  }
  if (
    identity.signingCertificateKind === "unsigned" ||
    identity.signingCertificateKind === "ad_hoc"
  ) {
    issues.push({
      code: "MACOS_SIGNING_CERTIFICATE_UNSAFE",
      message:
        "unsigned or ad_hoc signing is only valid for dev descriptors, not production standalone release.",
    });
  }
  if (
    identity.signingCertificateKind === "developer_id_application" &&
    !identity.notarizationRequired
  ) {
    issues.push({
      code: "MACOS_NOTARIZATION_REQUIRED",
      message:
        "Developer ID distribution should require notarization for production macOS release.",
    });
  }
  if (
    options.requiresInstallerCertificate &&
    identity.installerCertificateKind !== "developer_id_installer"
  ) {
    issues.push({
      code: "MACOS_INSTALLER_CERTIFICATE_MISSING",
      message:
        "pkg distribution requires a Developer ID Installer signing identity.",
    });
  }

  for (const group of identity.appGroups) {
    if (group && !group.startsWith("group.")) {
      issues.push({
        code: "MACOS_APP_GROUP_INVALID",
        message: "App Group identifiers must use the group.* namespace.",
      });
      break;
    }
  }

  for (const group of identity.keychainAccessGroups) {
    if (group && identity.teamId && !group.startsWith(`${identity.teamId}.`)) {
      issues.push({
        code: "MACOS_KEYCHAIN_GROUP_TEAM_MISMATCH",
        message:
          "Keychain Access Group must stay under the same Apple Team boundary.",
      });
      break;
    }
  }

  return issues;
}
