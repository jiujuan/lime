import {
  resolveBrowserControlEntrySource,
  resolveBrowserControlRuntimeContractBinding,
} from "@/lib/governance/modalityRuntimeContracts";
import type { ParsedBrowserWorkbenchCommand } from "../utils/browserWorkbenchCommand";
import type { BrowserAssistSessionState } from "../types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function buildBrowserControlLaunchRequestMetadata(
  existingMetadata: Record<string, unknown> | undefined,
  parsedCommand: ParsedBrowserWorkbenchCommand,
  browserAssistSessionState?: BrowserAssistSessionState | null,
): Record<string, unknown> {
  const runtimeContract = resolveBrowserControlRuntimeContractBinding();
  const existingHarness = asRecord(existingMetadata?.harness) || {};
  const existingBrowserAssist =
    asRecord(existingHarness.browser_assist) ||
    asRecord(existingHarness.browserAssist) ||
    {};
  const browserAssistSessionMetadata = buildBrowserAssistSessionMetadata(
    browserAssistSessionState,
  );
  const launchUrl =
    parsedCommand.launchUrl || browserAssistSessionMetadata.launch_url;

  return {
    ...(existingMetadata || {}),
    harness: {
      ...existingHarness,
      browser_requirement: parsedCommand.browserRequirement,
      browser_requirement_reason: parsedCommand.browserRequirementReason,
      browser_launch_url: launchUrl,
      browser_user_step_required:
        parsedCommand.browserRequirement === "required_with_user_step",
      browser_assist: {
        ...existingBrowserAssist,
        ...browserAssistSessionMetadata,
        enabled: true,
        launch_url: launchUrl,
        modality_contract_key: runtimeContract.contractKey,
        modality: runtimeContract.modality,
        required_capabilities: runtimeContract.requiredCapabilities,
        routing_slot: runtimeContract.routingSlot,
        runtime_contract: runtimeContract.runtimeContract,
        entry_source: resolveBrowserControlEntrySource(parsedCommand.trigger),
        requirement: parsedCommand.browserRequirement,
        requirement_reason: parsedCommand.browserRequirementReason,
        prompt: parsedCommand.prompt || parsedCommand.body,
      },
    },
  };
}

function buildBrowserAssistSessionMetadata(
  sessionState?: BrowserAssistSessionState | null,
): Record<string, unknown> {
  if (!sessionState) {
    return {};
  }

  return compactRecord({
    session_id: sessionState.sessionId,
    profile_key: sessionState.profileKey,
    launch_url: sessionState.url,
    title: sessionState.title,
    target_id: sessionState.targetId,
    transport_kind: sessionState.transportKind,
    lifecycle_state: sessionState.lifecycleState,
    control_mode: sessionState.controlMode,
  });
}

function compactRecord(
  values: Record<string, string | null | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const normalized = value?.trim();
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
}
