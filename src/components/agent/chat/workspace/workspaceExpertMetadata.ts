import { asRecord } from "./browserAssistArtifact";

export interface ResolveExpertPanelRequestMetadataParams {
  initialAutoSendRequestMetadata?: Record<string, unknown>;
  initialRequestMetadata?: Record<string, unknown>;
  sessionRequestMetadata?: Record<string, unknown> | null;
}

export function resolveExpertPanelRequestMetadata({
  initialAutoSendRequestMetadata,
  initialRequestMetadata,
  sessionRequestMetadata,
}: ResolveExpertPanelRequestMetadataParams): Record<string, unknown> | null {
  return (
    initialAutoSendRequestMetadata ??
    initialRequestMetadata ??
    sessionRequestMetadata ??
    null
  );
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
  sessionRequestMetadata,
}: ResolveExpertPanelRequestMetadataParams & {
  expertSkillRefsOverride: string[] | null;
}): Record<string, unknown> | null {
  const metadataWithExpertSkills = mergeExpertSkillRefsIntoRequestMetadata(
    initialRequestMetadata ??
      initialAutoSendRequestMetadata ??
      sessionRequestMetadata ??
      null,
    expertSkillRefsOverride,
  );
  return metadataWithExpertSkills &&
    Object.keys(metadataWithExpertSkills).length > 0
    ? metadataWithExpertSkills
    : null;
}

export function resolveSessionExpertRequestMetadata(
  threadRead?: {
    session_business_object_ref_metadata?: Record<string, unknown> | null;
  } | null,
): Record<string, unknown> | null {
  const metadata = asRecord(threadRead?.session_business_object_ref_metadata);
  const harness = asRecord(metadata?.harness);
  if (!asRecord(metadata?.expert) && !asRecord(harness?.expert)) {
    return null;
  }
  return { ...metadata };
}

export function shouldAllowDetachedInitialAutoSend(
  initialAutoSendRequestMetadata?: Record<string, unknown>,
): boolean {
  const metadata = asRecord(initialAutoSendRequestMetadata);
  const harness = asRecord(metadata?.harness);
  return Boolean(
    asRecord(metadata?.expert) ||
      asRecord(harness?.expert) ||
      asRecord(harness?.plugin_activation_intent) ||
      asRecord(harness?.pluginActivationIntent),
  );
}
