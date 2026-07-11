import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";
import { useWorkspaceImageWorkbenchSendCommandRuntime } from "./useWorkspaceImageWorkbenchSendCommandRuntime";

const mediaDefaultsHoisted = vi.hoisted(() => ({
  readGlobalMediaGenerationDefaults: vi.fn(),
}));

vi.mock("@/hooks/useGlobalMediaGenerationDefaults", () => ({
  readGlobalMediaGenerationDefaults:
    mediaDefaultsHoisted.readGlobalMediaGenerationDefaults,
}));

type HookProps = Parameters<
  typeof useWorkspaceImageWorkbenchSendCommandRuntime
>[0];

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function createParsedCommand() {
  return {
    rawText: "@配图 生成 城市夜景主视觉",
    commandKey: "image_generate",
    trigger: "@配图",
    body: "生成 城市夜景主视觉",
    mode: "generate" as const,
    prompt: "城市夜景主视觉",
    count: 1,
    size: "1024x1024",
    aspectRatio: undefined,
    targetRef: undefined,
  };
}

function renderHook(props?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<
    typeof useWorkspaceImageWorkbenchSendCommandRuntime
  > | null = null;

  const defaultProps: HookProps = {
    contentId: null,
    currentImageWorkbenchState: createInitialSessionImageWorkbenchState(),
    ensureImageWorkbenchProvidersLoaded: vi.fn(),
    imageWorkbenchPreferredModelId: undefined,
    imageWorkbenchPreferredProviderId: undefined,
    imageWorkbenchPreferredProviderUnavailable: false,
    imageWorkbenchProvidersLoading: false,
    imageWorkbenchSelectedModelId: "",
    imageWorkbenchSelectedProviderId: "",
    imageWorkbenchSelectedSize: "1024x1024",
    imageWorkbenchSessionKey: "session-1",
    projectId: "project-1",
    projectImageGenerationPreference: undefined,
    projectRootPath: "/workspace/project-1",
    setOnDemandMediaDefaults: vi.fn(),
  };

  function Probe(currentProps: HookProps) {
    latestValue = useWorkspaceImageWorkbenchSendCommandRuntime(currentProps);
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    await act(async () => {
      root.render(<Probe {...defaultProps} {...props} {...nextProps} />);
      await Promise.resolve();
    });
  };

  mountedRoots.push({ container, root });

  return {
    render,
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

describe("useWorkspaceImageWorkbenchSendCommandRuntime", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("zh-CN");
    mediaDefaultsHoisted.readGlobalMediaGenerationDefaults.mockReset();
    mediaDefaultsHoisted.readGlobalMediaGenerationDefaults.mockResolvedValue({
      image: {
        preferredProviderId: "fal",
        preferredModelId: "fal-ai/nano-banana-pro",
      },
    });
  });

  afterEach(async () => {
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
    await changeLimeLocale("zh-CN");
  });

  it("发送前应刷新图片默认模型，并把最新路由写入 skill request", async () => {
    const setOnDemandMediaDefaults = vi.fn();
    const ensureImageWorkbenchProvidersLoaded = vi.fn();
    const { render, getValue } = renderHook({
      ensureImageWorkbenchProvidersLoaded,
      setOnDemandMediaDefaults,
    });

    await render();

    let prepared = false;
    await act(async () => {
      prepared = await getValue().prepareImageWorkbenchSkillSend();
    });
    const skillRequest = getValue().resolveImageWorkbenchCommandRequest({
      rawText: "@配图 生成 城市夜景主视觉",
      parsedCommand: createParsedCommand(),
      images: [],
    });

    expect(prepared).toBe(true);
    expect(
      mediaDefaultsHoisted.readGlobalMediaGenerationDefaults,
    ).toHaveBeenCalledWith({
      forceRefresh: true,
    });
    expect(setOnDemandMediaDefaults).toHaveBeenCalledWith({
      image: {
        preferredProviderId: "fal",
        preferredModelId: "fal-ai/nano-banana-pro",
      },
    });
    expect(ensureImageWorkbenchProvidersLoaded).not.toHaveBeenCalled();
    expect(skillRequest?.requestContext).toMatchObject({
      kind: "image_task",
      image_task: {
        provider_id: "fal",
        model: "fal-ai/nano-banana-pro",
        executor_mode: "images_api",
      },
    });
  });

  it("图片工作台动作应通过绑定的 handleSendRef 进入统一发送主线", async () => {
    const { render, getValue } = renderHook();
    const handleSend = vi.fn().mockResolvedValue(true);
    const images = [{ data: "base64-image", mediaType: "image/png" }];
    const requestContext = {
      kind: "image_task",
      image_task: {
        prompt: "城市夜景主视觉",
      },
    };

    await render();

    getValue().bindWorkspaceHandleSendRef({ current: handleSend });
    let submitted = false;
    await act(async () => {
      submitted = await getValue().submitImageWorkbenchAgentCommand({
        rawText: "@配图 生成 城市夜景主视觉",
        displayContent: "生成城市夜景主视觉",
        images,
        requestContext,
      });
    });

    expect(submitted).toBe(true);
    expect(handleSend).toHaveBeenCalledWith(
      images,
      undefined,
      undefined,
      "@配图 生成 城市夜景主视觉",
      undefined,
      undefined,
      {
        displayContent: "生成城市夜景主视觉",
        requestMetadata: {
          harness: {
            image_command_intent: {
              kind: "image_task",
              image_task: {
                prompt: "城市夜景主视觉",
              },
            },
          },
        },
      },
    );
  });
});
