import {
  DEFAULT_AGENT_ACCESS_MODE,
  type AgentAccessMode,
} from "@/components/agent/chat/hooks/agentChatStorage";
import { createAccessModeFromRuntimePolicies } from "@/components/agent/chat/utils/accessModeRuntime";
import type {
  AgentTurnAutomationPayload,
  AutomationRequestMetadata,
} from "@/lib/api/automation";

export interface AutomationAccessModeCopy {
  readOnly: string;
  current: string;
  fullAccess: string;
  policyReadOnly: string;
  policyCurrent: string;
  policyFullAccess: string;
}

export const defaultAutomationAccessModeCopy: AutomationAccessModeCopy = {
  readOnly: "只读",
  current: "按需确认",
  fullAccess: "完全访问",
  policyReadOnly: "正式策略会写成 on-request + read-only。",
  policyCurrent: "正式策略会写成 on-request + workspace-write。",
  policyFullAccess: "正式策略会写成 never + danger-full-access。",
};

const LEGACY_ACCESS_MODE_KEYS = ["access_mode", "accessMode"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLegacyAccessModeFromRecord(
  record: Record<string, unknown>,
): AgentAccessMode | null {
  for (const key of LEGACY_ACCESS_MODE_KEYS) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }

    switch (value.trim()) {
      case "read-only":
      case "current":
      case "full-access":
        return value.trim() as AgentAccessMode;
      default:
        break;
    }
  }
  return null;
}

function readLegacyAccessModeFromMetadata(
  requestMetadata?: AutomationRequestMetadata | null,
): AgentAccessMode | null {
  if (!isRecord(requestMetadata)) {
    return null;
  }

  const nestedHarness = isRecord(requestMetadata.harness)
    ? requestMetadata.harness
    : null;

  return (
    (nestedHarness ? readLegacyAccessModeFromRecord(nestedHarness) : null) ??
    readLegacyAccessModeFromRecord(requestMetadata)
  );
}

function omitLegacyAccessModeKeys(record: Record<string, unknown>): {
  nextRecord: Record<string, unknown>;
  changed: boolean;
} {
  const nextRecord = { ...record };
  let changed = false;

  for (const key of LEGACY_ACCESS_MODE_KEYS) {
    if (!(key in nextRecord)) {
      continue;
    }
    delete nextRecord[key];
    changed = true;
  }

  return {
    nextRecord,
    changed,
  };
}

export function resolveAgentTurnAutomationAccessMode(
  payload: Pick<
    AgentTurnAutomationPayload,
    "approval_policy" | "sandbox_policy" | "request_metadata"
  >,
): AgentAccessMode {
  return (
    createAccessModeFromRuntimePolicies(
      payload.approval_policy,
      payload.sandbox_policy,
    ) ??
    readLegacyAccessModeFromMetadata(payload.request_metadata) ??
    DEFAULT_AGENT_ACCESS_MODE
  );
}

export function omitLegacyAutomationAccessModeMetadata(
  requestMetadata?: AutomationRequestMetadata | null,
): AutomationRequestMetadata | null {
  if (!isRecord(requestMetadata)) {
    return requestMetadata ?? null;
  }

  const { nextRecord: nextRootRecord, changed: rootChanged } =
    omitLegacyAccessModeKeys(requestMetadata);
  let nextMetadata: Record<string, unknown> = nextRootRecord;
  let changed = rootChanged;

  if (isRecord(nextRootRecord.harness)) {
    const { nextRecord: nextHarness, changed: harnessChanged } =
      omitLegacyAccessModeKeys(nextRootRecord.harness);
    if (harnessChanged) {
      changed = true;
      if (Object.keys(nextHarness).length === 0) {
        delete nextMetadata.harness;
      } else {
        nextMetadata = {
          ...nextMetadata,
          harness: nextHarness,
        };
      }
    }
  }

  if (!changed) {
    return requestMetadata;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
}

export function automationAccessModeLabel(accessMode: AgentAccessMode): string {
  return automationAccessModeLabelWithCopy(
    accessMode,
    defaultAutomationAccessModeCopy,
  );
}

export function automationAccessModeLabelWithCopy(
  accessMode: AgentAccessMode,
  copy: AutomationAccessModeCopy,
): string {
  switch (accessMode) {
    case "read-only":
      return copy.readOnly;
    case "current":
      return copy.current;
    case "full-access":
    default:
      return copy.fullAccess;
  }
}

export function automationAccessModePolicySummary(
  accessMode: AgentAccessMode,
): string {
  return automationAccessModePolicySummaryWithCopy(
    accessMode,
    defaultAutomationAccessModeCopy,
  );
}

export function automationAccessModePolicySummaryWithCopy(
  accessMode: AgentAccessMode,
  copy: AutomationAccessModeCopy,
): string {
  switch (accessMode) {
    case "read-only":
      return copy.policyReadOnly;
    case "current":
      return copy.policyCurrent;
    case "full-access":
    default:
      return copy.policyFullAccess;
  }
}

export function buildAutomationAccessModeOptions(
  copy: AutomationAccessModeCopy = defaultAutomationAccessModeCopy,
): Array<{
  value: AgentAccessMode;
  label: string;
}> {
  return [
    { value: "read-only", label: copy.readOnly },
    { value: "current", label: copy.current },
    { value: "full-access", label: copy.fullAccess },
  ];
}
