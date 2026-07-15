import type { MediaTaskModalityRuntimeContractIndexEntry } from "@/lib/api/agentRuntime/mediaTaskTypes";
import { getLimeI18n } from "@/i18n/createI18n";

const LIMECORE_POLICY_META_PREFIX = "LimeCore";
const MAX_VISIBLE_REFS = 3;

export interface LimeCorePolicyEvaluationMetaInput {
  evaluationStatus?: string | null;
  evaluationDecision?: string | null;
  blockingRefs?: string[] | null;
  askRefs?: string[] | null;
  pendingRefs?: string[] | null;
  missingInputs?: string[] | null;
  pendingHitRefs?: string[] | null;
}

function normalizeRefs(refs?: string[] | null): string[] {
  const normalized = new Set<string>();
  (refs || []).forEach((ref) => {
    const trimmed = ref.trim();
    if (trimmed) {
      normalized.add(trimmed);
    }
  });
  return Array.from(normalized);
}

function formatRefs(refs: string[]): string {
  const visibleRefs = refs.slice(0, MAX_VISIBLE_REFS);
  const extraCount = refs.length - visibleRefs.length;
  return extraCount > 0
    ? `${visibleRefs.join(" / ")} +${extraCount}`
    : visibleRefs.join(" / ");
}

export function buildLimeCorePolicyEvaluationMetaItem(
  input: LimeCorePolicyEvaluationMetaInput,
): string | null {
  const i18n = getLimeI18n();
  const t = i18n.t.bind(i18n);
  const status = input.evaluationStatus?.trim().toLowerCase();
  const decision = input.evaluationDecision?.trim().toLowerCase();

  if (!status && !decision) {
    return null;
  }

  const pendingRefs = normalizeRefs(
    input.pendingRefs?.length
      ? input.pendingRefs
      : input.pendingHitRefs?.length
        ? input.pendingHitRefs
        : input.missingInputs,
  );
  if (status === "input_gap") {
    return pendingRefs.length > 0
      ? t("agentChat.mediaTaskPolicy.inputGapWithCount", {
          ns: "agent",
          count: pendingRefs.length,
        })
      : t("agentChat.mediaTaskPolicy.inputGap", { ns: "agent" });
  }

  const blockingRefs = normalizeRefs(input.blockingRefs);
  if (decision === "deny" || blockingRefs.length > 0) {
    return blockingRefs.length > 0
      ? t("agentChat.mediaTaskPolicy.blockedWithRefs", {
          ns: "agent",
          refs: formatRefs(blockingRefs),
        })
      : t("agentChat.mediaTaskPolicy.blocked", { ns: "agent" });
  }

  const askRefs = normalizeRefs(input.askRefs);
  if (decision === "ask" || askRefs.length > 0) {
    return askRefs.length > 0
      ? t("agentChat.mediaTaskPolicy.askWithRefs", {
          ns: "agent",
          refs: formatRefs(askRefs),
        })
      : t("agentChat.mediaTaskPolicy.ask", { ns: "agent" });
  }

  if (status === "evaluated" && decision === "allow") {
    return t("agentChat.mediaTaskPolicy.allow", { ns: "agent" });
  }

  return null;
}

function buildPolicyEvaluationMetaItem(
  entry: MediaTaskModalityRuntimeContractIndexEntry,
): string | null {
  return buildLimeCorePolicyEvaluationMetaItem({
    evaluationStatus: entry.limecore_policy_evaluation_status,
    evaluationDecision: entry.limecore_policy_evaluation_decision,
    blockingRefs: entry.limecore_policy_evaluation_blocking_refs,
    askRefs: entry.limecore_policy_evaluation_ask_refs,
    pendingRefs: entry.limecore_policy_evaluation_pending_refs,
    missingInputs: entry.limecore_policy_missing_inputs,
    pendingHitRefs: entry.limecore_policy_pending_hit_refs,
  });
}

export function mergeMediaTaskPolicyEvaluationMetaItems(
  existingItems: string[] | undefined,
  entry: MediaTaskModalityRuntimeContractIndexEntry,
): string[] | undefined {
  const policyItem = buildPolicyEvaluationMetaItem(entry);
  if (!policyItem) {
    return existingItems;
  }

  const nextItems = (existingItems || [])
    .map((item) => item.trim())
    .filter(
      (item, index, items) =>
        item &&
        !item.startsWith(LIMECORE_POLICY_META_PREFIX) &&
        items.indexOf(item) === index,
    );
  nextItems.push(policyItem);
  return nextItems;
}

export function areTaskMetaItemsEqual(
  leftItems: string[] | undefined,
  rightItems: string[] | undefined,
): boolean {
  const left = leftItems || [];
  const right = rightItems || [];
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}
