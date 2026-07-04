import { SERIOUS_SOUL_STYLE_PROFILE_ID } from "./builtInProfiles";
import type {
  SoulStyleBoundaryResult,
  SoulStyleProfileContext,
} from "./types";

export function evaluateStyleBoundary(
  context: SoulStyleProfileContext = {},
): SoulStyleBoundaryResult {
  if (context.formalArtifact) {
    return {
      bypassInteractionStyle: true,
      reason: "formal_artifact_bypass",
    };
  }

  if (context.highRisk || context.dangerousOperation) {
    return {
      bypassInteractionStyle: false,
      forceProfileId: SERIOUS_SOUL_STYLE_PROFILE_ID,
      reason: "serious_mode_fallback",
    };
  }

  return {
    bypassInteractionStyle: false,
    reason: context.styleProfileId ? "selected" : "default",
  };
}
