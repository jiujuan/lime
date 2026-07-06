import { resolveSoulStyleProfile } from "./resolveStyleProfile";
import type {
  SoulStyleDirectives,
  SoulStyleFewShotAnchor,
  SoulStyleProfileContext,
  SoulStyleSurfaceContract,
} from "./types";

function surfaceContractLines(
  contracts: Partial<Record<SoulStyleSurfaceContract, string[]>>,
): string[] {
  return Object.entries(contracts).flatMap(([surface, rules]) =>
    (rules ?? []).map((rule) => `${surface}: ${rule}`),
  );
}

function fewShotLines(anchors: SoulStyleFewShotAnchor[]): string[] {
  return anchors.map(
    (anchor) => `${anchor.surface} / ${anchor.intent}: ${anchor.example}`,
  );
}

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
    responseContract: profile.responseContract,
    voicePrimitives: profile.voicePrimitives,
    surfaceContracts: profile.surfaceContracts,
    allowedMoves: profile.allowedMoves,
    forbiddenMoves: profile.forbiddenMoves,
    antiRepetitionRules: profile.antiRepetitionRules,
    fewShotAnchors: profile.fewShotAnchors,
    defaultUseCases: profile.defaultUseCases,
    riskFallback: profile.riskFallback,
    seriousModeFallback: profile.seriousModeFallback,
    promptLines: [
      `Style pack: ${profile.packId}`,
      `Style profile: ${profile.id}`,
      `Tone: ${profile.tone}`,
      `Intensity: ${intensity}`,
      `Response contract: ${profile.responseContract.join(" | ")}`,
      `Voice primitives: ${profile.voicePrimitives.join(" | ")}`,
      `Surface contracts: ${surfaceContractLines(profile.surfaceContracts).join(" | ")}`,
      `Allowed moves: ${profile.allowedMoves.join(" | ")}`,
      `Forbidden moves: ${profile.forbiddenMoves.join(" | ")}`,
      `Anti-repetition rules: ${profile.antiRepetitionRules.join(" | ")}`,
      `Few-shot anchors: ${fewShotLines(profile.fewShotAnchors).join(" | ")}`,
      `Risk fallback: ${profile.riskFallback.profileId} when ${profile.riskFallback.triggers.join(" | ")}`,
      `Serious mode fallback: ${profile.seriousModeFallback}`,
    ],
  };
}
