export type AgentPermissionMode = "ask" | "safe" | "allow-all" | string;

export type AgentSharedCapabilityId =
  | "lime.capability.image.generate"
  | "lime.capability.cover.generate"
  | "lime.capability.video.generate"
  | "lime.capability.research.search"
  | "lime.capability.report.generate"
  | "lime.capability.site.search"
  | "lime.capability.pdf.read"
  | "lime.capability.summary.generate"
  | "lime.capability.webpage.generate"
  | "lime.capability.presentation.generate";

export type AgentCapabilityArtifactKind =
  | "media-task"
  | "image"
  | "cover"
  | "video"
  | "search-results"
  | "report"
  | "source-summary"
  | "document"
  | "html"
  | "presentation";

export interface AgentCapabilityDefinition {
  capabilityId: AgentSharedCapabilityId;
  title: string;
  group: "creative" | "research" | "document" | "delivery";
  owner: "agent-runtime";
  aliases: readonly string[];
  metadataContract: {
    requiredKeys: readonly string[];
    optionalKeys: readonly string[];
  };
  allowedTools: readonly string[];
  runtimeEvents: readonly string[];
  artifactPolicy: {
    kinds: readonly AgentCapabilityArtifactKind[];
    requiresArtifactRef: boolean;
  };
  evidencePolicy: {
    required: boolean;
    refs: readonly string[];
  };
}

export interface AgentCapabilityPolicyInput {
  selectedSkillSlugs?: readonly string[];
  permissionMode?: AgentPermissionMode;
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  tools?: readonly string[];
  allowlist?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface AgentCapabilityPolicy {
  selectedSkillSlugs: string[];
  permissionMode: AgentPermissionMode;
  requiredCapabilities: AgentSharedCapabilityId[];
  capabilityHints: AgentSharedCapabilityId[];
  toolHints: AgentSharedCapabilityId[];
  metadata: {
    requiredCapabilities: AgentSharedCapabilityId[];
    capabilityHints: AgentSharedCapabilityId[];
    capabilityContracts: Array<{
      capabilityId: AgentSharedCapabilityId;
      requiredKeys: string[];
      optionalKeys: string[];
      allowedTools: string[];
      artifactKinds: AgentCapabilityArtifactKind[];
      evidenceRequired: boolean;
    }>;
  };
}

export interface AgentCapabilityValidationIssue {
  capabilityId: string;
  code: "unknown-capability" | "not-allowed";
  message: string;
}

const DEFINITIONS: readonly AgentCapabilityDefinition[] = [
  {
    capabilityId: "lime.capability.image.generate",
    title: "Image generation",
    group: "creative",
    owner: "agent-runtime",
    aliases: ["lime.capability.image.generate", "image.generate", "image_generation", "image", "asset.generate", "asset"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["prompt", "input", "expectedOutput", "humanReview", "artifactPolicy"],
    },
    allowedTools: ["image_generate", "creative_capability_search"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["media-task", "image"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "prompt", "generation-request"] },
  },
  {
    capabilityId: "lime.capability.cover.generate",
    title: "Cover generation",
    group: "creative",
    owner: "agent-runtime",
    aliases: ["lime.capability.cover.generate", "cover.generate", "cover_generation", "cover", "poster"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["prompt", "input", "expectedOutput", "artifactPolicy"],
    },
    allowedTools: ["cover_generate", "image_generate", "creative_capability_search"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["cover", "image"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "prompt", "generation-request"] },
  },
  {
    capabilityId: "lime.capability.video.generate",
    title: "Video generation",
    group: "creative",
    owner: "agent-runtime",
    aliases: ["lime.capability.video.generate", "video.generate", "video_generation", "video"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["prompt", "input", "expectedOutput", "timeline", "artifactPolicy"],
    },
    allowedTools: ["video_generate", "creative_capability_search"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["video", "media-task"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "prompt", "generation-request"] },
  },
  {
    capabilityId: "lime.capability.research.search",
    title: "Research search",
    group: "research",
    owner: "agent-runtime",
    aliases: ["lime.capability.research.search", "research.search", "research", "web_search", "search", "deep_research"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["query", "input", "expectedOutput", "sourcePolicy", "evidencePolicy"],
    },
    allowedTools: ["research", "web_search", "creative_capability_search"],
    runtimeEvents: ["tool.*", "evidence.*", "artifact.*", "task.*"],
    artifactPolicy: { kinds: ["search-results", "source-summary"], requiresArtifactRef: false },
    evidencePolicy: { required: true, refs: ["source", "citation", "search-result"] },
  },
  {
    capabilityId: "lime.capability.report.generate",
    title: "Report generation",
    group: "research",
    owner: "agent-runtime",
    aliases: ["lime.capability.report.generate", "report.generate", "report", "competitor_report", "analysis_report"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["input", "expectedOutput", "sourcePolicy", "artifactPolicy"],
    },
    allowedTools: ["report_generate", "research", "web_search"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "review.*", "task.*"],
    artifactPolicy: { kinds: ["report", "document"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "citation", "analysis-input"] },
  },
  {
    capabilityId: "lime.capability.site.search",
    title: "Site search",
    group: "research",
    owner: "agent-runtime",
    aliases: ["lime.capability.site.search", "site.search", "site_search", "domain_search"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["query", "site", "input", "evidencePolicy"],
    },
    allowedTools: ["site_search", "web_search"],
    runtimeEvents: ["tool.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["search-results"], requiresArtifactRef: false },
    evidencePolicy: { required: true, refs: ["source", "citation", "site-result"] },
  },
  {
    capabilityId: "lime.capability.pdf.read",
    title: "PDF read",
    group: "document",
    owner: "agent-runtime",
    aliases: ["lime.capability.pdf.read", "pdf.read", "pdf_extract", "pdf", "document.read"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["fileRefs", "input", "expectedOutput", "evidencePolicy"],
    },
    allowedTools: ["pdf_read", "document_parser"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["source-summary", "document"], requiresArtifactRef: false },
    evidencePolicy: { required: true, refs: ["file", "page", "extract"] },
  },
  {
    capabilityId: "lime.capability.summary.generate",
    title: "Summary generation",
    group: "document",
    owner: "agent-runtime",
    aliases: ["lime.capability.summary.generate", "summary.generate", "summary", "text_summary", "summarize"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["input", "expectedOutput", "sourcePolicy", "artifactPolicy"],
    },
    allowedTools: ["summary", "document_parser"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "task.*"],
    artifactPolicy: { kinds: ["source-summary", "document"], requiresArtifactRef: false },
    evidencePolicy: { required: true, refs: ["source", "summary-input"] },
  },
  {
    capabilityId: "lime.capability.webpage.generate",
    title: "Webpage generation",
    group: "delivery",
    owner: "agent-runtime",
    aliases: ["lime.capability.webpage.generate", "webpage.generate", "webpage", "html.generate", "landing_page"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["input", "expectedOutput", "artifactPolicy", "humanReview"],
    },
    allowedTools: ["webpage_generate"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "review.*", "task.*"],
    artifactPolicy: { kinds: ["html", "document"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "content-brief"] },
  },
  {
    capabilityId: "lime.capability.presentation.generate",
    title: "Presentation generation",
    group: "delivery",
    owner: "agent-runtime",
    aliases: ["lime.capability.presentation.generate", "presentation.generate", "presentation", "ppt", "slides"],
    metadataContract: {
      requiredKeys: ["taskKind"],
      optionalKeys: ["input", "expectedOutput", "artifactPolicy", "humanReview"],
    },
    allowedTools: ["presentation_generate"],
    runtimeEvents: ["tool.*", "artifact.*", "evidence.*", "review.*", "task.*"],
    artifactPolicy: { kinds: ["presentation", "document"], requiresArtifactRef: true },
    evidencePolicy: { required: true, refs: ["source", "content-brief"] },
  },
];

const DEFINITIONS_BY_ID = new Map<AgentSharedCapabilityId, AgentCapabilityDefinition>(
  DEFINITIONS.map((definition) => [definition.capabilityId, definition]),
);

const ALIASES = new Map<string, AgentSharedCapabilityId>();
for (const definition of DEFINITIONS) {
  for (const alias of definition.aliases) {
    ALIASES.set(capabilityToken(alias), definition.capabilityId);
  }
}

export const AGENT_CAPABILITY_CATALOG_VERSION = "agent-capability-catalog/v0.1";
export const AGENT_SHARED_CAPABILITIES = DEFINITIONS.map((definition) => definition.capabilityId);
export const AGENT_CAPABILITY_DEFINITIONS = DEFINITIONS;

export function capabilityToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function normalizeCapabilityList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)));
}

export function resolveAgentCapabilityId(value: string): AgentSharedCapabilityId | undefined {
  return ALIASES.get(capabilityToken(value));
}

export function resolveAgentCapabilityIds(values: readonly unknown[] | undefined): AgentSharedCapabilityId[] {
  return Array.from(
    new Set(
      normalizeCapabilityList(values)
        .map(resolveAgentCapabilityId)
        .filter((value): value is AgentSharedCapabilityId => Boolean(value)),
    ),
  ).sort();
}

export function getAgentCapabilityDefinition(capabilityId: string): AgentCapabilityDefinition | undefined {
  const resolved = resolveAgentCapabilityId(capabilityId);
  return resolved ? DEFINITIONS_BY_ID.get(resolved) : undefined;
}

export function validateAgentCapabilities(input: {
  capabilities?: readonly string[];
  allowlist?: readonly string[];
}): AgentCapabilityValidationIssue[] {
  const allowlist = input.allowlist?.length
    ? new Set(resolveAgentCapabilityIds(input.allowlist))
    : undefined;
  return normalizeCapabilityList(input.capabilities).flatMap<AgentCapabilityValidationIssue>((capability) => {
    const resolved = resolveAgentCapabilityId(capability);
    if (!resolved) {
      return [{
        capabilityId: capability,
        code: "unknown-capability" as const,
        message: `Unknown agent capability: ${capability}.`,
      }];
    }
    if (allowlist && !allowlist.has(resolved)) {
      return [{
        capabilityId: resolved,
        code: "not-allowed" as const,
        message: `Agent capability is not allowed by this surface: ${resolved}.`,
      }];
    }
    return [];
  });
}

export function assertAgentCapabilitiesAllowed(input: {
  capabilities?: readonly string[];
  allowlist?: readonly string[];
}): AgentSharedCapabilityId[] {
  const issues = validateAgentCapabilities(input);
  if (issues.length) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }
  return resolveAgentCapabilityIds(input.capabilities);
}

export function buildAgentCapabilityPolicy(input: AgentCapabilityPolicyInput = {}): AgentCapabilityPolicy {
  const requiredCapabilities = assertAgentCapabilitiesAllowed({
    capabilities: input.requiredCapabilities,
    allowlist: input.allowlist,
  });
  const capabilityHints = assertAgentCapabilitiesAllowed({
    capabilities: input.capabilityHints,
    allowlist: input.allowlist,
  });
  const toolHints = assertAgentCapabilitiesAllowed({
    capabilities: input.tools,
    allowlist: input.allowlist,
  });
  const allCapabilities = Array.from(new Set([...requiredCapabilities, ...capabilityHints, ...toolHints])).sort();
  const capabilityContracts = allCapabilities.flatMap((capabilityId) => {
    const definition = DEFINITIONS_BY_ID.get(capabilityId);
    if (!definition) return [];
    return [{
      capabilityId,
      requiredKeys: [...definition.metadataContract.requiredKeys],
      optionalKeys: [...definition.metadataContract.optionalKeys],
      allowedTools: [...definition.allowedTools],
      artifactKinds: [...definition.artifactPolicy.kinds],
      evidenceRequired: definition.evidencePolicy.required,
    }];
  });

  return {
    selectedSkillSlugs: normalizeCapabilityList(input.selectedSkillSlugs),
    permissionMode: input.permissionMode ?? "ask",
    requiredCapabilities,
    capabilityHints,
    toolHints,
    metadata: {
      requiredCapabilities,
      capabilityHints: Array.from(new Set([...capabilityHints, ...toolHints])).sort(),
      capabilityContracts,
      ...(input.metadata ?? {}),
    },
  };
}
