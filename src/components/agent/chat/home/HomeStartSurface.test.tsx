import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeStartSurface } from "./HomeStartSurface";
import type {
  HomeGuideCard,
  HomeProjectConversationGroup,
  HomeRecoverySession,
  HomeSkillSection,
  HomeSkillSurfaceItem,
  HomeStarterChip,
} from "./homeSurfaceTypes";
import type { HomeSurfaceChromeCopy } from "./homeSurfaceCopy";

vi.mock("./HomeSceneSkillManagerDialog", () => ({
  HomeSceneSkillManagerDialog: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="home-scene-skill-manager-mock">
        <button type="button" onClick={onClose}>
          关闭管理
        </button>
      </div>
    ) : null,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const TEST_CHROME_COPY: HomeSurfaceChromeCopy = {
  starterRowLabel: "首页起手入口",
  starterManagerLabel: "管理做法",
  guideCardsLabel: "首页引导帮助",
  moreSkillsDrawerLabel: "更多做法",
  galleryTitle: "你可以从这些任务开始",
  secondScreenLabel: "Lime 可执行任务示例",
  projectConversationsMoreLabel: (count) => `更多 ${count} 个对话`,
  recoverySessionTitle: (status, title) => {
    if (status === "waiting") {
      return `等待确认：${title}`;
    }
    if (status === "queued") {
      return `排队等待：${title}`;
    }
    return `正在继续：${title}`;
  },
  recoverySessionSummary: (status) => {
    if (status === "waiting") {
      return "需要你确认后继续。";
    }
    if (status === "queued") {
      return "仍有请求在队列中。";
    }
    return "后台输出仍在继续。";
  },
  recoverySessionActionLabel: (status) =>
    status === "waiting"
      ? "继续确认"
      : status === "queued"
        ? "查看队列"
        : "查看输出",
  recentSessionDefaultActionLabel: "继续最近会话",
};

function createItem(): HomeSkillSurfaceItem {
  return {
    id: "daily-trend-briefing",
    title: "每日趋势摘要",
    summary: "先收一版内容趋势。",
    category: "social",
    sourceKind: "curated_task",
    launchKind: "curated_task_launcher",
    coverToken: "trend",
    isRecent: false,
    isRecommended: true,
    usedAt: null,
    testId: "entry-recommended-daily-trend-briefing",
  };
}

function createStarterChips(): HomeStarterChip[] {
  return [
    {
      id: "starter-guide",
      label: "引导帮助",
      launchKind: "toggle_guide",
      testId: "home-guide-help-trigger",
    },
    {
      id: "starter-daily-trend",
      label: "帮我想选题",
      launchKind: "curated_task_launcher",
      targetItemId: "daily-trend-briefing",
      testId: "entry-recommended-daily-trend-briefing",
    },
    {
      id: "starter-more",
      label: "更多做法",
      launchKind: "open_drawer",
      testId: "home-more-skills-trigger",
    },
    {
      id: "starter-manager",
      label: "⚙",
      launchKind: "open_manager",
      testId: "home-skill-manager-trigger",
    },
  ];
}

function createGuideCards(): HomeGuideCard[] {
  return [
    {
      id: "guide-model",
      title: "怎么添加模型？",
      summary: "配置模型后再开始生成。",
      prompt: "请告诉我怎么添加模型。",
      testId: "home-guide-model",
    },
  ];
}

function renderSurface(options?: {
  starterChips?: HomeStarterChip[];
  sections?: HomeSkillSection[];
  supplementalActions?: React.ComponentProps<
    typeof HomeStartSurface
  >["supplementalActions"];
  conversationGroups?: HomeProjectConversationGroup[];
  recoverySession?: HomeRecoverySession | null;
  guideCards?: HomeGuideCard[];
  onSelectRecoverySession?: () => void;
  onSelectConversation?: (
    conversationId: string,
    statusReason?: string,
  ) => void;
  onSelectStarterChip?: (chip: HomeStarterChip) => void;
  onSelectGuideCard?: (card: HomeGuideCard) => void;
  onSelectSkillItem?: (item: HomeSkillSurfaceItem) => void;
}) {
  const item = createItem();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSelectStarterChip = options?.onSelectStarterChip ?? vi.fn();
  const onSelectGuideCard = options?.onSelectGuideCard ?? vi.fn();
  const onSelectSkillItem = options?.onSelectSkillItem ?? vi.fn();
  const onSelectConversation = options?.onSelectConversation ?? vi.fn();
  const onSelectRecoverySession = options?.onSelectRecoverySession ?? vi.fn();
  mountedRoots.push({ root, container });

  act(() => {
    root.render(
      <HomeStartSurface
        starterChips={options?.starterChips ?? createStarterChips()}
        copy={TEST_CHROME_COPY}
        guideCards={options?.guideCards ?? createGuideCards()}
        recoverySession={options?.recoverySession}
        sections={
          options?.sections ?? [
            { id: "social", title: "社交媒体", items: [item] },
          ]
        }
        conversationGroups={options?.conversationGroups}
        supplementalActions={options?.supplementalActions}
        onSelectRecoverySession={onSelectRecoverySession}
        onSelectConversation={onSelectConversation}
        onSelectStarterChip={onSelectStarterChip}
        onSelectGuideCard={onSelectGuideCard}
        onSelectSkillItem={onSelectSkillItem}
      />,
    );
  });

  return {
    container,
    item,
    onSelectStarterChip,
    onSelectGuideCard,
    onSelectSkillItem,
    onSelectConversation,
    onSelectRecoverySession,
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
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("HomeStartSurface", () => {
  it("普通起手 chip 只透传给上层，不打开抽屉或管理弹窗", () => {
    const { container, onSelectStarterChip } = renderSurface();
    const chip = container.querySelector(
      '[data-testid="entry-recommended-daily-trend-briefing"]',
    ) as HTMLButtonElement | null;

    act(() => {
      chip?.click();
    });

    expect(onSelectStarterChip).toHaveBeenCalledWith(
      expect.objectContaining({ id: "starter-daily-trend" }),
    );
    expect(
      container.querySelector('[data-testid="home-more-skills-drawer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="home-scene-skill-manager-mock"]'),
    ).toBeNull();
  });

  it("引导帮助 chip 展开帮助卡并把卡片选择交给上层", () => {
    const { container, onSelectGuideCard } = renderSurface();
    const guide = container.querySelector(
      '[data-testid="home-guide-help-trigger"]',
    ) as HTMLButtonElement | null;

    act(() => {
      guide?.click();
    });

    expect(
      container.querySelector('[data-testid="home-guide-cards"]'),
    ).toBeTruthy();

    const card = container.querySelector(
      '[data-testid="home-guide-model"]',
    ) as HTMLButtonElement | null;
    act(() => {
      card?.click();
    });

    expect(onSelectGuideCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: "guide-model" }),
    );
  });

  it("更多做法 chip 切换抽屉，抽屉条目继续透传选择", () => {
    const { container, item, onSelectSkillItem } = renderSurface();
    const more = container.querySelector(
      '[data-testid="home-more-skills-trigger"]',
    ) as HTMLButtonElement | null;

    act(() => {
      more?.click();
    });

    expect(
      container.querySelector('[data-testid="home-more-skills-drawer"]'),
    ).toBeTruthy();

    const drawerItem = container.querySelector(
      '[data-testid="home-drawer-entry-recommended-daily-trend-briefing"]',
    ) as HTMLButtonElement | null;
    act(() => {
      drawerItem?.click();
    });

    expect(onSelectSkillItem).toHaveBeenCalledWith(item);
  });

  it("抽屉打开后按 Escape 可关闭", () => {
    const { container } = renderSurface();
    const more = container.querySelector(
      '[data-testid="home-more-skills-trigger"]',
    ) as HTMLButtonElement | null;

    act(() => {
      more?.click();
    });
    expect(
      container.querySelector('[data-testid="home-more-skills-drawer"]'),
    ).toBeTruthy();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(
      container.querySelector('[data-testid="home-more-skills-drawer"]'),
    ).toBeNull();
  });

  it("管理 chip 打开场景管理弹窗并允许关闭", () => {
    const { container } = renderSurface();
    const manager = container.querySelector(
      '[data-testid="home-skill-manager-trigger"]',
    ) as HTMLButtonElement | null;

    act(() => {
      manager?.click();
    });

    const dialog = container.querySelector(
      '[data-testid="home-scene-skill-manager-mock"]',
    );
    expect(dialog).toBeTruthy();

    const close = container.querySelector(
      '[data-testid="home-scene-skill-manager-mock"] button',
    ) as HTMLButtonElement | null;
    act(() => {
      close?.click();
    });

    expect(
      container.querySelector('[data-testid="home-scene-skill-manager-mock"]'),
    ).toBeNull();
  });

  it("补充入口使用轻按钮呈现并触发自身动作", () => {
    const onSelect = vi.fn();
    const { container } = renderSurface({
      supplementalActions: [
        {
          id: "connect-browser",
          label: "连接浏览器",
          testId: "entry-connect-browser",
          onSelect,
        },
      ],
    });

    const action = container.querySelector(
      '[data-testid="entry-connect-browser"]',
    ) as HTMLButtonElement | null;
    expect(action?.textContent).toBe("连接浏览器");

    act(() => {
      action?.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("未完成恢复卡显示运行会话并触发恢复入口", () => {
    const onSelectRecoverySession = vi.fn();
    const { container } = renderSurface({
      recoverySession: {
        sessionId: "session-news",
        title: "国际新闻证据整理",
        summary: "正在继续输出。",
        status: "running",
      },
      onSelectRecoverySession,
    });

    const card = container.querySelector(
      '[data-testid="home-unfinished-session-card"]',
    ) as HTMLButtonElement | null;

    expect(card).toBeTruthy();
    expect(card?.getAttribute("data-status")).toBe("running");
    expect(card?.textContent).toContain("正在继续：国际新闻证据整理");
    expect(card?.textContent).toContain("正在继续输出。");
    expect(card?.textContent).toContain("查看输出");

    act(() => {
      card?.click();
    });

    expect(onSelectRecoverySession).toHaveBeenCalledTimes(1);
  });

  it("未完成恢复卡显示排队会话并触发恢复入口", () => {
    const onSelectRecoverySession = vi.fn();
    const { container } = renderSurface({
      recoverySession: {
        sessionId: "session-queued",
        title: "待继续的后台请求",
        summary: "仍有请求在队列中。",
        status: "queued",
      },
      onSelectRecoverySession,
    });

    const card = container.querySelector(
      '[data-testid="home-unfinished-session-card"]',
    ) as HTMLButtonElement | null;

    expect(card).toBeTruthy();
    expect(card?.getAttribute("data-status")).toBe("queued");
    expect(card?.textContent).toContain("排队等待：待继续的后台请求");
    expect(card?.textContent).toContain("仍有请求在队列中。");
    expect(card?.textContent).toContain("查看队列");

    act(() => {
      card?.click();
    });

    expect(onSelectRecoverySession).toHaveBeenCalledTimes(1);
  });

  it("引导帮助打开时不抢占展示未完成恢复卡", () => {
    const { container } = renderSurface({
      recoverySession: {
        sessionId: "session-waiting",
        title: "等待确认的任务",
        status: "waiting",
      },
    });

    expect(
      container.querySelector('[data-testid="home-unfinished-session-card"]'),
    ).toBeTruthy();

    const guide = container.querySelector(
      '[data-testid="home-guide-help-trigger"]',
    ) as HTMLButtonElement | null;

    act(() => {
      guide?.click();
    });

    expect(
      container.querySelector('[data-testid="home-unfinished-session-card"]'),
    ).toBeNull();
    expect(container.textContent).toContain("怎么添加模型？");
  });

  it("有项目会话时以左对齐目录替代补充入口", () => {
    const onSelect = vi.fn();
    const { container } = renderSurface({
      onSelectConversation: onSelect,
      conversationGroups: [
        {
          projectId: "project-1",
          projectName: "内容项目",
          conversations: [
            {
              id: "topic-1",
              title: "选题复盘",
              summary: "已记录 8 条消息。",
              statusReason: "workspace_error",
            },
          ],
        },
      ],
      supplementalActions: [
        {
          id: "recent-session",
          label: "继续最近会话",
          testId: "entry-recent-session-resume",
          onSelect: vi.fn(),
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="home-project-conversations"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="home-supplemental-actions"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="entry-recent-session-resume"]'),
    ).toBeNull();
    expect(container.textContent).toContain("选题复盘");
    expect(container.textContent).not.toContain("内容项目");
    expect(container.textContent).not.toContain("已记录 8 条消息。");

    const conversation = container.querySelector(
      '[data-testid="home-project-conversation"]',
    ) as HTMLButtonElement | null;
    act(() => {
      conversation?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("topic-1", "workspace_error");
  });

  it("项目会话超过上限时应收进更多下拉", () => {
    const { container } = renderSurface({
      conversationGroups: [
        {
          projectId: "project-1",
          projectName: "默认项目",
          conversations: [
            { id: "topic-1", title: "对话 1" },
            { id: "topic-2", title: "对话 2" },
            { id: "topic-3", title: "对话 3" },
            { id: "topic-4", title: "对话 4" },
            { id: "topic-5", title: "对话 5" },
          ],
        },
      ],
    });

    expect(
      container.querySelectorAll('[data-testid="home-project-conversation"]'),
    ).toHaveLength(3);
    expect(container.textContent).toContain("对话 1");
    expect(container.textContent).toContain("对话 3");
    expect(container.textContent).not.toContain("对话 4");
    expect(container.textContent).not.toContain("默认项目");

    const more = container.querySelector(
      '[data-testid="home-project-conversation-more"]',
    );
    expect(more?.textContent).toContain("更多 2 个对话");

    const moreButton = more?.querySelector(
      "button",
    ) as HTMLButtonElement | null;
    expect(moreButton?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      moreButton?.click();
    });

    expect(moreButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("对话 4");
    expect(container.textContent).toContain("对话 5");
  });
});
