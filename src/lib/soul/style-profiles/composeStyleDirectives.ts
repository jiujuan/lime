import { resolveSoulStyleProfile } from "./resolveStyleProfile";
import type {
  SoulStyleDirectives,
  SoulStyleProfileContext,
} from "./types";

export function composeStyleDirectives(
  context: SoulStyleProfileContext = {},
): SoulStyleDirectives | null {
  const resolved = resolveSoulStyleProfile(context);
  if (resolved.bypassInteractionStyle) {
    return null;
  }

  const { profile, intensity } = resolved;
  return {
    profileId: profile.id,
    packId: profile.packId,
    tone: profile.tone,
    intensity,
    scopes: profile.scopes,
    allowedMoves: profile.allowedMoves,
    forbiddenMoves: profile.forbiddenMoves,
    defaultUseCases: profile.defaultUseCases,
    seriousModeFallback: profile.seriousModeFallback,
    promptLines: [
      `Style pack: ${profile.packId}`,
      `Style profile: ${profile.id}`,
      `Tone: ${profile.tone}`,
      `Intensity: ${intensity}`,
      `Allowed moves: ${profile.allowedMoves.join(" | ")}`,
      `Forbidden moves: ${profile.forbiddenMoves.join(" | ")}`,
      `Serious mode fallback: ${profile.seriousModeFallback}`,
    ],
  };
}
