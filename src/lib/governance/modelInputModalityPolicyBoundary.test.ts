import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const INPUT_MODALITY_POLICY_SOURCE =
  "src/lib/model/modelInputModalityPolicy.ts";

const MODEL_INPUT_MODALITY_POLICY_INPUT_FIELDS = [
  "input_modalities",
  "inputModalities",
  "modalities",
];

const MODEL_INPUT_MODALITY_POLICY_FIELDS = [
  "input_modalities",
  "send_gate_modalities",
  "unknown_input_modalities",
  "supports_text_input",
  "supports_media_input",
  "supports_image_input",
  "source",
];

const FORBIDDEN_INFERENCE_FIELDS = [
  "output_modalities",
  "runtime_features",
  "task_families",
  "capabilities",
  "vision",
  "tools",
  "reasoning",
  "supports_media_output",
  "display_name",
  "provider_name",
  "tier",
  "status",
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

describe("Model input modality policy boundary", () => {
  it("只暴露 Codex input_modalities 与 opencode modalities.input 入口", () => {
    const source = readRepoFile(INPUT_MODALITY_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelInputModalityPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelInputModalityPolicyInput",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelInputModalityPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelInputModalityPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_INPUT_MODALITY_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_INPUT_MODALITY_POLICY_FIELDS,
    );
  });

  it("不从输出模态、任务族、runtime features 或 picker/catalog 字段推断输入能力", () => {
    const source = readRepoFile(INPUT_MODALITY_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelInputModalityPolicy 不应读取 ${field} 推断输入模态`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(INPUT_MODALITY_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelInputModalityPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });
});
