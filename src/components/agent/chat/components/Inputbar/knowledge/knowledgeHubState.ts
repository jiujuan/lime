import type {
  InputbarKnowledgePackOption,
  InputbarKnowledgePackSelection,
} from "../types";

export type InputbarKnowledgeHubPrimaryAction =
  | "organize"
  | "manage"
  | "use"
  | "supplement"
  | "none";

export type InputbarKnowledgeHubCopyKey =
  | "agentChat.inputbar.knowledge.state.pendingReview.title"
  | "agentChat.inputbar.knowledge.state.pendingReview.description"
  | "agentChat.inputbar.knowledge.state.using.title"
  | "agentChat.inputbar.knowledge.state.using.description"
  | "agentChat.inputbar.knowledge.state.select.title"
  | "agentChat.inputbar.knowledge.state.select.descriptionWithPending"
  | "agentChat.inputbar.knowledge.state.select.descriptionReady"
  | "agentChat.inputbar.knowledge.state.pendingOnly.title"
  | "agentChat.inputbar.knowledge.state.pendingOnly.description"
  | "agentChat.inputbar.knowledge.state.add.title"
  | "agentChat.inputbar.knowledge.state.add.description"
  | "agentChat.inputbar.knowledge.action.review"
  | "agentChat.inputbar.knowledge.action.supplement"
  | "agentChat.inputbar.knowledge.action.supplementWithInput"
  | "agentChat.inputbar.knowledge.action.use"
  | "agentChat.inputbar.knowledge.action.organize"
  | "agentChat.inputbar.knowledge.action.organizeWithInput";

export type InputbarKnowledgeHubCopyValues = Record<
  string,
  string | number
>;

export interface InputbarKnowledgeHubCopyRef {
  key: InputbarKnowledgeHubCopyKey;
  values?: InputbarKnowledgeHubCopyValues;
}

export interface InputbarKnowledgeHubState {
  title: InputbarKnowledgeHubCopyRef;
  description: InputbarKnowledgeHubCopyRef;
  primaryAction: InputbarKnowledgeHubPrimaryAction;
  primaryLabel: InputbarKnowledgeHubCopyRef;
  readyCount: number;
  pendingCount: number;
}

function copyRef(
  key: InputbarKnowledgeHubCopyKey,
  values?: InputbarKnowledgeHubCopyValues,
): InputbarKnowledgeHubCopyRef {
  return values ? { key, values } : { key };
}

export function normalizeKnowledgePackOptions({
  knowledgePackOptions,
  knowledgePackSelection,
}: {
  knowledgePackOptions: InputbarKnowledgePackOption[];
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
}) {
  const optionMap = new Map<string, InputbarKnowledgePackOption>();

  for (const option of knowledgePackOptions) {
    const packName = option.packName.trim();
    if (!packName || optionMap.has(packName)) {
      continue;
    }

    optionMap.set(packName, {
      ...option,
      packName,
    });
  }

  const selectedPackName = knowledgePackSelection?.packName.trim();
  if (selectedPackName && !optionMap.has(selectedPackName)) {
    optionMap.set(selectedPackName, {
      packName: selectedPackName,
      label: knowledgePackSelection?.label,
      status: knowledgePackSelection?.status,
    });
  }

  return Array.from(optionMap.values());
}

export function isReadyKnowledgePackStatus(status?: string | null): boolean {
  return status?.trim() === "ready";
}

export function resolveKnowledgeHubState({
  knowledgePackSelection,
  knowledgePackOptions,
  hasInputText,
  canManageKnowledgePacks,
  canStartKnowledgeOrganize,
  fallbackPackLabel,
}: {
  knowledgePackSelection?: InputbarKnowledgePackSelection | null;
  knowledgePackOptions: InputbarKnowledgePackOption[];
  hasInputText: boolean;
  canManageKnowledgePacks: boolean;
  canStartKnowledgeOrganize: boolean;
  fallbackPackLabel: string;
}): InputbarKnowledgeHubState {
  const readyCount = knowledgePackOptions.filter((option) =>
    isReadyKnowledgePackStatus(option.status),
  ).length;
  const pendingCount = knowledgePackOptions.length - readyCount;
  const currentLabel =
    knowledgePackSelection?.label ||
    knowledgePackSelection?.packName ||
    fallbackPackLabel;
  const selectedIsReady = isReadyKnowledgePackStatus(
    knowledgePackSelection?.status,
  );

  if (knowledgePackSelection && !selectedIsReady && canManageKnowledgePacks) {
    return {
      title: copyRef(
        "agentChat.inputbar.knowledge.state.pendingReview.title",
      ),
      description: copyRef(
        "agentChat.inputbar.knowledge.state.pendingReview.description",
        { label: currentLabel },
      ),
      primaryAction: "manage",
      primaryLabel: copyRef("agentChat.inputbar.knowledge.action.review"),
      readyCount,
      pendingCount,
    };
  }

  if (knowledgePackSelection?.enabled) {
    return {
      title: copyRef("agentChat.inputbar.knowledge.state.using.title", {
        label: currentLabel,
      }),
      description: copyRef(
        "agentChat.inputbar.knowledge.state.using.description",
      ),
      primaryAction: canStartKnowledgeOrganize ? "supplement" : "none",
      primaryLabel: copyRef(
        hasInputText
          ? "agentChat.inputbar.knowledge.action.supplementWithInput"
          : "agentChat.inputbar.knowledge.action.supplement",
      ),
      readyCount,
      pendingCount,
    };
  }

  if (knowledgePackSelection) {
    return {
      title: copyRef("agentChat.inputbar.knowledge.state.select.title"),
      description:
        pendingCount > 0
          ? copyRef(
              "agentChat.inputbar.knowledge.state.select.descriptionWithPending",
              { label: currentLabel },
            )
          : copyRef(
              "agentChat.inputbar.knowledge.state.select.descriptionReady",
              { label: currentLabel },
            ),
      primaryAction: "use",
      primaryLabel: copyRef("agentChat.inputbar.knowledge.action.use"),
      readyCount,
      pendingCount,
    };
  }

  if (pendingCount > 0 && canManageKnowledgePacks) {
    return {
      title: copyRef("agentChat.inputbar.knowledge.state.pendingOnly.title"),
      description: copyRef(
        "agentChat.inputbar.knowledge.state.pendingOnly.description",
      ),
      primaryAction: "manage",
      primaryLabel: copyRef("agentChat.inputbar.knowledge.action.review"),
      readyCount,
      pendingCount,
    };
  }

  return {
    title: copyRef("agentChat.inputbar.knowledge.state.add.title"),
    description: copyRef("agentChat.inputbar.knowledge.state.add.description"),
    primaryAction: canStartKnowledgeOrganize ? "organize" : "none",
    primaryLabel: copyRef(
      hasInputText
        ? "agentChat.inputbar.knowledge.action.organizeWithInput"
        : "agentChat.inputbar.knowledge.action.organize",
    ),
    readyCount,
    pendingCount,
  };
}
