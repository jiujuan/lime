import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const REASONING_OUTPUT_POLICY_SOURCE =
  "src/lib/model/modelReasoningOutputPolicy.ts";

const MODEL_REASONING_OUTPUT_POLICY_INPUT_FIELDS = [
  "default_reasoning_summary",
  "defaultReasoningSummary",
  "support_verbosity",
  "supportVerbosity",
  "default_verbosity",
  "defaultVerbosity",
];

const MODEL_REASONING_OUTPUT_POLICY_FIELDS = [
  "default_reasoning_summary",
  "support_verbosity",
  "default_verbosity",
  "can_set_verbosity",
];

const FORBIDDEN_INFERENCE_FIELDS = [
  "capabilities",
  "runtime_features",
  "input_modalities",
  "output_modalities",
  "task_families",
  "display_name",
  "provider_name",
  "tier",
  "status",
  "release_date",
  "is_latest",
  "pricing",
  "deployment_source",
  "management_plane",
  "alias_source",
  "tool_mode",
  "web_search_tool_type",
  "supports_search_tool",
  "supports_parallel_tool_calls",
  "service_tiers",
  "visibility",
  "default_reasoning_level",
  "supported_reasoning_levels",
];

const FORBIDDEN_DEPENDENCY_TOKENS = [
  "modelRegistry",
  "apiKeyProvider",
  "inferModelCapabilities",
  "ModelCapabilitySummary",
  "ModelReasoningEffortLevel",
  "safeInvoke",
  "desktop-host",
  "Inputbar",
  "React",
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function requireMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  expect(match, `${label} not found`).not.toBeNull();
  return match?.groups?.body ?? match?.[1] ?? "";
}

function extractTypeFieldNames(block: string): string[] {
  return [...block.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gmu)].map(
    (match) => match[1],
  );
}

describe("Model reasoning output policy boundary", () => {
  it("只暴露 Codex 式 reasoning summary / verbosity 字段", () => {
    const source = readRepoFile(REASONING_OUTPUT_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelReasoningOutputPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelReasoningOutputPolicyInput",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelReasoningOutputPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelReasoningOutputPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_REASONING_OUTPUT_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_REASONING_OUTPUT_POLICY_FIELDS,
    );
  });

  it("不从 capability summary、runtime features 或 picker/catalog 字段推断输出策略", () => {
    const source = readRepoFile(REASONING_OUTPUT_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelReasoningOutputPolicy 不应读取 ${field} 推断输出策略`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、旧 Lime 窄枚举、bridge 或 UI", () => {
    const source = readRepoFile(REASONING_OUTPUT_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelReasoningOutputPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });
});
