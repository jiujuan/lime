import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSceneAppExecutionSummaryRuntime } from "./useSceneAppExecutionSummaryRuntime";
import type { SceneAppExecutionSummaryViewModel } from "@/lib/agent/legacySceneAppExecutionSummary";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function createInitialSummary(): SceneAppExecutionSummaryViewModel {
  return {
    sceneappId: "story-video-suite",
    title: "短视频编排",
    summary: "把线框图、脚本、配乐和短视频草稿压成同一条结果链。",
    businessLabel: "内容闭环",
    typeLabel: "多模态组合",
    executionChainLabel: "做法 -> 生成 -> Project Pack",
    deliveryContractLabel: "Project Pack",
    planningStatusLabel: "已就绪",
    planningSummary: "当前已经带入 2 条参考与 1 条风格偏好，可直接进入生成。",
    activeLayers: [
      { key: "skill", label: "Skill" },
      { key: "memory", label: "Memory" },
      { key: "taste", label: "Taste" },
    ],
    referenceCount: 2,
    referenceItems: [],
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
      notes: [],
    },
    scorecardProfileRef: "story-video-scorecard",
    scorecardMetricKeys: [{ key: "delivery_readiness", label: "交付就绪度" }],
    scorecardFailureSignals: [{ key: "publish_stalled", label: "发布卡点" }],
    notes: [],
    descriptorSnapshot: {
      deliveryContract: "project_pack",
      deliveryProfile: {
        viewerKind: "artifact_bundle",
        requiredParts: ["brief", "storyboard"],
        primaryPart: "brief",
      },
    },
    runtimeBackflow: {
      runId: "run-archived-1",
      statusLabel: "成功",
      statusTone: "success",
      summary: "历史结果已经写入摘要 payload。",
      nextAction: "继续把这轮运行沉淀到判断与选品基线。",
      sourceLabel: "人工试跑",
      startedAtLabel: "2026-04-16 12:00",
      finishedAtLabel: "2026-04-16 12:03",
      deliveryCompletionLabel: "已交付 2/2 个部件",
      evidenceSourceLabel: "当前已接入会话证据",
      deliveryCompletedParts: [],
      deliveryMissingParts: [],
      observedFailureSignals: [],
      governanceArtifacts: [],
    },
  };
}

interface HookProbeProps {
  initialSummary?: SceneAppExecutionSummaryViewModel | null;
  sessionId?: string | null;
  isSending: boolean;
}

function renderHook(props: HookProbeProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue:
    | ReturnType<typeof useSceneAppExecutionSummaryRuntime>
    | undefined = undefined;

  function Probe(currentProps: HookProbeProps) {
    latestValue = useSceneAppExecutionSummaryRuntime(currentProps);
    return null;
  }

  act(() => {
    root.render(<Probe {...props} />);
  });

  mountedRoots.push({ root, container });
  return {
    getValue: () => latestValue,
    rerender: (nextProps: HookProbeProps) => {
      act(() => {
        root.render(<Probe {...nextProps} />);
      });
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
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("useSceneAppExecutionSummaryRuntime", () => {
  it("应只保留初始摘要中的历史只读信息", () => {
    const summary = createInitialSummary();
    const { getValue } = renderHook({
      initialSummary: summary,
      sessionId: "session-1",
      isSending: true,
    });

    expect(getValue()?.summary).toBe(summary);
    expect(getValue()?.summary?.runtimeBackflow).toEqual(
      expect.objectContaining({
        runId: "run-archived-1",
        statusLabel: "成功",
      }),
    );
    expect(getValue()?.loading).toBe(false);
    expect(getValue()?.latestPackResultDetailView).toBeNull();
    expect(getValue()?.latestPackResultUsesFallback).toBe(false);
    expect(getValue()?.reviewTargetRunSummary).toBeNull();
  });

  it("缺少初始摘要时不再尝试恢复旧 SceneApp 运行态", () => {
    const { getValue } = renderHook({
      initialSummary: null,
      sessionId: "session-1",
      isSending: true,
    });

    expect(getValue()?.summary).toBeNull();
    expect(getValue()?.loading).toBe(false);
    expect(getValue()?.latestPackResultDetailView).toBeNull();
    expect(getValue()?.reviewTargetRunSummary).toBeNull();
  });

  it("请求刷新是 no-op，不再触发旧 SceneApp API 轮询", () => {
    const summary = createInitialSummary();
    const { getValue, rerender } = renderHook({
      initialSummary: summary,
      sessionId: "session-1",
      isSending: false,
    });
    const firstRefresh = getValue()?.requestRefresh;

    act(() => {
      getValue()?.requestRefresh();
    });
    rerender({
      initialSummary: summary,
      sessionId: "session-1",
      isSending: true,
    });

    expect(getValue()?.summary).toBe(summary);
    expect(getValue()?.requestRefresh).toBe(firstRefresh);
    expect(getValue()?.loading).toBe(false);
  });
});
