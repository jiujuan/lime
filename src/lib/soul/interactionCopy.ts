import { resolveRequiredAgentChatCopy } from "@/i18n/agentChatCopy";
import type { MemorySoulConfig } from "@/lib/api/memoryConfigTypes";
import { normalizeSoulConfig } from "./soulConfig";
import { resolveSoulStyleProfile } from "./style-profiles";
import type {
  SoulStyleProfileContext,
  SoulStyleProfileId,
  SoulStyleTone,
} from "./style-profiles";

export type SoulStyleLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type SoulInteractionSurface =
  | "home_pending_preview"
  | "initial_runtime_status"
  | "waiting_runtime_status"
  | "initial_dispatch_preview"
  | "collaboration_runtime"
  | "failure_recovery";

export type SoulInteractionPhase =
  | "preparing"
  | "routing"
  | "queued"
  | "collaboration_ready"
  | "collaboration_preparing"
  | "failed";

const SOUL_INTERACTION_TONE_VARIANTS = [
  "cheeky_sassy",
  "warm_supportive",
  "cool_confident",
] as const;

type SoulInteractionProfileTone =
  (typeof SOUL_INTERACTION_TONE_VARIANTS)[number];

export type SoulInteractionToneVariant = "neutral" | SoulInteractionProfileTone;

export interface SoulInteractionCopyOptions extends SoulStyleProfileContext {
  soul?: MemorySoulConfig | null;
}

export interface SoulCopyDescriptor {
  key: string;
  values?: Record<string, string | number | boolean>;
  surface: SoulInteractionSurface;
  phase: SoulInteractionPhase;
  styleLevel: SoulStyleLevel;
  riskLevel: "normal" | "high";
  toneVariant: SoulInteractionToneVariant;
  profileId?: SoulStyleProfileId;
  packId?: string;
}

export interface SoulInteractionCopyDescriptors {
  preparingTitle: SoulCopyDescriptor;
  preparingDetail: SoulCopyDescriptor;
  preparingCheckpoints: SoulCopyDescriptor[];
  initialRuntimeTitle: SoulCopyDescriptor;
  initialRuntimeDetail: SoulCopyDescriptor;
  initialRuntimeCheckpoints: SoulCopyDescriptor[];
  waitingRuntimeTitle: SoulCopyDescriptor;
  waitingRuntimeDetail: SoulCopyDescriptor;
  waitingRuntimeCheckpoints: SoulCopyDescriptor[];
  initialDispatchWaiting: SoulCopyDescriptor;
  subagentsReadyTitle: SoulCopyDescriptor;
  subagentsReadyContent: (teamLabel: string) => SoulCopyDescriptor;
  subagentsPreparingContent: SoulCopyDescriptor;
  failurePrefix: SoulCopyDescriptor;
}

export interface SoulInteractionCopy {
  preparingTitle: string;
  preparingDetail: string;
  preparingCheckpoints: string[];
  initialRuntimeTitle: string;
  initialRuntimeDetail: string;
  initialRuntimeCheckpoints: string[];
  waitingRuntimeTitle: string;
  waitingRuntimeDetail: string;
  waitingRuntimeCheckpoints: string[];
  initialDispatchWaiting: string;
  subagentsReadyTitle: string;
  subagentsReadyContent: (teamLabel: string) => string;
  subagentsPreparingContent: string;
  failurePrefix: string;
  descriptors: SoulInteractionCopyDescriptors;
}

interface DescriptorOptions {
  keyPrefix?: string;
  surface: SoulInteractionSurface;
  phase: SoulInteractionPhase;
  styleLevel: SoulStyleLevel;
  riskLevel: "normal" | "high";
  toneVariant: SoulInteractionToneVariant;
  profileId?: SoulStyleProfileId;
  packId?: string;
  values?: Record<string, string | number | boolean>;
}

function descriptor(
  toneVariant: SoulInteractionToneVariant,
  name: string,
  options: Omit<DescriptorOptions, "toneVariant">,
): SoulCopyDescriptor {
  const { keyPrefix = "soulInteraction.neutral", ...descriptorOptions } =
    options;
  return {
    key: `${keyPrefix}.${name}`,
    ...descriptorOptions,
    toneVariant,
  };
}

function checkpointDescriptors(params: {
  toneVariant: SoulInteractionToneVariant;
  profileId?: SoulStyleProfileId;
  packId?: string;
  group: string;
  count: number;
  surface: SoulInteractionSurface;
  phase: SoulInteractionPhase;
  styleLevel: SoulStyleLevel;
  riskLevel: "normal" | "high";
}): SoulCopyDescriptor[] {
  return Array.from({ length: params.count }, (_, index) =>
    descriptor(params.toneVariant, `${params.group}.checkpoints.${index}`, {
      surface: params.surface,
      phase: params.phase,
      styleLevel: params.styleLevel,
      riskLevel: params.riskLevel,
      profileId: params.profileId,
      packId: params.packId,
    }),
  );
}

function resolveInteractionStyleMetadata(
  options: SoulInteractionCopyOptions,
): Pick<SoulCopyDescriptor, "toneVariant" | "profileId" | "packId"> {
  const soul = normalizeSoulConfig(options.soul);
  if (!soul.enabled) {
    return { toneVariant: "neutral" };
  }

  const resolved = resolveSoulStyleProfile({
    styleProfileId: soul.style_profile_id,
    styleIntensity: soul.style_intensity,
    highRisk: options.highRisk,
    dangerousOperation: options.dangerousOperation,
    formalArtifact: options.formalArtifact,
  });

  if (
    resolved.bypassInteractionStyle ||
    resolved.profile.tone === "calm_professional"
  ) {
    return {
      toneVariant: "neutral",
      profileId: resolved.profile.id,
      packId: resolved.profile.packId,
    };
  }

  return {
    toneVariant: resolveInteractionToneVariant(resolved.profile.tone),
    profileId: resolved.profile.id,
    packId: resolved.profile.packId,
  };
}

function resolveInteractionToneVariant(
  tone: SoulStyleTone,
): SoulInteractionToneVariant {
  return isInteractionProfileTone(tone) ? tone : "neutral";
}

function isInteractionProfileTone(
  tone: SoulStyleTone,
): tone is SoulInteractionProfileTone {
  return SOUL_INTERACTION_TONE_VARIANTS.includes(
    tone as SoulInteractionProfileTone,
  );
}

export function resolveSoulInteractionCopyDescriptors(
  options: SoulInteractionCopyOptions = {},
): SoulInteractionCopyDescriptors {
  const styleMetadata = resolveInteractionStyleMetadata(options);
  const { toneVariant, ...descriptorMetadata } = styleMetadata;
  const riskLevel =
    options.highRisk || options.dangerousOperation ? "high" : "normal";

  return {
    preparingTitle: descriptor(toneVariant, "preparing.title", {
      surface: "home_pending_preview",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    preparingDetail: descriptor(toneVariant, "preparing.detail", {
      surface: "home_pending_preview",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    preparingCheckpoints: checkpointDescriptors({
      toneVariant,
      group: "preparing",
      count: 3,
      surface: "home_pending_preview",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    initialRuntimeTitle: descriptor(toneVariant, "initialRuntime.title", {
      surface: "initial_runtime_status",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    initialRuntimeDetail: descriptor(toneVariant, "initialRuntime.detail", {
      surface: "initial_runtime_status",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    initialRuntimeCheckpoints: checkpointDescriptors({
      toneVariant,
      group: "initialRuntime",
      count: 3,
      surface: "initial_runtime_status",
      phase: "preparing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    waitingRuntimeTitle: descriptor(toneVariant, "waitingRuntime.title", {
      surface: "waiting_runtime_status",
      phase: "routing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    waitingRuntimeDetail: descriptor(toneVariant, "waitingRuntime.detail", {
      surface: "waiting_runtime_status",
      phase: "routing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    waitingRuntimeCheckpoints: checkpointDescriptors({
      toneVariant,
      group: "waitingRuntime",
      count: 4,
      surface: "waiting_runtime_status",
      phase: "routing",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    initialDispatchWaiting: descriptor(toneVariant, "initialDispatch.waiting", {
      surface: "initial_dispatch_preview",
      phase: "queued",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    subagentsReadyTitle: descriptor(toneVariant, "readyTitle", {
      keyPrefix: "collaboration.runtime",
      surface: "collaboration_runtime",
      phase: "collaboration_ready",
      styleLevel: "L1",
      riskLevel,
      ...descriptorMetadata,
    }),
    subagentsReadyContent: (teamLabel: string) =>
      descriptor(toneVariant, "readyContent", {
        keyPrefix: "collaboration.runtime",
        surface: "collaboration_runtime",
        phase: "collaboration_ready",
        styleLevel: "L1",
        riskLevel,
        ...descriptorMetadata,
        values: { teamLabel },
      }),
    subagentsPreparingContent: descriptor(
      toneVariant,
      "preparingContent",
      {
        keyPrefix: "collaboration.runtime",
        surface: "collaboration_runtime",
        phase: "collaboration_preparing",
        styleLevel: "L1",
        riskLevel,
        ...descriptorMetadata,
      },
    ),
    failurePrefix: descriptor(toneVariant, "failure.prefix", {
      keyPrefix: "runtime",
      surface: "failure_recovery",
      phase: "failed",
      styleLevel: riskLevel === "high" ? "L4" : "L2",
      riskLevel,
      ...descriptorMetadata,
    }),
  };
}

function renderDescriptor(descriptorValue: SoulCopyDescriptor): string {
  return resolveRequiredAgentChatCopy(
    descriptorValue.key,
    descriptorValue.values,
  );
}

export function resolveSoulInteractionCopy(
  options: SoulInteractionCopyOptions = {},
): SoulInteractionCopy {
  const descriptors = resolveSoulInteractionCopyDescriptors(options);

  return {
    preparingTitle: renderDescriptor(descriptors.preparingTitle),
    preparingDetail: renderDescriptor(descriptors.preparingDetail),
    preparingCheckpoints:
      descriptors.preparingCheckpoints.map(renderDescriptor),
    initialRuntimeTitle: renderDescriptor(descriptors.initialRuntimeTitle),
    initialRuntimeDetail: renderDescriptor(descriptors.initialRuntimeDetail),
    initialRuntimeCheckpoints:
      descriptors.initialRuntimeCheckpoints.map(renderDescriptor),
    waitingRuntimeTitle: renderDescriptor(descriptors.waitingRuntimeTitle),
    waitingRuntimeDetail: renderDescriptor(descriptors.waitingRuntimeDetail),
    waitingRuntimeCheckpoints:
      descriptors.waitingRuntimeCheckpoints.map(renderDescriptor),
    initialDispatchWaiting: renderDescriptor(
      descriptors.initialDispatchWaiting,
    ),
    subagentsReadyTitle: renderDescriptor(descriptors.subagentsReadyTitle),
    subagentsReadyContent: (teamLabel: string) =>
      renderDescriptor(descriptors.subagentsReadyContent(teamLabel)),
    subagentsPreparingContent: renderDescriptor(
      descriptors.subagentsPreparingContent,
    ),
    failurePrefix: renderDescriptor(descriptors.failurePrefix),
    descriptors,
  };
}
