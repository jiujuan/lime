import calmProfessionalPartnerPack from "./packs/calm-professional-partner.json";
import cheekySassyExecutorPack from "./packs/cheeky-sassy-executor.json";
import coolConfidentOperatorPack from "./packs/cool-confident-operator.json";
import warmSupportiveCompanionPack from "./packs/warm-supportive-companion.json";
import { toSoulStylePackManifest } from "./manifest";
import type { SoulStylePackManifest, SoulStyleProfileId } from "./types";

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

export const BUILT_IN_SOUL_STYLE_PACKS: readonly SoulStylePackManifest[] =
  BUILT_IN_SOUL_STYLE_PACK_MANIFESTS.map((manifest) =>
    toSoulStylePackManifest(manifest, { allowedSources: ["built_in"] }),
  );
