import type {
  MemorySoulArtifactVoiceConfig,
  MemorySoulConfig,
} from "@/lib/api/memoryConfigTypes";
import { normalizeSoulStyleProfileId } from "./style-profiles";

export type SoulImportWarningCode =
  | "empty"
  | "project_rules"
  | "local_path"
  | "secret_like"
  | "too_long";

export interface SoulImportResult {
  canImport: boolean;
  draft: MemorySoulConfig;
  preview: string;
  warnings: SoulImportWarningCode[];
}

const MAX_TEXT_LENGTH = 600;
const MAX_LIST_ITEMS = 8;
const MAX_IMPORT_LENGTH = 8000;
const PROJECT_RULE_PATTERN =
  /\b(npm|pnpm|yarn|cargo|git|uv|pytest|docker)\s+(run|test|build|install|add|commit|push|pull|checkout|reset|exec|compose|up|down)|localhost:\d+|127\.0\.0\.1:\d+|AGENTS\.md|MEMORY\.md|端口|命令|路径/u;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|\/var\/|\/tmp\/|[A-Za-z]:\\|~\/)[^\s)]+/u;
const SECRET_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|api[_-]?key|secret|token|password|密钥|令牌|密码)\b/u;

export const DEFAULT_SOUL_CONFIG: MemorySoulConfig = {
  enabled: false,
  name: undefined,
  summary: undefined,
  style_profile_id: undefined,
  tone: [],
  communication_style: [],
  explanation_depth: undefined,
  challenge_style: undefined,
  avoid: [],
  artifact_voice: {
    enabled: false,
    voice_source: undefined,
    creator_voice_id: undefined,
    brand_voice_id: undefined,
    evidence_pack_id: undefined,
    evidence_refs: [],
  },
  imported_from: "manual",
  updated_at: undefined,
};

function buildDefaultSoulConfig(): MemorySoulConfig {
  return {
    ...DEFAULT_SOUL_CONFIG,
    tone: [],
    communication_style: [],
    avoid: [],
    artifact_voice: normalizeSoulArtifactVoiceConfig(
      DEFAULT_SOUL_CONFIG.artifact_voice,
    ),
  };
}

function normalizeText(value?: string | null, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export function normalizeSoulList(items?: string[] | null): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items ?? []) {
    const normalized = normalizeText(item, 120);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_LIST_ITEMS) {
      break;
    }
  }

  return result;
}

export function parseSoulListInput(value: string): string[] {
  return normalizeSoulList(value.split(/[\n,，、;；]+/u));
}

export function formatSoulListInput(items?: string[] | null): string {
  return normalizeSoulList(items).join("\n");
}

export function normalizeSoulArtifactVoiceConfig(
  artifactVoice?: MemorySoulArtifactVoiceConfig | null,
): MemorySoulArtifactVoiceConfig {
  const voiceSource =
    artifactVoice?.voice_source === "brand_voice" ||
    artifactVoice?.voice_source === "creator_voice"
      ? artifactVoice.voice_source
      : undefined;
  const creatorVoiceId =
    voiceSource === "creator_voice"
      ? normalizeText(artifactVoice?.creator_voice_id, 120)
      : undefined;
  const brandVoiceId =
    voiceSource === "brand_voice"
      ? normalizeText(artifactVoice?.brand_voice_id, 120)
      : undefined;

  return {
    enabled: artifactVoice?.enabled ?? false,
    voice_source: voiceSource,
    creator_voice_id: creatorVoiceId,
    brand_voice_id: brandVoiceId,
    evidence_pack_id: normalizeText(artifactVoice?.evidence_pack_id, 120),
    evidence_refs: normalizeSoulList(artifactVoice?.evidence_refs),
  };
}

export function normalizeSoulConfig(
  soul?: MemorySoulConfig | null,
): MemorySoulConfig {
  if (!soul) {
    return buildDefaultSoulConfig();
  }

  return {
    enabled: soul.enabled ?? false,
    name: normalizeText(soul.name, 80),
    summary: normalizeText(soul.summary),
    style_profile_id: normalizeSoulStyleProfileId(soul.style_profile_id),
    tone: normalizeSoulList(soul.tone),
    communication_style: normalizeSoulList(soul.communication_style),
    explanation_depth: normalizeText(soul.explanation_depth, 120),
    challenge_style: normalizeText(soul.challenge_style, 160),
    avoid: normalizeSoulList(soul.avoid),
    artifact_voice: normalizeSoulArtifactVoiceConfig(soul.artifact_voice),
    imported_from: soul.imported_from ?? "manual",
    updated_at: normalizeText(soul.updated_at, 80),
  };
}

export function buildSoulArtifactVoiceGenerationBrief(
  soul?: MemorySoulConfig | null,
): Record<string, unknown> | undefined {
  const artifactVoice = normalizeSoulConfig(soul).artifact_voice;
  if (!artifactVoice?.enabled || !artifactVoice.voice_source) {
    return undefined;
  }

  const generationBrief: Record<string, unknown> = {
    voice_source: artifactVoice.voice_source,
    voice_guard: "user_explicit",
    global_soul_scope: "interaction_only",
    expert_persona_scope: "current_expert_session",
    formal_artifact_voice_source: "generation_brief_only",
    inherits_global_soul: false,
    inherits_expert_persona: false,
    evidence_source: "memory.soul.artifact_voice",
  };

  if (
    artifactVoice.voice_source === "creator_voice" &&
    artifactVoice.creator_voice_id
  ) {
    generationBrief.creator_voice_id = artifactVoice.creator_voice_id;
  }
  if (
    artifactVoice.voice_source === "brand_voice" &&
    artifactVoice.brand_voice_id
  ) {
    generationBrief.brand_voice_id = artifactVoice.brand_voice_id;
  }
  if (artifactVoice.evidence_pack_id) {
    generationBrief.evidence_pack_id = artifactVoice.evidence_pack_id;
  }
  if (artifactVoice.evidence_refs?.length) {
    generationBrief.evidence_refs = artifactVoice.evidence_refs;
  }

  return generationBrief;
}

export function hasSoulContent(soul?: MemorySoulConfig | null): boolean {
  const normalized = normalizeSoulConfig(soul);
  return Boolean(
    normalized.name ||
    normalized.summary ||
    normalized.style_profile_id ||
    normalized.explanation_depth ||
    normalized.challenge_style ||
    normalized.tone?.length ||
    normalized.communication_style?.length ||
    normalized.avoid?.length,
  );
}

function stripMarkdownSyntax(line: string): string {
  return line
    .replace(/^#+\s*/u, "")
    .replace(/^[-*]\s*/u, "")
    .replace(/^\d+\.\s*/u, "")
    .replace(/\*\*/gu, "")
    .trim();
}

function collectMeaningfulLines(markdown: string): string[] {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .split(/\r?\n/u)
    .map(stripMarkdownSyntax)
    .filter((line) => line.length > 0)
    .filter((line) => !/^SOUL\.md$/iu.test(line));
}

function uniqueWarnings(warnings: SoulImportWarningCode[]) {
  return Array.from(new Set(warnings));
}

export function parseSoulMarkdown(
  markdown: string,
  now: Date = new Date(),
): SoulImportResult {
  const trimmed = markdown.trim();
  const warnings: SoulImportWarningCode[] = [];

  if (!trimmed) {
    return {
      canImport: false,
      draft: buildDefaultSoulConfig(),
      preview: "",
      warnings: ["empty"],
    };
  }

  if (trimmed.length > MAX_IMPORT_LENGTH) {
    warnings.push("too_long");
  }
  if (PROJECT_RULE_PATTERN.test(trimmed)) {
    warnings.push("project_rules");
  }
  if (LOCAL_PATH_PATTERN.test(trimmed)) {
    warnings.push("local_path");
  }
  if (SECRET_PATTERN.test(trimmed)) {
    warnings.push("secret_like");
  }

  const lines = collectMeaningfulLines(trimmed.slice(0, MAX_IMPORT_LENGTH));
  const firstHeading = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));
  const name = normalizeText(
    firstHeading ? stripMarkdownSyntax(firstHeading) : undefined,
    80,
  );
  const avoid = lines.filter((line) =>
    /^(避免|不要|禁忌|avoid|do not)/iu.test(line),
  );
  const styleLines = lines.filter((line) =>
    /(风格|语气|人格|身份|tone|style|voice|persona|personality)/iu.test(line),
  );
  const summaryLines = lines
    .filter((line) => !avoid.includes(line))
    .filter((line) => !PROJECT_RULE_PATTERN.test(line))
    .slice(0, 4);
  const communicationStyle =
    styleLines.length > 0 ? styleLines : summaryLines.slice(0, 3);

  const draft = normalizeSoulConfig({
    enabled: true,
    name: name && name !== "SOUL.md" ? name : undefined,
    summary: summaryLines.join(" "),
    communication_style: communicationStyle,
    avoid,
    imported_from: "soul_md",
    updated_at: now.toISOString(),
  });

  return {
    canImport: hasSoulContent(draft),
    draft,
    preview: buildSoulMarkdown(draft),
    warnings: uniqueWarnings(warnings),
  };
}

export function buildSoulMarkdown(soul?: MemorySoulConfig | null): string {
  const normalized = normalizeSoulConfig(soul);
  if (!hasSoulContent(normalized)) {
    return "";
  }

  const lines = ["# SOUL.md", "", "## Interaction Identity"];
  if (normalized.name) {
    lines.push(`- Name: ${normalized.name}`);
  }
  if (normalized.summary) {
    lines.push(`- Summary: ${normalized.summary}`);
  }
  if (normalized.tone?.length) {
    lines.push(`- Tone: ${normalized.tone.join(", ")}`);
  }
  if (normalized.style_profile_id) {
    lines.push("", "## Interaction Style Profile");
    lines.push(`- Style profile: ${normalized.style_profile_id}`);
    lines.push("- Scope: chat interaction and tool narrative only.");
  }
  if (normalized.communication_style?.length) {
    lines.push("", "## Communication Style");
    normalized.communication_style.forEach((item) => lines.push(`- ${item}`));
  }
  if (normalized.explanation_depth) {
    lines.push("", "## Explanation Depth", normalized.explanation_depth);
  }
  if (normalized.challenge_style) {
    lines.push("", "## Challenge Style", normalized.challenge_style);
  }
  if (normalized.avoid?.length) {
    lines.push("", "## Avoid");
    normalized.avoid.forEach((item) => lines.push(`- ${item}`));
  }
  if (normalized.artifact_voice?.enabled) {
    lines.push("", "## Creator / Brand Voice");
    lines.push("- Formal artifact voice is enabled through Generation Brief.");
    if (normalized.artifact_voice.voice_source) {
      lines.push(`- Voice source: ${normalized.artifact_voice.voice_source}`);
    }
    if (
      normalized.artifact_voice.voice_source === "creator_voice" &&
      normalized.artifact_voice.creator_voice_id
    ) {
      lines.push(
        `- Creator voice ID: ${normalized.artifact_voice.creator_voice_id}`,
      );
    }
    if (
      normalized.artifact_voice.voice_source === "brand_voice" &&
      normalized.artifact_voice.brand_voice_id
    ) {
      lines.push(
        `- Brand voice ID: ${normalized.artifact_voice.brand_voice_id}`,
      );
    }
    if (normalized.artifact_voice.evidence_pack_id) {
      lines.push(
        `- Evidence pack ID: ${normalized.artifact_voice.evidence_pack_id}`,
      );
    }
  }

  lines.push(
    "",
    "## Boundary",
    "- This file is an import/export snapshot. Lime runtime should use the saved app config, not this file path.",
    "- Formal artifacts should only use creator or brand voice through an explicit generation brief.",
  );

  return lines.join("\n");
}
