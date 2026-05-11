import { describe, expect, it } from "vitest";
import {
  buildReviewFeedbackProjection,
  type ReviewFeedbackProjectionCopy,
} from "./reviewFeedbackProjection";
import type { CuratedTaskRecommendationSignal } from "./curatedTaskRecommendationSignals";

const signal: CuratedTaskRecommendationSignal = {
  category: "activity",
  createdAt: 1,
  preferredTaskIds: ["account-project-review", "viral-content-breakdown"],
  source: "review_feedback",
  summary: "需要补证据",
  tags: [],
  title: "短视频编排 · 补证据",
};

const copy: ReviewFeedbackProjectionCopy = {
  formatMatchedCurrentTaskWithTitle: (title) => `Stay with ${title}.`,
  formatSuggestedTasks: (titles) => `Return to ${titles}.`,
  matchedCurrentTask: "Stay with the current step.",
  suggestedTaskTitleSeparator: " or ",
};

describe("buildReviewFeedbackProjection", () => {
  it("应支持注入最近判断 suggestion 文案 copy", () => {
    const projection = buildReviewFeedbackProjection({ copy, signal });

    expect(projection?.matchedCurrentTask).toBe(false);
    expect(projection?.suggestionText).toBe(
      "Return to 复盘这个账号/项目 or 拆解一条爆款内容.",
    );
  });

  it("命中当前任务时应使用当前任务 copy", () => {
    const projection = buildReviewFeedbackProjection({
      copy,
      currentTaskId: "account-project-review",
      currentTaskTitle: "Project review",
      signal,
    });

    expect(projection?.matchedCurrentTask).toBe(true);
    expect(projection?.suggestionText).toBe("Stay with Project review.");
  });
});
