import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const appServerMocks = vi.hoisted(() => ({
  listVoiceAsrCredentials: vi.fn(),
  createVoiceAsrCredential: vi.fn(),
  updateVoiceAsrCredential: vi.fn(),
  deleteVoiceAsrCredential: vi.fn(),
  setDefaultVoiceAsrCredential: vi.fn(),
  testVoiceAsrCredential: vi.fn(),
  listVoiceInstructions: vi.fn(),
  saveVoiceInstruction: vi.fn(),
  deleteVoiceInstruction: vi.fn(),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_LIST: "voiceAsrCredential/list",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_CREATE: "voiceAsrCredential/create",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_UPDATE: "voiceAsrCredential/update",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DELETE: "voiceAsrCredential/delete",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET:
    "voiceAsrCredential/default/set",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_TEST: "voiceAsrCredential/test",
  APP_SERVER_METHOD_VOICE_INSTRUCTION_LIST: "voiceInstruction/list",
  APP_SERVER_METHOD_VOICE_INSTRUCTION_SAVE: "voiceInstruction/save",
  APP_SERVER_METHOD_VOICE_INSTRUCTION_DELETE: "voiceInstruction/delete",
  createAppServerClient: () => appServerMocks,
}));

describe("asrProvider API", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeInvoke).mockReset();
    Object.values(appServerMocks).forEach((mock) => {
      mock.mockReset();
    });
    invalidateAppConfigCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  function mockMediaDevices(
    devices: Array<{
      deviceId: string;
      kind: "audioinput" | "audiooutput" | "videoinput";
      label: string;
    }>,
  ) {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    const enumerateDevices = vi.fn().mockResolvedValue(devices);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          enumerateDevices,
          getUserMedia,
        },
      },
    });
    return { enumerateDevices, getUserMedia, stop };
  }

  it("麦克风设备列表走 renderer media devices current，不再调用旧命令", async () => {
    const mediaDevices = mockMediaDevices([
      {
        deviceId: "default",
        kind: "audioinput",
        label: "Default - 内置麦克风",
      },
      { deviceId: "input-2", kind: "audioinput", label: "USB 麦克风" },
      { deviceId: "camera-1", kind: "videoinput", label: "摄像头" },
    ]);

    await expect(listAudioDevices()).resolves.toEqual([
      { id: "内置麦克风", name: "内置麦克风", is_default: true },
      { id: "USB 麦克风", name: "USB 麦克风", is_default: false },
    ]);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mediaDevices.enumerateDevices).toHaveBeenCalledTimes(1);
    expect(mediaDevices.stop).toHaveBeenCalledTimes(1);
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("ASR 凭证读写应走 App Server current 并投影 provider 名", async () => {
    appServerMocks.listVoiceAsrCredentials.mockResolvedValueOnce({
      result: {
        credentials: [
          {
            id: "cred-1",
            provider: "sense_voice_local",
            is_default: true,
            disabled: false,
            language: "auto",
          },
        ],
      },
    });
    appServerMocks.createVoiceAsrCredential.mockResolvedValueOnce({
      result: {
        credential: {
          id: "cred-2",
          provider: "sense_voice_local",
          is_default: true,
          disabled: false,
          language: "zh-CN",
        },
      },
    });
    appServerMocks.updateVoiceAsrCredential.mockResolvedValueOnce({
      result: {},
    });
    appServerMocks.deleteVoiceAsrCredential.mockResolvedValueOnce({
      result: {},
    });
    appServerMocks.setDefaultVoiceAsrCredential.mockResolvedValueOnce({
      result: {},
    });
    appServerMocks.testVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true, message: "ok" },
    });

    await expect(getAsrCredentials()).resolves.toEqual([
      expect.objectContaining({
        id: "cred-1",
        provider: "sensevoice_local",
      }),
    ]);
    await expect(
      addAsrCredential({
        provider: "sensevoice_local",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "cred-2",
        provider: "sensevoice_local",
      }),
    );
    await expect(
      updateAsrCredential({
        id: "cred-2",
        provider: "sensevoice_local",
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

    expect(appServerMocks.listVoiceAsrCredentials).toHaveBeenCalledWith();
    expect(appServerMocks.createVoiceAsrCredential).toHaveBeenCalledWith({
      provider: "sense_voice_local",
      is_default: true,
      disabled: false,
      language: "zh-CN",
    });
    expect(appServerMocks.updateVoiceAsrCredential).toHaveBeenCalledWith({
      credential: {
        id: "cred-2",
        provider: "sense_voice_local",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      },
    });
    expect(appServerMocks.deleteVoiceAsrCredential).toHaveBeenCalledWith({
      id: "cred-2",
    });
    expect(appServerMocks.setDefaultVoiceAsrCredential).toHaveBeenCalledWith({
      id: "cred-2",
    });
    expect(appServerMocks.testVoiceAsrCredential).toHaveBeenCalledWith({
      id: "cred-2",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("get_asr_credentials");
  });

  it("麦克风设备枚举缺少浏览器能力时应 fail closed", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    await expect(listAudioDevices()).rejects.toThrow(
      "当前环境不支持麦克风设备枚举",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("转写、输出与录音控制未接 current 前应本地 fail closed，不再调用旧命令", async () => {
    const currentBlockedMessage =
      "语音转写、润色、输出与录音控制尚未接入 App Server / Electron current 通道，旧 Tauri in-process command 已退役。";

    await expect(
      transcribeAudio(new Uint8Array([1, 2, 3]), 16000, "cred-1"),
    ).rejects.toThrow(currentBlockedMessage);
    await expect(polishVoiceText("你好")).rejects.toThrow(
      currentBlockedMessage,
    );
    await expect(outputVoiceText("hello", "type")).rejects.toThrow(
      currentBlockedMessage,
    );
    await expect(startRecording("default")).rejects.toThrow(
      currentBlockedMessage,
    );
    await expect(stopRecording()).rejects.toThrow(currentBlockedMessage);
    await expect(getRecordingSnapshot()).rejects.toThrow(currentBlockedMessage);
    await expect(getRecordingSegment(16000, 0.8)).rejects.toThrow(
      currentBlockedMessage,
    );
    await expect(cancelRecording()).rejects.toThrow(currentBlockedMessage);
    await expect(getRecordingStatus()).rejects.toThrow(currentBlockedMessage);
    expect(safeInvoke).not.toHaveBeenCalledWith("transcribe_audio", {
      audioData: [1, 2, 3],
      sampleRate: 16000,
      credentialId: "cred-1",
    });
    for (const command of [
      "polish_voice_text",
      "output_voice_text",
      "start_recording",
      "stop_recording",
      "get_recording_snapshot",
      "get_recording_segment",
      "cancel_recording",
      "get_recording_status",
    ]) {
      expect(safeInvoke).not.toHaveBeenCalledWith(command, expect.anything());
      expect(safeInvoke).not.toHaveBeenCalledWith(command);
    }
  });

  it("ASR 凭证 App Server 返回错误形态时不应吞成成功", async () => {
    appServerMocks.listVoiceAsrCredentials.mockResolvedValueOnce({
      result: { credentials: {} },
    });
    appServerMocks.createVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.updateVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.deleteVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.setDefaultVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.testVoiceAsrCredential.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(getAsrCredentials()).rejects.toThrow(
      "voiceAsrCredential/list did not return ASR credentials",
    );
    await expect(
      addAsrCredential({
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      }),
    ).rejects.toThrow(
      "voiceAsrCredential/create did not return an ASR credential",
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
      "voiceAsrCredential/update did not return an empty result",
    );
    await expect(deleteAsrCredential("cred-2")).rejects.toThrow(
      "voiceAsrCredential/delete did not return an empty result",
    );
    await expect(setDefaultAsrCredential("cred-2")).rejects.toThrow(
      "voiceAsrCredential/default/set did not return an empty result",
    );
    await expect(testAsrCredential("cred-2")).rejects.toThrow(
      "voiceAsrCredential/test did not return a test result",
    );
  });

  it("Voice instructions App Server 返回错误形态时不应吞成成功", async () => {
    appServerMocks.listVoiceInstructions.mockResolvedValueOnce({
      result: { instructions: {} },
    });
    appServerMocks.saveVoiceInstruction.mockResolvedValueOnce({
      result: { success: true },
    });
    appServerMocks.deleteVoiceInstruction.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(getVoiceInstructions()).rejects.toThrow(
      "voiceInstruction/list did not return voice instructions",
    );
    await expect(
      saveVoiceInstruction({
        id: "inst-2",
        name: "润色",
        prompt: "请优化",
        is_preset: false,
      }),
    ).rejects.toThrow("voiceInstruction/save did not return an empty result");
    await expect(deleteVoiceInstruction("inst-2")).rejects.toThrow(
      "voiceInstruction/delete did not return an empty result",
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
      .mockResolvedValueOnce(undefined);
    appServerMocks.listVoiceInstructions.mockResolvedValueOnce({
      result: {
        instructions: [
          { id: "inst-1", name: "默认", prompt: "优化", is_preset: true },
        ],
      },
    });
    appServerMocks.saveVoiceInstruction.mockResolvedValueOnce({ result: {} });
    appServerMocks.deleteVoiceInstruction.mockResolvedValueOnce({ result: {} });

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
    expect(appServerMocks.listVoiceInstructions).toHaveBeenCalledWith();
    expect(appServerMocks.saveVoiceInstruction).toHaveBeenCalledWith({
      instruction: {
        id: "inst-2",
        name: "润色",
        prompt: "请优化",
        is_preset: false,
      },
    });
    expect(appServerMocks.deleteVoiceInstruction).toHaveBeenCalledWith({
      id: "inst-2",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("get_voice_instructions");
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "save_voice_instruction",
      expect.anything(),
    );
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "delete_voice_instruction",
      expect.anything(),
    );
  });
});
