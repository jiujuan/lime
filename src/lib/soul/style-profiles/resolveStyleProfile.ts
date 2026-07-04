import {
  BUILT_IN_SOUL_STYLE_PACK,
  DEFAULT_SOUL_STYLE_PROFILE_ID,
  getBuiltInSoulStyleProfile,
} from "./builtInProfiles";
import { evaluateStyleBoundary } from "./evaluateStyleBoundary";
import type {
  ResolvedSoulStyleProfile,
  SoulStyleIntensity,
  SoulStyleProfileContext,
  SoulStyleProfileId,
} from "./types";

const STYLE_PROFILE_IDS: ReadonlySet<string> = new Set(
  BUILT_IN_SOUL_STYLE_PACK.profiles.map((profile) => profile.id),
);

const STYLE_INTENSITIES: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
]);

const STYLE_PROFILE_ID_ALIASES: Readonly<Record<string, SoulStyleProfileId>> = {
  sassy_cute_executor: "cheeky_sassy_executor",
};

export function isSoulStyleProfileId(
  value: unknown,
): value is SoulStyleProfileId {
  return typeof value === "string" && STYLE_PROFILE_IDS.has(value);
}

export function normalizeSoulStyleProfileId(
  value: unknown,
): SoulStyleProfileId | undefined {
  if (isSoulStyleProfileId(value)) {
    return value;
  }
  return typeof value === "string" ? STYLE_PROFILE_ID_ALIASES[value] : undefined;
}

export function normalizeSoulStyleIntensity(
  value: unknown,
): SoulStyleIntensity | undefined {
  return typeof value === "string" && STYLE_INTENSITIES.has(value)
    ? (value as SoulStyleIntensity)
    : undefined;
}

export function resolveSoulStyleProfile(
  context: SoulStyleProfileContext = {},
): ResolvedSoulStyleProfile {
  const requestedProfileId = normalizeSoulStyleProfileId(
    context.styleProfileId,
  );
  const boundary = evaluateStyleBoundary(context);
  const profileId =
    boundary.forceProfileId ?? requestedProfileId ?? DEFAULT_SOUL_STYLE_PROFILE_ID;
  const profile = getBuiltInSoulStyleProfile(profileId);

  return {
    requestedProfileId,
    profile,
    intensity:
      normalizeSoulStyleIntensity(context.styleIntensity) ?? profile.intensity,
    reason: boundary.reason,
    bypassInteractionStyle: boundary.bypassInteractionStyle,
  };
}
