import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "@/lib/api/agentRuntime";
import type { SceneAppExecutionSummaryViewModel } from "@/lib/agent/legacySceneAppExecutionSummary";
import {
  recordCuratedTaskRecommendationSignalFromReviewDecision,
} from "../utils/curatedTaskRecommendationSignals";
import {
  useSceneAppReviewDecisionRuntime,
  type SceneAppReviewDecisionRuntimeState,
  type UseSceneAppReviewDecisionRuntimeParams,
} from "./useSceneAppReviewDecisionRuntime";
import type { SceneAppExecutionSummaryRuntimeState } from "./useSceneAppExecutionSummaryRuntime";

const exportAgentRuntimeReviewDecisionTemplateMock = vi.fn();
const saveAgentRuntimeReviewDecisionMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/api/agentRuntime", () => ({
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
  ): Promise<AgentRuntimeReviewDecisionTemplate> =>
    exportAgentRuntimeReviewDecisionTemplateMock(sessionId),
  saveAgentRuntimeReviewDecision: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ): Promise<AgentRuntimeReviewDecisionTemplate> =>
    saveAgentRuntimeReviewDecisionMock(request),
}));

type HookProps = UseSceneAppReviewDecisionRuntimeParams;

let latest: SceneAppReviewDecisionRuntimeState | null = null;
let root: Root;
let container: HTMLDivElement;

function createSummary(
  overrides: Partial<SceneAppExecutionSummaryViewModel> = {},
): SceneAppExecutionSummaryViewModel {
  return {
    sceneappId: "scene-1",
    title: "公众号选题",
    summary: "完成一轮选题判断",
    businessLabel: "内容",
    typeLabel: "选题",
    executionChainLabel: "Claw",
    deliveryContractLabel: "文章草稿",
    planningStatusLabel: "已完成",
    planningSummary: "下一步进入发布前复核",
    activeLayers: [],
    referenceCount: 1,
    referenceItems: [],
    projectPackPlan: null,
    scorecardMetricKeys: [],
    scorecardFailureSignals: [],
    notes: [],
    runtimeBackflow: {
      runId: "run-1",
      statusLabel: "成功",
      statusTone: "success",
      summary: "运行态已回流",
      nextAction: "继续放量",
      evidenceSourceLabel: "fixture",
      sourceLabel: "fixture",
      deliveryCompletionLabel: "已完成",
      startedAtLabel: "10:00",
      finishedAtLabel: "10:01",
      topFailureSignalLabel: "样本偏少",
      deliveryCompletedParts: [],
      deliveryMissingParts: [],
      observedFailureSignals: [],
      governanceArtifacts: [],
    },
    ...overrides,
  };
}

function createRuntimeState(
  summary: SceneAppExecutionSummaryViewModel = createSummary(),
): SceneAppExecutionSummaryRuntimeState {
  return {
    summary,
    latestPackResultDetailView: null,
    latestPackResultUsesFallback: false,
    reviewTargetRunSummary: {
      runId: "run-1",
      status: "success",
      sessionId: "review-session",
    },
    loading: false,
    requestRefresh: vi.fn(),
  };
}

function createTemplate(
  overrides: Partial<AgentRuntimeReviewDecisionTemplate> = {},
): AgentRuntimeReviewDecisionTemplate {
  return {
    session_id: "review-session",
    thread_id: "thread-1",
    workspace_root: "/tmp/workspace",
    review_relative_root: ".lime/review",
    review_absolute_root: "/tmp/workspace/.lime/review",
    analysis_relative_root: ".lime/analysis",
    analysis_absolute_root: "/tmp/workspace/.lime/analysis",
    handoff_bundle_relative_root: ".lime/handoff",
    evidence_pack_relative_root: ".lime/evidence",
    replay_case_relative_root: ".lime/replay",
    exported_at: "2026-06-18T00:00:00Z",
    title: "人工复核",
    thread_status: "completed",
    pending_request_count: 0,
    queued_turn_count: 0,
    default_decision_status: "pending_review",
    decision: {
      decision_status: "pending_review",
      decision_summary: "",
      chosen_fix_strategy: "",
      risk_level: "unknown",
      risk_tags: [],
      human_reviewer: "tester",
      followup_actions: [],
      regression_requirements: ["保留回归"],
      notes: "",
    },
    decision_status_options: [
      "accepted",
      "deferred",
      "needs_more_evidence",
      "rejected",
      "pending_review",
    ],
    risk_level_options: ["low", "medium", "high", "unknown"],
    review_checklist: [],
    analysis_artifacts: [],
    artifacts: [],
    ...overrides,
  };
}

function renderHook(props?: Partial<HookProps>) {
  function Probe(currentProps: HookProps) {
    latest = useSceneAppReviewDecisionRuntime(currentProps);
    return null;
  }

  const defaultProps: HookProps = {
    projectId: "project-1",
    sessionId: "session-1",
    sceneAppExecutionSummaryState: createRuntimeState(),
  };

  act(() => {
    root.render(<Probe {...defaultProps} {...props} />);
  });

  if (!latest) {
    throw new Error("hook 尚未初始化");
  }
  return latest;
}

describe("useSceneAppReviewDecisionRuntime", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
    window.localStorage.clear();
    exportAgentRuntimeReviewDecisionTemplateMock.mockReset();
    saveAgentRuntimeReviewDecisionMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    latest = null;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("打开人工复核时导出模板，并复用同一 session 的缓存模板", async () => {
    const template = createTemplate();
    exportAgentRuntimeReviewDecisionTemplateMock.mockResolvedValue(template);
    renderHook();

    await act(async () => {
      latest?.handleOpenHumanReview();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeReviewDecisionTemplateMock).toHaveBeenCalledTimes(
      1,
    );
    expect(exportAgentRuntimeReviewDecisionTemplateMock).toHaveBeenCalledWith(
      "review-session",
    );
    expect(latest?.dialogOpen).toBe(true);
    expect(latest?.template).toEqual(template);

    await act(async () => {
      latest?.handleOpenHumanReview();
      await Promise.resolve();
    });

    expect(exportAgentRuntimeReviewDecisionTemplateMock).toHaveBeenCalledTimes(
      1,
    );
  });

  it("快捷复核会基于模板保存 review decision 并保留弹窗状态", async () => {
    const requestRefresh = vi.fn();
    const template = createTemplate();
    const savedTemplate = createTemplate({
      decision: {
        ...template.decision,
        decision_status: "accepted",
      },
    });
    exportAgentRuntimeReviewDecisionTemplateMock.mockResolvedValue(template);
    saveAgentRuntimeReviewDecisionMock.mockResolvedValue(savedTemplate);
    renderHook({
      sceneAppExecutionSummaryState: {
        ...createRuntimeState(),
        requestRefresh,
      },
    });

    await act(async () => {
      latest?.handleApplyQuickReview("accepted");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveAgentRuntimeReviewDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "review-session",
        decision_status: "accepted",
        risk_level: "low",
        risk_tags: ["样本偏少"],
      }),
    );
    expect(latest?.dialogOpen).toBe(false);
    expect(latest?.template).toEqual(savedTemplate);
    expect(latest?.latestReviewFeedbackSignal).toEqual(
      expect.objectContaining({
        source: "review_feedback",
        sessionId: "session-1",
      }),
    );
    expect(requestRefresh).toHaveBeenCalledTimes(1);
  });

  it("手动保存人工复核后关闭弹窗并刷新推荐信号", async () => {
    const request: AgentRuntimeSaveReviewDecisionRequest = {
      session_id: "review-session",
      decision_status: "deferred",
      decision_summary: "继续观察",
      chosen_fix_strategy: "补一轮样本",
      risk_level: "medium",
      risk_tags: ["样本不足"],
      human_reviewer: "tester",
      followup_actions: ["追加样本"],
      regression_requirements: [],
      notes: "",
    };
    saveAgentRuntimeReviewDecisionMock.mockResolvedValue(createTemplate());
    renderHook();

    act(() => {
      latest?.setDialogOpen(true);
    });
    await act(async () => {
      await latest?.handleSaveHumanReview(request);
    });

    expect(latest?.dialogOpen).toBe(false);
    expect(latest?.latestReviewFeedbackSignal).toEqual(
      expect.objectContaining({
        source: "review_feedback",
        title: "公众号选题 · 继续观察",
      }),
    );
  });

  it("能从最新人工复核信号进入 Skill 沉淀页", () => {
    const onNavigate = vi.fn();
    recordCuratedTaskRecommendationSignalFromReviewDecision(
      {
        session_id: "review-session",
        decision_status: "accepted",
        decision_summary: "这轮可复用",
        chosen_fix_strategy: "沿当前基线放量",
        risk_level: "low",
        risk_tags: [],
        followup_actions: ["继续发布样本"],
      },
      {
        projectId: "project-1",
        sessionId: "session-1",
        sceneTitle: "公众号选题",
      },
    );
    renderHook({ onNavigate });

    act(() => {
      latest?.handleSaveAsSkill();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "skills",
      expect.objectContaining({
        creationProjectId: "project-1",
        initialScaffoldDraft: expect.objectContaining({
          name: expect.stringContaining("公众号选题"),
        }),
      }),
    );
  });
});
