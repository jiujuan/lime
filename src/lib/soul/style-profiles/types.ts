export type SoulStyleProfileId =
  | "cheeky_sassy_executor"
  | "warm_supportive_companion"
  | "cool_confident_operator"
  | "calm_professional_partner";

export type SoulStyleIntensity = "low" | "medium" | "high";

export type SoulStyleTone =
  | "cheeky_sassy"
  | "warm_supportive"
  | "cool_confident"
  | "calm_professional";

export type SoulStyleProfileScope =
  | "chat_interaction"
  | "tool_narrative"
  | "companion"
  | "artifact_voice";

export type SoulStylePackSource =
  | "built_in"
  | "local_import"
  | "cloud_download";

export interface SoulStyleProfile {
  id: SoulStyleProfileId;
  packId: string;
  nameKey: string;
  descriptionKey: string;
  tone: SoulStyleTone;
  intensity: SoulStyleIntensity;
  scopes: SoulStyleProfileScope[];
  allowedMoves: string[];
  forbiddenMoves: string[];
  defaultUseCases: string[];
  seriousModeFallback: "calm_professional_partner";
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
  styleIntensity?: string | null;
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
  intensity: SoulStyleIntensity;
  reason: SoulStyleBoundaryReason;
  bypassInteractionStyle: boolean;
}

export interface SoulStyleDirectives {
  profileId: SoulStyleProfileId;
  packId: string;
  tone: SoulStyleTone;
  intensity: SoulStyleIntensity;
  scopes: SoulStyleProfileScope[];
  allowedMoves: string[];
  forbiddenMoves: string[];
  defaultUseCases: string[];
  seriousModeFallback: "calm_professional_partner";
  promptLines: string[];
}
