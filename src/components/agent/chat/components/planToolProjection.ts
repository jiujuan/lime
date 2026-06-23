import type { Message } from "../types";
import type {
  GeneralWorkbenchTaskRailItemStatus,
  GeneralWorkbenchTaskRailPlanItem,
} from "./generalWorkbenchTaskRailViewModel";
import {
  type MinimalTranslate,
  translateTaskRailText,
} from "./generalWorkbenchTaskRailText";
import { extractLatestProposedPlanItems } from "../utils/proposedPlan";
export { isUpdatePlanToolName } from "../utils/toolNameFamily";

function normalizeRailStatus(
  status: "pending" | "in_progress" | "completed",
): GeneralWorkbenchTaskRailItemStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "in_progress") {
    return "running";
  }
  return "pending";
}

export function buildProposedPlanItemsFromMessages(
  messages: readonly Message[] | undefined,
  t: MinimalTranslate,
): GeneralWorkbenchTaskRailPlanItem[] {
  for (const message of [...(messages ?? [])].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }
    const items = extractLatestProposedPlanItems(message.content);
    if (items.length === 0) {
      continue;
    }
    return items.map((item, index) => ({
      id: `message-proposed-plan:${message.id}:${index}:${item.text}`,
      title: item.text,
      status: normalizeRailStatus(item.status),
      meta: translateTaskRailText(
        t,
        "generalWorkbench.taskRail.stepMeta",
        "步骤 {{index}}",
        { index: index + 1 },
      ),
    }));
  }
  return [];
}
