import { findCuratedTaskTemplateById } from "./curatedTaskTemplates";
import type { CuratedTaskRecommendationSignal } from "./curatedTaskRecommendationSignals";

export interface ReviewFeedbackSuggestedTask {
  taskId: string;
  title: string;
}

export interface ReviewFeedbackProjection {
  signal: CuratedTaskRecommendationSignal;
  matchedCurrentTask: boolean;
  suggestedTasks: ReviewFeedbackSuggestedTask[];
  suggestedTaskTitles: string[];
  suggestionText: string;
}

export interface ReviewFeedbackProjectionCopy {
  formatMatchedCurrentTaskWithTitle: (title: string) => string;
  formatSuggestedTasks: (titles: string) => string;
  matchedCurrentTask: string;
  suggestedTaskTitleSeparator: string;
}

type ReviewFeedbackTranslate = {
  (key: string, defaultValue: string): string;
  (
    key: string,
    options: { defaultValue: string } & Record<string, unknown>,
  ): string;
};

export function formatReviewFeedbackTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (placeholder, name) => values[name] ?? placeholder,
  );
}

export function buildReviewFeedbackProjectionCopy(
  translate: ReviewFeedbackTranslate,
): ReviewFeedbackProjectionCopy {
  return {
    formatMatchedCurrentTaskWithTitle: (title) => {
      const template = translate("reviewFeedback.suggestion.matchedWithTitle", {
        defaultValue:
          "这轮判断仍建议围绕「{{title}}」继续推进，可直接沿当前结果往下做。",
        title,
      });

      return formatReviewFeedbackTemplate(template, { title });
    },
    formatSuggestedTasks: (titles) => {
      const template = translate("reviewFeedback.suggestion.suggestedTasks", {
        defaultValue:
          "这轮判断更建议优先回到「{{titles}}」；需要切换时，可从首页“继续上次做法”接着跑。",
        titles,
      });

      return formatReviewFeedbackTemplate(template, { titles });
    },
    matchedCurrentTask: translate(
      "reviewFeedback.suggestion.matchedCurrentTask",
      "这轮判断仍建议围绕当前这一步继续推进，可直接沿当前结果往下做。",
    ),
    suggestedTaskTitleSeparator: translate(
      "reviewFeedback.suggestion.taskTitleSeparator",
      "」或「",
    ),
  };
}

const DEFAULT_REVIEW_FEEDBACK_PROJECTION_COPY: ReviewFeedbackProjectionCopy = {
  formatMatchedCurrentTaskWithTitle: (title) =>
    `这轮判断仍建议围绕「${title}」继续推进，可直接沿当前结果往下做。`,
  formatSuggestedTasks: (titles) =>
    `这轮判断更建议优先回到「${titles}」；需要切换时，可从首页“继续上次做法”接着跑。`,
  matchedCurrentTask:
    "这轮判断仍建议围绕当前这一步继续推进，可直接沿当前结果往下做。",
  suggestedTaskTitleSeparator: "」或「",
};

export function buildReviewFeedbackProjection(params: {
  signal: CuratedTaskRecommendationSignal | null;
  currentTaskId?: string | null;
  currentTaskTitle?: string | null;
  copy?: ReviewFeedbackProjectionCopy;
}): ReviewFeedbackProjection | null {
  const { signal } = params;
  if (!signal) {
    return null;
  }
  const copy = params.copy ?? DEFAULT_REVIEW_FEEDBACK_PROJECTION_COPY;

  const preferredTaskIds = Array.from(
    new Set(
      (signal.preferredTaskIds ?? [])
        .map((taskId) => taskId.trim())
        .filter((taskId) => taskId.length > 0),
    ),
  );
  if (preferredTaskIds.length === 0) {
    return null;
  }

  const currentTaskId = params.currentTaskId?.trim() || "";
  const currentTaskTitle = params.currentTaskTitle?.trim() || "";
  const matchedCurrentTask =
    currentTaskId.length > 0 && preferredTaskIds.includes(currentTaskId);
  const suggestedTasks = preferredTaskIds
    .map((taskId) => {
      const title = findCuratedTaskTemplateById(taskId)?.title?.trim() || "";
      if (!title) {
        return null;
      }

      return {
        taskId,
        title,
      };
    })
    .filter((task): task is ReviewFeedbackSuggestedTask => Boolean(task))
    .slice(0, 2);
  const suggestedTaskTitles = suggestedTasks.map((task) => task.title);

  if (matchedCurrentTask) {
    return {
      signal,
      matchedCurrentTask: true,
      suggestedTasks,
      suggestedTaskTitles,
      suggestionText: currentTaskTitle
        ? copy.formatMatchedCurrentTaskWithTitle(currentTaskTitle)
        : copy.matchedCurrentTask,
    };
  }

  if (suggestedTaskTitles.length === 0) {
    return null;
  }

  return {
    signal,
    matchedCurrentTask: false,
    suggestedTasks,
    suggestedTaskTitles,
    suggestionText: copy.formatSuggestedTasks(
      suggestedTaskTitles.join(copy.suggestedTaskTitleSeparator),
    ),
  };
}
