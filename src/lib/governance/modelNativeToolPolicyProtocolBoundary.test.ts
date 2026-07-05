import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();
const RUST_PROTOCOL_SOURCE =
  "lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs";
const SCHEMA_BUNDLE_SOURCE =
  "lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json";
const GENERATED_PROTOCOL_TYPES_SOURCE =
  "packages/app-server-client/src/generated/protocol-types.ts";
const MODEL_REGISTRY_TYPES_SOURCE = "src/lib/types/modelRegistry.ts";
const MODEL_REGISTRY_API_SOURCE = "src/lib/api/modelRegistry.ts";
const NATIVE_TOOL_POLICY_SOURCE = "src/lib/model/modelNativeToolPolicy.ts";

const NATIVE_TOOL_POLICY_WIRE_FIELDS = [
  "shell_type",
  "apply_patch_tool_type",
  "experimental_supported_tools",
];

const NATIVE_TOOL_POLICY_TS_FIELDS = [
  "shellType",
  "applyPatchToolType",
  "experimentalSupportedTools",
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function requireMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  expect(match, `${label} not found`).not.toBeNull();
  return match?.groups?.body ?? match?.[1] ?? "";
}

function extractRustPubFieldNames(source: string, name: string): string[] {
  const body = requireMatch(
    source,
    new RegExp(`pub struct ${name} \\{\\n(?<body>[\\s\\S]*?)\\n\\}`, "u"),
    name,
  );
  return [...body.matchAll(/^\s+pub\s+([a-zA-Z_][a-zA-Z0-9_]*):/gmu)].map(
    (match) => match[1],
  );
}

function extractTypeFieldNames(source: string, name: string): string[] {
  const body = requireMatch(
    source,
    new RegExp(`export interface ${name} \\{\\n(?<body>[\\s\\S]*?)\\n\\}`, "u"),
    name,
  );
  return [...body.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gmu)].map(
    (match) => match[1],
  );
}

function extractSchemaFieldNames(path: string, name: string): string[] {
  const schema = JSON.parse(readRepoFile(path)) as {
    $defs?: Record<string, { properties?: Record<string, unknown> }>;
  };
  return Object.keys(schema.$defs?.[name]?.properties ?? {});
}

function expectAllOrNone(
  label: string,
  actualFields: string[],
  expectedFields: string[],
): void {
  const presentFields = expectedFields.filter((field) =>
    actualFields.includes(field),
  );
  const missingFields = expectedFields.filter(
    (field) => !actualFields.includes(field),
  );

  expect(
    presentFields.length === 0 || missingFields.length === 0,
    `${label} native tool policy protocol fields must roll out as a complete set; present=${presentFields.join(
      ", ",
    )}; missing=${missingFields.join(", ")}`,
  ).toBe(true);
}

function hasAnyField(actualFields: string[], expectedFields: string[]): boolean {
  return expectedFields.some((field) => actualFields.includes(field));
}

describe("Model native tool policy protocol boundary", () => {
  it("App Server ModelInfo native tool policy 字段必须协议 / schema / generated TS 成组同步", () => {
    const rustFields = extractRustPubFieldNames(
      readRepoFile(RUST_PROTOCOL_SOURCE),
      "ModelInfo",
    );
    const schemaFields = extractSchemaFieldNames(SCHEMA_BUNDLE_SOURCE, "ModelInfo");
    const generatedFields = extractTypeFieldNames(
      readRepoFile(GENERATED_PROTOCOL_TYPES_SOURCE),
      "ModelInfo",
    );

    expectAllOrNone(
      "Rust ModelInfo",
      rustFields,
      NATIVE_TOOL_POLICY_WIRE_FIELDS,
    );
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      NATIVE_TOOL_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      NATIVE_TOOL_POLICY_TS_FIELDS,
    );

    const rustHasPolicy = hasAnyField(rustFields, NATIVE_TOOL_POLICY_WIRE_FIELDS);
    const schemaHasPolicy = hasAnyField(schemaFields, NATIVE_TOOL_POLICY_TS_FIELDS);
    const generatedHasPolicy = hasAnyField(
      generatedFields,
      NATIVE_TOOL_POLICY_TS_FIELDS,
    );

    expect(
      rustHasPolicy === schemaHasPolicy && schemaHasPolicy === generatedHasPolicy,
      "native tool policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
  });

  it("registry projection 继续只通过 native tool policy owner 暴露协议字段", () => {
    const registryTypeSource = readRepoFile(MODEL_REGISTRY_TYPES_SOURCE);
    const registryApiSource = readRepoFile(MODEL_REGISTRY_API_SOURCE);
    const nativeToolPolicySource = readRepoFile(NATIVE_TOOL_POLICY_SOURCE);
    const rustFields = extractRustPubFieldNames(
      readRepoFile(RUST_PROTOCOL_SOURCE),
      "ModelInfo",
    );
    const schemaFields = extractSchemaFieldNames(SCHEMA_BUNDLE_SOURCE, "ModelInfo");
    const generatedFields = extractTypeFieldNames(
      readRepoFile(GENERATED_PROTOCOL_TYPES_SOURCE),
      "ModelInfo",
    );
    const hasProtocolFields =
      hasAnyField(rustFields, NATIVE_TOOL_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, NATIVE_TOOL_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, NATIVE_TOOL_POLICY_TS_FIELDS);

    for (const field of NATIVE_TOOL_POLICY_WIRE_FIELDS) {
      expect(
        nativeToolPolicySource,
        `ModelNativeToolPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelNativeToolPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    for (const field of NATIVE_TOOL_POLICY_TS_FIELDS) {
      expect(
        nativeToolPolicySource,
        `ModelNativeToolPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
    }

    const hasRegistryProjection =
      registryTypeSource.includes("native_tool_policy?: ModelNativeToolPolicy;") ||
      registryApiSource.includes("native_tool_policy:");

    expect(registryApiSource).not.toMatch(/\bnative_tool_policy\b\s*:\s*\{/u);

    if (hasProtocolFields || hasRegistryProjection) {
      expect(registryTypeSource).toContain(
        "native_tool_policy?: ModelNativeToolPolicy;",
      );
      expect(registryApiSource).toContain(
        "native_tool_policy: buildModelNativeToolPolicy(",
      );
    }
  });
});
