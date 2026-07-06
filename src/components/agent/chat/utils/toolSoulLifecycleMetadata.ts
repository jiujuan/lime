export interface ToolSoulLifecycleMetadata {
  soulLifecycle?: Record<string, unknown>;
  soulSurface?: string;
  soulPhase?: string;
  styleLevel?: string;
  riskLevel?: string;
  toneVariant?: string;
  profileId?: string;
  packId?: string;
}

interface ToolSoulMetadataCarrier {
  metadata?: unknown;
}

function normalizeMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readStringValue(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function resolveToolSoulMetadata(
  rawMetadata: unknown,
): ToolSoulLifecycleMetadata {
  const metadata = normalizeMetadataRecord(rawMetadata);
  if (!metadata) {
    return {};
  }

  const lifecycle = normalizeMetadataRecord(
    metadata.soul_lifecycle ?? metadata.soulLifecycle,
  );
  const source = lifecycle ?? metadata;
  const soulSurface =
    readStringValue(metadata, "soul_surface", "soulSurface") ??
    readStringValue(source, "surface");
  const soulPhase =
    readStringValue(metadata, "soul_phase", "soulPhase") ??
    readStringValue(source, "phase");
  const styleLevel =
    readStringValue(metadata, "style_level", "styleLevel") ??
    readStringValue(source, "styleLevel", "style_level");
  const riskLevel =
    readStringValue(metadata, "risk_level", "riskLevel") ??
    readStringValue(source, "riskLevel", "risk_level");
  const toneVariant =
    readStringValue(metadata, "tone_variant", "toneVariant") ??
    readStringValue(source, "toneVariant", "tone_variant");
  const profileId =
    readStringValue(metadata, "profile_id", "profileId") ??
    readStringValue(source, "profileId", "profile_id");
  const packId =
    readStringValue(metadata, "pack_id", "packId") ??
    readStringValue(source, "packId", "pack_id");
  if (
    !lifecycle &&
    !soulSurface &&
    !soulPhase &&
    !styleLevel &&
    !riskLevel &&
    !toneVariant &&
    !profileId &&
    !packId
  ) {
    return {};
  }

  return {
    ...(lifecycle ? { soulLifecycle: lifecycle } : {}),
    ...(soulSurface ? { soulSurface } : {}),
    ...(soulPhase ? { soulPhase } : {}),
    ...(styleLevel ? { styleLevel } : {}),
    ...(riskLevel ? { riskLevel } : {}),
    ...(toneVariant ? { toneVariant } : {}),
    ...(profileId ? { profileId } : {}),
    ...(packId ? { packId } : {}),
  };
}

export function resolveToolSoulMetadataFromEntries(
  entries: readonly ToolSoulMetadataCarrier[],
): ToolSoulLifecycleMetadata {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const metadata = resolveToolSoulMetadata(entries[index]?.metadata);
    if (Object.keys(metadata).length > 0) {
      return metadata;
    }
  }
  return {};
}

export function resolveToolSoulMetadataDomAttributes(
  metadata: ToolSoulLifecycleMetadata,
): Record<string, string | undefined> {
  const hasMetadata = Boolean(
    metadata.soulSurface ||
      metadata.soulPhase ||
      metadata.styleLevel ||
      metadata.riskLevel ||
      metadata.toneVariant ||
      metadata.profileId ||
      metadata.packId,
  );

  return {
    "data-soul-lifecycle": hasMetadata ? "yes" : undefined,
    "data-soul-surface": metadata.soulSurface,
    "data-soul-phase": metadata.soulPhase,
    "data-soul-style-level": metadata.styleLevel,
    "data-soul-risk-level": metadata.riskLevel,
    "data-soul-tone-variant": metadata.toneVariant,
    "data-soul-profile-id": metadata.profileId,
    "data-soul-pack-id": metadata.packId,
  };
}
