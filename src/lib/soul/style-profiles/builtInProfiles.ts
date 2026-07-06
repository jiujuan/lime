import calmProfessionalPartnerPack from "./packs/calm-professional-partner.json";
import cheekySassyExecutorPack from "./packs/cheeky-sassy-executor.json";
import coolConfidentOperatorPack from "./packs/cool-confident-operator.json";
import warmSupportiveCompanionPack from "./packs/warm-supportive-companion.json";
import type {
  SoulStylePackManifest,
  SoulStyleProfile,
  SoulStyleProfileId,
} from "./types";

export const DEFAULT_SOUL_STYLE_PROFILE_ID: SoulStyleProfileId =
  "cheeky_sassy_executor";
export const SERIOUS_SOUL_STYLE_PROFILE_ID: SoulStyleProfileId =
  "calm_professional_partner";

const BUILT_IN_SOUL_STYLE_PACK_MANIFESTS = [
  cheekySassyExecutorPack,
  warmSupportiveCompanionPack,
  coolConfidentOperatorPack,
  calmProfessionalPartnerPack,
] as const;

function toSoulStylePackManifest(manifest: unknown): SoulStylePackManifest {
  assertSoulStylePackManifest(manifest);
  return manifest;
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
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`Invalid Soul style pack manifest: ${path}`);
  }
}

function assertSoulStylePackManifest(
  value: unknown,
): asserts value is SoulStylePackManifest {
  if (!isRecord(value)) {
    throw new Error("Invalid Soul style pack manifest: root");
  }

  assertString(value.id, "id");
  assertString(value.version, "version");
  if (value.source !== "built_in") {
    throw new Error("Invalid Soul style pack manifest: source");
  }
  assertString(value.nameKey, "nameKey");
  assertString(value.descriptionKey, "descriptionKey");

  const compatibility = value.compatibility;
  if (!isRecord(compatibility) || compatibility.schemaVersion !== 1) {
    throw new Error("Invalid Soul style pack manifest: compatibility");
  }

  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    throw new Error("Invalid Soul style pack manifest: profiles");
  }

  for (const [index, profile] of value.profiles.entries()) {
    const profilePath = `profiles[${index}]`;
    if (!isRecord(profile)) {
      throw new Error(`Invalid Soul style pack manifest: ${profilePath}`);
    }
    assertString(profile.id, `${profilePath}.id`);
    assertString(profile.packId, `${profilePath}.packId`);
    if (profile.packId !== value.id) {
      throw new Error(
        `Invalid Soul style pack manifest: ${profilePath}.packId`,
      );
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
    assertStringArray(
      profile.voicePrimitives,
      `${profilePath}.voicePrimitives`,
    );
    assertStringArray(profile.allowedMoves, `${profilePath}.allowedMoves`);
    assertStringArray(profile.forbiddenMoves, `${profilePath}.forbiddenMoves`);
    assertStringArray(
      profile.antiRepetitionRules,
      `${profilePath}.antiRepetitionRules`,
    );
    assertStringArray(
      profile.defaultUseCases,
      `${profilePath}.defaultUseCases`,
    );
    if (!isRecord(profile.surfaceContracts)) {
      throw new Error(
        `Invalid Soul style pack manifest: ${profilePath}.surfaceContracts`,
      );
    }
    if (!Array.isArray(profile.fewShotAnchors)) {
      throw new Error(
        `Invalid Soul style pack manifest: ${profilePath}.fewShotAnchors`,
      );
    }
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
}

export const BUILT_IN_SOUL_STYLE_PACKS: readonly SoulStylePackManifest[] =
  BUILT_IN_SOUL_STYLE_PACK_MANIFESTS.map((manifest) =>
    toSoulStylePackManifest(manifest),
  );

export const BUILT_IN_SOUL_STYLE_PROFILES: readonly SoulStyleProfile[] =
  BUILT_IN_SOUL_STYLE_PACKS.flatMap((pack) => pack.profiles);

export const BUILT_IN_SOUL_STYLE_PACK_IDS: Readonly<
  Record<SoulStyleProfileId, string>
> = Object.freeze(
  Object.fromEntries(
    BUILT_IN_SOUL_STYLE_PROFILES.map((profile) => [profile.id, profile.packId]),
  ),
);

const BUILT_IN_SOUL_STYLE_PROFILE_BY_ID = new Map(
  BUILT_IN_SOUL_STYLE_PROFILES.map((profile) => [profile.id, profile]),
);

export function getBuiltInSoulStyleProfile(
  profileId: SoulStyleProfileId,
): SoulStyleProfile {
  return (
    BUILT_IN_SOUL_STYLE_PROFILE_BY_ID.get(profileId) ??
    BUILT_IN_SOUL_STYLE_PROFILE_BY_ID.get(DEFAULT_SOUL_STYLE_PROFILE_ID) ??
    BUILT_IN_SOUL_STYLE_PROFILES[0]
  );
}
