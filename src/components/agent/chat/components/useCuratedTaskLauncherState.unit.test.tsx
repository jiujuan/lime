import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CuratedTaskInputValues,
  CuratedTaskTemplateItem,
} from "../utils/curatedTaskTemplates";
import type { CuratedTaskReferenceEntry } from "../utils/curatedTaskReferenceSelection";
import { useCuratedTaskLauncherState } from "./useCuratedTaskLauncherState";

type HookValue = ReturnType<typeof useCuratedTaskLauncherState>;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createTask(
  overrides: Partial<CuratedTaskTemplateItem> = {},
): CuratedTaskTemplateItem {
  return {
    id: "task",
    title: "周报",
    summary: "整理周报。",
    outputHint: "一份周报",
    resultDestination: "聊天结果",
    categoryLabel: "写作",
    prompt: "请整理周报。",
    requiredInputs: [],
    requiredInputFields: [],
    optionalReferences: [],
    outputContract: [],
    followUpActions: [],
    badge: "模板",
    actionLabel: "开始",
    statusLabel: "可用",
    statusTone: "emerald",
    recentUsedAt: null,
    isRecent: false,
    ...overrides,
  };
}

function referenceEntry(
  overrides: Partial<CuratedTaskReferenceEntry> = {},
): CuratedTaskReferenceEntry {
  return {
    id: "memory-1",
    title: "品牌风格",
    summary: "轻盈专业。",
    category: "context",
    categoryLabel: "参考",
    tags: [],
    ...overrides,
  };
}

function renderHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: HookValue | null = null;

  function Probe() {
    latestValue = useCuratedTaskLauncherState({
      effectiveDefaultCuratedTaskReferenceEntries: [
        referenceEntry({ id: "default-entry" }),
      ],
      effectiveDefaultCuratedTaskReferenceMemoryIds: ["default-memory"],
      reviewSuggestionPrefillHint: "已带入复盘建议",
    });
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  mountedRoots.push({ root, container });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("useCuratedTaskLauncherState", () => {
  it("打开弹窗时应合并显式引用与默认引用", () => {
    const harness = renderHook();
    const launchInputValues: CuratedTaskInputValues = { title: "六月复盘" };

    act(() => {
      harness.getValue().open(
        createTask({ id: "monthly-review" }),
        launchInputValues,
        ["explicit-memory"],
        [referenceEntry({ id: "explicit-entry" })],
        "需要先确认输入",
      );
    });

    expect(harness.getValue().task?.id).toBe("monthly-review");
    expect(harness.getValue().initialInputValues).toBe(launchInputValues);
    expect(harness.getValue().initialReferenceMemoryIds).toEqual([
      "explicit-memory",
      "explicit-entry",
      "default-entry",
      "default-memory",
    ]);
    expect(
      harness.getValue().initialReferenceEntries?.map((entry) => entry.id),
    ).toEqual(["explicit-entry", "default-entry"]);
    expect(harness.getValue().prefillHint).toBe("需要先确认输入");
  });

  it("关闭弹窗应重置状态，review suggestion 应使用固定提示", () => {
    const harness = renderHook();

    act(() => {
      harness.getValue().applyReviewSuggestion(createTask({ id: "fix" }), {
        inputValues: { topic: "补证据" },
        referenceSelection: {
          referenceMemoryIds: ["review-memory"],
          referenceEntries: [referenceEntry({ id: "review-entry" })],
        },
      });
    });

    expect(harness.getValue().task?.id).toBe("fix");
    expect(harness.getValue().prefillHint).toBe("已带入复盘建议");

    act(() => {
      harness.getValue().handleOpenChange(false);
    });

    expect(harness.getValue().task).toBeNull();
    expect(harness.getValue().initialInputValues).toBeNull();
    expect(harness.getValue().initialReferenceMemoryIds).toBeNull();
    expect(harness.getValue().initialReferenceEntries).toBeNull();
    expect(harness.getValue().prefillHint).toBeNull();
  });
});
