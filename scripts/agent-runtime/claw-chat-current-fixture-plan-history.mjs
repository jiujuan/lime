import {
  APP_SERVER_METHOD_SESSION_READ,
  PLAN_PROMPT,
  PLAN_STEPS,
  SESSION_TITLE,
} from "./claw-chat-current-fixture-constants.mjs";
import { collectReadModelItems } from "./claw-chat-current-fixture-read-model-core.mjs";
import {
  openSessionFromSidebar,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  evaluatePageSnapshot,
  invokeAppServerFromPage,
  reloadRendererDocument,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

const LEGACY_UPDATE_PLAN_VISIBLE_LABELS = ["UpdatePlanTool", "update_plan"];

export async function verifyPlanHistoryHydrate({
  page,
  options,
  requestLog,
  readModelPlanCompleted,
  sessionId,
  threadId,
}) {
  const readModelPlanThreadItem = summarizeReadModelPlanThreadItem(
    readModelPlanCompleted,
  );

  const planHistoryHydrateReload = await reloadRendererDocument(page, options);
  const planHistoryHydrateRendererReady = await waitForRendererReady(
    page,
    options,
  );

  const guiPlanHistoryHydrateSessionVisible = await waitForGuiSessionVisible(
    page,
    options,
    SESSION_TITLE,
  );
  const guiPlanHistoryHydrateSessionOpened = await openSessionFromSidebar(
    page,
    options,
    requestLog,
    {
      sessionId,
      title: SESSION_TITLE,
      allowPlanDecision: true,
    },
  );
  const guiPlanHistoryHydrateCompleted =
    await waitForGuiPlanHistoryHydrateCompleted(page, options);
  const postOpenRead = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_READ,
    {
      threadId,
      includeTurns: true,
    },
    requestLog,
  );
  const readModelPlanHistoryHydrate = summarizeReadModelPlanThreadItem(
    postOpenRead.result,
  );

  return sanitizeJson({
    readModelPlanThreadItem,
    planHistoryHydrateReload,
    planHistoryHydrateRendererReady,
    guiPlanHistoryHydrateSessionVisible,
    guiPlanHistoryHydrateSessionOpened,
    guiPlanHistoryHydrateCompleted,
    readModelPlanHistoryHydrate,
  });
}

export function summarizeReadModelPlanThreadItem(readModel) {
  const items = collectReadModelItems(readModel);
  const planItems = items.filter(isPlanItem);
  const completedPlanItems = planItems.filter((item) =>
    isCompletedPlanItem(item, readModel),
  );
  const latestPlanItem = completedPlanItems.at(-1) ?? planItems.at(-1) ?? null;
  const serializedLatest = JSON.stringify(latestPlanItem || {});
  const revisionId = readRevisionId(latestPlanItem);
  const legacyUpdatePlanToolItems = items.filter(isLegacyUpdatePlanToolItem);

  return {
    planThreadItemCount: planItems.length,
    completedPlanThreadItemCount: completedPlanItems.length,
    hasCompletedPlanThreadItem: completedPlanItems.length > 0,
    hasRevisionId: Boolean(revisionId),
    revisionId,
    source: readPlanSource(latestPlanItem, revisionId),
    includesAllPlanSteps: PLAN_STEPS.every((step) =>
      serializedLatest.includes(step.step),
    ),
    legacyUpdatePlanToolItemCount: legacyUpdatePlanToolItems.length,
    legacyUpdatePlanToolNames: legacyUpdatePlanToolItems
      .map((item) => readString(item, "toolName", "tool_name", "name"))
      .filter(Boolean),
    textPreview: readPlanText(latestPlanItem)?.slice(0, 240),
  };
}

async function waitForGuiPlanHistoryHydrateCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, planSteps, legacyLabels }) => {
        const bodyText = document.body?.innerText || "";
        const mainText = document.querySelector("main")?.innerText || bodyText;
        const messageListText =
          document.querySelector('[data-testid="message-list"]')?.textContent ||
          document.querySelector('[data-testid="message-list-frame"]')
            ?.textContent ||
          "";
        const readVisiblePlanOwner = ({
          kind,
          selector,
          itemSelector,
          revisionSelector,
        }) => {
          const root = document.querySelector(selector);
          const rect = root?.getBoundingClientRect();
          const style = root ? window.getComputedStyle(root) : null;
          const visible = Boolean(
            root &&
            rect &&
            rect.width > 16 &&
            rect.height > 8 &&
            style?.visibility !== "hidden" &&
            style?.display !== "none",
          );
          const revision = revisionSelector
            ? root?.querySelector(revisionSelector)
            : null;
          return {
            kind,
            visible,
            text: root?.textContent || "",
            itemCount: itemSelector
              ? root?.querySelectorAll(itemSelector).length || 0
              : 0,
            revisionId: revision?.getAttribute("data-plan-revision-id") || null,
            revisionSource: revision?.getAttribute("data-plan-source") || null,
            revisionTurnId: revision?.getAttribute("data-plan-turn-id") || null,
          };
        };
        const planOwners = [
          readVisiblePlanOwner({
            kind: "run-control-plan",
            selector: '[data-testid="task-center-run-control-plan"]',
            itemSelector: '[data-testid="task-center-run-control-plan-item"]',
            revisionSelector:
              '[data-testid="task-center-run-control-plan-revision"]',
          }),
          readVisiblePlanOwner({
            kind: "task-rail-plan",
            selector: '[data-testid="task-center-task-rail-plan"]',
            itemSelector: '[data-testid="task-center-task-rail-plan-item"]',
            revisionSelector:
              '[data-testid="task-center-task-rail-plan-revision"]',
          }),
          readVisiblePlanOwner({
            kind: "message-plan-block",
            selector: '[data-testid="agent-plan-block"]',
            itemSelector: null,
            revisionSelector: null,
          }),
        ].filter((owner) => owner.visible);
        const planCarrierText = planOwners
          .map((owner) => owner.text)
          .join("\n");
        const legacyVisibleHits = legacyLabels.filter((label) =>
          [mainText, messageListText, planCarrierText].some((textValue) =>
            textValue.includes(label),
          ),
        );
        const planDecisionPanel = document.querySelector(
          '[data-testid="plan-composer-decision-panel"]',
        );
        const planDecisionText = planDecisionPanel?.textContent || "";
        const planDecisionRect = planDecisionPanel?.getBoundingClientRect();
        const planDecisionStyle = planDecisionPanel
          ? window.getComputedStyle(planDecisionPanel)
          : null;
        const planDecisionVisible = Boolean(
          planDecisionPanel &&
          planDecisionRect &&
          planDecisionRect.width > 320 &&
          planDecisionRect.height > 48 &&
          planDecisionStyle?.visibility !== "hidden" &&
          planDecisionStyle?.display !== "none",
        );
        const planDecisionRevision = planDecisionPanel?.querySelector(
          '[data-testid="plan-composer-revision-status"]',
        );
        const planDecisionRevisionId =
          planDecisionRevision?.getAttribute("data-plan-revision-id") || null;
        const planOwnerStepHits = planSteps.map((step) => ({
          step: step.step,
          visible: planCarrierText.includes(step.step),
          owners: planOwners
            .filter((owner) => owner.text.includes(step.step))
            .map((owner) => owner.kind),
        }));
        return {
          url: window.location.href,
          hasPrompt: [mainText, messageListText, planCarrierText].some(
            (textValue) => textValue.includes(prompt),
          ),
          hasAllPlanSteps: planOwnerStepHits.every((hit) => hit.visible),
          planStepHits: planOwnerStepHits,
          planOwnerHasAllSteps: planOwnerStepHits.every((hit) => hit.visible),
          planOwnerKinds: planOwners.map((owner) => owner.kind),
          planOwnerKindsWithAllSteps: planOwners
            .filter((owner) =>
              planSteps.every((step) => owner.text.includes(step.step)),
            )
            .map((owner) => owner.kind),
          planOwnerRevisionIds: planOwners
            .map((owner) => owner.revisionId)
            .filter(Boolean),
          planOwnerRevisionSources: planOwners
            .map((owner) => owner.revisionSource)
            .filter(Boolean),
          planOwners,
          legacyVisibleHits,
          legacyUpdatePlanToolVisible: legacyVisibleHits.length > 0,
          planDecisionVisible,
          planDecisionHasTitle: planDecisionText.includes("实施此计划"),
          planDecisionRevisionBound: Boolean(planDecisionRevisionId),
          planDecisionRevisionId,
          planDecisionRevisionSource:
            planDecisionRevision?.getAttribute("data-plan-source") || null,
          planDecisionRevisionTurnId:
            planDecisionRevision?.getAttribute("data-plan-turn-id") || null,
          mainText,
          messageListText,
          taskRailText: planCarrierText,
        };
      },
      {
        prompt: PLAN_PROMPT,
        planSteps: PLAN_STEPS,
        legacyLabels: LEGACY_UPDATE_PLAN_VISIBLE_LABELS,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.planOwnerHasAllSteps &&
      snapshot.planDecisionVisible &&
      snapshot.planDecisionHasTitle &&
      snapshot.planDecisionRevisionBound &&
      snapshot.legacyUpdatePlanToolVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 历史恢复未显示 revisioned proposed_plan: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

function isLegacyUpdatePlanToolItem(item) {
  const itemType = readString(item, "type", "kind") || "";
  if (!itemType.includes("tool")) {
    return false;
  }
  const serialized = JSON.stringify(item || {});
  return LEGACY_UPDATE_PLAN_VISIBLE_LABELS.some((label) =>
    serialized.includes(label),
  );
}

function readRevisionId(item) {
  return (
    readString(item, "revisionId", "revision_id") ||
    readMetadataString(item, "revisionId", "revision_id") ||
    readString(item?.payload, "revisionId", "revision_id") ||
    readPlanRevisionIdFromItemId(item)
  );
}

function readMetadataString(item, ...keys) {
  return readString(item?.metadata, ...keys);
}

function isPlanItem(item) {
  return (
    readString(item, "type", "kind") === "plan" ||
    readString(item?.payload, "type") === "plan"
  );
}

function isCompletedPlanItem(item, readModel) {
  const status = readString(item, "status");
  return status ? status === "completed" : isLatestTurnCompleted(readModel);
}

function isLatestTurnCompleted(readModel) {
  const detail = readModel?.detail ?? readModel ?? {};
  const thread = detail.thread ?? detail.thread_read ?? detail.threadRead ?? {};
  const turns = Array.isArray(thread.turns)
    ? thread.turns
    : Array.isArray(detail.turns)
      ? detail.turns
      : [];
  return String(turns.at(-1)?.status ?? "").toLowerCase() === "completed";
}

function readPlanRevisionIdFromItemId(item) {
  const itemId = readString(item, "id", "itemId", "item_id");
  if (!itemId) {
    return null;
  }
  for (const prefix of ["proposed_plan:", "update_plan:"]) {
    const index = itemId.indexOf(prefix);
    if (index >= 0) {
      return itemId.slice(index);
    }
  }
  return null;
}

function readPlanSource(item, revisionId) {
  return (
    readString(item?.payload, "source") ||
    readMetadataString(item, "source") ||
    (revisionId?.startsWith("proposed_plan:")
      ? "proposed_plan"
      : revisionId?.startsWith("update_plan:")
        ? "update_plan"
        : null)
  );
}

function readPlanText(item) {
  return (
    readString(item, "text", "summary", "content") ||
    readString(item?.payload, "text", "summary", "content")
  );
}

function readString(value, ...keys) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}
