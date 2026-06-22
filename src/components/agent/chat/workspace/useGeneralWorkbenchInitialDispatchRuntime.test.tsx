import { useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useGeneralWorkbenchInitialAutoGuideRuntime,
  useGeneralWorkbenchInitialDispatchRuntime,
  type GeneralWorkbenchInitialDispatchRuntime,
} from "./useGeneralWorkbenchInitialDispatchRuntime";

vi.mock("@/lib/api/executionRun", () => ({
  executionRunGetGeneralWorkbenchState: vi.fn(),
}));

interface HarnessProps {
  autoRunInitialPromptOnMount?: boolean;
  contentId?: string;
  enableAutoGuide?: boolean;
  initialUserPrompt?: string;
  isSending?: boolean;
  isThemeWorkbench?: boolean;
  messagesLength?: number;
  queuedTurnsLength?: number;
  shouldUseCompactGeneralWorkbench?: boolean;
  onInitialUserPromptConsumed?: () => void;
}

interface LatestState {
  handleSend: ReturnType<typeof vi.fn>;
  input: string;
  runtime: GeneralWorkbenchInitialDispatchRuntime;
  soulArtifactVoiceEnabledForTurn: boolean;
}

let container: HTMLDivElement;
let root: Root;
let latestState: LatestState | null = null;

function Harness({
  autoRunInitialPromptOnMount = false,
  contentId,
  enableAutoGuide = false,
  initialUserPrompt,
  isSending = false,
  isThemeWorkbench = false,
  messagesLength = 0,
  queuedTurnsLength = 0,
  shouldUseCompactGeneralWorkbench = false,
  onInitialUserPromptConsumed = () => undefined,
}: HarnessProps) {
  const [input, setInput] = useState("");
  const [soulArtifactVoiceEnabledForTurn, setSoulArtifactVoiceEnabledForTurn] =
    useState(false);
  const triggerAIGuideRef = useRef(() => undefined);
  const handleSend = useRef(vi.fn(async () => true)).current;
  const runtime = useGeneralWorkbenchInitialDispatchRuntime({
    activeTheme: "general",
    autoRunInitialPromptOnMount,
    contentId,
    initialUserPrompt,
    isSending,
    isThemeWorkbench,
    mappedTheme: "general",
    messagesLength,
    onInitialUserPromptConsumed,
    queuedTurnsLength,
    sessionId: "session-1",
    setInput,
    setSoulArtifactVoiceEnabledForTurn,
    shouldUseCompactGeneralWorkbench,
  });

  useGeneralWorkbenchInitialAutoGuideRuntime({
    autoRunInitialPromptOnMount,
    canvasState: null,
    contentId,
    consumedInitialPromptRef: runtime.consumedInitialPromptRef,
    generalWorkbenchEntryCheckPending:
      runtime.generalWorkbenchEntryCheckPending,
    generalWorkbenchEntryPrompt: runtime.generalWorkbenchEntryPrompt,
    handleSend,
    hasProject: true,
    hasTriggeredGuideRef: runtime.hasTriggeredGuideRef,
    initialAutoSendAllowsDetachedSession: false,
    initialAutoSendRequestMetadata: { source: "test" },
    initialDispatchKey: runtime.initialDispatchKey,
    initialUserPrompt,
    isSending,
    isThemeWorkbench,
    mappedTheme: "general",
    messagesLength,
    onInitialUserPromptConsumed,
    projectId: "project-1",
    sessionId: "session-1",
    setInput,
    shouldSkipGeneralWorkbenchAutoGuideWithoutPrompt: false,
    shouldUseCompactGeneralWorkbench:
      !enableAutoGuide || shouldUseCompactGeneralWorkbench,
    systemPrompt: "system",
    triggerAIGuideRef,
  });

  latestState = {
    handleSend,
    input,
    runtime,
    soulArtifactVoiceEnabledForTurn,
  };
  return null;
}

function renderHarness(props?: HarnessProps): LatestState {
  act(() => {
    root.render(<Harness {...props} />);
  });
  return readLatestState();
}

function readLatestState(): LatestState {
  if (!latestState) {
    throw new Error("hook 尚未初始化");
  }
  return latestState;
}

async function flushEffects(times = 3): Promise<void> {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("useGeneralWorkbenchInitialDispatchRuntime", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latestState = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    latestState = null;
  });

  it("初始输入正在发送时应暴露 bootstrap preview", async () => {
    renderHarness({
      initialUserPrompt: "整理素材",
      isSending: true,
    });
    await flushEffects();

    const { runtime } = readLatestState();
    expect(runtime.initialDispatchKey).toBe("整理素材::");
    expect(runtime.isBootstrapDispatchPending).toBe(true);
    expect(runtime.bootstrapDispatchPreview).toMatchObject({
      key: "整理素材::",
      prompt: "整理素材",
      images: [],
    });
  });

  it("发送成功后应消费初始输入并恢复本轮语音开关", async () => {
    const onInitialUserPromptConsumed = vi.fn();
    renderHarness({
      contentId: "content-1",
      initialUserPrompt: "生成大纲",
      isThemeWorkbench: true,
      onInitialUserPromptConsumed,
    });
    await flushEffects();

    const { runtime } = readLatestState();
    const boundary = runtime.resolveSendBoundary({
      sourceText: "生成大纲",
    });

    act(() => {
      runtime.finalizeAfterSendSuccess(boundary);
    });

    expect(runtime.consumedInitialPromptRef.current).toBe("生成大纲::");
    expect(onInitialUserPromptConsumed).toHaveBeenCalledTimes(1);
    expect(readLatestState().soulArtifactVoiceEnabledForTurn).toBe(true);
  });

  it("工作台初始提示应恢复为确认卡并支持重启消费", async () => {
    const onInitialUserPromptConsumed = vi.fn();
    renderHarness({
      contentId: "content-1",
      initialUserPrompt: "继续生成文章",
      isThemeWorkbench: true,
      onInitialUserPromptConsumed,
    });
    await flushEffects();

    expect(readLatestState().input).toBe("继续生成文章");
    expect(readLatestState().runtime.generalWorkbenchEntryPrompt).toMatchObject(
      {
        kind: "initial_prompt",
        prompt: "继续生成文章",
      },
    );

    act(() => {
      readLatestState().runtime.dismissGeneralWorkbenchEntryPrompt({
        consumeInitialPrompt: true,
        onConsumeInitialPrompt: () => {
          readLatestState().runtime.consumeInitialPrompt(
            readLatestState().runtime.initialDispatchKey,
          );
        },
      });
    });

    expect(readLatestState().runtime.generalWorkbenchEntryPrompt).toBeNull();
    expect(onInitialUserPromptConsumed).toHaveBeenCalledTimes(1);
  });

  it("无 contentId 且不自动发送时应只把初始输入预填到输入框", async () => {
    renderHarness({
      enableAutoGuide: true,
      initialUserPrompt: "先列一个计划",
    });
    await flushEffects();

    const { handleSend, input } = readLatestState();
    expect(input).toBe("先列一个计划");
    expect(handleSend).not.toHaveBeenCalled();
  });
});
