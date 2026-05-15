import type { AutomationPayload } from "@/lib/api/automation";

function normalizeOptionalText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      value
        .map((item) =>
          typeof item === "string" ? normalizeOptionalText(item) : undefined,
        )
        .filter((item): item is string => Boolean(item)),
    ),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizedEntries = Object.entries(value)
    .map(([key, rawValue]) => {
      const normalizedKey = normalizeOptionalText(key);
      const normalizedValue =
        typeof rawValue === "string"
          ? normalizeOptionalText(rawValue)
          : undefined;
      if (!normalizedKey || !normalizedValue) {
        return null;
      }

      return [normalizedKey, normalizedValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

export interface LegacySceneAppAutomationContext {
  sceneappId: string;
  title?: string;
  sceneappType?: string;
  deliveryContract?: string;
  entrySource?: string;
  workspaceId?: string;
  projectId?: string;
  referenceMemoryIds?: string[];
  slots?: Record<string, string>;
}

function resolveSceneAppAutomationContextFromRecord(
  record: Record<string, unknown>,
): LegacySceneAppAutomationContext | null {
  const sceneappValue = isRecord(record.sceneapp) ? record.sceneapp : null;
  const harnessValue = isRecord(record.harness) ? record.harness : null;
  const launchValue = isRecord(harnessValue?.sceneapp_launch)
    ? harnessValue.sceneapp_launch
    : null;

  const sceneappId =
    normalizeOptionalText(
      typeof sceneappValue?.id === "string" ? sceneappValue.id : undefined,
    ) ??
    normalizeOptionalText(
      typeof launchValue?.sceneapp_id === "string"
        ? launchValue.sceneapp_id
        : undefined,
    ) ??
    normalizeOptionalText(
      typeof harnessValue?.sceneapp_id === "string"
        ? harnessValue.sceneapp_id
        : undefined,
    );

  if (!sceneappId) {
    return null;
  }

  const referenceMemoryIds =
    normalizeOptionalStringList(record.sceneapp_reference_memory_ids) ??
    normalizeOptionalStringList(launchValue?.reference_memory_ids);
  const slots =
    normalizeOptionalStringRecord(record.sceneapp_slots) ??
    normalizeOptionalStringRecord(launchValue?.slots);

  return {
    sceneappId,
    title: normalizeOptionalText(
      typeof sceneappValue?.title === "string"
        ? sceneappValue.title
        : undefined,
    ),
    sceneappType: normalizeOptionalText(
      typeof sceneappValue?.sceneapp_type === "string"
        ? sceneappValue.sceneapp_type
        : typeof harnessValue?.sceneapp_type === "string"
          ? harnessValue.sceneapp_type
          : undefined,
    ),
    deliveryContract: normalizeOptionalText(
      typeof sceneappValue?.delivery_contract === "string"
        ? sceneappValue.delivery_contract
        : typeof launchValue?.delivery_contract === "string"
          ? launchValue.delivery_contract
          : undefined,
    ),
    entrySource: normalizeOptionalText(
      typeof launchValue?.entry_source === "string"
        ? launchValue.entry_source
        : typeof harnessValue?.entry_source === "string"
          ? harnessValue.entry_source
          : undefined,
    ),
    workspaceId: normalizeOptionalText(
      typeof launchValue?.workspace_id === "string"
        ? launchValue.workspace_id
        : typeof harnessValue?.workspace_id === "string"
          ? harnessValue.workspace_id
          : undefined,
    ),
    projectId: normalizeOptionalText(
      typeof launchValue?.project_id === "string"
        ? launchValue.project_id
        : typeof harnessValue?.project_id === "string"
          ? harnessValue.project_id
          : undefined,
    ),
    referenceMemoryIds,
    slots,
  };
}

function resolveSceneAppAutomationContextFromMetadataRecord(
  metadata: Record<string, unknown>,
): LegacySceneAppAutomationContext | null {
  const nestedRequestMetadata = isRecord(metadata.request_metadata)
    ? metadata.request_metadata
    : null;

  return (
    resolveSceneAppAutomationContextFromRecord(metadata) ||
    (nestedRequestMetadata
      ? resolveSceneAppAutomationContextFromRecord(nestedRequestMetadata)
      : null)
  );
}

export function resolveLegacySceneAppAutomationContext(
  payload: AutomationPayload,
): LegacySceneAppAutomationContext | null {
  if (payload.kind !== "agent_turn" || !isRecord(payload.request_metadata)) {
    return null;
  }

  return resolveSceneAppAutomationContextFromMetadataRecord(
    payload.request_metadata,
  );
}
