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
const EXECUTION_POLICY_SOURCE = "src/lib/model/modelExecutionPolicy.ts";
const CONTEXT_POLICY_SOURCE = "src/lib/model/modelContextPolicy.ts";
const PICKER_POLICY_SOURCE = "src/lib/model/modelPickerPolicy.ts";
const TOOL_CALL_POLICY_SOURCE = "src/lib/model/modelToolCallPolicy.ts";
const REASONING_POLICY_SOURCE = "src/lib/model/modelReasoningPolicy.ts";
const REASONING_OUTPUT_POLICY_SOURCE =
  "src/lib/model/modelReasoningOutputPolicy.ts";
const INPUT_MODALITY_POLICY_SOURCE =
  "src/lib/model/modelInputModalityPolicy.ts";
const RESPONSES_POLICY_SOURCE = "src/lib/model/modelResponsesPolicy.ts";
const TRUNCATION_POLICY_SOURCE = "src/lib/model/modelTruncationPolicy.ts";

const EXECUTION_POLICY_WIRE_FIELDS = [
  "tool_mode",
  "supports_search_tool",
  "web_search_tool_type",
  "supports_image_detail_original",
];

const EXECUTION_POLICY_TS_FIELDS = [
  "toolMode",
  "supportsSearchTool",
  "webSearchToolType",
  "supportsImageDetailOriginal",
];

const CONTEXT_POLICY_WIRE_FIELDS = [
  "context_window",
  "max_context_window",
  "auto_compact_token_limit",
  "effective_context_window_percent",
];

const CONTEXT_POLICY_TS_FIELDS = [
  "contextWindow",
  "maxContextWindow",
  "autoCompactTokenLimit",
  "effectiveContextWindowPercent",
];

const PICKER_POLICY_WIRE_FIELDS = [
  "visibility",
  "service_tiers",
  "default_service_tier",
];

const PICKER_POLICY_TS_FIELDS = [
  "visibility",
  "serviceTiers",
  "defaultServiceTier",
];

const TOOL_CALL_POLICY_WIRE_FIELDS = ["supports_parallel_tool_calls"];

const TOOL_CALL_POLICY_TS_FIELDS = ["supportsParallelToolCalls"];

const REASONING_POLICY_WIRE_FIELDS = [
  "default_reasoning_level",
  "supported_reasoning_levels",
  "supports_reasoning_summaries",
];

const REASONING_POLICY_TS_FIELDS = [
  "defaultReasoningLevel",
  "supportedReasoningLevels",
  "supportsReasoningSummaries",
];

const REASONING_OUTPUT_POLICY_WIRE_FIELDS = [
  "default_reasoning_summary",
  "support_verbosity",
  "default_verbosity",
];

const REASONING_OUTPUT_POLICY_TS_FIELDS = [
  "defaultReasoningSummary",
  "supportVerbosity",
  "defaultVerbosity",
];

const INPUT_MODALITY_POLICY_WIRE_FIELDS = ["input_modalities"];

const INPUT_MODALITY_POLICY_TS_FIELDS = ["inputModalities"];

const RESPONSES_POLICY_WIRE_FIELDS = ["use_responses_lite"];

const RESPONSES_POLICY_TS_FIELDS = ["useResponsesLite"];

const TRUNCATION_POLICY_WIRE_FIELDS = ["truncation_policy"];

const TRUNCATION_POLICY_TS_FIELDS = ["truncationPolicy"];

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
    `${label} policy protocol fields must roll out as a complete set; present=${presentFields.join(
      ", ",
    )}; missing=${missingFields.join(", ")}`,
  ).toBe(true);
}

function hasAnyField(
  actualFields: string[],
  expectedFields: string[],
): boolean {
  return expectedFields.some((field) => actualFields.includes(field));
}

describe("Model execution policy protocol boundary", () => {
  it("App Server ModelInfo policy 字段必须协议 / schema / generated TS 成组同步", () => {
    const rustFields = extractRustPubFieldNames(
      readRepoFile(RUST_PROTOCOL_SOURCE),
      "ModelInfo",
    );
    const schemaFields = extractSchemaFieldNames(
      SCHEMA_BUNDLE_SOURCE,
      "ModelInfo",
    );
    const generatedFields = extractTypeFieldNames(
      readRepoFile(GENERATED_PROTOCOL_TYPES_SOURCE),
      "ModelInfo",
    );

    expectAllOrNone("Rust ModelInfo", rustFields, EXECUTION_POLICY_WIRE_FIELDS);
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      EXECUTION_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      EXECUTION_POLICY_TS_FIELDS,
    );
    expectAllOrNone("Rust ModelInfo", rustFields, CONTEXT_POLICY_WIRE_FIELDS);
    expectAllOrNone("schema ModelInfo", schemaFields, CONTEXT_POLICY_TS_FIELDS);
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      CONTEXT_POLICY_TS_FIELDS,
    );
    expectAllOrNone("Rust ModelInfo", rustFields, PICKER_POLICY_WIRE_FIELDS);
    expectAllOrNone("schema ModelInfo", schemaFields, PICKER_POLICY_TS_FIELDS);
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      PICKER_POLICY_TS_FIELDS,
    );
    expectAllOrNone("Rust ModelInfo", rustFields, TOOL_CALL_POLICY_WIRE_FIELDS);
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      TOOL_CALL_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      TOOL_CALL_POLICY_TS_FIELDS,
    );
    expectAllOrNone("Rust ModelInfo", rustFields, REASONING_POLICY_WIRE_FIELDS);
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      REASONING_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      REASONING_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "Rust ModelInfo",
      rustFields,
      REASONING_OUTPUT_POLICY_WIRE_FIELDS,
    );
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      REASONING_OUTPUT_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      REASONING_OUTPUT_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "Rust ModelInfo",
      rustFields,
      INPUT_MODALITY_POLICY_WIRE_FIELDS,
    );
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      INPUT_MODALITY_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      INPUT_MODALITY_POLICY_TS_FIELDS,
    );
    expectAllOrNone("Rust ModelInfo", rustFields, RESPONSES_POLICY_WIRE_FIELDS);
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      RESPONSES_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      RESPONSES_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "Rust ModelInfo",
      rustFields,
      TRUNCATION_POLICY_WIRE_FIELDS,
    );
    expectAllOrNone(
      "schema ModelInfo",
      schemaFields,
      TRUNCATION_POLICY_TS_FIELDS,
    );
    expectAllOrNone(
      "generated TS ModelInfo",
      generatedFields,
      TRUNCATION_POLICY_TS_FIELDS,
    );

    const rustHasExecutionPolicy = hasAnyField(
      rustFields,
      EXECUTION_POLICY_WIRE_FIELDS,
    );
    const schemaHasExecutionPolicy = hasAnyField(
      schemaFields,
      EXECUTION_POLICY_TS_FIELDS,
    );
    const generatedHasExecutionPolicy = hasAnyField(
      generatedFields,
      EXECUTION_POLICY_TS_FIELDS,
    );
    const rustHasContextPolicy = hasAnyField(
      rustFields,
      CONTEXT_POLICY_WIRE_FIELDS,
    );
    const schemaHasContextPolicy = hasAnyField(
      schemaFields,
      CONTEXT_POLICY_TS_FIELDS,
    );
    const generatedHasContextPolicy = hasAnyField(
      generatedFields,
      CONTEXT_POLICY_TS_FIELDS,
    );
    const rustHasPickerPolicy = hasAnyField(
      rustFields,
      PICKER_POLICY_WIRE_FIELDS,
    );
    const schemaHasPickerPolicy = hasAnyField(
      schemaFields,
      PICKER_POLICY_TS_FIELDS,
    );
    const generatedHasPickerPolicy = hasAnyField(
      generatedFields,
      PICKER_POLICY_TS_FIELDS,
    );
    const rustHasToolCallPolicy = hasAnyField(
      rustFields,
      TOOL_CALL_POLICY_WIRE_FIELDS,
    );
    const schemaHasToolCallPolicy = hasAnyField(
      schemaFields,
      TOOL_CALL_POLICY_TS_FIELDS,
    );
    const generatedHasToolCallPolicy = hasAnyField(
      generatedFields,
      TOOL_CALL_POLICY_TS_FIELDS,
    );
    const rustHasReasoningPolicy = hasAnyField(
      rustFields,
      REASONING_POLICY_WIRE_FIELDS,
    );
    const schemaHasReasoningPolicy = hasAnyField(
      schemaFields,
      REASONING_POLICY_TS_FIELDS,
    );
    const generatedHasReasoningPolicy = hasAnyField(
      generatedFields,
      REASONING_POLICY_TS_FIELDS,
    );
    const rustHasReasoningOutputPolicy = hasAnyField(
      rustFields,
      REASONING_OUTPUT_POLICY_WIRE_FIELDS,
    );
    const schemaHasReasoningOutputPolicy = hasAnyField(
      schemaFields,
      REASONING_OUTPUT_POLICY_TS_FIELDS,
    );
    const generatedHasReasoningOutputPolicy = hasAnyField(
      generatedFields,
      REASONING_OUTPUT_POLICY_TS_FIELDS,
    );
    const rustHasInputModalityPolicy = hasAnyField(
      rustFields,
      INPUT_MODALITY_POLICY_WIRE_FIELDS,
    );
    const schemaHasInputModalityPolicy = hasAnyField(
      schemaFields,
      INPUT_MODALITY_POLICY_TS_FIELDS,
    );
    const generatedHasInputModalityPolicy = hasAnyField(
      generatedFields,
      INPUT_MODALITY_POLICY_TS_FIELDS,
    );
    const rustHasResponsesPolicy = hasAnyField(
      rustFields,
      RESPONSES_POLICY_WIRE_FIELDS,
    );
    const schemaHasResponsesPolicy = hasAnyField(
      schemaFields,
      RESPONSES_POLICY_TS_FIELDS,
    );
    const generatedHasResponsesPolicy = hasAnyField(
      generatedFields,
      RESPONSES_POLICY_TS_FIELDS,
    );
    const rustHasTruncationPolicy = hasAnyField(
      rustFields,
      TRUNCATION_POLICY_WIRE_FIELDS,
    );
    const schemaHasTruncationPolicy = hasAnyField(
      schemaFields,
      TRUNCATION_POLICY_TS_FIELDS,
    );
    const generatedHasTruncationPolicy = hasAnyField(
      generatedFields,
      TRUNCATION_POLICY_TS_FIELDS,
    );

    expect(
      rustHasExecutionPolicy === schemaHasExecutionPolicy &&
        schemaHasExecutionPolicy === generatedHasExecutionPolicy,
      "execution policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasContextPolicy === schemaHasContextPolicy &&
        schemaHasContextPolicy === generatedHasContextPolicy,
      "context policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasPickerPolicy === schemaHasPickerPolicy &&
        schemaHasPickerPolicy === generatedHasPickerPolicy,
      "picker policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasToolCallPolicy === schemaHasToolCallPolicy &&
        schemaHasToolCallPolicy === generatedHasToolCallPolicy,
      "tool-call policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasReasoningPolicy === schemaHasReasoningPolicy &&
        schemaHasReasoningPolicy === generatedHasReasoningPolicy,
      "reasoning policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasReasoningOutputPolicy === schemaHasReasoningOutputPolicy &&
        schemaHasReasoningOutputPolicy === generatedHasReasoningOutputPolicy,
      "reasoning output policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasInputModalityPolicy === schemaHasInputModalityPolicy &&
        schemaHasInputModalityPolicy === generatedHasInputModalityPolicy,
      "input modality policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasResponsesPolicy === schemaHasResponsesPolicy &&
        schemaHasResponsesPolicy === generatedHasResponsesPolicy,
      "responses policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
    expect(
      rustHasTruncationPolicy === schemaHasTruncationPolicy &&
        schemaHasTruncationPolicy === generatedHasTruncationPolicy,
      "truncation policy protocol fields must not exist on only one protocol surface",
    ).toBe(true);
  });

  it("registry projection 继续只通过 policy owner 暴露协议字段", () => {
    const registryTypeSource = readRepoFile(MODEL_REGISTRY_TYPES_SOURCE);
    const registryApiSource = readRepoFile(MODEL_REGISTRY_API_SOURCE);
    const executionPolicySource = readRepoFile(EXECUTION_POLICY_SOURCE);
    const contextPolicySource = readRepoFile(CONTEXT_POLICY_SOURCE);
    const pickerPolicySource = readRepoFile(PICKER_POLICY_SOURCE);
    const toolCallPolicySource = readRepoFile(TOOL_CALL_POLICY_SOURCE);
    const reasoningPolicySource = readRepoFile(REASONING_POLICY_SOURCE);
    const reasoningOutputPolicySource = readRepoFile(
      REASONING_OUTPUT_POLICY_SOURCE,
    );
    const inputModalityPolicySource = readRepoFile(
      INPUT_MODALITY_POLICY_SOURCE,
    );
    const responsesPolicySource = readRepoFile(RESPONSES_POLICY_SOURCE);
    const truncationPolicySource = readRepoFile(TRUNCATION_POLICY_SOURCE);
    const rustFields = extractRustPubFieldNames(
      readRepoFile(RUST_PROTOCOL_SOURCE),
      "ModelInfo",
    );
    const schemaFields = extractSchemaFieldNames(
      SCHEMA_BUNDLE_SOURCE,
      "ModelInfo",
    );
    const generatedFields = extractTypeFieldNames(
      readRepoFile(GENERATED_PROTOCOL_TYPES_SOURCE),
      "ModelInfo",
    );
    const hasContextProtocolFields =
      hasAnyField(rustFields, CONTEXT_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, CONTEXT_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, CONTEXT_POLICY_TS_FIELDS);
    const hasPickerProtocolFields =
      hasAnyField(rustFields, PICKER_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, PICKER_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, PICKER_POLICY_TS_FIELDS);
    const hasToolCallProtocolFields =
      hasAnyField(rustFields, TOOL_CALL_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, TOOL_CALL_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, TOOL_CALL_POLICY_TS_FIELDS);
    const hasReasoningProtocolFields =
      hasAnyField(rustFields, REASONING_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, REASONING_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, REASONING_POLICY_TS_FIELDS);
    const hasReasoningOutputProtocolFields =
      hasAnyField(rustFields, REASONING_OUTPUT_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, REASONING_OUTPUT_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, REASONING_OUTPUT_POLICY_TS_FIELDS);
    const hasResponsesProtocolFields =
      hasAnyField(rustFields, RESPONSES_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, RESPONSES_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, RESPONSES_POLICY_TS_FIELDS);
    const hasTruncationProtocolFields =
      hasAnyField(rustFields, TRUNCATION_POLICY_WIRE_FIELDS) ||
      hasAnyField(schemaFields, TRUNCATION_POLICY_TS_FIELDS) ||
      hasAnyField(generatedFields, TRUNCATION_POLICY_TS_FIELDS);

    expect(registryTypeSource).toContain(
      "execution_policy?: ModelExecutionPolicy;",
    );
    expect(registryApiSource).toContain(
      "execution_policy: buildModelExecutionPolicy(",
    );

    for (const field of EXECUTION_POLICY_WIRE_FIELDS) {
      expect(
        executionPolicySource,
        `ModelExecutionPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelExecutionPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    for (const field of CONTEXT_POLICY_WIRE_FIELDS) {
      expect(
        contextPolicySource,
        `ModelContextPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelContextPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    if (hasContextProtocolFields) {
      expect(registryTypeSource).toContain(
        "context_policy?: ModelContextPolicy;",
      );
      expect(registryApiSource).toContain(
        "context_policy: buildModelContextPolicy(",
      );
    }

    for (const field of PICKER_POLICY_WIRE_FIELDS) {
      expect(
        pickerPolicySource,
        `ModelPickerPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelPickerPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    if (hasPickerProtocolFields) {
      expect(registryTypeSource).toContain(
        "picker_policy?: ModelPickerPolicy;",
      );
      expect(registryApiSource).toContain(
        "picker_policy: buildModelPickerPolicy(",
      );
    }

    for (const field of TOOL_CALL_POLICY_WIRE_FIELDS) {
      expect(
        toolCallPolicySource,
        `ModelToolCallPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelToolCallPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    if (hasToolCallProtocolFields) {
      expect(registryTypeSource).toContain(
        "tool_call_policy?: ModelToolCallPolicy;",
      );
      expect(registryApiSource).toContain(
        "tool_call_policy: buildModelToolCallPolicy(",
      );
    }

    for (const field of REASONING_POLICY_WIRE_FIELDS) {
      expect(
        reasoningPolicySource,
        `ModelReasoningPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelReasoningPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    if (hasReasoningProtocolFields) {
      expect(registryTypeSource).toContain(
        "reasoning_policy?: ModelReasoningPolicy;",
      );
      expect(registryApiSource).toContain(
        "reasoning_policy: buildModelReasoningPolicy(",
      );
    }

    for (const field of REASONING_OUTPUT_POLICY_WIRE_FIELDS) {
      expect(
        reasoningOutputPolicySource,
        `ModelReasoningOutputPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelReasoningOutputPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    if (hasReasoningOutputProtocolFields) {
      expect(registryTypeSource).toContain(
        "reasoning_output_policy?: ModelReasoningOutputPolicy;",
      );
      expect(registryApiSource).toContain(
        "reasoning_output_policy: buildModelReasoningOutputPolicy(",
      );
    }

    for (const field of INPUT_MODALITY_POLICY_WIRE_FIELDS) {
      expect(
        inputModalityPolicySource,
        `ModelInputModalityPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
    }

    for (const field of INPUT_MODALITY_POLICY_TS_FIELDS) {
      expect(
        inputModalityPolicySource,
        `ModelInputModalityPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
    }

    const hasInputModalityRegistryProjection =
      registryTypeSource.includes(
        "input_modality_policy?: ModelInputModalityPolicy;",
      ) || registryApiSource.includes("input_modality_policy:");

    expect(registryApiSource).not.toMatch(
      /\binput_modality_policy\b\s*:\s*\{/u,
    );

    if (hasInputModalityRegistryProjection) {
      expect(registryTypeSource).toContain(
        "input_modality_policy?: ModelInputModalityPolicy;",
      );
      expect(registryApiSource).toContain(
        "input_modality_policy: buildModelInputModalityPolicy(",
      );
    }

    for (const field of RESPONSES_POLICY_WIRE_FIELDS) {
      expect(
        responsesPolicySource,
        `ModelResponsesPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelResponsesPolicy`,
      ).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`, "u"));
    }

    for (const field of RESPONSES_POLICY_TS_FIELDS) {
      expect(
        responsesPolicySource,
        `ModelResponsesPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
    }

    const hasResponsesRegistryProjection =
      registryTypeSource.includes("responses_policy?: ModelResponsesPolicy;") ||
      registryApiSource.includes("responses_policy:");

    expect(registryApiSource).not.toMatch(/\bresponses_policy\b\s*:\s*\{/u);

    if (hasResponsesProtocolFields || hasResponsesRegistryProjection) {
      expect(registryTypeSource).toContain(
        "responses_policy?: ModelResponsesPolicy;",
      );
      expect(registryApiSource).toContain(
        "responses_policy: buildModelResponsesPolicy(",
      );
    }

    for (const field of TRUNCATION_POLICY_WIRE_FIELDS) {
      expect(
        truncationPolicySource,
        `ModelTruncationPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
      expect(
        registryApiSource,
        `modelRegistry should not map ${field} manually outside buildModelTruncationPolicy`,
      ).not.toMatch(
        new RegExp(
          `\\b${field}\\b\\s*:\\s*(?!\\s*buildModelTruncationPolicy\\()`,
          "u",
        ),
      );
    }

    for (const field of TRUNCATION_POLICY_TS_FIELDS) {
      expect(
        truncationPolicySource,
        `ModelTruncationPolicyInput should accept ${field}`,
      ).toContain(`${field}?: unknown;`);
    }

    const hasTruncationRegistryProjection =
      registryTypeSource.includes(
        "truncation_policy?: ModelTruncationPolicy;",
      ) || registryApiSource.includes("truncation_policy:");

    expect(registryApiSource).not.toMatch(/\btruncation_policy\b\s*:\s*\{/u);

    if (hasTruncationProtocolFields || hasTruncationRegistryProjection) {
      expect(registryTypeSource).toContain(
        "truncation_policy?: ModelTruncationPolicy;",
      );
      expect(registryApiSource).toMatch(
        /\btruncation_policy\b\s*:\s*buildModelTruncationPolicy\s*\(/u,
      );
    }
  });
});
