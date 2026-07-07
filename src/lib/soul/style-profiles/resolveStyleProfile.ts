import { DEFAULT_SOUL_STYLE_PROFILE_ID } from "./builtInProfiles";
import { evaluateStyleBoundary } from "./evaluateStyleBoundary";
import {
  DEFAULT_SOUL_STYLE_PROFILE_REGISTRY,
  type SoulStyleProfileRegistry,
} from "./registry";
import type {
  ResolvedSoulStyleProfile,
  SoulStyleIntensity,
  SoulStyleProfileContext,
  SoulStyleProfileId,
} from "./types";

const STYLE_INTENSITIES: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
]);

const STYLE_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

export function isSoulStyleProfileId(
  value: unknown,
): value is SoulStyleProfileId {
  return typeof value === "string" && STYLE_PROFILE_ID_PATTERN.test(value);
}

export function normalizeSoulStyleProfileId(
  value: unknown,
): SoulStyleProfileId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return isSoulStyleProfileId(normalized) ? normalized : undefined;
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
  registry: SoulStyleProfileRegistry = DEFAULT_SOUL_STYLE_PROFILE_REGISTRY,
): ResolvedSoulStyleProfile {
  const requestedProfileId = normalizeSoulStyleProfileId(
    context.styleProfileId,
  );
  const boundary = evaluateStyleBoundary(context);
  const profileId =
    boundary.forceProfileId ??
    requestedProfileId ??
    DEFAULT_SOUL_STYLE_PROFILE_ID;
  const profile =
    registry.findProfile(profileId) ?? registry.getFallbackProfile();

  return {
    requestedProfileId,
    profile,
    intensity:
      normalizeSoulStyleIntensity(context.styleIntensity) ?? profile.intensity,
    reason: boundary.reason,
    bypassInteractionStyle: boundary.bypassInteractionStyle,
  };
}
