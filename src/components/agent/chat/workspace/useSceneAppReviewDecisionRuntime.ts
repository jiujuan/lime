import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  exportAgentRuntimeReviewDecisionTemplate,
  saveAgentRuntimeReviewDecision,
  type AgentRuntimeReviewDecisionTemplate,
  type AgentRuntimeSaveReviewDecisionRequest,
} from "@/lib/api/agentRuntime";
import {
  buildSceneAppQuickReviewDecisionRequest,
  formatSceneAppErrorMessage,
  SCENEAPP_QUICK_REVIEW_ACTIONS,
  type SceneAppRunSummary,
} from "@/lib/agent/legacySceneAppExecutionSummary";
import type { Page, PageParams } from "@/types/page";
import {
  listCuratedTaskRecommendationSignals,
  recordCuratedTaskRecommendationSignalFromReviewDecision,
  subscribeCuratedTaskRecommendationSignalsChanged,
} from "../utils/curatedTaskRecommendationSignals";
import {
  buildSceneAppExecutionInspirationLibraryPageParams,
  hasSavedSceneAppExecutionAsInspiration,
  saveSceneAppExecutionAsInspiration,
} from "../utils/saveSceneAppExecutionAsInspiration";
import { buildSkillsPageParamsFromSceneAppExecution } from "../utils/sceneAppSkillScaffoldDraft";
import type { SceneAppExecutionSummaryRuntimeState } from "./useSceneAppExecutionSummaryRuntime";

type SceneAppQuickReviewActionKey =
  (typeof SCENEAPP_QUICK_REVIEW_ACTIONS)[number]["key"];

export interface UseSceneAppReviewDecisionRuntimeParams {
  projectId?: string | null;
  sessionId?: string | null;
  sceneAppExecutionSummaryState?: SceneAppExecutionSummaryRuntimeState;
  onNavigate?: (page: Page, params?: PageParams) => void;
}

export interface SceneAppReviewDecisionRuntimeState {
  dialogOpen: boolean;
  template: AgentRuntimeReviewDecisionTemplate | null;
  loading: boolean;
  saving: boolean;
  humanReviewAvailable: boolean;
  quickReviewPending: boolean;
  latestReviewFeedbackSignal: ReturnType<
    typeof listCuratedTaskRecommendationSignals
  >[number] | null;
  savedAsInspiration: boolean;
  setDialogOpen: (open: boolean) => void;
  handleOpenHumanReview: () => void;
  handleSaveHumanReview: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<void>;
  handleApplyQuickReview: (
    actionKey: SceneAppQuickReviewActionKey,
  ) => void;
  handleSaveAsSkill: () => void;
  handleSaveAsInspiration: () => void;
  handleOpenInspirationLibrary: () => void;
}

const REVIEWABLE_SCENE_APP_STATUSES: SceneAppRunSummary["status"][] = [
  "success",
  "error",
  "canceled",
  "timeout",
];

export function useSceneAppReviewDecisionRuntime({
  projectId,
  sessionId,
  sceneAppExecutionSummaryState,
  onNavigate,
}: UseSceneAppReviewDecisionRuntimeParams): SceneAppReviewDecisionRuntimeState {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [template, setTemplate] =
    useState<AgentRuntimeReviewDecisionTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signalsVersion, setSignalsVersion] = useState(0);
  const summary = sceneAppExecutionSummaryState?.summary ?? null;
  const targetRunSummary =
    sceneAppExecutionSummaryState?.reviewTargetRunSummary ?? null;
  const targetSessionId = targetRunSummary?.sessionId?.trim() || "";
  const requestRefreshSceneAppExecutionSummary =
    sceneAppExecutionSummaryState?.requestRefresh;
  const failureSignal = summary?.runtimeBackflow?.topFailureSignalLabel;
  const humanReviewAvailable =
    targetSessionId.length > 0 &&
    Boolean(
      targetRunSummary &&
      REVIEWABLE_SCENE_APP_STATUSES.includes(targetRunSummary.status),
    );

  useEffect(() => {
    return subscribeCuratedTaskRecommendationSignalsChanged(() => {
      setSignalsVersion((previous) => previous + 1);
    });
  }, []);

  const resolveReviewDecisionTemplate = useCallback(async () => {
    if (!targetSessionId) {
      return null;
    }

    if (template?.session_id === targetSessionId) {
      return template;
    }

    setLoading(true);
    try {
      const nextTemplate =
        await exportAgentRuntimeReviewDecisionTemplate(targetSessionId);
      setTemplate(nextTemplate);
      return nextTemplate;
    } catch (error) {
      toast.error(formatSceneAppErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [targetSessionId, template]);

  const persistHumanReview = useCallback(
    async (
      request: AgentRuntimeSaveReviewDecisionRequest,
      options?: {
        closeDialog?: boolean;
        successMessage?: string;
      },
    ) => {
      setSaving(true);
      try {
        const nextTemplate = await saveAgentRuntimeReviewDecision(request);
        setTemplate(nextTemplate);
        recordCuratedTaskRecommendationSignalFromReviewDecision(request, {
          projectId,
          sessionId,
          sceneTitle: summary?.title,
        });
        requestRefreshSceneAppExecutionSummary?.();
        if (options?.closeDialog !== false) {
          setDialogOpen(false);
        }
        toast.success(options?.successMessage ?? "已保存人工复核结果");
      } catch (error) {
        toast.error(formatSceneAppErrorMessage(error));
      } finally {
        setSaving(false);
      }
    },
    [projectId, requestRefreshSceneAppExecutionSummary, sessionId, summary?.title],
  );

  const handleOpenHumanReview = useCallback(() => {
    if (!targetSessionId) {
      toast.error("当前运行还没有关联会话，暂时无法填写人工复核。");
      return;
    }

    void (async () => {
      const nextTemplate = await resolveReviewDecisionTemplate();
      if (nextTemplate) {
        setDialogOpen(true);
      }
    })();
  }, [resolveReviewDecisionTemplate, targetSessionId]);

  const handleSaveHumanReview = useCallback(
    async (request: AgentRuntimeSaveReviewDecisionRequest) => {
      await persistHumanReview(request);
    },
    [persistHumanReview],
  );

  const handleApplyQuickReview = useCallback(
    (actionKey: SceneAppQuickReviewActionKey) => {
      if (!humanReviewAvailable || !targetSessionId) {
        toast.error("当前运行还没有关联会话，暂时无法记录轻量反馈。");
        return;
      }

      const action = SCENEAPP_QUICK_REVIEW_ACTIONS.find(
        (item) => item.key === actionKey,
      );
      if (!action) {
        return;
      }

      void (async () => {
        const nextTemplate = await resolveReviewDecisionTemplate();
        if (!nextTemplate) {
          return;
        }

        await persistHumanReview(
          buildSceneAppQuickReviewDecisionRequest({
            template: nextTemplate,
            action,
            sceneTitle: summary?.title,
            failureSignal,
            sourceLabel: "生成",
          }),
          {
            closeDialog: false,
            successMessage: `已记录「${action.label}」判断`,
          },
        );
      })();
    },
    [
      failureSignal,
      humanReviewAvailable,
      persistHumanReview,
      resolveReviewDecisionTemplate,
      summary?.title,
      targetSessionId,
    ],
  );

  const handleSaveAsSkill = useCallback(() => {
    if (!onNavigate) {
      toast.error("当前入口暂不支持直接跳转到 Skill 页面");
      return;
    }

    const latestReviewSignal =
      listCuratedTaskRecommendationSignals({
        projectId,
        sessionId,
      })
        .filter((signal) => signal.source === "review_feedback")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;

    const nextPageParams = buildSkillsPageParamsFromSceneAppExecution(summary, {
      projectId,
      reviewSignal: latestReviewSignal,
    });
    if (!nextPageParams?.initialScaffoldDraft) {
      toast.error("当前这轮结果还不足以沉淀为做法");
      return;
    }

    onNavigate("skills", nextPageParams);
    toast.success("已带着这轮结果去整理做法");
  }, [onNavigate, projectId, sessionId, summary]);

  const handleSaveAsInspiration = useCallback(() => {
    void saveSceneAppExecutionAsInspiration({
      summary,
      projectId,
      sessionId,
    });
  }, [projectId, sessionId, summary]);

  const handleOpenInspirationLibrary = useCallback(() => {
    if (!onNavigate) {
      toast.error("当前入口暂不支持直接打开灵感库");
      return;
    }

    onNavigate(
      "memory",
      buildSceneAppExecutionInspirationLibraryPageParams({
        summary,
      }),
    );
  }, [onNavigate, summary]);

  const savedAsInspiration = useMemo(() => {
    void signalsVersion;
    return hasSavedSceneAppExecutionAsInspiration({
      summary,
      projectId,
      sessionId,
    });
  }, [projectId, sessionId, signalsVersion, summary]);

  const latestReviewFeedbackSignal = useMemo(() => {
    void signalsVersion;
    return (
      listCuratedTaskRecommendationSignals({
        projectId,
        sessionId,
      })
        .filter((signal) => signal.source === "review_feedback")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
    );
  }, [projectId, sessionId, signalsVersion]);

  return useMemo(
    () => ({
      dialogOpen,
      template,
      loading,
      saving,
      humanReviewAvailable,
      quickReviewPending: loading || saving,
      latestReviewFeedbackSignal,
      savedAsInspiration,
      setDialogOpen,
      handleOpenHumanReview,
      handleSaveHumanReview,
      handleApplyQuickReview,
      handleSaveAsSkill,
      handleSaveAsInspiration,
      handleOpenInspirationLibrary,
    }),
    [
      dialogOpen,
      handleApplyQuickReview,
      handleOpenHumanReview,
      handleOpenInspirationLibrary,
      handleSaveAsInspiration,
      handleSaveAsSkill,
      handleSaveHumanReview,
      humanReviewAvailable,
      latestReviewFeedbackSignal,
      loading,
      savedAsInspiration,
      saving,
      template,
    ],
  );
}
