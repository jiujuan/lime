import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const RESPONSES_POLICY_SOURCE = "src/lib/model/modelResponsesPolicy.ts";

const MODEL_RESPONSES_POLICY_INPUT_FIELDS = [
  "use_responses_lite",
  "useResponsesLite",
];

const MODEL_RESPONSES_POLICY_FIELDS = [
  "use_responses_lite",
  "request_mode",
  "instructions_location",
  "tools_location",
  "reasoning_context",
  "parallel_tool_calls_allowed",
  "requires_responses_lite_header",
];

const FORBIDDEN_INFERENCE_FIELDS = [
  "capabilities",
  "runtime_features",
  "input_modalities",
  "output_modalities",
  "task_families",
  "protocol",
  "provider_name",
  "display_name",
  "tier",
  "status",
  "pricing",
  "tool_mode",
  "supports_search_tool",
  "web_search_tool_type",
  "supports_parallel_tool_calls",
  "supports_reasoning_summaries",
  "default_reasoning_level",
  "supported_reasoning_levels",
  "default_reasoning_summary",
  "support_verbosity",
  "default_verbosity",
];

const FORBIDDEN_DEPENDENCY_TOKENS = [
  "modelRegistry",
  "apiKeyProvider",
  "inferModelCapabilities",
  "ModelCapabilitySummary",
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

describe("Model responses policy boundary", () => {
  it("只暴露 Codex use_responses_lite 请求形态字段", () => {
    const source = readRepoFile(RESPONSES_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelResponsesPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelResponsesPolicyInput",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelResponsesPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelResponsesPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_RESPONSES_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_RESPONSES_POLICY_FIELDS,
    );
  });

  it("不从 protocol、runtime features、tool support 或 picker/catalog 字段推断 request mode", () => {
    const source = readRepoFile(RESPONSES_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelResponsesPolicy 不应读取 ${field} 推断 Responses request mode`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(RESPONSES_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelResponsesPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });
});
