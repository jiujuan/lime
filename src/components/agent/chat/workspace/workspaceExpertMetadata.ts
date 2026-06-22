import { asRecord } from "./browserAssistArtifact";

export interface ResolveExpertPanelRequestMetadataParams {
  initialAutoSendRequestMetadata?: Record<string, unknown>;
  initialRequestMetadata?: Record<string, unknown>;
}

export function resolveExpertPanelRequestMetadata({
  initialAutoSendRequestMetadata,
  initialRequestMetadata,
}: ResolveExpertPanelRequestMetadataParams): Record<string, unknown> | null {
  return initialAutoSendRequestMetadata ?? initialRequestMetadata ?? null;
}

export function mergeExpertSkillRefsIntoRequestMetadata(
  metadata: Record<string, unknown> | null | undefined,
  skillRefs: string[] | null,
): Record<string, unknown> | null {
  if (!metadata || !skillRefs) {
    return metadata ?? null;
  }

  const root: Record<string, unknown> = { ...metadata };
  const expert = asRecord(root.expert);
  const harness = asRecord(root.harness);
  const harnessExpert = asRecord(harness?.expert);

  if (expert) {
    root.expert = {
      ...expert,
      skillRefs: [...skillRefs],
    };
  }

  if (harness || harnessExpert) {
    root.harness = {
      ...(harness ?? {}),
      expert: {
        ...(harnessExpert ?? {}),
        skill_refs: [...skillRefs],
      },
    };
  }

  return root;
}

export function resolveWorkspaceRequestMetadataWithExpertSkills({
  expertSkillRefsOverride,
  initialAutoSendRequestMetadata,
  initialRequestMetadata,
}: ResolveExpertPanelRequestMetadataParams & {
  expertSkillRefsOverride: string[] | null;
}): Record<string, unknown> | null {
  const metadataWithExpertSkills = mergeExpertSkillRefsIntoRequestMetadata(
    initialRequestMetadata ?? initialAutoSendRequestMetadata ?? null,
    expertSkillRefsOverride,
  );
  return metadataWithExpertSkills &&
    Object.keys(metadataWithExpertSkills).length > 0
    ? metadataWithExpertSkills
    : null;
}

export function shouldAllowDetachedInitialAutoSend(
  initialAutoSendRequestMetadata?: Record<string, unknown>,
): boolean {
  const metadata = asRecord(initialAutoSendRequestMetadata);
  const harness = asRecord(metadata?.harness);
  return Boolean(asRecord(metadata?.expert) || asRecord(harness?.expert));
}
