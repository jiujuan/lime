import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { invalidateAppConfigCache } from "./appConfig";
import {
  addAsrCredential,
  cancelRecording,
  deleteAsrCredential,
  deleteVoiceInstruction,
  getAsrCredentials,
  getRecordingSegment,
  getRecordingSnapshot,
  getRecordingStatus,
  getVoiceInputConfig,
  getVoiceInstructions,
  listAudioDevices,
  outputVoiceText,
  polishVoiceText,
  saveVoiceInputConfig,
  saveVoiceInstruction,
  setDefaultAsrCredential,
  startRecording,
  stopRecording,
  testAsrCredential,
  transcribeAudio,
  updateAsrCredential,
} from "./asrProvider";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("asrProvider API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAppConfigCache();
  });

  it("应代理设备与凭证命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        { id: "default", name: "系统默认", is_default: true },
      ])
      .mockResolvedValueOnce([{ id: "cred-1", provider: "openai" }])
      .mockResolvedValueOnce({ id: "cred-2", provider: "openai" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ success: true, message: "ok" });

    await expect(listAudioDevices()).resolves.toEqual([
      expect.objectContaining({ id: "default" }),
    ]);
    await expect(getAsrCredentials()).resolves.toEqual([
      expect.objectContaining({ id: "cred-1" }),
    ]);
    await expect(
      addAsrCredential({
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "cred-2" }));
    await expect(
      updateAsrCredential({
        id: "cred-2",
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).resolves.toBeUndefined();
    await expect(deleteAsrCredential("cred-2")).resolves.toBeUndefined();
    await expect(setDefaultAsrCredential("cred-2")).resolves.toBeUndefined();
    await expect(testAsrCredential("cred-2")).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
  });

  it("音频设备列表遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        source: "electron-host-diagnostic",
        command: "list_audio_devices",
        status: "degraded",
      },
      enumerable: false,
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(listAudioDevices()).rejects.toThrow(
      "list_audio_devices 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("ASR 凭证列表遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        source: "electron-host-diagnostic",
        command: "get_asr_credentials",
        status: "degraded",
      },
      enumerable: false,
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(getAsrCredentials()).rejects.toThrow(
      "get_asr_credentials 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("ASR 写链、指令与录音命令遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(
      addAsrCredential({
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).rejects.toThrow(
      "add_asr_credential 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      updateAsrCredential({
        id: "cred-2",
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).rejects.toThrow(
      "update_asr_credential 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(deleteAsrCredential("cred-2")).rejects.toThrow(
      "delete_asr_credential 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(setDefaultAsrCredential("cred-2")).rejects.toThrow(
      "set_default_asr_credential 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(testAsrCredential("cred-2")).rejects.toThrow(
      "test_asr_credential 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(getVoiceInstructions()).rejects.toThrow(
      "get_voice_instructions 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      saveVoiceInstruction({
        id: "inst-2",
        name: "润色",
        prompt: "请优化",
        is_preset: false,
      }),
    ).rejects.toThrow(
      "save_voice_instruction 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(deleteVoiceInstruction("inst-2")).rejects.toThrow(
      "delete_voice_instruction 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      transcribeAudio(new Uint8Array([1, 2, 3]), 16000, "cred-1"),
    ).rejects.toThrow(
      "transcribe_audio 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(polishVoiceText("你好")).rejects.toThrow(
      "polish_voice_text 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(outputVoiceText("hello", "type")).rejects.toThrow(
      "output_voice_text 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(startRecording("default")).rejects.toThrow(
      "start_recording 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(stopRecording()).rejects.toThrow(
      "stop_recording 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(getRecordingSnapshot()).rejects.toThrow(
      "get_recording_snapshot 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(getRecordingSegment(16000, 0.8)).rejects.toThrow(
      "get_recording_segment 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(cancelRecording()).rejects.toThrow(
      "cancel_recording 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(getRecordingStatus()).rejects.toThrow(
      "get_recording_status 尚未接入真实语音输入 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("ASR 写链、转写与录音命令返回错误形态时不应吞成成功", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ success: true });

    await expect(
      addAsrCredential({
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).rejects.toThrow("add_asr_credential did not return an ASR credential");
    await expect(
      updateAsrCredential({
        id: "cred-2",
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).rejects.toThrow("update_asr_credential did not return an empty result");
    await expect(deleteAsrCredential("cred-2")).rejects.toThrow(
      "delete_asr_credential did not return an empty result",
    );
    await expect(setDefaultAsrCredential("cred-2")).rejects.toThrow(
      "set_default_asr_credential did not return an empty result",
    );
    await expect(testAsrCredential("cred-2")).rejects.toThrow(
      "test_asr_credential did not return a test result",
    );
    await expect(getVoiceInstructions()).rejects.toThrow(
      "get_voice_instructions did not return an array",
    );
    await expect(
      saveVoiceInstruction({
        id: "inst-2",
        name: "润色",
        prompt: "请优化",
        is_preset: false,
      }),
    ).rejects.toThrow(
      "save_voice_instruction did not return an empty result",
    );
    await expect(deleteVoiceInstruction("inst-2")).rejects.toThrow(
      "delete_voice_instruction did not return an empty result",
    );
    await expect(
      transcribeAudio(new Uint8Array([1, 2, 3]), 16000, "cred-1"),
    ).rejects.toThrow("transcribe_audio did not return a transcribe result");
    await expect(polishVoiceText("你好")).rejects.toThrow(
      "polish_voice_text did not return a polish result",
    );
    await expect(outputVoiceText("hello", "type")).rejects.toThrow(
      "output_voice_text did not return an empty result",
    );
    await expect(startRecording("default")).rejects.toThrow(
      "start_recording did not return an empty result",
    );
    await expect(stopRecording()).rejects.toThrow(
      "stop_recording did not return an audio capture result",
    );
    await expect(getRecordingSnapshot()).rejects.toThrow(
      "get_recording_snapshot did not return an audio capture result",
    );
    await expect(getRecordingSegment(16000, 0.8)).rejects.toThrow(
      "get_recording_segment did not return an audio capture result",
    );
    await expect(cancelRecording()).rejects.toThrow(
      "cancel_recording did not return an empty result",
    );
    await expect(getRecordingStatus()).rejects.toThrow(
      "get_recording_status did not return a recording status",
    );
  });

  it("应通过 app config 读写语音输入配置", async () => {
    const config = {
      enabled: true,
      shortcut: "CommandOrControl+Shift+V",
      processor: {
        polish_enabled: true,
        default_instruction_id: "default",
      },
      output: {
        mode: "type" as const,
        type_delay_ms: 10,
      },
      instructions: [],
      sound_enabled: true,
      translate_instruction_id: "default",
    };

    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        default_provider: "openai",
        experimental: {
          webmcp: { enabled: false },
          voice_input: {
            ...config,
            asr_credentials: [{ id: "cred-1" }],
          },
        },
      })
      .mockResolvedValueOnce({
        default_provider: "openai",
        experimental: {
          webmcp: { enabled: false },
          voice_input: {
            asr_credentials: [{ id: "cred-1" }],
          },
        },
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { id: "inst-1", name: "默认", prompt: "优化", is_preset: true },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(getVoiceInputConfig()).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(saveVoiceInputConfig(config)).resolves.toBeUndefined();
    await expect(getVoiceInstructions()).resolves.toEqual([
      expect.objectContaining({ id: "inst-1" }),
    ]);
    await expect(
      saveVoiceInstruction({
        id: "inst-2",
        name: "润色",
        prompt: "请优化",
        is_preset: false,
      }),
    ).resolves.toBeUndefined();
    await expect(deleteVoiceInstruction("inst-2")).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_config");
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "get_config");
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "save_config", {
      config: expect.objectContaining({
        experimental: expect.objectContaining({
          voice_input: expect.objectContaining({
            enabled: true,
            asr_credentials: [{ id: "cred-1" }],
          }),
        }),
      }),
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("get_voice_input_config");
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "save_voice_input_config",
      expect.anything(),
    );
  });

  it("应代理转写、润色与录音命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ text: "你好", provider: "openai" })
      .mockResolvedValueOnce({ text: "你好，世界", instruction_name: "润色" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        audio_data: [1, 2],
        sample_rate: 16000,
        duration: 1,
      })
      .mockResolvedValueOnce({
        audio_data: [1, 2],
        sample_rate: 16000,
        duration: 1,
      })
      .mockResolvedValueOnce({
        audio_data: [3, 4],
        sample_rate: 16000,
        duration: 0.8,
        start_sample: 16000,
        end_sample: 28800,
        total_samples: 28800,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ is_recording: false, volume: 0, duration: 0 })
      .mockResolvedValueOnce(undefined);

    await expect(
      transcribeAudio(new Uint8Array([1, 2, 3]), 16000, "cred-1"),
    ).resolves.toEqual(expect.objectContaining({ text: "你好" }));
    await expect(polishVoiceText("你好")).resolves.toEqual(
      expect.objectContaining({ instruction_name: "润色" }),
    );
    await expect(outputVoiceText("hello", "type")).resolves.toBeUndefined();
    await expect(startRecording("default")).resolves.toBeUndefined();
    await expect(stopRecording()).resolves.toEqual(
      expect.objectContaining({ sample_rate: 16000 }),
    );
    await expect(getRecordingSnapshot()).resolves.toEqual(
      expect.objectContaining({ sample_rate: 16000 }),
    );
    await expect(getRecordingSegment(16000, 0.8)).resolves.toEqual(
      expect.objectContaining({ end_sample: 28800 }),
    );
    await expect(cancelRecording()).resolves.toBeUndefined();
    await expect(getRecordingStatus()).resolves.toEqual(
      expect.objectContaining({ is_recording: false }),
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "transcribe_audio", {
      audioData: [1, 2, 3],
      sampleRate: 16000,
      credentialId: "cred-1",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(4, "start_recording", {
      deviceId: "default",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(6, "get_recording_snapshot");
    expect(safeInvoke).toHaveBeenNthCalledWith(7, "get_recording_segment", {
      startSample: 16000,
      maxDurationSecs: 0.8,
    });
  });
});
