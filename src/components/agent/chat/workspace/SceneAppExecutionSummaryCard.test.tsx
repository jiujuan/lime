import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneAppExecutionSummaryCard } from "./SceneAppExecutionSummaryCard";
import { changeLimeLocale } from "@/i18n/createI18n";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];
function renderCard(
  props: Partial<
    React.ComponentProps<typeof SceneAppExecutionSummaryCard>
  > = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <SceneAppExecutionSummaryCard
        summary={{
          sceneappId: "story-video-suite",
          title: "短视频编排",
          summary: "把线框图、脚本、配乐和短视频草稿压成同一条结果链。",
          businessLabel: "内容闭环",
          typeLabel: "多模态组合",
          executionChainLabel: "做法 -> 生成 -> Project Pack",
          deliveryContractLabel: "Project Pack",
          planningStatusLabel: "已就绪",
          planningSummary:
            "当前已经带入 2 条参考与 1 条风格偏好，可直接进入生成。",
          activeLayers: [
            { key: "skill", label: "Skill" },
            { key: "memory", label: "Memory" },
            { key: "taste", label: "Taste" },
          ],
          referenceCount: 2,
          referenceItems: [
            {
              key: "ref-1",
              label: "品牌 KV",
              sourceLabel: "记忆参考",
              contentTypeLabel: "图片",
              usageLabel: "主视觉",
              selected: true,
            },
            {
              key: "ref-2",
              label: "评论反馈",
              sourceLabel: "复盘",
              contentTypeLabel: "文本",
              feedbackLabel: "封面需更克制",
              selected: true,
            },
          ],
          tasteSummary: "偏好克制的科技蓝与留白型构图。",
          feedbackSummary: "最近两次复盘都提示封面信息过密。",
          projectPackPlan: {
            packKindLabel: "短视频项目包",
            completionStrategyLabel: "按必含部件判断整包完成度",
            viewerLabel: "结果包查看器",
            primaryPart: "任务简报",
            requiredParts: [
              { key: "brief", label: "任务简报" },
              { key: "storyboard", label: "分镜 / 线框图" },
            ],
            notes: ["完整度将按 2 个必含部件判断。"],
          },
          scorecardProfileRef: "story-video-scorecard",
          scorecardMetricKeys: [
            { key: "delivery_readiness", label: "交付就绪度" },
          ],
          scorecardFailureSignals: [
            { key: "publish_stalled", label: "发布卡点" },
          ],
          scorecardAggregate: {
            status: "risk",
            statusLabel: "先补复核与修复",
            summary:
              "这套做法最近一轮还没形成可直接放大的结果闭环，当前主要卡在复核阻塞。",
            nextAction:
              "优先补结果材料，补齐复核结论、结果校验问题或验证失败项，再决定是否继续放大这套做法。",
            actionLabel: "建议继续优化",
            topFailureSignalLabel: "复核阻塞",
            profileRef: "story-video-scorecard",
            metricKeys: [{ key: "delivery_readiness", label: "交付就绪度" }],
            failureSignals: [{ key: "publish_stalled", label: "发布卡点" }],
            observedFailureSignals: [
              { key: "review_blocked", label: "复核阻塞" },
            ],
            destinations: [
              {
                key: "weekly-review",
                label: "看结果",
                description: "把证据摘要和人工复核记录带回来回看业务结果。",
              },
              {
                key: "task-center",
                label: "生成",
                description: "继续把结果记录带回生成。",
              },
            ],
          },
          notes: ["已装配 2 条参考素材和 1 条 memory 引用。"],
          descriptorSnapshot: {
            deliveryContract: "project_pack",
            deliveryProfile: {
              viewerKind: "artifact_bundle",
              requiredParts: ["brief", "storyboard"],
              primaryPart: "brief",
            },
          },
          runtimeBackflow: {
            runId: "run-1",
            statusLabel: "已完成",
            statusTone: "watch",
            summary: "「短视频编排」本次运行成功，但结果包还缺少最终复核部件。",
            nextAction: "优先补齐复核意见，再决定是否进入发布动作。",
            sourceLabel: "对话执行",
            deliveryCompletionLabel: "已交付 1/2 个部件",
            evidenceSourceLabel: "当前已接入会话证据",
            startedAtLabel: "2026-04-17 12:00",
            finishedAtLabel: "2026-04-17 12:03",
            scorecardActionLabel: "优先优化",
            topFailureSignalLabel: "复核阻塞",
            deliveryCompletedParts: [{ key: "brief", label: "任务简报" }],
            deliveryMissingParts: [{ key: "review_note", label: "复核意见" }],
            observedFailureSignals: [
              { key: "review_blocked", label: "复核阻塞" },
            ],
            governanceArtifacts: [
              { key: "evidence_summary", label: "证据摘要" },
            ],
          },
        }}
        {...props}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

beforeEach(async () => {
  await changeLimeLocale("zh-CN");
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
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("SceneAppExecutionSummaryCard", () => {
  it("应展示做法执行摘要的核心合同信息", () => {
    const container = renderCard();

    expect(container.textContent).toContain("做法执行摘要");
    expect(container.textContent).toContain("短视频编排");
    expect(container.textContent).toContain("做法 -> 生成 -> Project Pack");
    expect(container.textContent).toContain(
      "当前已经带入 2 条参考与 1 条风格偏好",
    );
    expect(container.textContent).toContain("当前带入对象");
    expect(container.textContent).toContain("结果去向与交付");
    expect(container.textContent).toContain("这轮怎么判断");
    expect(container.textContent).toContain("当前带入：2 条参考对象");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-project-pack"]',
      )?.textContent,
    ).toContain("短视频项目包");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-scorecard"]',
      )?.textContent,
    ).toContain("story-video-scorecard");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-scorecard-aggregate"]',
      )?.textContent,
    ).toContain("先补复核与修复");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-scorecard-destinations"]',
      )?.textContent,
    ).toContain("看结果");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-runtime-backflow"]',
      )?.textContent,
    ).toContain("当前已接入会话证据");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-active-layers"]',
      )?.textContent,
    ).toContain("Taste");
  });

  it("命中最近判断时，结果卡应显影判断建议横幅", () => {
    const container = renderCard({
      onContinueReviewFeedback: vi.fn(),
      latestReviewFeedbackSignal: {
        source: "review_feedback",
        category: "experience",
        title: "短视频编排 · 补证据",
        summary: "这轮结果还缺证据，需要回到账号复盘和高表现样本继续补证据。",
        tags: ["复盘", "补证据"],
        preferredTaskIds: ["account-project-review", "viral-content-breakdown"],
        createdAt: 1_776_869_588_097,
        projectId: "project-1",
        sessionId: "session-1",
      },
    });

    const reviewBanner = container.querySelector(
      '[data-testid="sceneapp-execution-summary-review-feedback-banner"]',
    ) as HTMLElement | null;
    expect(reviewBanner).not.toBeNull();
    expect(reviewBanner?.textContent).toContain("围绕最近判断");
    expect(reviewBanner?.textContent).toContain(
      "最近判断已更新：短视频编排 · 补证据",
    );
    expect(reviewBanner?.textContent).toContain("这轮结果还缺证据");
    expect(reviewBanner?.textContent).toContain(
      "复盘这个账号/项目 / 拆解一条爆款内容",
    );
    expect(
      reviewBanner?.querySelector(
        '[data-testid="sceneapp-execution-summary-review-feedback-action"]',
      )?.textContent,
    ).toContain("继续去「复盘这个账号/项目」");
  });

  it("点击最近判断建议时，应继续切到对应结果模板", () => {
    const onContinueReviewFeedback = vi.fn();
    const container = renderCard({
      latestReviewFeedbackSignal: {
        source: "review_feedback",
        category: "experience",
        title: "短视频编排 · 补证据",
        summary: "这轮结果还缺证据，需要回到账号复盘和高表现样本继续补证据。",
        tags: ["复盘", "补证据"],
        preferredTaskIds: ["account-project-review", "viral-content-breakdown"],
        createdAt: 1_776_869_588_097,
        projectId: "project-1",
        sessionId: "session-1",
      },
      onContinueReviewFeedback,
    });

    const actionButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-review-feedback-action"]',
    );
    expect(actionButton).not.toBeNull();

    act(() => {
      actionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onContinueReviewFeedback).toHaveBeenCalledTimes(1);
    expect(onContinueReviewFeedback).toHaveBeenCalledWith(
      "account-project-review",
    );
  });

  it("应只展示历史摘要、继续动作和当前发布产物", () => {
    const onReviewCurrentProject = vi.fn();
    const onSaveAsSkill = vi.fn();
    const onOpenSceneAppDetail = vi.fn();
    const onOpenSceneAppGovernance = vi.fn();
    const onOpenHumanReview = vi.fn();
    const onApplyQuickReview = vi.fn();
    const onContentPostAction = vi.fn();
    const container = renderCard({
      onReviewCurrentProject,
      onSaveAsSkill,
      onOpenSceneAppDetail,
      onOpenSceneAppGovernance,
      humanReviewAvailable: true,
      onOpenHumanReview,
      onApplyQuickReview,
      quickReviewActions: [
        {
          key: "accepted",
          label: "可继续复用",
          helperText: "这轮结果可以继续沿当前基线放量。",
          tone: "positive",
        },
      ],
      contentPostEntries: [
        {
          key: "publish",
          label: "发布稿",
          helperText: "直接复核标题、摘要、封面文案和发布备注。",
          pathLabel: "content-posts/final-publish.md",
          readinessLabel: "可继续发布",
          readinessTone: "success",
          companionEntries: [
            {
              key: "cover_meta",
              label: "封面信息",
              pathLabel: "content-posts/final-publish.cover.json",
            },
            {
              key: "publish_pack",
              label: "发布包",
              pathLabel: "content-posts/final-publish.publish-pack.json",
            },
          ],
          updatedAt: 1,
          source: {
            kind: "session_file",
            file: {
              name: "content-posts/final-publish.md",
              fileType: "document",
              size: 128,
              createdAt: 1,
              updatedAt: 1,
              metadata: {
                contentPostIntent: "publish",
                contentPostLabel: "发布稿",
              },
            },
          },
        },
        {
          key: "preview",
          label: "渠道预览稿",
          helperText: "直接复核首屏摘要、排版层级和封面建议。",
          pathLabel: "content-posts/preview.md",
          platformLabel: "小红书",
          readinessLabel: "优先渠道预览",
          readinessTone: "success",
          companionEntries: [],
          updatedAt: 2,
          source: {
            kind: "session_file",
            file: {
              name: "content-posts/preview.md",
              fileType: "document",
              size: 96,
              createdAt: 2,
              updatedAt: 2,
              metadata: {
                contentPostIntent: "preview",
                contentPostLabel: "渠道预览稿",
              },
            },
          },
        },
      ],
      onContentPostAction,
    });

    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-runtime-pack"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-orchestration"]',
      ),
    ).toBeNull();
    expect(container.textContent).not.toContain("最近可消费结果");
    expect(container.textContent).not.toContain("同聊推进");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-followup-actions"]',
      )?.textContent,
    ).toContain("继续动作");
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-content-posts"]',
      )?.textContent,
    ).toContain("最近发布产物");
    expect(container.textContent).toContain("发布稿");
    expect(container.textContent).toContain("渠道预览稿");
    expect(container.textContent).toContain("可继续发布");
    expect(container.textContent).toContain("优先渠道预览");
    expect(container.textContent).toContain("封面信息");
    expect(container.textContent).toContain("发布包");

    const reviewCurrentProjectButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-review-current-project"]',
    );
    const saveAsSkillButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-save-as-skill"]',
    );
    const detailButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-open-detail"]',
    );
    const governanceButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-open-governance"]',
    );
    const humanReviewButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-open-human-review"]',
    );
    const quickReviewButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-quick-review-accepted"]',
    );
    const publishArtifactButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-content-post-publish"]',
    );
    const previewArtifactButton = container.querySelector(
      '[data-testid="sceneapp-execution-summary-content-post-preview"]',
    );

    expect(reviewCurrentProjectButton).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-save-as-inspiration"]',
      ),
    ).toBeNull();
    expect(saveAsSkillButton).not.toBeNull();
    expect(detailButton).not.toBeNull();
    expect(governanceButton).not.toBeNull();
    expect(humanReviewButton).not.toBeNull();
    expect(quickReviewButton).not.toBeNull();
    expect(publishArtifactButton).not.toBeNull();
    expect(previewArtifactButton).not.toBeNull();

    act(() => {
      reviewCurrentProjectButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      saveAsSkillButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      detailButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      governanceButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      humanReviewButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      quickReviewButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      publishArtifactButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      previewArtifactButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onReviewCurrentProject).toHaveBeenCalledTimes(1);
    expect(onSaveAsSkill).toHaveBeenCalledTimes(1);
    expect(onOpenSceneAppDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSceneAppGovernance).toHaveBeenCalledTimes(1);
    expect(onOpenHumanReview).toHaveBeenCalledTimes(1);
    expect(onApplyQuickReview).toHaveBeenCalledWith("accepted");
    expect(onContentPostAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ key: "publish" }),
    );
    expect(onContentPostAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: "preview" }),
    );
  });

  it("旧灵感库按钮不应再出现场景结果卡", () => {
    const container = renderCard();

    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-save-as-inspiration"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-open-inspiration-library"]',
      ),
    ).toBeNull();
    expect(container.textContent ?? "").not.toContain("灵感库");
  });

  it("不应恢复旧运行详情编排入口", () => {
    const container = renderCard({
      onReviewCurrentProject: vi.fn(),
    });

    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-runtime-pack"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-orchestration"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid^="sceneapp-execution-summary-prompt-action-"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid^="sceneapp-execution-summary-destination-action-"]',
      ),
    ).toBeNull();
  });

  it("没有摘要时不应渲染卡片", () => {
    const container = renderCard({
      summary: null,
    });

    expect(
      container.querySelector(
        '[data-testid="sceneapp-execution-summary-card"]',
      ),
    ).toBeNull();
  });
});
