import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const PICKER_POLICY_SOURCE = "src/lib/model/modelPickerPolicy.ts";

const MODEL_PICKER_POLICY_INPUT_FIELDS = [
  "visibility",
  "service_tiers",
  "serviceTiers",
  "default_service_tier",
  "defaultServiceTier",
];

const MODEL_PICKER_POLICY_FIELDS = [
  "visibility",
  "show_in_picker",
  "service_tiers",
  "supported_service_tier_ids",
  "default_service_tier",
];

const EXECUTION_OR_CONTEXT_FIELDS = [
  "tool_mode",
  "supports_search_tool",
  "web_search_tool_type",
  "supports_image_detail_original",
  "context_window",
  "max_context_window",
  "auto_compact_token_limit",
  "effective_context_window_percent",
  "capabilities",
  "input_modalities",
  "output_modalities",
  "runtime_features",
  "pricing",
  "provider_name",
  "status",
];

const FORBIDDEN_DEPENDENCY_TOKENS = [
  "modelRegistry",
  "apiKeyProvider",
  "inferModelCapabilities",
  "ModelCapabilitySummary",
  "modelExecutionPolicy",
  "modelContextPolicy",
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

describe("Model picker policy boundary", () => {
  it("只暴露 Codex 式 picker / service tier 字段", () => {
    const source = readRepoFile(PICKER_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelPickerPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelPickerPolicyInput",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelPickerPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelPickerPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_PICKER_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_PICKER_POLICY_FIELDS,
    );
  });

  it("不从 execution / context / capability / provider catalog 字段推断 picker policy", () => {
    const source = readRepoFile(PICKER_POLICY_SOURCE);

    for (const field of EXECUTION_OR_CONTEXT_FIELDS) {
      expect(
        source,
        `modelPickerPolicy 不应读取非 picker 字段 ${field}`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、execution/context owner、bridge 或 UI", () => {
    const source = readRepoFile(PICKER_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(source, `modelPickerPolicy 不应依赖 ${token}`).not.toContain(
        token,
      );
    }
  });

  it("request service tier 只从 picker policy supported ids 过滤", () => {
    const source = readRepoFile(PICKER_POLICY_SOURCE);
    const requestTierBlock = requireMatch(
      source,
      /(?<body>export function resolveModelServiceTierForRequest[\s\S]*)$/u,
      "resolveModelServiceTierForRequest",
    );

    expect(requestTierBlock).toContain("MODEL_SERVICE_TIER_DEFAULT_REQUEST_VALUE");
    expect(requestTierBlock).toContain("policy.supported_service_tier_ids");
    expect(requestTierBlock).not.toMatch(/\bdefault_service_tier\b/u);
  });
});
