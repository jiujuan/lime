import { contentFactorySignedReleasePlaceholderSamples } from "./plugin-content-factory-signed-release-gate-placeholders.mjs";

const SECRET_VALUE_RE =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,})\b/;

function preflightEvidenceForScan(preflight) {
  if (!preflight || typeof preflight !== "object" || Array.isArray(preflight)) {
    return preflight;
  }
  const { note, signingCommand, ...evidence } = preflight;
  return evidence;
}

function collectSecretValuePaths(root, path = "$", seen = new Set()) {
  if (typeof root === "string") {
    return SECRET_VALUE_RE.test(root) ? [path] : [];
  }
  if (!root || typeof root !== "object" || seen.has(root)) {
    return [];
  }
  seen.add(root);
  const entries = Array.isArray(root)
    ? root.map((value, index) => [String(index), value])
    : Object.entries(root);
  return entries.flatMap(([key, value]) =>
    collectSecretValuePaths(value, `${path}.${key}`, seen),
  );
}

export function summarizePlaceholders(input) {
  return {
    bootstrap: contentFactorySignedReleasePlaceholderSamples(input.bootstrap),
    catalog: contentFactorySignedReleasePlaceholderSamples(input.catalog),
    fetchCloud: contentFactorySignedReleasePlaceholderSamples(input.fetchCloud),
    guiEvidence: contentFactorySignedReleasePlaceholderSamples(
      input.guiEvidence,
    ),
    preflight: contentFactorySignedReleasePlaceholderSamples(
      preflightEvidenceForScan(input.preflight),
    ),
  };
}

export function summarizeSecretScan(input) {
  const surfaces = {
    bootstrap: collectSecretValuePaths(input.bootstrap),
    catalog: collectSecretValuePaths(input.catalog),
    fetchCloud: collectSecretValuePaths(input.fetchCloud),
    guiEvidence: collectSecretValuePaths(input.guiEvidence),
    preflight: collectSecretValuePaths(input.preflight),
  };
  return {
    ...surfaces,
    total: Object.values(surfaces).reduce(
      (count, paths) => count + paths.length,
      0,
    ),
  };
}

export function appendPlaceholderRequirement(
  missingRequirements,
  placeholders,
) {
  const surfaces = Object.entries(placeholders)
    .filter(([, samples]) => samples.length > 0)
    .map(([surface]) => surface);
  if (surfaces.length === 0) {
    return;
  }
  missingRequirements.push({
    code: "production_placeholder_values_present",
    detail: `Production evidence still contains template placeholder values in: ${surfaces.join(", ")}.`,
  });
}

export function appendSecretScanRequirement(missingRequirements, secretScan) {
  if (!secretScan.total) {
    return;
  }
  const surfaces = Object.entries(secretScan)
    .filter(([surface, paths]) => surface !== "total" && paths.length > 0)
    .map(([surface]) => surface);
  missingRequirements.push({
    code: "production_secret_values_present",
    detail: `Production evidence contains secret-like values in: ${surfaces.join(", ")}. Evidence may reference env var names, but must not contain Provider keys or bearer tokens.`,
  });
}
