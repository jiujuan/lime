import type { InstalledAgentAppState } from "../types";

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeDisplayCandidate(value: string | undefined): string | undefined {
  const normalized = value
    ?.replace(/\s*(?:fixture|Fixture)\s*$/u, "")
    .trim();
  return normalized ? normalized : undefined;
}

export function resolveInstalledAgentAppDisplayName(
  state: InstalledAgentAppState,
): string {
  const appId = state.appId;
  const manifest = state.manifest as unknown as Record<string, unknown>;
  const explicitName =
    normalizeText(manifest.displayName) ??
    normalizeText(manifest.title) ??
    normalizeText(state.projection.app.displayName);

  const normalizedExplicitName = normalizeDisplayCandidate(explicitName);
  if (normalizedExplicitName && normalizedExplicitName !== appId) {
    return normalizedExplicitName;
  }

  const description =
    normalizeText(state.projection.app.description) ??
    normalizeText(manifest.description);
  const leadingName = description?.split(/[，,。.:：]/)[0]?.trim();
  const normalizedLeadingName = normalizeDisplayCandidate(leadingName);
  if (
    normalizedLeadingName &&
    normalizedLeadingName !== appId &&
    normalizedLeadingName.length <= 24
  ) {
    return normalizedLeadingName;
  }

  return normalizedExplicitName ?? appId;
}
