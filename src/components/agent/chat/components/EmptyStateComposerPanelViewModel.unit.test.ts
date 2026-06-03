import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/api/skills";
import type { HomeInputSuggestion } from "../home/homeSurfaceTypes";
import type { InputCapabilitySelection } from "../skill-selection/inputCapabilitySelection";
import type { CuratedTaskTemplateItem } from "../utils/curatedTaskTemplates";
import type { CreationReplaySurfaceModel } from "../utils/creationReplaySurface";
import {
  buildEmptyStateAdvancedControlsState,
  buildEmptyStateInputSuggestionState,
  resolveEmptyStateActiveCapability,
  resolveCurrentModelSummary,
  sortInputSuggestions,
} from "./EmptyStateComposerPanelViewModel";

function suggestion(
  overrides: Partial<HomeInputSuggestion>,
): HomeInputSuggestion {
  return {
    id: "suggestion",
    label: "默认建议",
    prompt: "默认提示",
    order: 10,
    ...overrides,
  };
}

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    key: "writer",
    name: "写作助手",
    description: "处理写作任务。",
    directory: "writer",
    installed: true,
    sourceKind: "other",
    ...overrides,
  };
}

function curatedTask(
  overrides: Partial<CuratedTaskTemplateItem> = {},
): CuratedTaskTemplateItem {
  return {
    id: "task",
    title: "周报",
    summary: "整理周报。",
    outputHint: "一份周报",
    resultDestination: "聊天结果",
    categoryLabel: "写作",
    prompt: "请整理周报。",
    requiredInputs: [],
    requiredInputFields: [],
    optionalReferences: [],
    outputContract: [],
    followUpActions: [],
    badge: "模板",
    actionLabel: "开始",
    statusLabel: "可用",
    statusTone: "emerald",
    recentUsedAt: null,
    isRecent: false,
    ...overrides,
  };
}

function creationReplaySurface(
  overrides: Partial<CreationReplaySurfaceModel> = {},
): CreationReplaySurfaceModel {
  return {
    kind: "memory_entry",
    eyebrow: "带入灵感",
    badgeLabel: "参考",
    title: "品牌风格",
    summary: "轻盈专业",
    hint: "后续结果模板会默认沿用这条风格参考。",
    defaultReferenceMemoryIds: [],
    defaultReferenceEntries: [],
    ...overrides,
  };
}

function defaultActiveCapability() {
  return resolveEmptyStateActiveCapability({
    activeCapability: null,
    fallbackActiveSkill: null,
  });
}

describe("EmptyStateComposerPanelViewModel", () => {
  it("应按 order 和中文 label 排序输入建议", () => {
    expect(
      sortInputSuggestions([
        suggestion({ id: "b", label: "整理会议", order: 20 }),
        suggestion({ id: "c", label: "写邮件", order: 10 }),
        suggestion({ id: "a", label: "分析需求", order: 10 }),
      ]).map((item) => item.id),
    ).toEqual(["a", "c", "b"]);
  });

  it("应只在空输入且没有其他上下文时展示 Tab 起手建议", () => {
    const visibleState = buildEmptyStateInputSuggestionState({
      inputSuggestions: [suggestion({ id: "email" })],
      isLoading: false,
      disabled: false,
      draftInput: "   ",
      pendingImageCount: 0,
      guideHelpActive: false,
      activeCapability: defaultActiveCapability(),
      creationReplaySurface: null,
      inputSuggestionIndex: 0,
    });
    expect(visibleState.shouldShowInputSuggestion).toBe(true);
    expect(visibleState.activeInputSuggestion?.id).toBe("email");

    const hiddenCases = [
      { draftInput: "已有输入" },
      { pendingImageCount: 1 },
      { guideHelpActive: true },
      { isLoading: true },
      { disabled: true },
      {
        activeCapability: resolveEmptyStateActiveCapability({
          activeCapability: {
            kind: "installed_skill",
            skill: skill(),
          },
          fallbackActiveSkill: null,
        }),
      },
      {
        creationReplaySurface: creationReplaySurface(),
      },
    ];

    hiddenCases.forEach((overrides) => {
      expect(
        buildEmptyStateInputSuggestionState({
          inputSuggestions: [suggestion({ id: "email" })],
          isLoading: false,
          disabled: false,
          draftInput: "",
          pendingImageCount: 0,
          guideHelpActive: false,
          activeCapability: defaultActiveCapability(),
          creationReplaySurface: null,
          inputSuggestionIndex: 0,
          ...overrides,
        }).activeInputSuggestion,
      ).toBeNull();
    });
  });

  it("应按 suggestion index 取模选中当前起手建议", () => {
    const state = buildEmptyStateInputSuggestionState({
      inputSuggestions: [
        suggestion({ id: "first", order: 10 }),
        suggestion({ id: "second", order: 20 }),
      ],
      isLoading: false,
      disabled: false,
      draftInput: "",
      pendingImageCount: 0,
      guideHelpActive: false,
      activeCapability: defaultActiveCapability(),
      creationReplaySurface: null,
      inputSuggestionIndex: 3,
    });

    expect(state.activeInputSuggestion?.id).toBe("second");
  });

  it("应派生当前能力 badge，且过滤知识包内置命令", () => {
    const fallbackSkill = skill({ key: "fallback" });
    const knowledgePackCapability: InputCapabilitySelection = {
      kind: "builtin_command",
      command: {
        key: "knowledge_pack",
        label: "知识包",
        mentionLabel: "知识包",
        commandPrefix: "@knowledge",
        description: "",
        aliases: [],
      },
    };

    expect(
      resolveEmptyStateActiveCapability({
        activeCapability: knowledgePackCapability,
        fallbackActiveSkill: fallbackSkill,
      }),
    ).toMatchObject({
      activeBuiltinCommand: null,
      activeSkill: fallbackSkill,
    });

    const taskCapability: InputCapabilitySelection = {
      kind: "curated_task",
      task: curatedTask({ id: "weekly" }),
      referenceEntries: [
        {
          id: "ref",
          category: "experience",
          categoryLabel: "经验",
          title: "参考资料",
          summary: "资料摘要",
          tags: [],
        },
      ],
    };
    const taskState = resolveEmptyStateActiveCapability({
      activeCapability: taskCapability,
      fallbackActiveSkill: fallbackSkill,
    });

    expect(taskState.activeCuratedTask?.id).toBe("weekly");
    expect(taskState.activeCuratedTaskReferenceEntries).toHaveLength(1);
    expect(taskState.activeSkill).toBe(fallbackSkill);
  });

  it("应裁剪 provider/model 后生成当前模型摘要", () => {
    expect(
      resolveCurrentModelSummary({
        providerType: " openai ",
        model: " gpt-5 ",
        getProviderLabel: (value) => value.toUpperCase(),
      }),
    ).toEqual({
      currentModelSummary: "OPENAI / gpt-5",
      trimmedModel: "gpt-5",
    });
    expect(
      resolveCurrentModelSummary({
        providerType: "openai",
        model: " ",
        getProviderLabel: (value) => value,
      }).currentModelSummary,
    ).toBeNull();
  });

  it("应派生高级控件显示和高亮状态", () => {
    const collapsedState = buildEmptyStateAdvancedControlsState({
      providerType: "openai",
      model: "gpt-5",
      getProviderLabel: () => "OpenAI",
      subagentEnabled: false,
      knowledgePackEnabled: false,
      accessMode: undefined,
      isGeneralTheme: false,
      shouldShowTeamSelector: false,
      showCreationModeSelector: false,
      hasAccessModeSetter: false,
      hasFileManagerToggle: false,
      hasKnowledgePackControl: false,
    });

    expect(collapsedState).toMatchObject({
      currentModelSummary: "OpenAI / gpt-5",
      trimmedModel: "gpt-5",
      hasHighlightedAdvancedPreference: false,
      shouldShowAdvancedToggle: true,
      shouldShowLeftExtra: true,
    });

    const highlightedState = buildEmptyStateAdvancedControlsState({
      providerType: "openai",
      model: "gpt-5",
      getProviderLabel: () => "OpenAI",
      subagentEnabled: false,
      knowledgePackEnabled: true,
      accessMode: "read-only",
      isGeneralTheme: true,
      shouldShowTeamSelector: true,
      showCreationModeSelector: true,
      hasAccessModeSetter: true,
      hasFileManagerToggle: true,
      hasKnowledgePackControl: true,
    });

    expect(highlightedState).toMatchObject({
      hasHighlightedAdvancedPreference: true,
      shouldShowAdvancedToggle: true,
      shouldShowLeftExtra: true,
    });
  });
});
