import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "../types";
import {
  buildExpertSkillRuntimeActionViewModels,
  buildExpertSkillRuntimeChipViewModels,
  buildExpertSkillRuntimeInvocationViewModel,
  buildExpertSkillRuntimeSummaryViewModel,
  buildExpertSkillRuntimeTraceViewModel,
} from "./expertSkillRuntimeViewModel";
import { buildExpertSkillRuntimeTimelineViewModel } from "./expertSkillRuntimeTimelineViewModel";

const COPY = {
  ready: "可运行",
  needsMapping: "待映射",
  needsRegistration: "待注册",
  needsEnable: "待启用",
  blocked: "不可用",
};

describe("buildExpertSkillRuntimeChipViewModels", () => {
  it("应把 runtime candidate readiness 投影成稳定 chip 状态", () => {
    const chips = buildExpertSkillRuntimeChipViewModels({
      skillRefs: ["skill:docx", "service-skill:daily-trend-briefing", "legacy"],
      candidates: [
        {
          ref: "skill:docx",
          kind: "catalog_skill",
          readiness: "ready",
          reason: "matched",
          displayTitle: "docx",
          source: "expert_skill_ref",
          riskLevel: "low",
          skillLocator: {
            source: "user",
            name: "docx",
            directory: "docx",
          },
        },
        {
          ref: "service-skill:daily-trend-briefing",
          kind: "service_skill",
          readiness: "needs_mapping",
          reason: "needs scene mapping",
          displayTitle: "daily-trend-briefing",
          source: "expert_skill_ref",
          riskLevel: "medium",
        },
      ],
      resolveLabel: (ref) => ref,
      copy: COPY,
    });

    expect(chips).toEqual([
      expect.objectContaining({
        ref: "skill:docx",
        readiness: "ready",
        readinessLabel: "可运行",
        readinessTone: "ready",
        title: "skill:docx · 可运行",
      }),
      expect.objectContaining({
        ref: "service-skill:daily-trend-briefing",
        readiness: "needs_mapping",
        readinessLabel: "待映射",
        readinessTone: "warning",
      }),
      expect.objectContaining({
        ref: "legacy",
        label: "legacy",
        readiness: "blocked",
        readinessLabel: "不可用",
        readinessTone: "blocked",
      }),
    ]);
  });

  it("应汇总专家技能运行准备度与需处理动作", () => {
    const chips = buildExpertSkillRuntimeChipViewModels({
      skillRefs: ["skill:docx", "service-skill:daily-trend-briefing"],
      candidates: [
        {
          ref: "skill:docx",
          kind: "catalog_skill",
          readiness: "ready",
          reason: "matched",
          displayTitle: "docx",
          source: "expert_skill_ref",
          riskLevel: "low",
        },
        {
          ref: "service-skill:daily-trend-briefing",
          kind: "service_skill",
          readiness: "needs_mapping",
          reason: "service skill ref must be resolved",
          displayTitle: "Daily Trend",
          source: "expert_skill_ref",
          riskLevel: "medium",
        },
      ],
      resolveLabel: (ref) => ref,
      copy: COPY,
    });

    const summary = buildExpertSkillRuntimeSummaryViewModel(chips, {
      readyTitle: "全部可运行",
      readyDetail: "全部会按需加载",
      partialTitle: "部分需处理",
      partialDetail: "可运行项继续生效",
      blockedTitle: "还不能运行",
      blockedDetail: "需要先补齐",
      emptyTitle: "无技能",
      emptyDetail: "先添加技能",
    });
    const actions = buildExpertSkillRuntimeActionViewModels({
      candidates: [
        {
          ref: "service-skill:daily-trend-briefing",
          kind: "service_skill",
          readiness: "needs_mapping",
          reason: "service skill ref must be resolved",
          displayTitle: "Daily Trend",
          source: "expert_skill_ref",
          riskLevel: "medium",
        },
      ],
      resolveLabel: (ref) => ref,
      copy: {
        ready: "可直接试用",
        needsMapping: "补目录映射",
        needsRegistration: "完成注册",
        needsEnable: "启用运行",
        blocked: "检查引用",
      },
    });

    expect(summary).toEqual({
      tone: "warning",
      title: "部分需处理",
      detail: "可运行项继续生效",
      totalCount: 2,
      readyCount: 1,
      attentionCount: 1,
    });
    expect(actions).toEqual([
      {
        ref: "service-skill:daily-trend-briefing",
        label: "Daily Trend",
        readiness: "needs_mapping",
        actionLabel: "补目录映射",
        reason: "service skill ref must be resolved",
        recoveryKind: "map_skill_ref",
        searchQuery: "daily-trend-briefing",
      },
    ]);
  });

  it("应为待注册技能生成跳转管理页的恢复动作", () => {
    const actions = buildExpertSkillRuntimeActionViewModels({
      candidates: [
        {
          ref: "workspace_skill:project-report@1.0.0",
          kind: "workspace_skill",
          readiness: "needs_registration",
          reason: "requires workspace binding",
          displayTitle: "Project Report",
          source: "expert_skill_ref",
          riskLevel: "medium",
          skillLocator: {
            source: "project",
            name: "project:project-report",
            directory: "project-report",
          },
        },
        {
          ref: "workspace_skill:ready-report",
          kind: "workspace_skill",
          readiness: "needs_enable",
          reason: "requires manual enable",
          displayTitle: "Ready Report",
          source: "expert_skill_ref",
          riskLevel: "medium",
          skillLocator: {
            source: "project",
            name: "project:ready-report",
            directory: "ready-report",
          },
        },
        {
          ref: "legacy:unknown",
          kind: "unknown",
          readiness: "blocked",
          reason: "unsupported ref",
          displayTitle: "legacy:unknown",
          source: "expert_skill_ref",
          riskLevel: "medium",
        },
      ],
      resolveLabel: (ref) => ref,
      copy: {
        ready: "可直接试用",
        needsMapping: "补目录映射",
        needsRegistration: "完成注册",
        needsEnable: "启用运行",
        blocked: "检查引用",
      },
    });

    expect(actions).toEqual([
      expect.objectContaining({
        ref: "workspace_skill:project-report@1.0.0",
        actionLabel: "完成注册",
        recoveryKind: "open_skills_manage",
        searchQuery: "project-report",
      }),
      expect.objectContaining({
        ref: "workspace_skill:ready-report",
        actionLabel: "启用运行",
        recoveryKind: "enable_workspace_skill",
        searchQuery: "ready-report",
      }),
      expect.objectContaining({
        ref: "legacy:unknown",
        actionLabel: "检查引用",
        recoveryKind: "replace_skill_ref",
        searchQuery: "legacy:unknown",
      }),
    ]);
  });

  it("应从线程 metadata 中提取最近的技能加载与授权状态", () => {
    const threadItems = [
      {
        id: "skill-gate",
        thread_id: "thread",
        turn_id: "turn",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T00:00:00.000Z",
        type: "turn_summary",
        text: "skill gate",
        metadata: {
          skillRuntime: {
            event: "skill_gate_decision",
            selectedSkills: ["docx"],
          },
        },
      },
    ] satisfies AgentThreadItem[];

    const trace = buildExpertSkillRuntimeTraceViewModel({
      threadItems,
      copy: {
        none: "无记录",
        bodyRead: "已读取",
        gateReady: "已授权",
        gateBlocked: "未放行",
        search: "已检索",
      },
    });

    expect(trace).toEqual({
      tone: "ready",
      label: "已授权",
    });
  });

  it("应把最近 turn 的技能搜索、启用、授权与执行合成轨迹", () => {
    const threadItems = [
      {
        id: "old-skill-call",
        thread_id: "thread",
        turn_id: "turn-old",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T00:00:00.000Z",
        type: "tool_call",
        tool_name: "Skill",
        success: true,
        metadata: {
          tool_family: "skill",
          skill_name: "old-skill",
        },
      },
      {
        id: "skill-search",
        thread_id: "thread",
        turn_id: "turn-new",
        sequence: 2,
        status: "completed",
        started_at: "2026-06-21T00:00:01.000Z",
        updated_at: "2026-06-21T00:00:01.000Z",
        type: "turn_summary",
        text: "skill search",
        metadata: {
          skillRuntime: {
            event: "skill_search",
            query: "capability report",
          },
        },
      },
      {
        id: "skill-body-read",
        thread_id: "thread",
        turn_id: "turn-new",
        sequence: 3,
        status: "completed",
        started_at: "2026-06-21T00:00:02.000Z",
        updated_at: "2026-06-21T00:00:02.000Z",
        type: "turn_summary",
        text: "skill body read",
        metadata: {
          skillRuntime: {
            event: "skill_body_read",
            skill_name: "project:capability-report",
            status: "completed",
          },
        },
      },
      {
        id: "runtime-enable",
        thread_id: "thread",
        turn_id: "turn-new",
        sequence: 4,
        status: "completed",
        started_at: "2026-06-21T00:00:03.000Z",
        updated_at: "2026-06-21T00:00:03.000Z",
        type: "turn_summary",
        text: "runtime enable",
        metadata: {
          workspace_skill_runtime_enable: {
            source: "manual_session_enable",
            bindings: [{ skill: "project:capability-report" }],
          },
        },
      },
      {
        id: "skill-gate",
        thread_id: "thread",
        turn_id: "turn-new",
        sequence: 5,
        status: "completed",
        started_at: "2026-06-21T00:00:04.000Z",
        updated_at: "2026-06-21T00:00:04.000Z",
        type: "turn_summary",
        text: "skill gate",
        metadata: {
          skillRuntime: {
            event: "skill_gate_decision",
            selectedSkills: ["project:capability-report"],
          },
        },
      },
      {
        id: "skill-call",
        thread_id: "thread",
        turn_id: "turn-new",
        sequence: 6,
        status: "completed",
        started_at: "2026-06-21T00:00:05.000Z",
        updated_at: "2026-06-21T00:00:05.000Z",
        type: "tool_call",
        tool_name: "Skill",
        success: true,
        metadata: {
          tool_family: "skill",
          skill_name: "project:capability-report",
        },
      },
    ] satisfies AgentThreadItem[];

    const timeline = buildExpertSkillRuntimeTimelineViewModel({
      threadItems,
      copy: {
        empty: "无轨迹",
        search: "检索",
        bodyRead: "读取",
        runtimeEnable: "启用",
        runtimeEnableWithCount: (count) => `启用 ${count}`,
        gateReady: "授权",
        gateBlocked: "未授权",
        invocationRunning: "执行中",
        invocationCompleted: "执行完成",
        invocationFailed: "执行失败",
        invocationUnknown: "待确认",
      },
    });

    expect(timeline.steps.map((step) => step.kind)).toEqual([
      "search",
      "body_read",
      "runtime_enable",
      "gate",
      "invocation",
    ]);
    expect(timeline.steps).toEqual([
      expect.objectContaining({ label: "检索", detail: "capability report" }),
      expect.objectContaining({
        label: "读取",
        detail: "project:capability-report",
      }),
      expect.objectContaining({
        label: "启用 1",
        detail: "manual_session_enable",
      }),
      expect.objectContaining({
        label: "授权",
        detail: "project:capability-report",
      }),
      expect.objectContaining({
        label: "执行完成",
        detail: "project:capability-report",
      }),
    ]);
    expect(JSON.stringify(timeline.steps)).not.toContain("old-skill");
  });

  it("应从真实 tool_call metadata 中提取最近成功执行的技能", () => {
    const threadItems = [
      {
        id: "skill-call",
        thread_id: "thread",
        turn_id: "turn",
        sequence: 2,
        status: "completed",
        started_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T00:00:00.000Z",
        type: "tool_call",
        tool_name: "Skill",
        success: true,
        metadata: {
          tool_family: "skill",
          skill_name: "project:capability-report",
        },
      },
    ] satisfies AgentThreadItem[];

    const invocation = buildExpertSkillRuntimeInvocationViewModel({
      threadItems,
      copy: {
        none: "无执行",
        running: "执行中",
        completed: "已执行",
        failed: "执行失败",
        unknown: "待确认",
      },
    });

    expect(invocation).toEqual({
      tone: "ready",
      label: "已执行",
      status: "completed",
      skillName: "project:capability-report",
    });
  });

  it("应把失败和空技能调用投影为可见状态", () => {
    const failedThreadItems = [
      {
        id: "skill-call-failed",
        thread_id: "thread",
        turn_id: "turn",
        sequence: 2,
        status: "failed",
        started_at: "2026-06-21T00:00:00.000Z",
        updated_at: "2026-06-21T00:00:00.000Z",
        type: "tool_call",
        tool_name: "Skill",
        error: "missing input",
        metadata: {
          tool_family: "skill",
          skillName: "analysis",
        },
      },
    ] satisfies AgentThreadItem[];
    const copy = {
      none: "无执行",
      running: "执行中",
      completed: "已执行",
      failed: "执行失败",
      unknown: "待确认",
    };

    expect(
      buildExpertSkillRuntimeInvocationViewModel({
        threadItems: failedThreadItems,
        copy,
      }),
    ).toEqual({
      tone: "blocked",
      label: "执行失败",
      status: "failed",
      skillName: "analysis",
    });
    expect(
      buildExpertSkillRuntimeInvocationViewModel({
        threadItems: [],
        copy,
      }),
    ).toEqual({
      tone: "blocked",
      label: "无执行",
      status: "none",
      skillName: null,
    });
  });
});
