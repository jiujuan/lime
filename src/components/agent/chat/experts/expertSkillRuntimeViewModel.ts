import type {
  ExpertSkillRuntimeCandidate,
  ExpertSkillRuntimeCandidateReadiness,
} from "@/features/experts";

export type ExpertSkillRuntimeReadinessTone =
  | "ready"
  | "warning"
  | "blocked";

export interface ExpertSkillRuntimeReadinessCopy {
  ready: string;
  needsMapping: string;
  needsRegistration: string;
  blocked: string;
}

export interface ExpertSkillRuntimeChipViewModel {
  ref: string;
  label: string;
  readiness: ExpertSkillRuntimeCandidateReadiness;
  readinessLabel: string;
  readinessTone: ExpertSkillRuntimeReadinessTone;
  title: string;
}

export interface BuildExpertSkillRuntimeChipViewModelsInput {
  skillRefs: string[];
  candidates: ExpertSkillRuntimeCandidate[];
  resolveLabel: (ref: string) => string;
  copy: ExpertSkillRuntimeReadinessCopy;
}

function normalizeRefKey(ref: string): string {
  return ref.trim().toLowerCase();
}

function readinessLabel(
  readiness: ExpertSkillRuntimeCandidateReadiness,
  copy: ExpertSkillRuntimeReadinessCopy,
): string {
  switch (readiness) {
    case "ready":
      return copy.ready;
    case "needs_mapping":
      return copy.needsMapping;
    case "needs_registration":
      return copy.needsRegistration;
    case "blocked":
      return copy.blocked;
    default:
      return copy.blocked;
  }
}

function readinessTone(
  readiness: ExpertSkillRuntimeCandidateReadiness,
): ExpertSkillRuntimeReadinessTone {
  switch (readiness) {
    case "ready":
      return "ready";
    case "needs_mapping":
    case "needs_registration":
      return "warning";
    case "blocked":
    default:
      return "blocked";
  }
}

export function buildExpertSkillRuntimeChipViewModels({
  skillRefs,
  candidates,
  resolveLabel,
  copy,
}: BuildExpertSkillRuntimeChipViewModelsInput): ExpertSkillRuntimeChipViewModel[] {
  const candidatesByRef = new Map(
    candidates.map((candidate) => [normalizeRefKey(candidate.ref), candidate]),
  );

  return skillRefs.map((ref) => {
    const candidate = candidatesByRef.get(normalizeRefKey(ref));
    const readiness = candidate?.readiness ?? "blocked";
    const label = candidate?.displayTitle || resolveLabel(ref);
    const labelText = readinessLabel(readiness, copy);
    return {
      ref,
      label,
      readiness,
      readinessLabel: labelText,
      readinessTone: readinessTone(readiness),
      title: `${ref} · ${labelText}`,
    };
  });
}
