import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptInput } from "./PromptInput";
import { VideoSidebar } from "./VideoSidebar";
import { VideoWorkspace } from "./VideoWorkspace";
import { createInitialVideoState } from "./types";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import { changeLimeLocale } from "@/i18n/createI18n";

const mountedRoots: MountedRoot[] = [];

function getBodyText(): string {
  return document.body.textContent ?? "";
}

async function hoverTip(ariaLabel: string): Promise<HTMLButtonElement> {
  const trigger = document.body.querySelector(
    `button[aria-label='${ariaLabel}']`,
  );
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await Promise.resolve();
  });

  return trigger as HTMLButtonElement;
}

async function leaveTip(trigger: HTMLButtonElement | null): Promise<void> {
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("视频工作台 tips 收口", () => {
  beforeEach(async () => {
    setupReactActEnvironment();
    await changeLimeLocale("zh-CN");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  it("提示词输入区应默认隐藏解释文案，只在 hover tips 时展示", async () => {
    mountHarness(
      PromptInput,
      {
        state: createInitialVideoState(),
        onStateChange: vi.fn(),
        onGenerate: vi.fn(),
      },
      mountedRoots,
    );
    await flushEffects();

    expect(getBodyText()).not.toContain(
      "先写主体、场景和运动方式，再补充光线、氛围或镜头语言",
    );
    expect(getBodyText()).not.toContain("按 Enter 直接生成");

    const promptTip = await hoverTip("提示词说明");
    expect(getBodyText()).toContain(
      "先写主体、场景和运动方式，再补充光线、氛围或镜头语言",
    );
    await leaveTip(promptTip);
    expect(getBodyText()).not.toContain(
      "先写主体、场景和运动方式，再补充光线、氛围或镜头语言",
    );

    const shortcutTip = await hoverTip("快捷键说明");
    expect(getBodyText()).toContain("按 Enter 直接生成，Shift + Enter 换行。");
    await leaveTip(shortcutTip);
    expect(getBodyText()).not.toContain("按 Enter 直接生成");
  });

  it("提示词输入区英文界面应使用 workspace namespace 文案", async () => {
    await changeLimeLocale("en-US");
    mountHarness(
      PromptInput,
      {
        state: {
          ...createInitialVideoState(),
          duration: 8,
          endImage: "asset://end.png",
          model: "veo-3.1",
          startImage: "asset://start.png",
        },
        onStateChange: vi.fn(),
        onGenerate: vi.fn(),
      },
      mountedRoots,
    );
    await flushEffects();

    expect(getBodyText()).toContain("VIDEO STUDIO");
    expect(getBodyText()).toContain(
      "Describe the scene, camera, and pacing you want to generate",
    );
    expect(getBodyText()).toContain("Model veo-3.1");
    expect(getBodyText()).toContain("8s");
    expect(getBodyText()).toContain("2 reference image(s)");
    expect(
      document.body.querySelector("textarea")?.getAttribute("placeholder"),
    ).toContain("At dusk by the sea");
    expect(getBodyText()).toContain("Generate video");

    const promptTip = await hoverTip("Prompt guidance");
    expect(getBodyText()).toContain(
      "Start with the subject, scene, and motion",
    );
    await leaveTip(promptTip);

    const shortcutTip = await hoverTip("Shortcut guidance");
    expect(getBodyText()).toContain(
      "Press Enter to generate, Shift + Enter for a new line.",
    );
    await leaveTip(shortcutTip);
  });

  it("左侧参数栏应把说明文案和建议统一收到 tips", async () => {
    mountHarness(
      VideoSidebar,
      {
        state: createInitialVideoState(),
        providers: [],
        availableModels: [],
        onStateChange: vi.fn(),
      },
      mountedRoots,
    );
    await flushEffects();

    expect(getBodyText()).not.toContain(
      "先确定模型，再补参考图和输出规格。这里保持轻量控制，主创作仍留在右侧画布。",
    );
    expect(getBodyText()).not.toContain(
      "需要复现某次结果时再固定种子；探索阶段保持随机即可。",
    );
    expect(getBodyText()).not.toContain(
      "提示词优先写清主体、场景、镜头运动和光线。",
    );

    const introTip = await hoverTip("生成参数说明");
    expect(getBodyText()).toContain(
      "先确定模型，再补参考图和输出规格。这里保持轻量控制，主创作仍留在右侧画布。",
    );
    await leaveTip(introTip);

    const helperTip = await hoverTip("提示词建议");
    expect(getBodyText()).toContain(
      "提示词优先写清主体、场景、镜头运动和光线。生成成功后，视频会自动同步到项目资料，便于后续复用。",
    );
    await leaveTip(helperTip);
  });

  it("左侧参数栏英文界面应使用 workspace namespace 概览与创作 Tips 文案", async () => {
    await changeLimeLocale("en-US");
    mountHarness(
      VideoSidebar,
      {
        state: {
          ...createInitialVideoState(),
          aspectRatio: "16:9",
          duration: 12,
          resolution: "1080p",
          startImage: "data:image/png;base64,start",
        },
        providers: [],
        availableModels: [],
        onStateChange: vi.fn(),
      },
      mountedRoots,
    );
    await flushEffects();

    expect(getBodyText()).toContain("VIDEO CONTROL");
    expect(getBodyText()).toContain("Generation parameters");
    expect(getBodyText()).toContain("Current model");
    expect(getBodyText()).toContain("Configure a video model");
    expect(getBodyText()).toContain("No video models available");
    expect(getBodyText()).toContain("Configure a video-capable provider first");
    expect(getBodyText()).toContain("Output spec");
    expect(getBodyText()).toContain("16:9 · 1080p");
    expect(getBodyText()).toContain("Duration");
    expect(getBodyText()).toContain("12 sec");
    expect(getBodyText()).toContain("Reference images");
    expect(getBodyText()).toContain("Ready references: 1");
    expect(getBodyText()).toContain("Start frame");
    expect(
      document.body.querySelector("img[alt='Start frame preview']"),
    ).not.toBeNull();
    expect(getBodyText()).toContain("Change");
    expect(getBodyText()).toContain(
      "Drag and drop to replace the current image",
    );
    expect(getBodyText()).toContain("End frame");
    expect(getBodyText()).toContain("Add image");
    expect(getBodyText()).toContain(
      "Drag or click to upload a reference image",
    );
    expect(getBodyText()).toContain("Choose image");
    expect(getBodyText()).toContain("Aspect ratio");
    expect(getBodyText()).toContain("Adaptive");
    expect(getBodyText()).toContain("Resolution");
    expect(getBodyText()).toContain("Seed");
    expect(
      document.body.querySelector("input[placeholder='Random']"),
    ).not.toBeNull();
    expect(
      document.body.querySelector("button[title='Random seed']"),
    ).not.toBeNull();
    expect(getBodyText()).toContain("Generate audio");
    expect(getBodyText()).toContain("Fixed camera");
    expect(getBodyText()).toContain("Creation tips");
    expect(getBodyText()).toContain("Parameter pacing");

    const introTip = await hoverTip("Generation parameter guidance");
    expect(getBodyText()).toContain("Keep this panel lightweight");
    await leaveTip(introTip);

    const startFrameTip = await hoverTip("Opening frame guidance");
    expect(getBodyText()).toContain("Use it to lock the opening composition");
    await leaveTip(startFrameTip);

    const endFrameTip = await hoverTip("Ending frame guidance");
    expect(getBodyText()).toContain("Use it to constrain the final shot");
    await leaveTip(endFrameTip);

    const durationTip = await hoverTip("Duration guidance");
    expect(getBodyText()).toContain("Start with 4 to 8 seconds");
    await leaveTip(durationTip);

    const seedTip = await hoverTip("Seed guidance");
    expect(getBodyText()).toContain("Lock the seed only");
    await leaveTip(seedTip);

    const audioTip = await hoverTip("Generate audio guidance");
    expect(getBodyText()).toContain("Turn this on only when you need ambience");
    await leaveTip(audioTip);

    const cameraTip = await hoverTip("Fixed camera guidance");
    expect(getBodyText()).toContain("Reduce camera movement");
    await leaveTip(cameraTip);

    const promptTip = await hoverTip("Prompt guidance");
    expect(getBodyText()).toContain(
      "Prioritize the subject, scene, camera motion, and lighting",
    );
    await leaveTip(promptTip);

    const paceTip = await hoverTip("Parameter pacing guidance");
    expect(getBodyText()).toContain("Lock the model and aspect ratio first");
    await leaveTip(paceTip);
  });

  it("左侧参数栏英文界面应使用 workspace namespace 模型面板文案", async () => {
    await changeLimeLocale("en-US");
    mountHarness(
      VideoSidebar,
      {
        state: {
          ...createInitialVideoState(),
          model: "sora-2-pro",
          providerId: "openai",
        },
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            customModels: ["sora-2-pro"],
          },
        ],
        availableModels: [],
        onStateChange: vi.fn(),
      },
      mountedRoots,
    );
    await flushEffects();

    expect(getBodyText()).toContain("Model");
    expect(getBodyText()).toContain("Sora-2-Pro");

    const modelTip = await hoverTip("Model guidance");
    expect(getBodyText()).toContain(
      "Model capabilities determine the available resolutions",
    );
    await leaveTip(modelTip);

    const trigger = document.body.querySelector(
      "button[title='Choose video model']",
    );
    expect(trigger).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(getBodyText()).toContain("MODEL LIBRARY");
    expect(getBodyText()).toContain("Choose a video model");
    expect(getBodyText()).toContain("Review model capabilities");
    expect(getBodyText()).toContain("20 credits / sec · est. 80 for 4s");
    expect(getBodyText()).toContain(
      "Sora-2 Pro takes about 2 minutes to generate",
    );
  });

  it("主工作台应把首屏介绍和摘要卡 hint 收到 tips", async () => {
    mountHarness(
      VideoWorkspace,
      {
        state: createInitialVideoState(),
        onStateChange: vi.fn(),
        projectId: null,
      },
      mountedRoots,
    );
    await flushEffects(6);

    expect(getBodyText()).not.toContain(
      "用一句清晰的场景描述启动视频生成，再逐步补充镜头运动、情绪和画面锚点。",
    );
    expect(getBodyText()).not.toContain("请先在左侧选择视频服务");

    const workspaceTip = await hoverTip("视频创作说明");
    expect(getBodyText()).toContain(
      "用一句清晰的场景描述启动视频生成，再逐步补充镜头运动、情绪和画面锚点。先让结构成立，再慢慢叠加参考图与参数约束。",
    );
    await leaveTip(workspaceTip);

    const statTip = await hoverTip("当前模型说明");
    expect(getBodyText()).toContain("请先在左侧选择视频服务");
    await leaveTip(statTip);
  });

  it("主工作台英文界面应使用 workspace namespace 首屏与摘要卡文案", async () => {
    await changeLimeLocale("en-US");
    mountHarness(
      VideoWorkspace,
      {
        state: createInitialVideoState(),
        onStateChange: vi.fn(),
        projectId: null,
      },
      mountedRoots,
    );
    await flushEffects(6);

    expect(getBodyText()).toContain("VIDEO WORKBENCH");
    expect(getBodyText()).toContain("Video creation");
    expect(getBodyText()).toContain("Current model");
    expect(getBodyText()).toContain("Select a model");
    expect(getBodyText()).toContain("Output spec");
    expect(getBodyText()).toContain("Reference images");
    expect(getBodyText()).toContain("Text-to-video only");
    expect(getBodyText()).toContain("Task sync");
    expect(getBodyText()).toContain("Select a project first");

    const workspaceTip = await hoverTip("Video creation guidance");
    expect(getBodyText()).toContain(
      "Start video generation with one clear scene description",
    );
    await leaveTip(workspaceTip);

    const statTip = await hoverTip("Current model guidance");
    expect(getBodyText()).toContain(
      "Select a video provider from the left panel first.",
    );
    await leaveTip(statTip);

    const outputSpecTip = await hoverTip("Output spec guidance");
    expect(getBodyText()).toContain("Duration 5 sec");
    await leaveTip(outputSpecTip);
  });
});
