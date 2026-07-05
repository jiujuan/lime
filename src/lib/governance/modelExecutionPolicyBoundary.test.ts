import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const EXECUTION_POLICY_SOURCE = "src/lib/model/modelExecutionPolicy.ts";
const MODEL_REGISTRY_API_SOURCE = "src/lib/api/modelRegistry.ts";
const MODEL_REGISTRY_TYPES_SOURCE = "src/lib/types/modelRegistry.ts";

const MODEL_EXECUTION_POLICY_FIELDS = [
  "tool_mode",
  "supports_search_tool",
  "web_search_tool_type",
  "search_content_modalities",
  "supports_image_detail_original",
  "allowed_image_detail_values",
  "default_image_detail",
];

const PICKER_OR_CATALOG_FIELDS = [
  "display_name",
  "provider_name",
  "tier",
  "status",
  "release_date",
  "is_latest",
  "created_at",
  "updated_at",
  "pricing",
  "deployment_source",
  "management_plane",
  "alias_source",
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

describe("Model execution policy boundary", () => {
  it("只暴露 Codex 式 execution policy 字段", () => {
    const source = readRepoFile(EXECUTION_POLICY_SOURCE);
    const policyBlock = requireMatch(
      source,
      /export interface ModelExecutionPolicy \{\n(?<body>[\s\S]*?)\n\}/u,
      "ModelExecutionPolicy",
    );

    expect(extractTypeFieldNames(policyBlock)).toEqual(
      MODEL_EXECUTION_POLICY_FIELDS,
    );
  });

  it("不从 picker 或 catalog 字段推断 execution policy", () => {
    const source = readRepoFile(EXECUTION_POLICY_SOURCE);

    for (const field of PICKER_OR_CATALOG_FIELDS) {
      expect(
        source,
        `modelExecutionPolicy 不应读取 picker/catalog 字段 ${field}`,
      ).not.toMatch(new RegExp(`\\b${field}\\b`, "u"));
    }
  });

  it("保持纯 owner，不依赖 registry、capability summary、bridge 或 UI", () => {
    const source = readRepoFile(EXECUTION_POLICY_SOURCE);

    for (const token of FORBIDDEN_DEPENDENCY_TOKENS) {
      expect(
        source,
        `modelExecutionPolicy 不应依赖 ${token}`,
      ).not.toContain(token);
    }
  });

  it("registry metadata 只能通过 execution policy owner 暴露归一结果", () => {
    const apiSource = readRepoFile(MODEL_REGISTRY_API_SOURCE);
    const typeSource = readRepoFile(MODEL_REGISTRY_TYPES_SOURCE);

    expect(typeSource).toContain(
      'import type { ModelExecutionPolicy } from "@/lib/model/modelExecutionPolicy";',
    );
    expect(typeSource).toContain("execution_policy?: ModelExecutionPolicy;");
    expect(apiSource).toContain("buildModelExecutionPolicy(");
    expect(apiSource).toContain("execution_policy: buildModelExecutionPolicy(");
    expect(apiSource).not.toMatch(/\btoolMode:\s*model\./u);
    expect(apiSource).not.toMatch(/\bsupportsSearchTool:\s*model\./u);
    expect(apiSource).not.toMatch(/\bwebSearchToolType:\s*model\./u);
    expect(apiSource).not.toMatch(/\bsupportsImageDetailOriginal:\s*model\./u);
  });
});
