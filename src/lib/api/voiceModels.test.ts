import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import {
  DEFAULT_SENSEVOICE_MODEL_ID,
  deleteVoiceModel,
  downloadVoiceModel,
  getDefaultLocalVoiceModelReadiness,
  getVoiceModelInstallState,
  listenVoiceModelDownloadProgress,
  listVoiceModelCatalog,
  setDefaultVoiceModel,
  testTranscribeVoiceModelFile,
  VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT,
} from "./voiceModels";

const appServerMocks = vi.hoisted(() => ({
  listVoiceAsrCredentials: vi.fn(),
  setDefaultVoiceModel: vi.fn(),
  testTranscribeVoiceModelFile: vi.fn(),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

vi.mock("./appServer", () => ({
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_LIST: "voiceAsrCredential/list",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_CREATE: "voiceAsrCredential/create",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_UPDATE: "voiceAsrCredential/update",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DELETE: "voiceAsrCredential/delete",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET:
    "voiceAsrCredential/default/set",
  APP_SERVER_METHOD_VOICE_ASR_CREDENTIAL_TEST: "voiceAsrCredential/test",
  APP_SERVER_METHOD_VOICE_MODEL_DEFAULT_SET: "voiceModel/default/set",
  APP_SERVER_METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE:
    "voiceModel/testTranscribeFile",
  createAppServerClient: () => appServerMocks,
}));

describe("voiceModels API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeInvoke).mockReset();
    vi.mocked(safeListen).mockReset();
    Object.values(appServerMocks).forEach((mock) => {
      mock.mockReset();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应代理本地语音模型管理命令", async () => {
    const installState = {
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: false,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 0,
      missing_files: ["model.int8.onnx"],
    };
    const installedState = {
      ...installState,
      installed: true,
      installed_bytes: 1024,
      missing_files: [],
    };

    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          id: "sensevoice-small-int8-2024-07-17",
          name: "SenseVoice Small INT8",
          provider: "FunAudioLLM / sherpa-onnx",
          description: "本地离线 ASR 模型",
          version: "2024-07-17",
          languages: ["zh", "en"],
          size_bytes: 262144000,
          download_url:
            "https://models.example.com/voice/sensevoice-small-int8.tar.bz2",
          vad_model_id: "silero-vad-onnx",
          vad_download_url: "https://models.example.com/voice/silero_vad.onnx",
          runtime: "sherpa-onnx",
          bundled: false,
          checksum_sha256: "abc123",
        },
      ])
      .mockResolvedValueOnce(installState)
      .mockResolvedValueOnce({ state: installedState })
      .mockResolvedValueOnce(installState)
      .mockResolvedValueOnce(installedState)
      .mockResolvedValueOnce(installedState);
    appServerMocks.setDefaultVoiceModel.mockResolvedValueOnce({
      result: {
        credential: {
          id: "sensevoice-local",
          provider: "sensevoice_local",
          is_default: true,
          disabled: false,
          language: "auto",
        },
      },
    });
    appServerMocks.testTranscribeVoiceModelFile.mockResolvedValueOnce({
      result: {
        text: "这是一段测试转写结果。",
        duration_secs: 3.2,
        sample_rate: 16000,
        language: "auto",
      },
    });

    await expect(listVoiceModelCatalog()).resolves.toEqual([
      expect.objectContaining({ id: "sensevoice-small-int8-2024-07-17" }),
    ]);
    await expect(
      getVoiceModelInstallState("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual(expect.objectContaining({ installed: false }));
    await expect(
      downloadVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual({
      state: expect.objectContaining({ installed: true }),
    });
    await expect(
      deleteVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual(expect.objectContaining({ installed: false }));
    await expect(
      setDefaultVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual(expect.objectContaining({ is_default: true }));
    await expect(
      testTranscribeVoiceModelFile(
        "sensevoice-small-int8-2024-07-17",
        "/tmp/interview.wav",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ text: "这是一段测试转写结果。" }),
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "voice_models_list_catalog");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "voice_models_get_install_state",
      { modelId: "sensevoice-small-int8-2024-07-17" },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "voice_models_download", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(4, "voice_models_delete", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      5,
      "voice_models_get_install_state",
      { modelId: "sensevoice-small-int8-2024-07-17" },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      6,
      "voice_models_get_install_state",
      { modelId: "sensevoice-small-int8-2024-07-17" },
    );
    expect(appServerMocks.setDefaultVoiceModel).toHaveBeenCalledWith({
      model_id: "sensevoice-small-int8-2024-07-17",
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "voice_models_test_transcribe_file",
      expect.anything(),
    );
    expect(appServerMocks.testTranscribeVoiceModelFile).toHaveBeenCalledWith({
      model_id: "sensevoice-small-int8-2024-07-17",
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      file_path: "/tmp/interview.wav",
    });
  });

  it("默认 ASR 为 SenseVoice 本地时应检查模型安装状态", async () => {
    appServerMocks.listVoiceAsrCredentials.mockResolvedValueOnce({
      result: {
        credentials: [
          {
            id: "sensevoice-local-sensevoice-small-int8-2024-07-17",
            provider: "sense_voice_local",
            is_default: true,
            disabled: false,
            language: "auto",
            sensevoice_config: {
              model_id: DEFAULT_SENSEVOICE_MODEL_ID,
              use_itn: true,
              num_threads: 4,
            },
          },
        ],
      },
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      model_id: DEFAULT_SENSEVOICE_MODEL_ID,
      installed: false,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 0,
      missing_files: ["model.int8.onnx"],
    });

    await expect(getDefaultLocalVoiceModelReadiness()).resolves.toEqual({
      ready: false,
      model_id: DEFAULT_SENSEVOICE_MODEL_ID,
      installed: false,
      message: "先下载语音模型",
    });

    expect(appServerMocks.listVoiceAsrCredentials).toHaveBeenCalledTimes(1);
    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "voice_models_get_install_state",
      { modelId: DEFAULT_SENSEVOICE_MODEL_ID },
    );
  });

  it("语音模型目录遇到浅层 mock-like 项时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      { id: "sensevoice-small-int8-2024-07-17" },
    ]);

    await expect(listVoiceModelCatalog()).rejects.toThrow(
      "voice_models_list_catalog did not return a voice model catalog entry",
    );
  });

  it("测试转写应固定走 App Server voiceModel/testTranscribeFile current 通道", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: true,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 1024,
      missing_files: [],
    });
    appServerMocks.testTranscribeVoiceModelFile.mockResolvedValueOnce({
      result: {
        text: "真实测试转写结果。",
        duration_secs: 2.5,
        sample_rate: 16000,
      },
    });

    await expect(
      testTranscribeVoiceModelFile(
        "sensevoice-small-int8-2024-07-17",
        "/tmp/interview.wav",
      ),
    ).resolves.toEqual(expect.objectContaining({ text: "真实测试转写结果。" }));
    expect(safeInvoke).not.toHaveBeenCalledWith(
      "voice_models_test_transcribe_file",
      expect.anything(),
    );
    expect(appServerMocks.testTranscribeVoiceModelFile).toHaveBeenCalledWith({
      model_id: "sensevoice-small-int8-2024-07-17",
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      file_path: "/tmp/interview.wav",
    });
  });

  it("语音模型 side-effect 命令返回错误形态时不应吞成成功", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        model_id: "sensevoice-small-int8-2024-07-17",
        installed: true,
        installing: false,
        install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
        installed_bytes: 1024,
        missing_files: [],
      });
    appServerMocks.testTranscribeVoiceModelFile.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(
      downloadVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_download did not return a voice model install state",
    );
    await expect(
      deleteVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_delete did not return a voice model install state",
    );
    await expect(
      testTranscribeVoiceModelFile(
        "sensevoice-small-int8-2024-07-17",
        "/tmp/interview.wav",
      ),
    ).rejects.toThrow(
      "voiceModel/testTranscribeFile did not return a transcribe test result",
    );
  });

  it("设置默认语音模型应通过 Electron Host 安装状态接入 App Server current 写链", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: true,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 1024,
      missing_files: [],
    });
    appServerMocks.setDefaultVoiceModel.mockResolvedValueOnce({
      result: {
        credential: {
          id: "sensevoice-local-sensevoice-small-int8-2024-07-17",
          provider: "sensevoice_local",
          is_default: true,
          disabled: false,
          language: "auto",
        },
      },
    });

    await expect(
      setDefaultVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual(expect.objectContaining({ is_default: true }));

    expect(safeInvoke).toHaveBeenCalledWith("voice_models_get_install_state", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
    expect(safeInvoke).not.toHaveBeenCalledWith("voice_models_set_default", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
    expect(appServerMocks.setDefaultVoiceModel).toHaveBeenCalledWith({
      model_id: "sensevoice-small-int8-2024-07-17",
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
    });
  });

  it("设置默认语音模型的 App Server 返回错误形态时不应吞成成功", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: true,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 1024,
      missing_files: [],
    });
    appServerMocks.setDefaultVoiceModel.mockResolvedValueOnce({
      result: { success: true },
    });

    await expect(
      setDefaultVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voiceModel/default/set did not return an ASR credential",
    );
  });

  it("默认本地 SenseVoice readiness 依赖 Electron Host current 安装状态", async () => {
    appServerMocks.listVoiceAsrCredentials.mockResolvedValueOnce({
      result: {
        credentials: [
          {
            id: "sensevoice-local-sensevoice-small-int8-2024-07-17",
            provider: "sense_voice_local",
            is_default: true,
            disabled: false,
            language: "auto",
            sensevoice_config: {
              model_id: DEFAULT_SENSEVOICE_MODEL_ID,
              use_itn: true,
              num_threads: 4,
            },
          },
        ],
      },
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      model_id: DEFAULT_SENSEVOICE_MODEL_ID,
      installed: false,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 0,
      missing_files: ["model.int8.onnx"],
    });

    await expect(getDefaultLocalVoiceModelReadiness()).resolves.toEqual({
      ready: false,
      model_id: DEFAULT_SENSEVOICE_MODEL_ID,
      installed: false,
      message: "先下载语音模型",
    });
  });

  it("默认 ASR 不是本地 SenseVoice 时不应阻塞录音入口", async () => {
    appServerMocks.listVoiceAsrCredentials.mockResolvedValueOnce({
      result: {
        credentials: [
          {
            id: "openai-default",
            provider: "openai",
            is_default: true,
            disabled: false,
            language: "zh-CN",
          },
        ],
      },
    });

    await expect(getDefaultLocalVoiceModelReadiness()).resolves.toEqual({
      ready: true,
    });

    expect(appServerMocks.listVoiceAsrCredentials).toHaveBeenCalledTimes(1);
    expect(safeInvoke).not.toHaveBeenCalledWith("get_asr_credentials");
  });

  it("语音模型目录与下载不应从 Renderer 直连网络", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("renderer network"));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          id: "sensevoice-small-int8-2024-07-17",
          name: "SenseVoice Small INT8",
          provider: "FunAudioLLM / sherpa-onnx",
          description: "本地离线 ASR 模型",
          version: "2024-07-17",
          languages: ["zh", "en"],
          size_bytes: 262144000,
          download_url:
            "https://models.example.com/voice/sensevoice-small-int8.tar.bz2",
          vad_model_id: "silero-vad-onnx",
          vad_download_url: "https://models.example.com/voice/silero_vad.onnx",
          runtime: "sherpa-onnx",
          bundled: false,
          checksum_sha256: "abc123",
        },
      ])
      .mockResolvedValueOnce({
        state: {
          model_id: "sensevoice-small-int8-2024-07-17",
          installed: true,
          installing: false,
          install_dir:
            "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
          installed_bytes: 1024,
          missing_files: [],
        },
      });

    await expect(listVoiceModelCatalog()).resolves.toHaveLength(1);
    await expect(
      downloadVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual({
      state: expect.objectContaining({ installed: true }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(safeInvoke).toHaveBeenNthCalledWith(1, "voice_models_list_catalog");
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "voice_models_download", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
  });

  it("应通过 API 网关监听语音模型下载进度事件", async () => {
    const unlisten = vi.fn();
    vi.mocked(safeListen).mockImplementationOnce(async (_event, handler) => {
      handler({
        payload: {
          model_id: "sensevoice-small-int8-2024-07-17",
          phase: "archive",
          downloaded_bytes: 42,
          total_bytes: 100,
          overall_progress: 0.42,
          message: "正在下载模型包",
        },
      });
      return unlisten;
    });
    const listener = vi.fn();

    await expect(listenVoiceModelDownloadProgress(listener)).resolves.toBe(
      unlisten,
    );

    expect(safeListen).toHaveBeenCalledWith(
      VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT,
      expect.any(Function),
    );
    expect(listener).toHaveBeenCalledWith({
      model_id: "sensevoice-small-int8-2024-07-17",
      phase: "archive",
      downloaded_bytes: 42,
      total_bytes: 100,
      overall_progress: 0.42,
      message: "正在下载模型包",
    });
  });
});
