import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
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

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

vi.mock("./oemCloudRuntime", () => ({
  resolveOemCloudRuntimeContext: vi.fn(),
}));

describe("voiceModels API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeInvoke).mockReset();
    vi.mocked(safeListen).mockReset();
    vi.mocked(resolveOemCloudRuntimeContext).mockReturnValue(null);
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
      .mockResolvedValueOnce([{ id: "sensevoice-small-int8-2024-07-17" }])
      .mockResolvedValueOnce(installState)
      .mockResolvedValueOnce({ state: installedState })
      .mockResolvedValueOnce(installState)
      .mockResolvedValueOnce({
        id: "sensevoice-local",
        provider: "sensevoice_local",
        is_default: true,
      })
      .mockResolvedValueOnce({
        text: "这是一段测试转写结果。",
        duration_secs: 3.2,
        sample_rate: 16000,
        language: "auto",
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
    expect(safeInvoke).toHaveBeenNthCalledWith(5, "voice_models_set_default", {
      modelId: "sensevoice-small-int8-2024-07-17",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      6,
      "voice_models_test_transcribe_file",
      {
        modelId: "sensevoice-small-int8-2024-07-17",
        filePath: "/tmp/interview.wav",
      },
    );
  });

  it("默认 ASR 为 SenseVoice 本地时应检查模型安装状态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          id: "sensevoice-local-sensevoice-small-int8-2024-07-17",
          provider: "sensevoice_local",
          is_default: true,
          disabled: false,
          language: "auto",
          sensevoice_config: {
            model_id: DEFAULT_SENSEVOICE_MODEL_ID,
            use_itn: true,
            num_threads: 4,
          },
        },
      ])
      .mockResolvedValueOnce({
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

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "get_asr_credentials");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "voice_models_get_install_state",
      { modelId: DEFAULT_SENSEVOICE_MODEL_ID },
    );
  });

  it("语音模型目录遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        source: "electron-host-diagnostic",
        command: "voice_models_list_catalog",
        status: "degraded",
      },
      enumerable: false,
    });
    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(listVoiceModelCatalog()).rejects.toThrow(
      "voice_models_list_catalog 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("语音模型安装状态遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      model_id: DEFAULT_SENSEVOICE_MODEL_ID,
      installed: false,
      installing: false,
      install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
      installed_bytes: 0,
      missing_files: ["model.int8.onnx"],
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "voice_models_get_install_state",
        status: "degraded",
      },
    });

    await expect(
      getVoiceModelInstallState(DEFAULT_SENSEVOICE_MODEL_ID),
    ).rejects.toThrow(
      "voice_models_get_install_state 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("语音模型 side-effect 命令遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(
      downloadVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_download 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      deleteVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_delete 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      setDefaultVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_set_default 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      testTranscribeVoiceModelFile(
        "sensevoice-small-int8-2024-07-17",
        "/tmp/interview.wav",
      ),
    ).rejects.toThrow(
      "voice_models_test_transcribe_file 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("语音模型 side-effect 命令返回错误形态时不应吞成成功", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });

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
      setDefaultVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).rejects.toThrow(
      "voice_models_set_default did not return an ASR credential",
    );
    await expect(
      testTranscribeVoiceModelFile(
        "sensevoice-small-int8-2024-07-17",
        "/tmp/interview.wav",
      ),
    ).rejects.toThrow(
      "voice_models_test_transcribe_file did not return a transcribe test result",
    );
  });

  it("默认本地 SenseVoice readiness 遇到 degraded 安装状态时不应返回假未安装状态", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          id: "sensevoice-local-sensevoice-small-int8-2024-07-17",
          provider: "sensevoice_local",
          is_default: true,
          disabled: false,
          language: "auto",
          sensevoice_config: {
            model_id: DEFAULT_SENSEVOICE_MODEL_ID,
            use_itn: true,
            num_threads: 4,
          },
        },
      ])
      .mockResolvedValueOnce({
        model_id: DEFAULT_SENSEVOICE_MODEL_ID,
        installed: false,
        installing: false,
        install_dir: "/mock/lime/models/voice/sensevoice-small-int8-2024-07-17",
        installed_bytes: 0,
        missing_files: ["model.int8.onnx"],
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "voice_models_get_install_state",
          status: "degraded",
        },
      });

    await expect(getDefaultLocalVoiceModelReadiness()).rejects.toThrow(
      "voice_models_get_install_state 尚未接入真实语音模型 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("默认 ASR 不是本地 SenseVoice 时不应阻塞录音入口", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce([
      {
        id: "openai-default",
        provider: "openai",
        is_default: true,
        disabled: false,
        language: "zh-CN",
      },
    ]);

    await expect(getDefaultLocalVoiceModelReadiness()).resolves.toEqual({
      ready: true,
    });

    expect(safeInvoke).toHaveBeenCalledTimes(1);
    expect(safeInvoke).toHaveBeenCalledWith("get_asr_credentials");
  });

  it("应优先使用 limecore 下发的语音模型目录并传给下载命令", async () => {
    vi.mocked(resolveOemCloudRuntimeContext).mockReturnValue({
      baseUrl: "https://cloud.example.com",
      controlPlaneBaseUrl: "https://cloud.example.com/api",
      sceneBaseUrl: "https://cloud.example.com/scene-api",
      gatewayBaseUrl: "https://cloud.example.com/gateway-api",
      tenantId: "tenant-0001",
      sessionToken: null,
      hubProviderName: null,
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 200,
        message: "success",
        data: {
          items: [
            {
              id: "sensevoice-small-int8-2024-07-17",
              name: "SenseVoice Small INT8",
              provider: "FunAudioLLM / sherpa-onnx",
              description: "后端下发的离线语音模型",
              version: "2024-07-17",
              languages: ["zh", "en"],
              runtime: "sherpa-onnx",
              bundled: false,
              sizeBytes: 262144000,
              download: {
                archive: {
                  downloadUrl:
                    "https://models.example.com/voice/sensevoice.tar.bz2",
                  sha256: "abc123",
                },
                vad: {
                  modelId: "silero-vad-onnx",
                  downloadUrl:
                    "https://models.example.com/voice/silero_vad.onnx",
                },
              },
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(safeInvoke).mockResolvedValueOnce({
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

    await expect(
      downloadVoiceModel("sensevoice-small-int8-2024-07-17"),
    ).resolves.toEqual({
      state: expect.objectContaining({ installed: true }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.example.com/api/v1/public/tenants/tenant-0001/client/voice-model-catalog",
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(safeInvoke).toHaveBeenCalledWith("voice_models_download", {
      modelId: "sensevoice-small-int8-2024-07-17",
      catalogEntry: expect.objectContaining({
        id: "sensevoice-small-int8-2024-07-17",
        download_url: "https://models.example.com/voice/sensevoice.tar.bz2",
        vad_download_url: "https://models.example.com/voice/silero_vad.onnx",
        checksum_sha256: "abc123",
      }),
    });
  });

  it("列出语音模型目录时应优先使用 limecore 下发目录", async () => {
    vi.mocked(resolveOemCloudRuntimeContext).mockReturnValue({
      baseUrl: "https://cloud.example.com",
      controlPlaneBaseUrl: "https://cloud.example.com/api",
      sceneBaseUrl: "https://cloud.example.com/scene-api",
      gatewayBaseUrl: "https://cloud.example.com/gateway-api",
      tenantId: "tenant-0001",
      sessionToken: null,
      hubProviderName: null,
      loginPath: "/login",
      desktopClientId: "desktop-client",
      desktopOauthRedirectUrl: "lime://oauth/callback",
      desktopOauthNextPath: "/welcome",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          items: [
            {
              id: "sensevoice-cloud",
              name: "SenseVoice Cloud",
              provider: "FunAudioLLM / sherpa-onnx",
              languages: ["zh"],
              sizeBytes: 42,
              download: {
                archive: {
                  downloadUrl:
                    "https://models.example.com/voice/sensevoice-cloud.tar.bz2",
                },
              },
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listVoiceModelCatalog()).resolves.toEqual([
      expect.objectContaining({
        id: "sensevoice-cloud",
        download_url:
          "https://models.example.com/voice/sensevoice-cloud.tar.bz2",
      }),
    ]);

    expect(safeInvoke).not.toHaveBeenCalled();
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
