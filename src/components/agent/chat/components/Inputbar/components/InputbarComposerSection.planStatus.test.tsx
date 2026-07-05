import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInputAdapter } from "@/components/input-kit/adapters/types";
import { agentZhCNResource } from "@/i18n/agentResources";
import type { MessageImage } from "../../../types";
import { InputbarComposerSection } from "./InputbarComposerSection";
import {
  buildInputbarComposerSectionCopy,
  type InputbarComposerSectionCopyKey,
} from "./inputbarComposerSectionCopy";
import {
  buildInputbarCoreCopy,
  type InputbarCoreCopyKey,
} from "./inputbarCoreCopy";
import {
  buildInputbarWorkflowPanelCopy,
  type InputbarWorkflowCopyKey,
} from "../inputbarWorkflowCopy";
import type { SkillSelectionProps } from "../../../skill-selection/skillSelectionBindings";

const visionNoticeMockState = vi.hoisted(() => ({
  policy: {
    canSubmit: true,
    failClosedAtSubmit: false,
    missingInputModalities: [],
    reason: null,
    requiredInputModalities: [],
    shouldDisableComposer: false,
    shouldWarn: false,
    status: "enabled",
  },
}));

vi.mock("./InputbarCore", () => ({
  InputbarCore: (props: {
    disabled?: boolean;
    leftExtra?: React.ReactNode;
    onSend?: () => void;
    topExtra?: React.ReactNode;
    trailingMeta?: React.ReactNode;
  }) => (
    <div data-testid="inputbar-core" data-disabled={String(props.disabled)}>
      <button
        type="button"
        data-testid="mock-send"
        onClick={() => props.onSend?.()}
      />
      <div data-testid="top-extra">{props.topExtra}</div>
      <div data-testid="left-extra">{props.leftExtra}</div>
      <div data-testid="trailing-meta">{props.trailingMeta}</div>
    </div>
  ),
}));

vi.mock("./InputbarModelExtra", () => ({
  InputbarModelExtra: (props: { model?: string; reasoningEffort?: string }) => (
    <div
      data-testid="model-selector"
      data-model={props.model ?? ""}
      data-reasoning-effort={props.reasoningEffort ?? ""}
    />
  ),
}));

vi.mock("./InputbarWorkflowStatusPanel", () => ({
  InputbarWorkflowStatusPanel: () => null,
}));

vi.mock("./InputbarVisionCapabilityNotice", async () => {
  const ReactModule = await import("react");

  return {
    InputbarVisionCapabilityNotice: (props: {
      hasPendingImages?: boolean;
      onPolicyChange?: (policy: typeof visionNoticeMockState.policy) => void;
    }) => {
      ReactModule.useEffect(() => {
        props.onPolicyChange?.(visionNoticeMockState.policy);
      }, [props.onPolicyChange]);

      return props.hasPendingImages
        ? ReactModule.createElement("div", {
            "data-testid": "mock-vision-notice",
          })
        : null;
    },
  };
});

vi.mock("../../../skill-selection/CharacterMention", () => ({
  CharacterMention: () => null,
}));

vi.mock("../../../skill-selection/SkillSelector", () => ({
  SkillSelector: () => null,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function translateResource(
  key:
    | InputbarComposerSectionCopyKey
    | InputbarCoreCopyKey
    | InputbarWorkflowCopyKey,
  values?: Record<string, number | string>,
) {
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    agentZhCNResource[key] ?? key,
  );
}

const composerCopy = buildInputbarComposerSectionCopy(translateResource);
const inputbarCopy = buildInputbarCoreCopy(translateResource);
const workflowPanelCopy = buildInputbarWorkflowPanelCopy(translateResource);

const defaultSkillSelection: SkillSelectionProps = {
  skills: [],
  serviceSkills: [],
  serviceSkillGroups: [],
  activeSkill: null,
  isSkillsLoading: false,
  onSelectInputCapability: vi.fn(),
};

function createInputAdapter(): ChatInputAdapter {
  return {
    state: {
      text: "先给我计划",
      isSending: false,
      disabled: false,
      attachments: [],
    },
    model: {
      providerType: "openai",
      model: "gpt-5.2",
      reasoningEffort: "medium",
    },
    actions: {
      setText: vi.fn(),
      send: vi.fn(),
      stop: vi.fn(),
      setProviderType: vi.fn(),
      setModel: vi.fn(),
      setReasoningEffort: vi.fn(),
    },
    ui: {
      showModelSelector: true,
      showToolBar: true,
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  visionNoticeMockState.policy = {
    canSubmit: true,
    failClosedAtSubmit: false,
    missingInputModalities: [],
    reason: null,
    requiredInputModalities: [],
    shouldDisableComposer: false,
    shouldWarn: false,
    status: "enabled",
  };
});

function renderComposerSection(
  props?: Partial<React.ComponentProps<typeof InputbarComposerSection>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const textareaRef = React.createRef<HTMLTextAreaElement>();
  const defaultProps: React.ComponentProps<typeof InputbarComposerSection> = {
    renderWorkflowGeneratingPanel: false,
    workflowGate: null,
    workflowQuickActions: [],
    workflowQueueItems: [],
    workflowActiveItem: null,
    workflowQueueTotalCount: 0,
    workflowCompletedCount: 0,
    workflowTotalCount: 0,
    workflowProgressLabel: "",
    workflowSummaryLabel: "",
    inputAdapter: createInputAdapter(),
    characters: [],
    skillSelection: defaultSkillSelection,
    textareaRef,
    input: "先给我计划",
    onSelectInputCapability: vi.fn(),
    onSend: vi.fn(),
    onToolClick: vi.fn(),
    activeTools: { task_mode: true },
    pendingImages: [],
    onRemoveImage: vi.fn(),
    pathReferences: [],
    onPaste: vi.fn(),
    isFullscreen: false,
    isWorkspaceVariant: false,
    reasoningEffort: "medium",
    setReasoningEffort: vi.fn(),
    showModelControls: true,
    queuedTurns: [],
    inputCompletionEnabled: true,
    copy: composerCopy,
    inputbarCopy,
    workflowPanelCopy,
  };
  const render = (
    nextProps?: Partial<React.ComponentProps<typeof InputbarComposerSection>>,
  ) => {
    act(() => {
      root.render(
        <InputbarComposerSection {...defaultProps} {...props} {...nextProps} />,
      );
    });
  };

  render();
  mountedRoots.push({ root, container });
  return {
    container,
    rerender: render,
    onToolClick: defaultProps.onToolClick,
  };
}

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("InputbarComposerSection plan status", () => {
  it("开启 Plan Mode 后应在左侧显示模型与思考档位，模型选择器仍留在右侧", () => {
    const { container, rerender } = renderComposerSection();

    const leftExtra = container.querySelector('[data-testid="left-extra"]');
    const trailingMeta = container.querySelector(
      '[data-testid="trailing-meta"]',
    );
    const planChip = leftExtra?.querySelector(
      '[data-testid="inputbar-task-mode-status"]',
    );
    const planContext = leftExtra?.querySelector(
      '[data-testid="inputbar-plan-mode-context"]',
    );

    expect(planChip?.textContent).toContain("计划");
    expect(planContext?.textContent).toContain("模型 gpt-5.2");
    expect(planContext?.textContent).toContain("思考 中");
    expect(
      leftExtra?.querySelector('[data-testid="model-selector"]'),
    ).toBeNull();
    expect(
      trailingMeta?.querySelector('[data-testid="model-selector"]'),
    ).toBeTruthy();
    expect(
      trailingMeta
        ?.querySelector('[data-testid="model-selector"]')
        ?.getAttribute("data-reasoning-effort"),
    ).toBe("medium");

    rerender({ activeTools: { task_mode: false } });

    expect(
      container.querySelector('[data-testid="inputbar-plan-mode-context"]'),
    ).toBeNull();
  });

  it("图片能力 policy 阻断时应禁用输入框并拦截发送", () => {
    visionNoticeMockState.policy = {
      canSubmit: false,
      failClosedAtSubmit: true,
      missingInputModalities: ["image"],
      reason: "missing_input_modalities",
      requiredInputModalities: ["image"],
      shouldDisableComposer: true,
      shouldWarn: true,
      status: "blocked",
    };
    const image: MessageImage = {
      data: "aW1hZ2U=",
      mediaType: "image/png",
    };
    const inputAdapter = createInputAdapter();
    inputAdapter.state.attachments = [image];
    const onSend = vi.fn();

    const { container } = renderComposerSection({
      inputAdapter,
      onSend,
      pendingImages: [image],
    });

    expect(
      container.querySelector('[data-testid="mock-vision-notice"]'),
    ).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="inputbar-core"]')
        ?.getAttribute("data-disabled"),
    ).toBe("true");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="mock-send"]')
        ?.click();
    });

    expect(onSend).not.toHaveBeenCalled();
  });
});
