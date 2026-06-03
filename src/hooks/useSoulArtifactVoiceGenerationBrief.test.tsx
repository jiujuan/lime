import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSoulArtifactVoiceGenerationBrief } from "./useSoulArtifactVoiceGenerationBrief";

const { mockGetConfig, mockSubscribeAppConfigChanged, configListeners } =
  vi.hoisted(() => {
    const listeners: Array<() => void> = [];
    const subscribe = vi.fn((listener: () => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    });

    return {
      mockGetConfig: vi.fn(),
      mockSubscribeAppConfigChanged: subscribe,
      configListeners: listeners,
    };
  });

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  subscribeAppConfigChanged: mockSubscribeAppConfigChanged,
}));

type HookValue = ReturnType<typeof useSoulArtifactVoiceGenerationBrief>;

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

function renderHookProbe(onValue: (value: HookValue) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const value = useSoulArtifactVoiceGenerationBrief();
    useEffect(() => {
      onValue(value);
    }, [value]);
    return null;
  }

  mounted.push({ container, root });
  act(() => {
    root.render(<Probe />);
  });
}

async function flushEffects(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useSoulArtifactVoiceGenerationBrief", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    configListeners.splice(0, configListeners.length);
  });

  afterEach(() => {
    while (mounted.length > 0) {
      const target = mounted.pop();
      if (!target) {
        break;
      }
      act(() => {
        target.root.unmount();
      });
      target.container.remove();
    }
    configListeners.splice(0, configListeners.length);
  });

  it("显式开启的 Soul 创作声线应投影为 Generation Brief", async () => {
    let latest: HookValue = { loading: true, generationBrief: undefined };
    mockGetConfig.mockResolvedValue({
      memory: {
        soul: {
          artifact_voice: {
            enabled: true,
            voice_source: "creator_voice",
            creator_voice_id: "creator-voice-1",
            evidence_pack_id: "voice-pack-1",
            evidence_refs: ["memory:voice-note-1"],
          },
        },
      },
    });

    renderHookProbe((value) => {
      latest = value;
    });
    await flushEffects();

    expect(latest).toEqual({
      loading: false,
      generationBrief: {
        voice_source: "creator_voice",
        voice_guard: "user_explicit",
        global_soul_scope: "interaction_only",
        expert_persona_scope: "current_expert_session",
        formal_artifact_voice_source: "generation_brief_only",
        inherits_global_soul: false,
        inherits_expert_persona: false,
        evidence_source: "memory.soul.artifact_voice",
        creator_voice_id: "creator-voice-1",
        evidence_pack_id: "voice-pack-1",
        evidence_refs: ["memory:voice-note-1"],
      },
    });
  });

  it("配置变更后应强制刷新并清除关闭的创作声线", async () => {
    let latest: HookValue = { loading: true, generationBrief: undefined };
    mockGetConfig
      .mockResolvedValueOnce({
        memory: {
          soul: {
            artifact_voice: {
              enabled: true,
              voice_source: "brand_voice",
              brand_voice_id: "brand-voice-1",
            },
          },
        },
      })
      .mockResolvedValueOnce({
        memory: {
          soul: {
            artifact_voice: {
              enabled: false,
              voice_source: "brand_voice",
              brand_voice_id: "brand-voice-1",
            },
          },
        },
      });

    renderHookProbe((value) => {
      latest = value;
    });
    await flushEffects();

    expect(latest?.generationBrief).toMatchObject({
      voice_source: "brand_voice",
      brand_voice_id: "brand-voice-1",
    });

    await act(async () => {
      configListeners[0]?.();
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockGetConfig).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(latest).toEqual({
      loading: false,
      generationBrief: undefined,
    });
  });
});
