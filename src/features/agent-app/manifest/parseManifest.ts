import type { AppManifest } from "../types";

export class AgentAppManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentAppManifestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isString(value)) {
    throw new AgentAppManifestError(`Agent App manifest missing string field: ${key}`);
  }
  return value;
}

export function parseManifest(input: unknown): AppManifest {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (!isRecord(raw)) {
    throw new AgentAppManifestError("Agent App manifest must be an object");
  }

  assertString(raw, "manifestVersion");
  assertString(raw, "name");
  assertString(raw, "version");

  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new AgentAppManifestError("Agent App manifest must declare at least one entry");
  }

  raw.entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new AgentAppManifestError(`Agent App entry ${index} must be an object`);
    }
    assertString(entry, "key");
    assertString(entry, "kind");
  });

  return raw as unknown as AppManifest;
}
