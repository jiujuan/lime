export type CanvasWorkbenchTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type CanvasWorkbenchReviewBase =
  | "unstaged"
  | "staged"
  | "commit"
  | "branch"
  | "previousConversation";

export interface CanvasWorkbenchReviewCommitOption {
  sha: string;
  shortSha: string;
  subject: string;
  committedAt?: string;
}

export const CANVAS_WORKBENCH_REVIEW_BASE_OPTIONS: Array<{
  key: CanvasWorkbenchReviewBase;
  labelKey: string;
}> = [
  {
    key: "unstaged",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.unstaged",
  },
  {
    key: "staged",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.staged",
  },
  {
    key: "commit",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.commit",
  },
  {
    key: "branch",
    labelKey: "agentChat.canvasWorkbench.coding.changes.base.branch",
  },
  {
    key: "previousConversation",
    labelKey:
      "agentChat.canvasWorkbench.coding.changes.base.previousConversation",
  },
];
