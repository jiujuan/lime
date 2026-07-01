import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  createHarnessState,
  findButtonByText,
  renderExpandedPanel as renderPanel,
  getHarnessPanelTestMocks,
} from "./HarnessStatusPanel.testFixtures";

const { mockToast } = getHarnessPanelTestMocks();

describe("HarnessStatusPanel runtime", () => {
  it("runtimeStatus 为 failed 时应展示失败阶段与失败详情", () => {
    renderPanel({
      harnessState: createHarnessState({
        runtimeStatus: {
          phase: "failed",
          title: "当前处理失败",
          detail: "429 rate limit",
          checkpoints: ["已保留当前阶段记录"],
        },
      }),
    });

    expect(document.body.textContent).toContain("当前任务");
    expect(document.body.textContent).toContain("失败");
    expect(document.body.textContent).toContain("当前处理失败");
    expect(document.body.textContent).toContain("429 rate limit");
  });

  it("存在 selectedTeam 时应在工作台展示当前 Subagents", () => {
    renderPanel({
      selectedTeamLabel: "前端联调团队",
      selectedTeamSummary: "分析、实现、验证三段式推进。",
      selectedTeamRoles: [
        {
          id: "explorer",
          label: "分析",
          summary: "负责定位问题、澄清范围。",
          profileId: "code-explorer",
          roleKey: "explorer",
          skillIds: ["repo-exploration", "source-grounding"],
        },
      ],
    });

    expect(document.body.textContent).toContain("Subagents");
    expect(document.body.textContent).toContain("当前 Subagents");
    expect(document.body.textContent).toContain("前端联调团队");
    expect(document.body.textContent).toContain("分析、实现、验证三段式推进。");
    expect(document.body.textContent).toContain("模板 code-explorer");
    expect(document.body.textContent).toContain("职责 explorer");
    expect(document.body.textContent).toContain("repo-exploration");
  });

  it("存在真实 child session 时应优先展示子任务摘要", () => {
    renderPanel({
      childSubagentSessions: [
        {
          id: "child-1",
          name: "研究代理",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_200,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          task_summary: "并行整理竞品与证据链",
          role_hint: "explorer",
        },
        {
          id: "child-2",
          name: "实现代理",
          created_at: 1_710_000_010,
          updated_at: 1_710_000_220,
          session_type: "sub_agent",
          runtime_status: "queued",
          latest_turn_status: "queued",
          task_summary: "起草第一版落地方案",
          role_hint: "executor",
        },
      ],
    });

    expect(document.body.textContent).toContain("任务进行中");
    expect(document.body.textContent).toContain("子任务");
    expect(document.body.textContent).toContain("当前子任务");
    expect(document.body.textContent).toContain("实时子任务");
    expect(document.body.textContent).toContain("类型：子任务");
    expect(document.body.textContent).not.toContain("协作回退");
    expect(document.body.textContent).not.toContain("回退链路");
    expect(document.body.textContent).toContain("研究代理");
    expect(document.body.textContent).toContain("实现代理");
  });

  it("仅有计划摘要兜底时也应在工作台显示已就绪计划状态", () => {
    renderPanel({
      harnessState: createHarnessState({
        plan: {
          phase: "ready",
          items: [],
          summaryText: "直接回答优先\n当前请求无需工具介入。",
        },
      }),
    });

    expect(document.body.textContent).toContain("计划状态");
    expect(document.body.textContent).toContain("已就绪");
    expect(document.body.textContent).toContain("直接回答优先");
    expect(document.body.textContent).toContain("规划状态");
  });

  it("内部路由型 runtimeStatus 不应单独占据工作台主视觉", () => {
    renderPanel({
      harnessState: createHarnessState({
        runtimeStatus: {
          phase: "routing",
          title: "直接回答优先",
          detail: "当前请求无需默认升级为搜索或任务。",
          checkpoints: ["默认保持直接回答"],
          metadata: {
            sourceType: "runtime_status",
            surface: "runtime_status",
            visibility: "diagnostics",
            persistence: "transient",
          },
        },
      }),
    });

    expect(document.body.textContent).not.toContain("任务进行中");
    expect(document.body.textContent).not.toContain("直接回答优先");
  });

  it("存在 activeFileWrites 时应在工作台中展示当前文件写入", () => {
    renderPanel({
      harnessState: createHarnessState({
        activeFileWrites: [
          {
            id: "write-1",
            path: "/tmp/workspace/live.md",
            displayName: "live.md",
            phase: "streaming",
            status: "streaming",
            source: "artifact_snapshot",
            updatedAt: new Date("2026-03-13T12:00:00.000Z"),
            preview: "# 草稿\n正在写入",
            latestChunk: "正在写入",
            content: "# 草稿\n正在写入",
          },
        ],
      }),
    });

    expect(document.body.textContent).toContain("当前文件写入");
    expect(document.body.textContent).toContain("live.md");
    expect(document.body.textContent).toContain("正在写入");
    expect(document.body.textContent).toContain("快照同步");
  });

  it("运行时面板应同时呈现工具输出、权限确认、文件写入和文件活动", () => {
    const onRespondToAction = vi.fn();

    renderPanel({
      layout: "dialog",
      onRespondToAction,
      diagnosticRuntimeContext: {
        sessionId: "session-code-orchestrated",
        workspaceId: "workspace-code-orchestrated",
        workingDir: "/tmp/workspace-code-orchestrated",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: "代码团队",
      },
      harnessState: createHarnessState({
        activeFileWrites: [
          {
            id: "write-code-test",
            path: "/tmp/workspace/src/components/ImageCard.test.tsx",
            displayName: "ImageCard.test.tsx",
            phase: "streaming",
            status: "streaming",
            source: "artifact_snapshot",
            updatedAt: new Date("2026-05-26T10:00:00.000Z"),
            preview: "it('keeps image cards after history switch', () => {})",
            latestChunk: "keeps image cards after history switch",
            content: "it('keeps image cards after history switch', () => {})",
          },
        ],
        outputSignals: [
          {
            id: "signal-code-test",
            toolCallId: "tool-code-test",
            toolName: "bash",
            title: "回归测试结果",
            summary: "vitest 已执行图片卡片历史切换回归测试。",
            preview: "1 test passed",
            content: "PASS ImageCard.test.tsx\n1 test passed",
            outputFile: "/tmp/workspace/.lime/runtime/vitest-output.txt",
            exitCode: 0,
          },
        ],
        pendingApprovals: [
          {
            requestId: "approval-code-write",
            actionType: "tool_confirmation",
            toolName: "write_file",
            prompt: "确认写入图片卡片历史切换回归测试",
            arguments: {
              filePath: "src/components/ImageCard.test.tsx",
            },
          },
        ],
        recentFileEvents: [
          {
            id: "event-code-test",
            toolCallId: "tool-code-test",
            path: "/tmp/workspace/src/components/ImageCard.test.tsx",
            displayName: "ImageCard.test.tsx",
            kind: "code",
            action: "write",
            sourceToolName: "write_file",
            timestamp: new Date("2026-05-26T10:01:00.000Z"),
            preview: "新增图片卡片历史切换回归测试",
            clickable: true,
          },
        ],
      }),
    });

    const writesSection = document.body.querySelector(
      '[data-harness-section="writes"]',
    ) as HTMLElement | null;
    const outputsSection = document.body.querySelector(
      '[data-harness-section="outputs"]',
    ) as HTMLElement | null;
    const approvalsSection = document.body.querySelector(
      '[data-harness-section="approvals"]',
    ) as HTMLElement | null;
    const fileReviewSection = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;
    const filesSection = document.body.querySelector(
      '[data-harness-section="files"]',
    ) as HTMLElement | null;

    expect(document.body.textContent).toContain("本轮文件变更处理");
    expect(writesSection?.textContent).toContain("ImageCard.test.tsx");
    expect(writesSection?.textContent).toContain(
      "keeps image cards after history switch",
    );
    expect(outputsSection?.textContent).toContain("回归测试结果");
    expect(outputsSection?.textContent).toContain("1 test passed");
    expect(outputsSection?.textContent).toContain("退出码 0");
    expect(outputsSection?.textContent).toContain("输出位置");
    expect(outputsSection?.textContent).toContain("输出文件");
    expect(outputsSection?.textContent).toContain(
      "/tmp/workspace/.lime/runtime/vitest-output.txt",
    );
    expect(approvalsSection?.textContent).toContain(
      "确认写入图片卡片历史切换回归测试",
    );
    expect(approvalsSection?.textContent).toContain("工具确认");
    expect(approvalsSection?.textContent).toContain("影响范围");
    expect(approvalsSection?.textContent).toContain("风险提示");
    expect(approvalsSection?.textContent).toContain(
      "将修改工作区文件，请确认目标路径和内容符合预期。",
    );
    expect(approvalsSection?.textContent).toContain("参数摘要");
    expect(approvalsSection?.textContent).toContain(
      "src/components/ImageCard.test.tsx",
    );
    expect(approvalsSection?.textContent).toContain(
      "请求标识：approval-code-write",
    );
    expect(fileReviewSection?.textContent).toContain("确认本轮文件应用状态");
    expect(fileReviewSection?.textContent).toContain("待处理 1");
    expect(fileReviewSection?.textContent).toContain("ImageCard.test.tsx");
    expect(fileReviewSection?.textContent).toContain(
      "新增图片卡片历史切换回归测试",
    );
    expect(filesSection?.textContent).toContain("ImageCard.test.tsx");
    expect(filesSection?.textContent).toContain("新增图片卡片历史切换回归测试");

    const approveButton = findButtonByText("允许并继续");
    expect(approveButton).not.toBeNull();
    act(() => {
      approveButton?.click();
    });
    expect(onRespondToAction).toHaveBeenCalledWith({
      requestId: "approval-code-write",
      actionType: "tool_confirmation",
      confirmed: true,
      response: "approved",
    });

    const rejectButton = findButtonByText("拒绝");
    expect(rejectButton).not.toBeNull();
    act(() => {
      rejectButton?.click();
    });
    expect(onRespondToAction).toHaveBeenCalledWith({
      requestId: "approval-code-write",
      actionType: "tool_confirmation",
      confirmed: false,
      response: "rejected",
    });
  });

  it("运行时面板应将 patch/diff 输出渲染为代码变更概览", () => {
    const unifiedDiff = [
      "diff --git a/src/components/ImageCard.tsx b/src/components/ImageCard.tsx",
      "--- a/src/components/ImageCard.tsx",
      "+++ b/src/components/ImageCard.tsx",
      "@@ -1,2 +1,3 @@",
      '-const title = "oldTitle";',
      '+const title = "newTitle";',
      "+const keepsHistory = true;",
    ].join("\n");
    const applyPatch = [
      "*** Begin Patch",
      "*** Update File: src/components/ImageCard.test.tsx",
      "@@",
      "-it('drops history cards', () => {})",
      "+it('keeps history cards', () => {})",
      "*** End Patch",
    ].join("\n");

    renderPanel({
      layout: "dialog",
      diagnosticRuntimeContext: {
        sessionId: "session-code-diff",
        workspaceId: "workspace-code-diff",
        workingDir: "/tmp/workspace-code-diff",
        providerType: "openai",
        model: "gpt-5.4",
        executionStrategy: "react",
        activeTheme: "default",
        selectedTeamLabel: "代码团队",
      },
      harnessState: createHarnessState({
        outputSignals: [
          {
            id: "signal-code-diff",
            toolCallId: "tool-code-diff",
            toolName: "apply_patch",
            title: "补丁预览",
            summary: "已生成图片卡片修复补丁。",
            preview: unifiedDiff,
            content: unifiedDiff,
          },
        ],
        recentFileEvents: [
          {
            id: "event-code-diff",
            toolCallId: "tool-code-diff",
            path: "/tmp/workspace/src/components/ImageCard.test.tsx",
            displayName: "ImageCard.test.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "apply_patch",
            timestamp: new Date("2026-05-26T10:02:00.000Z"),
            preview: applyPatch,
            content: applyPatch,
            clickable: true,
          },
        ],
      }),
    });

    const outputsSection = document.body.querySelector(
      '[data-harness-section="outputs"]',
    ) as HTMLElement | null;
    const fileReviewSection = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;

    expect(
      document.body.querySelectorAll('[data-testid="harness-diff-review-card"]')
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(outputsSection?.textContent).toContain("代码变更概览");
    expect(outputsSection?.textContent).toContain(
      "src/components/ImageCard.tsx",
    );
    expect(outputsSection?.textContent).toContain("修改前");
    expect(outputsSection?.textContent).toContain("修改后");
    expect(outputsSection?.textContent).toContain("oldTitle");
    expect(outputsSection?.textContent).toContain("newTitle");
    expect(fileReviewSection?.textContent).toContain("代码变更概览");
    expect(fileReviewSection?.textContent).toContain(
      "src/components/ImageCard.test.tsx",
    );
    expect(fileReviewSection?.textContent).toContain("keeps history cards");
  });

  it("文件变更处理区块应使用 locale 资源展示动作、类型和写入阶段", async () => {
    await changeLimeLocale("en-US");

    renderPanel({
      harnessState: createHarnessState({
        activeFileWrites: [
          {
            id: "write-locale-review",
            path: "/tmp/workspace/src/locale.ts",
            displayName: "locale.ts",
            phase: "streaming",
            status: "streaming",
            source: "artifact_snapshot",
            updatedAt: new Date("2026-05-26T12:00:00.000Z"),
            preview: "export const locale = true;",
            latestChunk: "export const locale = true;",
            content: "export const locale = true;",
          },
        ],
        recentFileEvents: [
          {
            id: "event-locale-review",
            toolCallId: "tool-locale-review",
            path: "/tmp/workspace/src/locale.ts",
            displayName: "locale.ts",
            kind: "code",
            action: "write",
            sourceToolName: "Write",
            timestamp: new Date("2026-05-26T12:01:00.000Z"),
            preview: "export const locale = true;",
            clickable: true,
          },
        ],
      }),
    });

    const section = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;
    expect(section?.textContent).toContain("Confirm file application status");
    expect(section?.textContent).toContain("locale.ts");
    expect(section?.textContent).toContain("Write");
    expect(section?.textContent).toContain("Code");
    expect(section?.textContent).toContain("Writing 1");
    expect(section?.textContent).toContain("Write 1");
    expect(section?.textContent).not.toContain("正在写入 1");
    expect(section?.textContent).not.toContain("代码");
  });

  it("文件变更处理区块应支持批量标记已应用", () => {
    renderPanel({
      harnessState: createHarnessState({
        recentFileEvents: [
          {
            id: "event-review-apply-1",
            toolCallId: "tool-review-apply-1",
            path: "/tmp/workspace/src/app.ts",
            displayName: "app.ts",
            kind: "code",
            action: "write",
            sourceToolName: "Write",
            timestamp: new Date("2026-05-26T11:00:00.000Z"),
            preview: "export const app = true;",
            clickable: true,
          },
          {
            id: "event-review-apply-2",
            toolCallId: "tool-review-apply-2",
            path: "/tmp/workspace/src/card.tsx",
            displayName: "card.tsx",
            kind: "code",
            action: "edit",
            sourceToolName: "Edit",
            timestamp: new Date("2026-05-26T11:01:00.000Z"),
            preview: "<Card />",
            clickable: true,
          },
        ],
      }),
    });

    const section = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;
    expect(section?.textContent).toContain("待处理 2");
    expect(section?.textContent).toContain("已应用 0");

    const selectAllButton = Array.from(
      section?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("全选变更"));

    act(() => {
      selectAllButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const markAppliedButton = Array.from(
      section?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("标记已应用 2"));

    act(() => {
      markAppliedButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(mockToast.success).toHaveBeenCalledWith(
      "已标记 2 个文件变更为已应用",
    );
    expect(section?.textContent).toContain("待处理 0");
    expect(section?.textContent).toContain("已应用 2");
  });

  it("文件变更处理区块拒绝变更时应打开文件快照入口", () => {
    const onOpenFileCheckpoints = vi.fn();

    renderPanel({
      harnessState: createHarnessState({
        recentFileEvents: [
          {
            id: "event-review-reject-1",
            toolCallId: "tool-review-reject-1",
            path: "/tmp/workspace/src/reject.ts",
            displayName: "reject.ts",
            kind: "code",
            action: "edit",
            sourceToolName: "Edit",
            timestamp: new Date("2026-05-26T11:02:00.000Z"),
            preview: "const rejected = true;",
            clickable: true,
          },
        ],
      }),
      onOpenFileCheckpoints,
    });

    const section = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;
    const rejectButton = Array.from(
      section?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.trim() === "拒绝并回滚");

    act(() => {
      rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenFileCheckpoints).toHaveBeenCalledTimes(1);
    expect(section?.textContent).toContain("已拒绝");
  });

  it("文件变更处理区块没有快照入口时拒绝变更应提示回退路径", () => {
    renderPanel({
      harnessState: createHarnessState({
        recentFileEvents: [
          {
            id: "event-review-reject-no-checkpoint",
            toolCallId: "tool-review-reject-no-checkpoint",
            path: "/tmp/workspace/src/no-checkpoint.ts",
            displayName: "no-checkpoint.ts",
            kind: "code",
            action: "write",
            sourceToolName: "Write",
            timestamp: new Date("2026-05-26T11:03:00.000Z"),
            preview: "const checkpoint = false;",
            clickable: true,
          },
        ],
      }),
    });

    const section = document.body.querySelector(
      '[data-harness-section="file_review"]',
    ) as HTMLElement | null;
    const rejectButton = Array.from(
      section?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.trim() === "拒绝并回滚");

    act(() => {
      rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockToast.info).toHaveBeenCalledWith(
      "当前会话没有可打开的文件快照入口，请在文件活动中查看路径。",
    );
    expect(section?.textContent).toContain("已拒绝");
  });

  it("摘要卡和快速导航应支持跳转到对应区块", () => {
    const scrollIntoViewMock = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    renderPanel({
      harnessState: createHarnessState({
        pendingApprovals: [
          {
            requestId: "approval-1",
            actionType: "tool_confirmation",
            prompt: "确认写入",
          },
        ],
        recentFileEvents: [
          {
            id: "event-nav-1",
            toolCallId: "tool-nav-1",
            path: "/tmp/workspace/nav.md",
            displayName: "nav.md",
            kind: "document",
            action: "write",
            sourceToolName: "Write",
            timestamp: new Date("2026-03-11T12:00:00.000Z"),
            preview: "导航预览",
            clickable: true,
          },
        ],
      }),
    });

    const summaryJumpButton = document.body.querySelector(
      'button[aria-label="跳转到待审批"]',
    ) as HTMLButtonElement | null;

    act(() => {
      summaryJumpButton?.click();
    });

    expect(scrollIntoViewMock).toHaveBeenCalled();

    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("待审批区块应通过 artifact protocol 展示嵌套参数里的路径", () => {
    renderPanel({
      harnessState: createHarnessState({
        pendingApprovals: [
          {
            requestId: "approval-path-1",
            actionType: "tool_confirmation",
            prompt: "确认写入主稿",
            toolName: "write_file",
            arguments: {
              payload: {
                filePath: "workspace/approval-draft.md",
              },
            },
          },
        ],
      }),
    });

    expect(document.body.textContent).toContain("workspace/approval-draft.md");
    expect(document.body.textContent).toContain("允许会继续当前编程运行");
    expect(document.body.textContent).toContain("拒绝会结束这次操作请求");
  });
});
