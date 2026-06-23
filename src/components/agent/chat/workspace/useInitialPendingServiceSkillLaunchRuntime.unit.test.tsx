import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { MutableRefObject } from "react";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import type { ServiceSkillSelectionOptions } from "./workspaceServiceSkillEntryActionsViewModel";
import { buildPendingServiceSkillLaunchSignature } from "./pendingServiceSkillLaunchSignature";
import { useInitialPendingServiceSkillLaunchRuntime } from "./useInitialPendingServiceSkillLaunchRuntime";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

type HookProps = Omit<
  Parameters<typeof useInitialPendingServiceSkillLaunchRuntime>[0],
  "handledSignatureRef" | "dismissedSignatureRef"
> & {
  initialHandledSignature?: string;
  initialDismissedSignature?: string;
};

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];
let latestRefs: {
  handled: MutableRefObject<string>;
  dismissed: MutableRefObject<string>;
} | null = null;

function createSkill(
  overrides: Partial<ServiceSkillHomeItem> = {},
): ServiceSkillHomeItem {
  return {
    id: "skill-1",
    skillKey: "writer",
    title: "Writer",
    summary: "Write",
    category: "writing",
    outputHint: "Markdown",
    source: "cloud_catalog",
    runnerType: "instant",
    defaultExecutorBinding: "agent_turn",
    executionLocation: "client_default",
    slotSchema: [],
    version: "1.0.0",
    badge: "写",
    recentUsedAt: null,
    isRecent: false,
    runnerLabel: "即时",
    runnerTone: "slate",
    runnerDescription: "即时执行",
    actionLabel: "执行",
    automationStatus: null,
    ...overrides,
  };
}

function renderHook(props: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe(currentProps: HookProps) {
    const handledSignatureRef = useRef(
      currentProps.initialHandledSignature ?? "",
    );
    const dismissedSignatureRef = useRef(
      currentProps.initialDismissedSignature ?? "",
    );
    latestRefs = {
      handled: handledSignatureRef,
      dismissed: dismissedSignatureRef,
    };
    useInitialPendingServiceSkillLaunchRuntime({
      ...currentProps,
      handledSignatureRef,
      dismissedSignatureRef,
    });
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    await act(async () => {
      root.render(<Probe {...props} {...nextProps} />);
      await Promise.resolve();
    });
  };

  mountedRoots.push({ root, container });

  return {
    render,
    getRefs: () => {
      if (!latestRefs) {
        throw new Error("hook 尚未初始化");
      }
      return {
        handled: latestRefs.handled.current,
        dismissed: latestRefs.dismissed.current,
      };
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  latestRefs = null;
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
  vi.restoreAllMocks();
  latestRefs = null;
});

describe("useInitialPendingServiceSkillLaunchRuntime", () => {
  it("匹配到初始技能时应触发 service skill select 并记录 handled signature", async () => {
    const launch = {
      skillId: " skill-1 ",
      requestKey: 7,
      initialSlotValues: { topic: "Codex" },
      prefillHint: "继续",
      launchUserInput: "生成报告",
    };
    const signature = buildPendingServiceSkillLaunchSignature(launch);
    const onSelectServiceSkill =
      vi.fn<
        (
          skill: ServiceSkillHomeItem,
          options?: ServiceSkillSelectionOptions,
        ) => void
      >();

    const { render, getRefs } = renderHook({
      activeTheme: "general",
      initialPendingServiceSkillLaunch: launch,
      initialPendingServiceSkillLaunchSignature: signature,
      serviceSkills: [createSkill()],
      serviceSkillsLoading: false,
      onSelectServiceSkill,
    });

    await render();

    expect(onSelectServiceSkill).toHaveBeenCalledWith(
      expect.objectContaining({ id: "skill-1" }),
      {
        requestKey: 7,
        initialSlotValues: { topic: "Codex" },
        prefillHint: "继续",
        launchUserInput: "生成报告",
      },
    );
    expect(getRefs().handled).toBe(signature);
  });

  it("已 dismissed 的签名不应再次触发", async () => {
    const launch = { skillId: "skill-1" };
    const signature = buildPendingServiceSkillLaunchSignature(launch);
    const onSelectServiceSkill = vi.fn();

    const { render } = renderHook({
      activeTheme: "general",
      initialPendingServiceSkillLaunch: launch,
      initialPendingServiceSkillLaunchSignature: signature,
      initialDismissedSignature: signature,
      serviceSkills: [createSkill()],
      serviceSkillsLoading: false,
      onSelectServiceSkill,
    });

    await render();

    expect(onSelectServiceSkill).not.toHaveBeenCalled();
  });

  it("技能列表已加载但找不到目标技能时应提示并标记 handled", async () => {
    const launch = { skillId: "missing-skill", skillKey: "missing-skill" };
    const signature = buildPendingServiceSkillLaunchSignature(launch);
    const onSelectServiceSkill = vi.fn();

    const { render, getRefs } = renderHook({
      activeTheme: "general",
      initialPendingServiceSkillLaunch: launch,
      initialPendingServiceSkillLaunchSignature: signature,
      serviceSkills: [createSkill()],
      serviceSkillsLoading: false,
      onSelectServiceSkill,
    });

    await render();

    expect(onSelectServiceSkill).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("未找到技能：missing-skill");
    expect(getRefs().handled).toBe(signature);
  });
});
