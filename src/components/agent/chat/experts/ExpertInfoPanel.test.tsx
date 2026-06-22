import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { AgentThreadItem } from "../types";
import type {
  AgentRuntimeEvidencePack,
  AgentRuntimeWorkspaceSkillBinding,
} from "@/lib/api/agentRuntime/types";
import type { Skill } from "@/lib/api/skills";
import {
  clearHarnessEvidencePackStore,
  recordHarnessEvidencePack,
} from "../components/harnessEvidencePackStore";
import { ExpertInfoPanel } from "./ExpertInfoPanel";
import type { ExpertSkillsManageOptions } from "./ExpertSkillsSection";

interface MountedContent {
  container: HTMLDivElement;
  root: Root;
}

const mountedContents: MountedContent[] = [];

const REQUEST_METADATA = {
  expert: {
    expertId: "marketing-strategist",
    releaseId: "rel-marketing-strategist-20260515",
    title: "营销策略专家",
    category: "growth",
    source: "seeded",
    personaRef: "expert-persona:marketing-strategist@1.0.0",
    memoryTemplateRef: "memory-template:marketing-strategist@1.0.0",
    skillRefs: ["service-skill:daily-trend-briefing"],
    workflowRefs: ["workflow:campaign-growth-loop"],
    memoryEnabled: true,
    workflowEnabled: true,
  },
  harness: {
    expert: {
      expert_id: "marketing-strategist",
      release_id: "rel-marketing-strategist-20260515",
      title: "营销策略专家",
      category: "growth",
      source: "seeded",
      persona_ref: "expert-persona:marketing-strategist@1.0.0",
      memory_template_ref: "memory-template:marketing-strategist@1.0.0",
      skill_refs: ["service-skill:daily-trend-briefing"],
      workflow_refs: ["workflow:campaign-growth-loop"],
      memory_enabled: true,
      workflow_enabled: true,
    },
  },
};

const LOCAL_SKILL: Skill = {
  key: "docx",
  name: "docx",
  description: "把 Word 文档解析为可继续处理的结构化内容。",
  directory: "docx",
  installed: true,
  sourceKind: "builtin",
  catalogSource: "user",
};

const SKILL_SEARCH_THREAD_ITEM: AgentThreadItem = {
  id: "skill-search",
  thread_id: "thread-expert",
  turn_id: "turn-expert",
  sequence: 1,
  status: "completed",
  started_at: "2026-06-21T00:00:00.000Z",
  updated_at: "2026-06-21T00:00:00.000Z",
  type: "turn_summary",
  text: "skill search",
  metadata: {
    skillRuntime: {
      event: "skill_search",
      query: "capability report",
    },
  },
};

const SKILL_BODY_READ_THREAD_ITEM: AgentThreadItem = {
  id: "skill-body-read",
  thread_id: "thread-expert",
  turn_id: "turn-expert",
  sequence: 2,
  status: "completed",
  started_at: "2026-06-21T00:00:01.000Z",
  updated_at: "2026-06-21T00:00:01.000Z",
  type: "turn_summary",
  text: "skill body read",
  metadata: {
    skillRuntime: {
      event: "skill_body_read",
      skill_name: "project:capability-report",
      status: "completed",
    },
  },
};

const SKILL_RUNTIME_ENABLE_THREAD_ITEM: AgentThreadItem = {
  id: "skill-runtime-enable",
  thread_id: "thread-expert",
  turn_id: "turn-expert",
  sequence: 3,
  status: "completed",
  started_at: "2026-06-21T00:00:01.500Z",
  updated_at: "2026-06-21T00:00:01.500Z",
  type: "turn_summary",
  text: "skill runtime enable",
  metadata: {
    workspace_skill_runtime_enable: {
      source: "manual_session_enable",
      bindings: [{ skill: "project:capability-report" }],
    },
  },
};

const SKILL_GATE_THREAD_ITEM: AgentThreadItem = {
  id: "skill-gate",
  thread_id: "thread-expert",
  turn_id: "turn-expert",
  sequence: 4,
  status: "completed",
  started_at: "2026-06-21T00:00:02.000Z",
  updated_at: "2026-06-21T00:00:02.000Z",
  type: "turn_summary",
  text: "skill gate",
  metadata: {
    skillRuntime: {
      event: "skill_gate_decision",
      selectedSkills: ["docx"],
    },
  },
};

const SKILL_INVOCATION_THREAD_ITEM: AgentThreadItem = {
  id: "skill-invocation",
  thread_id: "thread-expert",
  turn_id: "turn-expert",
  sequence: 5,
  status: "completed",
  started_at: "2026-06-21T00:00:03.000Z",
  updated_at: "2026-06-21T00:00:04.000Z",
  completed_at: "2026-06-21T00:00:04.000Z",
  type: "tool_call",
  tool_name: "Skill",
  success: true,
  metadata: {
    tool_family: "skill",
    skill_name: "project:capability-report",
  },
};

const SKILL_EVIDENCE_PACK: AgentRuntimeEvidencePack = {
  session_id: "session-expert",
  thread_id: "thread-expert",
  workspace_id: "workspace-expert",
  workspace_root: "/tmp/workspace-expert",
  pack_relative_root: ".lime/harness/sessions/session-expert/evidence",
  pack_absolute_root: "/tmp/workspace-expert/.lime/harness/evidence",
  exported_at: "2026-06-21T00:00:05.000Z",
  thread_status: "completed",
  latest_turn_status: "completed",
  turn_count: 1,
  item_count: 5,
  pending_request_count: 0,
  queued_turn_count: 0,
  recent_artifact_count: 0,
  known_gaps: ["缺少人工复核截图"],
  observability_summary: {
    known_gaps: [],
    signal_coverage: [],
    skill_invocations: [
      {
        event: "skill_invocation",
        skill_name: "project:capability-report",
        status: "completed",
        source_event_id: "skill-invocation",
        source_event_type: "tool_call",
        turn_id: "turn-expert",
        tool_call_id: "skill-invocation",
        workspace_skill_runtime_enable: {
          source: "manual_session_enable",
          bindings: [{ skill: "project:capability-report" }],
        },
      },
    ],
    skill_searches: [
      {
        event: "skill_search",
        query: "capability report",
        result_count: 1,
        status: "completed",
        source_event_id: "skill-search",
        source_event_type: "turn_summary",
        turn_id: "turn-expert",
      },
    ],
    mcp_tool_results: [],
    mcp_resource_reads: [],
  },
  artifacts: [],
};

function createRequestMetadata(skillRefs: string[]) {
  return {
    ...REQUEST_METADATA,
    expert: {
      ...REQUEST_METADATA.expert,
      skillRefs,
    },
    harness: {
      ...REQUEST_METADATA.harness,
      expert: {
        ...REQUEST_METADATA.harness.expert,
        skill_refs: skillRefs,
      },
    },
  };
}

function renderPanel(
  options: {
    onSkillRefsChange?: (skillRefs: string[]) => void;
    onEnableWorkspaceSkillRuntime?: (ref: string) => void;
    onOpenSkillsManage?: (options?: ExpertSkillsManageOptions) => void;
    requestMetadata?: Record<string, unknown>;
    localSkills?: Skill[];
    workspaceSkillBindings?: AgentRuntimeWorkspaceSkillBinding[];
    enabledWorkspaceSkillRuntimeCount?: number;
  } = {},
) {
  const onSkillRefsChange = options.onSkillRefsChange ?? vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ExpertInfoPanel
        requestMetadata={options.requestMetadata ?? REQUEST_METADATA}
        localSkills={options.localSkills ?? [LOCAL_SKILL]}
        serviceSkills={[]}
        workspaceSkillBindings={options.workspaceSkillBindings}
        enabledWorkspaceSkillRuntimeCount={
          options.enabledWorkspaceSkillRuntimeCount
        }
        threadItems={[
          SKILL_SEARCH_THREAD_ITEM,
          SKILL_BODY_READ_THREAD_ITEM,
          SKILL_RUNTIME_ENABLE_THREAD_ITEM,
          SKILL_GATE_THREAD_ITEM,
          SKILL_INVOCATION_THREAD_ITEM,
        ]}
        onSkillRefsChange={onSkillRefsChange}
        onEnableWorkspaceSkillRuntime={options.onEnableWorkspaceSkillRuntime}
        onOpenSkillsManage={options.onOpenSkillsManage}
      />,
    );
  });

  mountedContents.push({ container, root });
  return { container, onSkillRefsChange, root };
}

async function flushEffects(times = 4) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function setTextInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ExpertInfoPanel", () => {
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await changeLimeLocale("zh-CN");
    window.localStorage.clear();
  });

  afterEach(() => {
    while (mountedContents.length > 0) {
      const mounted = mountedContents.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    clearHarnessEvidencePackStore();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("应支持从右侧专家面板为当前 Agent 添加技能", async () => {
    recordHarnessEvidencePack(SKILL_EVIDENCE_PACK);
    const { container, onSkillRefsChange } = renderPanel();
    await flushEffects();

    expect(
      container
        .querySelector('[data-testid="expert-info-panel"]')
        ?.getAttribute("data-layout"),
    ).toBe("right-surface-full");

    const overviewSection = container.querySelector(
      '[data-testid="expert-info-section-overview"]',
    );
    expect(
      overviewSection?.querySelector("button")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(container.textContent).not.toContain(
      "全局 Soul 只影响沟通节奏；专家人格不会写回全局 Soul，也不会默认进入正式产物。",
    );
    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-readiness-service-skill-daily-trend-briefing"]',
      )?.textContent,
    ).toContain("待映射");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-summary"]',
      )?.textContent,
    ).toContain("技能还不能运行");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-actions"]',
      )?.textContent,
    ).toContain("补目录映射");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-trace"]',
      )?.textContent,
    ).toContain("最近已完成技能授权");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-invocation"]',
      )?.textContent,
    ).toContain("最近已执行技能");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-invocation"]',
      )?.textContent,
    ).toContain("project:capability-report");
    const runtimeTimeline = container.querySelector(
      '[data-testid="expert-info-skills-runtime-timeline"]',
    );
    expect(runtimeTimeline?.textContent).toContain("检索候选");
    expect(runtimeTimeline?.textContent).toContain("读取说明");
    expect(runtimeTimeline?.textContent).toContain("运行启用 1 个绑定");
    expect(runtimeTimeline?.textContent).toContain("授权放行");
    expect(runtimeTimeline?.textContent).toContain("执行完成");
    const evidenceSummary = container.querySelector(
      '[data-testid="expert-info-skills-evidence-summary"]',
    );
    expect(evidenceSummary?.textContent).toContain("证据包复盘");
    expect(evidenceSummary?.textContent).toContain("检索 1 次 · 执行 1 次");
    expect(evidenceSummary?.textContent).toContain(
      "最近技能 project:capability-report",
    );
    expect(evidenceSummary?.textContent).toContain("运行启用");
    expect(evidenceSummary?.textContent).toContain("手动会话");
    expect(evidenceSummary?.textContent).toContain("1 个绑定");
    expect(evidenceSummary?.textContent).toContain("1 个已知缺口");
    expect(evidenceSummary?.textContent).not.toContain(
      "workspace_skill_runtime_enable",
    );

    const addButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-add"]',
    );
    expect(addButton).not.toBeNull();

    act(() => {
      addButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).not.toBeNull();

    const addDocxButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-skill-add-skill-docx"]',
    );
    expect(addDocxButton).not.toBeNull();

    act(() => {
      addDocxButton?.click();
    });
    await flushEffects();

    expect(container.textContent).toContain("docx");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-chip-skill-docx"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-readiness-skill-docx"]',
      )?.textContent,
    ).toContain("可运行");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-summary"]',
      )?.textContent,
    ).toContain("部分技能还需处理");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-summary"]',
      )?.textContent,
    ).toContain("1/2 可运行");
    expect(onSkillRefsChange).toHaveBeenLastCalledWith([
      "service-skill:daily-trend-briefing",
      "skill:docx",
    ]);
  });

  it("应从待映射运行准备动作打开技能选择器并补目录映射", async () => {
    const { container, onSkillRefsChange } = renderPanel();
    await flushEffects();

    const actionButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-runtime-action-service-skill-daily-trend-briefing"]',
    );
    expect(actionButton).not.toBeNull();

    act(() => {
      actionButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
      "daily-trend-briefing",
    );
    expect(container.textContent).toContain("补齐技能目录映射");

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    setTextInputValue(input as HTMLInputElement, "docx");
    await flushEffects();

    const replacementButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-skill-add-skill-docx"]',
    );
    expect(replacementButton).not.toBeNull();
    expect(replacementButton?.textContent).toContain("替换");

    act(() => {
      replacementButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-chip-service-skill-daily-trend-briefing"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-readiness-skill-docx"]',
      )?.textContent,
    ).toContain("可运行");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-runtime-summary"]',
      )?.textContent,
    ).toContain("本轮运行准备就绪");
    expect(
      container.querySelector('[data-testid="expert-info-skills-edit-notice"]')
        ?.textContent,
    ).toContain("下一条消息会使用当前技能设置");
    expect(onSkillRefsChange).toHaveBeenLastCalledWith(["skill:docx"]);
  });

  it("应从不可用运行准备动作打开技能选择器并替换问题引用", async () => {
    const { container, onSkillRefsChange } = renderPanel({
      requestMetadata: createRequestMetadata(["legacy:unknown"]),
    });
    await flushEffects();

    const actionButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-runtime-action-legacy-unknown"]',
    );
    expect(actionButton).not.toBeNull();

    act(() => {
      actionButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
      "legacy:unknown",
    );
    expect(container.textContent).toContain("替换当前技能引用");

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    setTextInputValue(input as HTMLInputElement, "docx");
    await flushEffects();

    const replacementButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-skill-add-skill-docx"]',
    );
    expect(replacementButton).not.toBeNull();

    act(() => {
      replacementButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-chip-legacy-unknown"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-readiness-skill-docx"]',
      )?.textContent,
    ).toContain("可运行");
    expect(onSkillRefsChange).toHaveBeenLastCalledWith(["skill:docx"]);
  });

  it("同值专家 skillRefs 刷新时应保持技能选择器打开", async () => {
    const { container, root, onSkillRefsChange } = renderPanel();
    await flushEffects();

    const addButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-add"]',
    );
    expect(addButton).not.toBeNull();

    act(() => {
      addButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).not.toBeNull();

    const refreshedMetadata = createRequestMetadata([
      "service-skill:daily-trend-briefing",
    ]);
    act(() => {
      root.render(
        <ExpertInfoPanel
          requestMetadata={refreshedMetadata}
          localSkills={[LOCAL_SKILL]}
          serviceSkills={[]}
          threadItems={[SKILL_SEARCH_THREAD_ITEM]}
          onSkillRefsChange={onSkillRefsChange}
        />,
      );
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).not.toBeNull();
  });

  it("应支持移除原始技能并提示下一条消息会使用当前设置", async () => {
    const { container, onSkillRefsChange } = renderPanel();
    await flushEffects();

    const serviceSkillChip = container.querySelector<HTMLElement>(
      '[data-testid="expert-info-skill-chip-service-skill-daily-trend-briefing"]',
    );
    expect(serviceSkillChip).not.toBeNull();

    const removeButton =
      serviceSkillChip?.querySelector<HTMLButtonElement>("button");
    expect(removeButton).not.toBeNull();

    act(() => {
      removeButton?.click();
    });
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-chip-service-skill-daily-trend-briefing"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="expert-info-skills-edit-notice"]')
        ?.textContent,
    ).toContain("下一条消息会使用当前技能设置");
    expect(
      container.querySelector('[data-testid="expert-info-skills"]'),
    ).toBeNull();
    expect(onSkillRefsChange).toHaveBeenLastCalledWith([]);
  });

  it("应从待注册技能动作跳转到技能管理页", async () => {
    const onOpenSkillsManage = vi.fn();
    const { container } = renderPanel({
      onOpenSkillsManage,
      requestMetadata: createRequestMetadata([
        "workspace_skill:project-report@1.0.0",
      ]),
    });
    await flushEffects();

    const actionButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-runtime-action-workspace-skill-project-report-1-0-0"]',
    );
    expect(actionButton).not.toBeNull();

    act(() => {
      actionButton?.click();
    });
    await flushEffects();

    expect(onOpenSkillsManage).toHaveBeenCalledTimes(1);
    expect(onOpenSkillsManage).toHaveBeenCalledWith({
      searchQuery: "project-report",
      scaffoldDraft: expect.objectContaining({
        target: "project",
        directory: "project-report",
        name: "project-report",
        sourceExcerpt: "workspace_skill:project-report@1.0.0",
      }),
    });
    expect(
      container.querySelector('[data-testid="expert-skill-picker-dialog"]'),
    ).toBeNull();
  });

  it("应从待启用工作区技能动作写入下一轮运行启用选择", async () => {
    const onEnableWorkspaceSkillRuntime = vi.fn();
    const readyBinding: AgentRuntimeWorkspaceSkillBinding = {
      key: "ready-report",
      name: "Ready Report",
      description: "生成项目报告。",
      directory: "ready-report",
      registered_skill_directory: ".lime/skills/ready-report",
      registration: {
        registration_id: "registration-ready-report",
        registered_skill_directory: ".lime/skills/ready-report",
      },
      permission_summary: [],
      metadata: {},
      allowed_tools: [],
      resource_summary: {
        has_scripts: false,
        has_references: true,
        has_assets: false,
      },
      standard_compliance: {
        is_standard: true,
        validation_errors: [],
        deprecated_fields: [],
      },
      runtime_binding_target: "skill_tool",
      binding_status: "ready_for_manual_enable",
      binding_status_reason: "",
      next_gate: "manual_enable",
      query_loop_visible: true,
      tool_runtime_visible: false,
      launch_enabled: false,
      runtime_gate: "workspace_skill_runtime_enable",
    };
    const { container } = renderPanel({
      onEnableWorkspaceSkillRuntime,
      requestMetadata: createRequestMetadata(["workspace_skill:ready-report"]),
      workspaceSkillBindings: [readyBinding],
      enabledWorkspaceSkillRuntimeCount: 1,
    });
    await flushEffects();

    expect(
      container.querySelector(
        '[data-testid="expert-info-skill-readiness-workspace-skill-ready-report"]',
      )?.textContent,
    ).toContain("待启用");
    expect(
      container.querySelector(
        '[data-testid="expert-info-skills-enable-notice"]',
      )?.textContent,
    ).toContain("已选择启用 1 个工作区技能");

    const actionButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="expert-info-skills-runtime-action-workspace-skill-ready-report"]',
    );
    expect(actionButton).not.toBeNull();
    expect(actionButton?.textContent).toContain("启用运行");

    act(() => {
      actionButton?.click();
    });
    await flushEffects();

    expect(onEnableWorkspaceSkillRuntime).toHaveBeenCalledWith(
      "workspace_skill:ready-report",
    );
  });
});
