import type { PluginRuntimeProcessTimelineItem } from "../types";
import {
  findFirstObjectByKeys,
  isRecord,
  readString,
} from "./agentRuntimeProcessAccess";

export function buildHostManagedGenerationTimelineItems(
  ...sources: unknown[]
): PluginRuntimeProcessTimelineItem[] {
  const generation = findHostManagedGeneration(sources);
  if (!generation) {
    return [];
  }
  const presentation = recordFromAny(generation, [
    "presentation",
    "display",
    "copy",
  ]);
  const lifecycle = recordFromAny(generation, [
    "soul_lifecycle",
    "soulLifecycle",
  ]);
  const facts = recordFromAny(generation, [
    "host_managed_generation_facts",
    "hostManagedGenerationFacts",
  ]);
  const boundary = recordFromAny(generation, [
    "generationBriefBoundary",
    "generation_brief_boundary",
  ]);
  const status = readString(generation, "status") || "requested";
  const provider =
    readString(generation, "provider") ||
    readString(facts, "provider") ||
    readString(recordFromAny(presentation, ["values"]), "provider");
  const model =
    readString(generation, "model") ||
    readString(facts, "model") ||
    readString(recordFromAny(presentation, ["values"]), "model");
  const displayValues = displayValuesFromPresentation(
    presentation,
    provider,
    model,
    outputCountFrom(generation, facts),
  );
  const styleLevel = readString(presentation, "styleLevel") ||
    readString(lifecycle, "styleLevel") ||
    (status === "completed" || status === "unavailable" ? "L2" : "L1");
  const riskLevel =
    readString(presentation, "riskLevel") ||
    readString(lifecycle, "riskLevel") ||
    "normal";

  return [
    {
      kind: status === "unavailable" || status === "failed" ? "warning" : "artifact",
      title: "Host-managed generation",
      statusText: statusLabelForHostGeneration(status),
      message: "Host-managed generation status updated.",
      detail: detailForHostGeneration(provider, model, displayValues.outputCount),
      meta: provider && model ? `${provider}/${model}` : provider || model || undefined,
      collapseKey: "plugin:host-managed-generation",
      displayTitleKey:
        readString(presentation, "titleKey") ||
        `plugin.apps.runtime.agentRun.hostManagedGeneration.${statusKey(status)}.title`,
      displayMessageKey:
        readString(presentation, "messageKey") ||
        `plugin.apps.runtime.agentRun.hostManagedGeneration.${statusKey(status)}.message`,
      displayValues,
      soulLifecycle: lifecycle ?? undefined,
      soulSurface:
        readString(presentation, "soulSurface") ||
        readString(lifecycle, "surface") ||
        readString(generation, "soul_surface") ||
        "plugin_host_managed_generation",
      soulPhase:
        readString(presentation, "soulPhase") ||
        readString(lifecycle, "phase") ||
        readString(generation, "soul_phase") ||
        undefined,
      styleLevel,
      riskLevel,
      toneVariant:
        readString(presentation, "toneVariant") ||
        readString(lifecycle, "toneVariant") ||
        readString(generation, "tone_variant") ||
        "neutral",
      profileId:
        readString(presentation, "profileId") ||
        readString(lifecycle, "profileId") ||
        readString(generation, "profile_id") ||
        undefined,
      packId:
        readString(presentation, "packId") ||
        readString(lifecycle, "packId") ||
        readString(generation, "pack_id") ||
        undefined,
      generationBriefBoundary: boundary ?? undefined,
      metadata: {
        hostManagedGeneration: generation,
        ...(presentation ? { presentation } : {}),
        ...(facts ? { host_managed_generation_facts: facts } : {}),
        ...(boundary ? { generationBriefBoundary: boundary } : {}),
        ...(lifecycle ? { soul_lifecycle: lifecycle } : {}),
      },
    },
  ];
}

function findHostManagedGeneration(sources: unknown[]): Record<string, unknown> | null {
  for (const source of sources) {
    const direct = firstGenerationRecord(source);
    if (direct) {
      return direct;
    }
  }
  return null;
}

function firstGenerationRecord(source: unknown): Record<string, unknown> | null {
  const direct = findFirstObjectByKeys(source, [
    "hostManagedGeneration",
    "host_managed_generation",
    "hostManagedGenerationResult",
    "host_managed_generation_result",
  ]);
  if (isHostManagedGenerationRecord(direct)) {
    return direct;
  }
  return null;
}

function isHostManagedGenerationRecord(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  if (!value) {
    return false;
  }
  const schema = readString(value, "schemaVersion") || readString(value, "schema");
  return (
    schema === "lime.plugin.host_managed_generation.v1" ||
    readString(value, "source") === "app_server_runtime_backend" ||
    Boolean(recordFromAny(value, ["presentation"]))
  );
}

function recordFromAny(
  value: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  for (const key of keys) {
    if (isRecord(value[key])) {
      return value[key];
    }
  }
  return null;
}

function displayValuesFromPresentation(
  presentation: Record<string, unknown> | null,
  provider: string,
  model: string,
  outputCount: number,
): Record<string, unknown> {
  const values = recordFromAny(presentation, ["values"]) ?? {};
  return {
    ...values,
    provider,
    model,
    outputCount,
  };
}

function outputCountFrom(
  generation: Record<string, unknown>,
  facts: Record<string, unknown> | null,
): number {
  const factCount = Number(facts?.outputCount ?? facts?.output_count);
  if (Number.isFinite(factCount)) {
    return factCount;
  }
  const outputs = generation.outputs;
  return Array.isArray(outputs) ? outputs.length : 0;
}

function statusKey(status: string): string {
  if (status === "completed") {
    return "completed";
  }
  if (status === "unavailable" || status === "failed") {
    return "unavailable";
  }
  if (status === "skipped") {
    return "skipped";
  }
  return "requested";
}

function statusLabelForHostGeneration(status: string): string {
  if (status === "completed") {
    return "completed";
  }
  if (status === "unavailable" || status === "failed") {
    return "unavailable";
  }
  if (status === "skipped") {
    return "skipped";
  }
  return "requested";
}

function detailForHostGeneration(
  provider: string,
  model: string,
  outputCount: unknown,
): string {
  return [
    provider ? `provider=${provider}` : "",
    model ? `model=${model}` : "",
    typeof outputCount === "number" ? `outputs=${outputCount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
