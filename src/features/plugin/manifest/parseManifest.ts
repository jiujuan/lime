import type { AppManifest } from "../types";

export interface ManifestValueLayerField {
  source: string;
  target: string;
}

export interface MergeLayeredManifestOptions {
  arrayFields?: readonly string[];
  valueFields?: readonly ManifestValueLayerField[];
}

export class PluginManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginManifestError";
  }
}

const DEFAULT_ARRAY_LAYER_FIELDS = ["entries", "permissions"] as const;
const DEFAULT_VALUE_LAYER_FIELDS: readonly ManifestValueLayerField[] = [
  { source: "capabilities", target: "capabilityConfig" },
  { source: "errors", target: "errors" },
  { source: "i18n", target: "i18n" },
  { source: "signature", target: "signature" },
  { source: "agentRuntime", target: "agentRuntime" },
  { source: "requirements", target: "requirements" },
  { source: "boundary", target: "boundary" },
  { source: "boundaries", target: "boundary" },
  { source: "integrations", target: "integrations" },
  { source: "operations", target: "operations" },
  { source: "install", target: "install" },
  { source: "readiness", target: "readiness" },
  { source: "health", target: "health" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isString(value)) {
    throw new PluginManifestError(
      `Plugin manifest missing string field: ${key}`,
    );
  }
  return value;
}

function readManifestInput(input: unknown): Record<string, unknown> {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (!isRecord(raw)) {
    throw new PluginManifestError("Plugin manifest must be an object");
  }
  return raw;
}

function layeredItemKey(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const key = value.key ?? value.id;
  return isString(key) ? key : undefined;
}

function mergeNamedArrayLayer(
  current: unknown,
  overlay: readonly unknown[],
): unknown[] {
  const merged = Array.isArray(current) ? [...current] : [];

  overlay.forEach((overlayItem) => {
    const overlayKey = layeredItemKey(overlayItem);
    if (!overlayKey) {
      merged.push(overlayItem);
      return;
    }

    const existingIndex = merged.findIndex(
      (item) => layeredItemKey(item) === overlayKey,
    );
    if (existingIndex === -1) {
      merged.push(overlayItem);
      return;
    }

    const existingItem = merged[existingIndex];
    merged[existingIndex] =
      isRecord(existingItem) && isRecord(overlayItem)
        ? { ...existingItem, ...overlayItem }
        : overlayItem;
  });

  return merged;
}

export function mergeLayeredManifest(
  input: unknown,
  layers: readonly unknown[],
  options: MergeLayeredManifestOptions = {},
): AppManifest {
  const manifest: Record<string, unknown> = { ...readManifestInput(input) };
  const arrayFields = options.arrayFields ?? DEFAULT_ARRAY_LAYER_FIELDS;
  const valueFields = options.valueFields ?? DEFAULT_VALUE_LAYER_FIELDS;

  layers.forEach((layer) => {
    if (!isRecord(layer)) {
      return;
    }

    arrayFields.forEach((field) => {
      const items = layer[field];
      if (Array.isArray(items)) {
        manifest[field] = mergeNamedArrayLayer(manifest[field], items);
      }
    });

    valueFields.forEach(({ source, target }) => {
      if (layer[source] !== undefined) {
        manifest[target] = layer[source];
      }
    });
  });

  return parseManifest(manifest);
}

export function parseManifest(input: unknown): AppManifest {
  const raw = readManifestInput(input);

  assertString(raw, "manifestVersion");
  assertString(raw, "name");
  assertString(raw, "version");

  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new PluginManifestError(
      "Plugin manifest must declare at least one entry",
    );
  }

  raw.entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new PluginManifestError(
        `Plugin entry ${index} must be an object`,
      );
    }
    assertString(entry, "key");
    assertString(entry, "kind");
  });

  return raw as unknown as AppManifest;
}
