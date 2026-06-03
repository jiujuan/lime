import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { Skill } from "@/lib/api/skills";
import { ExpertInfoPanel } from "./ExpertInfoPanel";

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

function renderPanel(onSkillRefsChange = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ExpertInfoPanel
        requestMetadata={REQUEST_METADATA}
        localSkills={[LOCAL_SKILL]}
        serviceSkills={[]}
        onSkillRefsChange={onSkillRefsChange}
      />,
    );
  });

  mountedContents.push({ container, root });
  return { container, onSkillRefsChange };
}

async function flushEffects(times = 4) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
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
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("应支持从右侧专家面板为当前 Agent 添加技能", async () => {
    const { container, onSkillRefsChange } = renderPanel();
    await flushEffects();

    expect(container.textContent).toContain(
      "全局 Soul 只影响沟通节奏；专家人格不会写回全局 Soul，也不会默认进入正式产物。",
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
    expect(onSkillRefsChange).toHaveBeenLastCalledWith([
      "service-skill:daily-trend-briefing",
      "skill:docx",
    ]);
  });
});
