import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";

export type SoulToolLifecycleStatus =
  | "started"
  | "progress"
  | "output_delta"
  | "input_delta"
  | "completed"
  | "failed";

export interface SoulToolLifecycleDescriptor {
  surface: "tool_lifecycle";
  phase:
    | "before_tool"
    | "tool_progress"
    | "after_tool_success"
    | "after_tool_failure";
  status: SoulToolLifecycleStatus;
  styleLevel: "L1" | "L2" | "L4";
  riskLevel: "normal" | "high";
  toneVariant: string;
  profileId?: string;
  packId?: string;
}

export interface SoulToolLifecycleDescriptorOptions {
  soulCopy?: SoulInteractionCopy;
  status: SoulToolLifecycleStatus;
  highRisk?: boolean;
}

function resolvePhase(
  status: SoulToolLifecycleStatus,
): SoulToolLifecycleDescriptor["phase"] {
  if (status === "completed") {
    return "after_tool_success";
  }
  if (status === "failed") {
    return "after_tool_failure";
  }
  if (status === "started" || status === "input_delta") {
    return "before_tool";
  }
  return "tool_progress";
}

export function buildSoulToolLifecycleDescriptor({
  soulCopy,
  status,
  highRisk = false,
}: SoulToolLifecycleDescriptorOptions): SoulToolLifecycleDescriptor {
  const source = soulCopy?.descriptors.initialRuntimeTitle;
  const riskLevel = highRisk || source?.riskLevel === "high" ? "high" : "normal";
  const phase = resolvePhase(status);
  return {
    surface: "tool_lifecycle",
    phase,
    status,
    styleLevel:
      riskLevel === "high"
        ? "L4"
        : phase === "before_tool" || phase === "tool_progress"
          ? "L1"
          : "L2",
    riskLevel,
    toneVariant: source?.toneVariant ?? "neutral",
    profileId: source?.profileId,
    packId: source?.packId,
  };
}
