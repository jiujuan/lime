import type {
  SoulStylePackManifest,
  SoulStylePackSource,
  SoulStyleSurfaceContract,
} from "./types";

const TRANSCRIPT_SURFACES: readonly SoulStyleSurfaceContract[] = [
  "before_tool",
  "tool_running",
  "after_tool_success",
  "after_tool_partial_failure",
  "after_tool_failure",
  "body_detail",
  "closing_suggestion",
];

const ALL_STYLE_PACK_SOURCES: readonly SoulStylePackSource[] = [
  "built_in",
  "local_import",
  "cloud_download",
];

export interface SoulStylePackManifestValidationOptions {
  allowedSources?: readonly SoulStylePackSource[];
  requireIntegrityForInstalled?: boolean;
}

export function toSoulStylePackManifest(
  manifest: unknown,
  options: SoulStylePackManifestValidationOptions = {},
): SoulStylePackManifest {
  assertSoulStylePackManifest(manifest, options);
  return manifest;
}

export function assertSoulStylePackManifest(
  value: unknown,
  options: SoulStylePackManifestValidationOptions = {},
): asserts value is SoulStylePackManifest {
  const allowedSources = options.allowedSources ?? ALL_STYLE_PACK_SOURCES;

  if (!isRecord(value)) {
    throw new Error("Invalid Soul style pack manifest: root");
  }

  assertString(value.id, "id");
  assertString(value.version, "version");
  if (!isSoulStylePackSource(value.source)) {
    throw new Error("Invalid Soul style pack manifest: source");
  }
  if (!allowedSources.includes(value.source)) {
    throw new Error("Invalid Soul style pack manifest: source");
  }
  assertString(value.nameKey, "nameKey");
  assertString(value.descriptionKey, "descriptionKey");

  const compatibility = value.compatibility;
  if (!isRecord(compatibility) || compatibility.schemaVersion !== 1) {
    throw new Error("Invalid Soul style pack manifest: compatibility");
  }

  if (value.source !== "built_in" && options.requireIntegrityForInstalled) {
    const integrity = value.integrity;
    if (!isRecord(integrity)) {
      throw new Error("Invalid Soul style pack manifest: integrity");
    }
    assertString(integrity.digest, "integrity.digest");
  }

  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    throw new Error("Invalid Soul style pack manifest: profiles");
  }

  const profileIds = new Set<string>();
  for (const [index, profile] of value.profiles.entries()) {
    const profilePath = `profiles[${index}]`;
    assertProfile(profile, value.id, profilePath);
    if (profileIds.has(profile.id)) {
      throw new Error(`Invalid Soul style pack manifest: ${profilePath}.id`);
    }
    profileIds.add(profile.id);
  }
}

function assertProfile(
  profile: unknown,
  packId: string,
  profilePath: string,
): asserts profile is SoulStylePackManifest["profiles"][number] {
  if (!isRecord(profile)) {
    throw new Error(`Invalid Soul style pack manifest: ${profilePath}`);
  }
  assertString(profile.id, `${profilePath}.id`);
  assertString(profile.packId, `${profilePath}.packId`);
  if (profile.packId !== packId) {
    throw new Error(`Invalid Soul style pack manifest: ${profilePath}.packId`);
  }
  assertString(profile.nameKey, `${profilePath}.nameKey`);
  assertString(profile.descriptionKey, `${profilePath}.descriptionKey`);
  assertString(profile.tone, `${profilePath}.tone`);
  if (
    profile.intensity !== "low" &&
    profile.intensity !== "medium" &&
    profile.intensity !== "high"
  ) {
    throw new Error(
      `Invalid Soul style pack manifest: ${profilePath}.intensity`,
    );
  }
  assertStringArray(profile.scopes, `${profilePath}.scopes`);
  assertStringArray(
    profile.responseContract,
    `${profilePath}.responseContract`,
  );
  assertStringArray(profile.voicePrimitives, `${profilePath}.voicePrimitives`);
  assertStringArray(profile.allowedMoves, `${profilePath}.allowedMoves`);
  assertStringArray(profile.forbiddenMoves, `${profilePath}.forbiddenMoves`);
  assertStringArray(
    profile.antiRepetitionRules,
    `${profilePath}.antiRepetitionRules`,
  );
  assertStringArray(profile.defaultUseCases, `${profilePath}.defaultUseCases`);
  assertSurfaceContracts(
    profile.surfaceContracts,
    `${profilePath}.surfaceContracts`,
  );
  assertFewShotAnchors(profile.fewShotAnchors, `${profilePath}.fewShotAnchors`);
  if (!isRecord(profile.riskFallback)) {
    throw new Error(
      `Invalid Soul style pack manifest: ${profilePath}.riskFallback`,
    );
  }
  assertString(
    profile.riskFallback.profileId,
    `${profilePath}.riskFallback.profileId`,
  );
  assertStringArray(
    profile.riskFallback.triggers,
    `${profilePath}.riskFallback.triggers`,
  );
  assertString(
    profile.seriousModeFallback,
    `${profilePath}.seriousModeFallback`,
  );
}

function assertSurfaceContracts(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new Error(`Invalid Soul style pack manifest: ${path}`);
  }
  for (const surface of TRANSCRIPT_SURFACES) {
    assertStringArray(value[surface], `${path}.${surface}`);
  }
}

function assertFewShotAnchors(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid Soul style pack manifest: ${path}`);
  }
  for (const [index, anchor] of value.entries()) {
    const anchorPath = `${path}[${index}]`;
    if (!isRecord(anchor)) {
      throw new Error(`Invalid Soul style pack manifest: ${anchorPath}`);
    }
    assertString(anchor.surface, `${anchorPath}.surface`);
    assertString(anchor.intent, `${anchorPath}.intent`);
    assertString(anchor.example, `${anchorPath}.example`);
  }
}

function isSoulStylePackSource(value: unknown): value is SoulStylePackSource {
  return (
    value === "built_in" ||
    value === "local_import" ||
    value === "cloud_download"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid Soul style pack manifest: ${path}`);
  }
}

function assertStringArray(
  value: unknown,
  path: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`Invalid Soul style pack manifest: ${path}`);
  }
}
