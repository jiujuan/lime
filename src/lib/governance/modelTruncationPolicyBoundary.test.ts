import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const TRUNCATION_POLICY_SOURCE = "src/lib/model/modelTruncationPolicy.ts";

const MODEL_TRUNCATION_POLICY_INPUT_FIELDS = [
  "truncation_policy",
  "truncationPolicy",
];

const MODEL_TRUNCATION_POLICY_CONFIG_FIELDS = ["mode", "limit"];

const MODEL_TRUNCATION_POLICY_FIELDS = [
  "mode",
  "limit",
  "truncation_policy",
];

const FORBIDDEN_INFERENCE_FIELDS = [
  "context_window",
  "max_context_window",
  "auto_compact_token_limit",
  "effective_context_window_percent",
  "tool_mode",
  "supports_parallel_tool_calls",
  "runtime_features",
  "capabilities",
  "input_modalities",
  "output_modalities",
  "provider_name",
  "display_name",
  "tier",
  "status",
  "pricing",
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

describe("Model truncation policy boundary", () => {
  it("只暴露 Codex truncation_policy 形态字段", () => {
    const source = readRepoFile(TRUNCATION_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelTruncationPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelTruncationPolicyInput",
    );
    const configBlock = requireMatch(
      source,
      /export interface ModelTruncationPolicyConfig \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelTruncationPolicyConfig",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelTruncationPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelTruncationPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_TRUNCATION_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(configBlock)).toEqual(
      MODEL_TRUNCATION_POLICY_CONFIG_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_TRUNCATION_POLICY_FIELDS,
    );
  });

  it("不从 context、tool support、runtime features 或 picker/catalog 字段推断截断策略", () => {
    const source = readRepoFile(TRUNCATION_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelTruncationPolicy 不应读取 ${field} 推断 truncation policy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(TRUNCATION_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelTruncationPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });
});
