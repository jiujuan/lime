import type { PluginProjection } from "../types";

const CREATIVE_CAPABILITY_TOOL_KEYS = new Set(
  [
    "creative_capability_search",
    "claw_capability_catalog",
    "app_server_runtime_capability_catalog",
  ].map(capabilityMatchToken),
);

const CLAW_CAPABILITY_ALIASES: Array<{
  capabilityId: string;
  aliases: string[];
}> = [
  {
    capabilityId: "lime.capability.image.generate",
    aliases: [
      "lime.capability.image.generate",
      "image.generate",
      "image_generation",
      "image",
      "asset.generate",
    ],
  },
  {
    capabilityId: "lime.capability.cover.generate",
    aliases: [
      "lime.capability.cover.generate",
      "cover.generate",
      "cover_generation",
      "cover",
    ],
  },
  {
    capabilityId: "lime.capability.research.search",
    aliases: [
      "lime.capability.research.search",
      "research.search",
      "research",
      "web_search",
      "search",
    ],
  },
  {
    capabilityId: "lime.capability.report.generate",
    aliases: [
      "lime.capability.report.generate",
      "report.generate",
      "report",
      "competitor_report",
    ],
  },
  {
    capabilityId: "lime.capability.pdf.read",
    aliases: ["lime.capability.pdf.read", "pdf.read", "pdf_extract", "pdf"],
  },
  {
    capabilityId: "lime.capability.summary.generate",
    aliases: [
      "lime.capability.summary.generate",
      "summary.generate",
      "summary",
      "text_summary",
    ],
  },
];

export function capabilityMatchToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

export function collectUndeclaredRequestedClawCapabilityIds(
  projection: PluginProjection,
  input: Record<string, unknown>,
): string[] {
  return collectRequestedClawCapabilityIds(input).filter(
    (capabilityId) => !manifestDeclaresClawCapability(projection, capabilityId),
  );
}

function resolveClawCapabilityId(value: string): string | null {
  const token = capabilityMatchToken(value);
  if (!token) {
    return null;
  }
  const descriptor = CLAW_CAPABILITY_ALIASES.find((item) =>
    item.aliases.some((alias) => capabilityMatchToken(alias) === token),
  );
  return descriptor?.capabilityId ?? null;
}

function collectRequestedClawCapabilityIds(
  input: Record<string, unknown>,
): string[] {
  const requested = [
    ...normalizeStringList(input.requiredCapabilities),
    ...normalizeStringList(input.capabilityHints),
    ...normalizeStringList(input.tools),
  ];
  return Array.from(
    new Set(
      requested
        .map(resolveClawCapabilityId)
        .filter((item): item is string => Boolean(item)),
    ),
  ).sort();
}

function manifestDeclaresClawCapability(
  projection: PluginProjection,
  capabilityId: string,
): boolean {
  const descriptor = CLAW_CAPABILITY_ALIASES.find(
    (item) => item.capabilityId === capabilityId,
  );
  if (!descriptor) {
    return false;
  }
  return projection.toolRequirements.some((tool) =>
    toolRequirementDeclaresClawCapability(tool, descriptor),
  );
}

function toolRequirementDeclaresClawCapability(
  tool: PluginProjection["toolRequirements"][number],
  descriptor: (typeof CLAW_CAPABILITY_ALIASES)[number],
): boolean {
  const toolKeyToken = capabilityMatchToken(tool.key);
  if (
    descriptor.aliases.some(
      (alias) => capabilityMatchToken(alias) === toolKeyToken,
    )
  ) {
    return true;
  }
  if (!CREATIVE_CAPABILITY_TOOL_KEYS.has(toolKeyToken)) {
    return false;
  }
  return tool.capabilities.some(
    (capability) =>
      resolveClawCapabilityId(capability) === descriptor.capabilityId,
  );
}
