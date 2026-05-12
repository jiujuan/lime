import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  renderIntoDom,
  setReactActEnvironment,
  type MountedRoot,
} from "@/components/image-gen/test-utils";
import { findCuratedTaskTemplateById } from "@/components/agent/chat/utils/curatedTaskTemplates";
import { changeLimeLocale } from "@/i18n/createI18n";
import { MemoryCuratedTaskSuggestionPanel } from "./MemoryCuratedTaskSuggestionPanel";

const mountedRoots: MountedRoot[] = [];

describe("MemoryCuratedTaskSuggestionPanel", () => {
  beforeEach(async () => {
    setReactActEnvironment();
    await changeLimeLocale("zh-CN");
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("应从 agent resource 渲染推荐卡 chrome 文案", () => {
    const task = findCuratedTaskTemplateById("account-project-review");
    expect(task).not.toBeNull();
    const onStartTask = vi.fn();

    const { container } = renderIntoDom(
      <MemoryCuratedTaskSuggestionPanel
        tasks={[
          {
            badgeLabel: "围绕当前成果",
            reasonSummary: "承接这轮结果继续判断。",
            template: task!,
          },
        ]}
        referenceEntryCount={2}
        emptyState="暂无推荐"
        onStartTask={onStartTask}
      />,
      mountedRoots,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("2 条参考对象");
    expect(text).toContain("你先给：");
    expect(text).toContain("这一步先拿：");
    expect(text).toContain("接着可做：");
    expect(text).toContain("开始这一步");
    expect(text).not.toContain("skills.workspace.curatedTask.suggestion");

    const startButton = container.querySelector("button");
    expect(startButton).toBeTruthy();
    act(() => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartTask).toHaveBeenCalledWith(task);
  });
});
