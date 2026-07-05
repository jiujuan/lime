export const MODEL_RESPONSES_REQUEST_MODES = [
  "responses",
  "responses_lite",
] as const;

export type ModelResponsesRequestMode =
  (typeof MODEL_RESPONSES_REQUEST_MODES)[number];

export const MODEL_RESPONSES_PAYLOAD_LOCATIONS = [
  "request_field",
  "input_prefix",
] as const;

export type ModelResponsesPayloadLocation =
  (typeof MODEL_RESPONSES_PAYLOAD_LOCATIONS)[number];

export const MODEL_RESPONSES_REASONING_CONTEXTS = [
  "default",
  "all_turns",
] as const;

export type ModelResponsesReasoningContext =
  (typeof MODEL_RESPONSES_REASONING_CONTEXTS)[number];

export interface ModelResponsesPolicyInput {
  use_responses_lite?: unknown;
  useResponsesLite?: unknown;
}

export interface ModelResponsesPolicy {
  use_responses_lite: boolean;
  request_mode: ModelResponsesRequestMode;
  instructions_location: ModelResponsesPayloadLocation;
  tools_location: ModelResponsesPayloadLocation;
  reasoning_context: ModelResponsesReasoningContext;
  parallel_tool_calls_allowed: boolean;
  requires_responses_lite_header: boolean;
}

function firstPresent<T>(
  input: ModelResponsesPolicyInput,
  keys: Array<keyof ModelResponsesPolicyInput>,
): T | undefined {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

export function buildModelResponsesPolicy(
  input: ModelResponsesPolicyInput | null | undefined,
): ModelResponsesPolicy {
  const source = input ?? {};
  const useResponsesLite =
    firstPresent(source, ["use_responses_lite", "useResponsesLite"]) === true;

  return {
    use_responses_lite: useResponsesLite,
    request_mode: useResponsesLite ? "responses_lite" : "responses",
    instructions_location: useResponsesLite ? "input_prefix" : "request_field",
    tools_location: useResponsesLite ? "input_prefix" : "request_field",
    reasoning_context: useResponsesLite ? "all_turns" : "default",
    parallel_tool_calls_allowed: !useResponsesLite,
    requires_responses_lite_header: useResponsesLite,
  };
}

export function shouldSendParallelToolCallsForResponses(
  policy: Pick<ModelResponsesPolicy, "parallel_tool_calls_allowed">,
  requestedParallelToolCalls: unknown,
): boolean {
  return requestedParallelToolCalls === true && policy.parallel_tool_calls_allowed;
}
