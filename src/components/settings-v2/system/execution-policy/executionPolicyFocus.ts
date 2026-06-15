import type {
  ExecutionPolicyFocusContext,
  ExecutionPolicyFocusTarget,
} from "@/types/page";
import type { ToolExecutionNetworkRuleConfig } from "@/lib/api/appConfigTypes";

type NetworkFocusTarget = Extract<ExecutionPolicyFocusTarget, "host" | "url">;

export interface ExecutionPolicyNetworkRuleFocus {
  index: number;
  ruleId: string;
  target: NetworkFocusTarget;
  value: string;
  reasonCode: string | null;
}

export interface ExecutionPolicyNetworkRuleSuggestion {
  rule: ToolExecutionNetworkRuleConfig;
  target: NetworkFocusTarget;
  value: string;
}

function normalize(value?: string | null): string {
  return value?.trim() ?? "";
}

function ruleMatchesFocus(
  rule: ToolExecutionNetworkRuleConfig,
  focus: ExecutionPolicyFocusContext,
): boolean {
  const ruleId = normalize(rule.rule_id);
  const focusRuleId = normalize(focus.ruleId);
  if (focusRuleId && ruleId === focusRuleId) {
    return true;
  }

  const target = rule.target ?? "url";
  if (focus.target && target !== focus.target) {
    return false;
  }

  const focusValue = normalize(focus.value);
  if (!focusValue) {
    return false;
  }

  const pattern = normalize(rule.pattern);
  if (!pattern) {
    return false;
  }

  return pattern === focusValue || pattern.includes(focusValue);
}

export function resolveExecutionPolicyNetworkRuleFocus(
  rules: ToolExecutionNetworkRuleConfig[],
  focus?: ExecutionPolicyFocusContext | null,
): ExecutionPolicyNetworkRuleFocus | null {
  if (!focus || focus.section !== "network") {
    return null;
  }

  const index = rules.findIndex((rule) => ruleMatchesFocus(rule, focus));
  if (index < 0) {
    return null;
  }

  const rule = rules[index];
  const target: NetworkFocusTarget =
    rule.target ??
    (focus.target === "host" || focus.target === "url" ? focus.target : "url");
  const value = normalize(rule.pattern) || normalize(focus.value);

  if (!value) {
    return null;
  }

  return {
    index,
    ruleId: normalize(rule.rule_id),
    target,
    value,
    reasonCode:
      normalize(rule.reason_code) || normalize(focus.reasonCode) || null,
  };
}

export function resolveExecutionPolicyNetworkRuleSuggestion(
  focus?: ExecutionPolicyFocusContext | null,
): ExecutionPolicyNetworkRuleSuggestion | null {
  if (!focus || focus.section !== "network") {
    return null;
  }

  const value = normalize(focus.value) || normalize(focus.ruleId);
  if (!value) {
    return null;
  }

  const target: NetworkFocusTarget =
    focus.target === "host" || focus.target === "url"
      ? focus.target
      : value.startsWith("http://") || value.startsWith("https://")
        ? "url"
        : "host";
  const reasonCode = normalize(focus.reasonCode) || "network_policy_review";

  return {
    target,
    value,
    rule: {
      rule_id: normalize(focus.ruleId),
      match_type: "exact",
      target,
      pattern: value,
      risk_level: "high",
      reason_code: reasonCode,
      reason: "",
    },
  };
}
