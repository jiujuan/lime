import {
  BUILT_IN_SOUL_STYLE_PACKS,
  DEFAULT_SOUL_STYLE_PROFILE_ID,
} from "./builtInProfiles";
import { toSoulStylePackManifest } from "./manifest";
import type {
  SoulStylePackManifest,
  SoulStyleProfile,
  SoulStyleProfileId,
} from "./types";

export interface SoulStyleProfileRegistry {
  packs: readonly SoulStylePackManifest[];
  profiles: readonly SoulStyleProfile[];
  packIds: Readonly<Record<SoulStyleProfileId, string>>;
  findProfile(profileId: SoulStyleProfileId): SoulStyleProfile | undefined;
  getFallbackProfile(): SoulStyleProfile;
}

export interface CreateSoulStyleProfileRegistryOptions {
  installedPackManifests?: readonly unknown[];
}

export const DEFAULT_SOUL_STYLE_PROFILE_REGISTRY =
  createSoulStyleProfileRegistry();

export function createSoulStyleProfileRegistry(
  options: CreateSoulStyleProfileRegistryOptions = {},
): SoulStyleProfileRegistry {
  const installedPacks = (options.installedPackManifests ?? []).map(
    (manifest) =>
      toSoulStylePackManifest(manifest, {
        allowedSources: ["local_import", "cloud_download"],
        requireIntegrityForInstalled: true,
      }),
  );
  return buildSoulStyleProfileRegistry([
    ...BUILT_IN_SOUL_STYLE_PACKS,
    ...installedPacks,
  ]);
}

function buildSoulStyleProfileRegistry(
  packs: readonly SoulStylePackManifest[],
): SoulStyleProfileRegistry {
  const packIds = new Set<string>();
  const profileById = new Map<SoulStyleProfileId, SoulStyleProfile>();

  for (const pack of packs) {
    if (packIds.has(pack.id)) {
      throw new Error(`Duplicate Soul style pack id: ${pack.id}`);
    }
    packIds.add(pack.id);
    for (const profile of pack.profiles) {
      if (profileById.has(profile.id)) {
        throw new Error(`Duplicate Soul style profile id: ${profile.id}`);
      }
      profileById.set(profile.id, profile);
    }
  }

  const profiles = Array.from(profileById.values());
  const fallbackProfile =
    profileById.get(DEFAULT_SOUL_STYLE_PROFILE_ID) ?? profiles[0];
  if (!fallbackProfile) {
    throw new Error("Soul style registry is missing fallback profile");
  }

  return Object.freeze({
    packs: Object.freeze([...packs]),
    profiles: Object.freeze(profiles),
    packIds: Object.freeze(
      Object.fromEntries(
        profiles.map((profile) => [profile.id, profile.packId]),
      ),
    ),
    findProfile(profileId: SoulStyleProfileId) {
      return profileById.get(profileId);
    },
    getFallbackProfile() {
      return fallbackProfile;
    },
  });
}
