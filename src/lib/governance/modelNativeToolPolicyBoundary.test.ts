import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const NATIVE_TOOL_POLICY_SOURCE = "src/lib/model/modelNativeToolPolicy.ts";

const MODEL_NATIVE_TOOL_POLICY_INPUT_FIELDS = [
  "shell_type",
  "shellType",
  "apply_patch_tool_type",
  "applyPatchToolType",
  "experimental_supported_tools",
  "experimentalSupportedTools",
];

const MODEL_NATIVE_TOOL_POLICY_FIELDS = [
  "shell_type",
  "shell_tool_enabled",
  "preferred_shell_surface",
  "apply_patch_tool_type",
  "apply_patch_tool_enabled",
  "experimental_supported_tools",
];

const FORBIDDEN_INFERENCE_FIELDS = [
  "capabilities",
  "runtime_features",
  "task_families",
  "input_modalities",
  "output_modalities",
  "supports_tools",
  "supports_parallel_tool_calls",
  "tool_mode",
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

describe("Model native tool policy boundary", () => {
  it("只暴露 Codex native tool surface 字段", () => {
    const source = readRepoFile(NATIVE_TOOL_POLICY_SOURCE);
    const inputBlock = requireMatch(
      source,
      /export interface ModelNativeToolPolicyInput \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelNativeToolPolicyInput",
    );
    const policyBlock = requireMatch(
      source,
      /export interface ModelNativeToolPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelNativeToolPolicy",
    );

    expect(extractTypeFieldNames(inputBlock)).toEqual(
      MODEL_NATIVE_TOOL_POLICY_INPUT_FIELDS,
    );
    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_NATIVE_TOOL_POLICY_FIELDS,
    );
  });

  it("不从 generic tools、runtime features 或 picker/catalog 字段推断 native tool surface", () => {
    const source = readRepoFile(NATIVE_TOOL_POLICY_SOURCE);

    for (const field of FORBIDDEN_INFERENCE_FIELDS) {
      expect(
        source,
        `modelNativeToolPolicy 不应读取 ${field} 推断 native tool surface`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(NATIVE_TOOL_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(source, `modelNativeToolPolicy 不应依赖 ${token}`).not.toContain(
        token,
      );
    }
  });
});
