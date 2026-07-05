import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const TOOL_CALL_POLICY_SOURCE = "src/lib/model/modelToolCallPolicy.ts";

const MODEL_TOOL_CALL_POLICY_FIELDS = [
  "supports_parallel_tool_calls",
  "parallel_tool_calls",
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
  "service_tiers",
  "visibility",
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
  return [...block.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*):/gmu)].map(
    (match) => match[1],
  );
}

describe("Model tool call policy boundary", () => {
  it("只暴露 Codex 式并行工具调用策略字段", () => {
    const source = readRepoFile(TOOL_CALL_POLICY_SOURCE);
    const policyBlock = requireMatch(
      source,
      /export interface ModelToolCallPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelToolCallPolicy",
    );

    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_TOOL_CALL_POLICY_FIELDS,
    );
  });

  it("不从 capabilities、runtime features 或 picker/catalog 字段推断并行工具调用", () => {
    const source = readRepoFile(TOOL_CALL_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelToolCallPolicy 不应读取 ${field} 推断 supports_parallel_tool_calls`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(TOOL_CALL_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelToolCallPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });
});
