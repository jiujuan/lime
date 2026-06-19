import { describe, expect, it } from "vitest";
import {
  collectPendingA2UIFormIds,
  createMockAgentChatUnifiedState,
  flushEffects,
  installMockAgentChatUnifiedState,
  mountPage,
  renderPage,
  waitForElement,
  waitForPendingA2UIForm,
} from "./index.testFixtures";
import { requestTaskCenterDraftTask } from "./taskCenterDraftTaskEvents";

describe("AgentChatPage 服务技能 A2UI", () => {
  it("页面参数带着 pending service skill 时，应在当前对话挂起服务技能 A2UI", async () => {
    installMockAgentChatUnifiedState(createMockAgentChatUnifiedState());

    const container = renderPage({
      projectId: "project-service-skill-a2ui",
      contentId: "content-service-skill-a2ui",
      theme: "general",
      lockTheme: true,
      initialPendingServiceSkillLaunch: {
        skillId: "daily-trend-briefing",
        requestKey: 20260409,
        initialSlotValues: {
          industry_keywords: "",
          schedule_time: "每天 10:00",
        },
        prefillHint: "已根据 Skills 页入口推荐自动预填。",
      },
    });
    await waitForElement(container, '[data-testid="layout-transition"]');

    expect(
      container
        .querySelector('[data-testid="layout-transition"]')
        ?.getAttribute("data-mode"),
    ).toBe("chat");

    const pendingA2UIForm = (await waitForPendingA2UIForm(
      (form) =>
        form?.id ===
        "service-skill-launch:daily-trend-briefing:daily-trend-briefing:20260409",
    )) as {
      id?: string;
      components?: Array<Record<string, unknown>>;
    } | null;

    expect(
      pendingA2UIForm?.id,
      `pending A2UI 调用历史：${JSON.stringify(collectPendingA2UIFormIds())}`,
    ).toBe(
      "service-skill-launch:daily-trend-briefing:daily-trend-briefing:20260409",
    );
    expect(pendingA2UIForm?.components || []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringContaining(":prefill-hint"),
          text: "已根据 Skills 页入口推荐自动预填。",
        }),
        expect.objectContaining({
          id: "service-skill-slot-industry_keywords",
          component: "TextField",
        }),
        expect.objectContaining({
          id: "service-skill-slot-schedule_time",
          value: "每天 10:00",
        }),
      ]),
    );
  });

  it("从挂起服务技能补参态新建任务时，应清掉旧补参表单", async () => {
    installMockAgentChatUnifiedState(createMockAgentChatUnifiedState());

    const mounted = mountPage({
      projectId: "project-service-skill-a2ui",
      contentId: "content-service-skill-a2ui",
      theme: "general",
      lockTheme: true,
      initialPendingServiceSkillLaunch: {
        skillId: "daily-trend-briefing",
        requestKey: 20260409,
        initialSlotValues: {
          industry_keywords: "",
          schedule_time: "每天 10:00",
        },
        prefillHint: "已根据 Skills 页入口推荐自动预填。",
      },
    });

    const pendingFormBefore = await waitForPendingA2UIForm((form) =>
      Boolean(form?.id?.includes("service-skill-launch:daily-trend-briefing")),
    );
    expect(
      pendingFormBefore?.id,
      `pending A2UI 调用历史：${JSON.stringify(collectPendingA2UIFormIds())}`,
    ).toContain("service-skill-launch");

    expect(requestTaskCenterDraftTask({ source: "sidebar" })).toBe(true);
    await flushEffects();
    mounted.rerender();
    await flushEffects();

    expect(
      await waitForElement(mounted.container, '[data-testid="empty-state"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector(
        '[data-testid="workspace-pending-a2ui-panel"]',
      ),
    ).toBeNull();
  });
});
