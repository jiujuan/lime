import {
  resolveAgentStreamPendingRenderedTextDelta,
  shouldFlushAgentStreamTextRenderAtLineBoundary,
  shouldFlushAgentStreamTextRenderBacklog,
  shouldFlushAgentStreamVisibleFirstText,
  shouldScheduleAgentStreamTextRenderTimer,
} from "./agentStreamTextRenderFlushController";

// 首字仍立即渲染；后续 delta 以接近 10fps 的节奏合并，避免拖动整棵消息树。
export const AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS = 96;
export const AGENT_STREAM_TEXT_DELTA_BACKLOG_FLUSH_CHARS = 120;

export interface AgentStreamTimerClearPlan {
  shouldClearTimer: boolean;
  nextTimerId: null;
}

export type AgentStreamTextRenderTimerAction =
  | "flush_now"
  | "schedule_timer"
  | "skip";

export interface AgentStreamTextRenderTimerSchedulePlan {
  action: AgentStreamTextRenderTimerAction;
  delayMs: number | null;
}

export function buildAgentStreamTimerClearPlan(params: {
  hasTimer: boolean;
}): AgentStreamTimerClearPlan {
  return {
    shouldClearTimer: params.hasTimer,
    nextTimerId: null,
  };
}

export function buildAgentStreamTextRenderTimerSchedulePlan(params: {
  accumulatedContent: string;
  backlogFlushChars?: number;
  hasPendingTimer: boolean;
  renderedContent: string;
}): AgentStreamTextRenderTimerSchedulePlan {
  if (
    shouldFlushAgentStreamVisibleFirstText({
      accumulatedContent: params.accumulatedContent,
      renderedContent: params.renderedContent,
    })
  ) {
    return {
      action: "flush_now",
      delayMs: null,
    };
  }

  const pendingDelta = resolveAgentStreamPendingRenderedTextDelta({
    accumulatedContent: params.accumulatedContent,
    renderedContent: params.renderedContent,
  });
  if (!pendingDelta) {
    return {
      action: "skip",
      delayMs: null,
    };
  }

  if (
    shouldFlushAgentStreamTextRenderAtLineBoundary({
      pendingDelta,
    }) ||
    shouldFlushAgentStreamTextRenderBacklog({
      backlogChars: pendingDelta.length,
      backlogFlushChars:
        params.backlogFlushChars ?? AGENT_STREAM_TEXT_DELTA_BACKLOG_FLUSH_CHARS,
    })
  ) {
    return {
      action: "flush_now",
      delayMs: null,
    };
  }

  if (
    !shouldScheduleAgentStreamTextRenderTimer({
      hasPendingTimer: params.hasPendingTimer,
    })
  ) {
    return {
      action: "skip",
      delayMs: null,
    };
  }

  return {
    action: "schedule_timer",
    delayMs: AGENT_STREAM_TEXT_DELTA_RENDER_FLUSH_MS,
  };
}
