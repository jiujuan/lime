export type SoulStyleProfileId = string;

export type SoulStyleTone = string;

export type SoulStyleProfileScope =
  | "chat_interaction"
  | "tool_narrative"
  | "companion"
  | "artifact_voice";

export type SoulStyleSurfaceContract =
  | "before_tool"
  | "tool_running"
  | "after_tool_success"
  | "after_tool_partial_failure"
  | "after_tool_failure"
  | "body_detail"
  | "closing_suggestion";

export type SoulStylePackSource =
  | "built_in"
  | "local_import"
  | "cloud_download";

export interface SoulStyleFewShotAnchor {
  surface: SoulStyleSurfaceContract;
  intent: string;
  example: string;
}

export interface SoulStyleRiskFallback {
  profileId: SoulStyleProfileId;
  triggers: string[];
}

export interface SoulStyleProfile {
  id: SoulStyleProfileId;
  packId: string;
  nameKey: string;
  descriptionKey: string;
  tone: SoulStyleTone;
  scopes: SoulStyleProfileScope[];
  responseContract: string[];
  voicePrimitives: string[];
  surfaceContracts: Partial<Record<SoulStyleSurfaceContract, string[]>>;
  allowedMoves: string[];
  forbiddenMoves: string[];
  antiRepetitionRules: string[];
  fewShotAnchors: SoulStyleFewShotAnchor[];
  defaultUseCases: string[];
  riskFallback: SoulStyleRiskFallback;
  seriousModeFallback: SoulStyleProfileId;
}

export interface SoulStylePackManifest {
  id: string;
  version: string;
  source: SoulStylePackSource;
  nameKey: string;
  descriptionKey: string;
  profiles: readonly SoulStyleProfile[];
  compatibility: {
    minAppVersion?: string;
    schemaVersion: 1;
  };
  integrity?: {
    signature?: string;
    digest?: string;
  };
}

export interface SoulStyleProfileContext {
  styleProfileId?: string | null;
  highRisk?: boolean;
  dangerousOperation?: boolean;
  formalArtifact?: boolean;
}

export type SoulStyleBoundaryReason =
  | "selected"
  | "default"
  | "serious_mode_fallback"
  | "formal_artifact_bypass";

export interface SoulStyleBoundaryResult {
  bypassInteractionStyle: boolean;
  forceProfileId?: SoulStyleProfileId;
  reason: SoulStyleBoundaryReason;
}

export interface ResolvedSoulStyleProfile {
  requestedProfileId?: SoulStyleProfileId;
  profile: SoulStyleProfile;
  reason: SoulStyleBoundaryReason;
  bypassInteractionStyle: boolean;
}

export interface SoulStyleDirectives {
  profileId: SoulStyleProfileId;
  packId: string;
  tone: SoulStyleTone;
  scopes: SoulStyleProfileScope[];
  responseContract: string[];
  voicePrimitives: string[];
  surfaceContracts: Partial<Record<SoulStyleSurfaceContract, string[]>>;
  allowedMoves: string[];
  forbiddenMoves: string[];
  antiRepetitionRules: string[];
  fewShotAnchors: SoulStyleFewShotAnchor[];
  defaultUseCases: string[];
  riskFallback: SoulStyleRiskFallback;
  seriousModeFallback: SoulStyleProfileId;
  promptLines: string[];
}
