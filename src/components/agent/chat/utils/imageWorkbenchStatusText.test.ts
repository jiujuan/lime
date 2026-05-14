import { describe, expect, it } from "vitest";

import {
  isImageWorkbenchSubmissionTemplateText,
  shouldSuppressImageWorkbenchStatusText,
} from "./imageWorkbenchStatusText";

describe("imageWorkbenchStatusText", () => {
  it("应把历史图片任务递交摘要识别为可隐藏过程文本", () => {
    const legacySummary = [
      "任务类型：image_generate",
      "任务 ID：task-image-skill-1",
      "任务文件：.lime/tasks/image_generate/task-image-skill-1.json",
      "状态：pending_submit",
    ].join("\n");

    expect(isImageWorkbenchSubmissionTemplateText(legacySummary)).toBe(true);
    expect(shouldSuppressImageWorkbenchStatusText(legacySummary)).toBe(true);
  });

  it("不应隐藏正常的图片生成说明", () => {
    const naturalReply = "我按你要的线稿感处理好了，画面会更轻一点。";

    expect(isImageWorkbenchSubmissionTemplateText(naturalReply)).toBe(false);
    expect(shouldSuppressImageWorkbenchStatusText(naturalReply)).toBe(false);
  });
});
