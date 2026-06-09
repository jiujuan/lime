/**
 * ASR Provider 类型定义
 *
 * 定义语音识别服务相关的类型，与 Rust 后端保持一致。
 */

import { safeInvoke } from "@/lib/dev-bridge";
import { getConfig, saveConfig, type Config } from "./appConfig";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

// ============ ASR Provider 类型 ============

/** ASR Provider 类型 */
export type AsrProviderType =
  | "whisper_local"
  | "sensevoice_local"
  | "xunfei"
  | "baidu"
  | "openai";

/** Whisper 模型大小 */
export type WhisperModelSize = "tiny" | "base" | "small" | "medium";

/** Whisper 本地配置 */
export interface WhisperLocalConfig {
  model: WhisperModelSize;
  model_path?: string;
}

/** SenseVoice 本地配置 */
export interface SenseVoiceLocalConfig {
  model_id: string;
  model_dir?: string;
  use_itn: boolean;
  num_threads: number;
  vad_model_id?: string;
}

/** 讯飞配置 */
export interface XunfeiConfig {
  app_id: string;
  api_key: string;
  api_secret: string;
}

/** 百度配置 */
export interface BaiduConfig {
  api_key: string;
  secret_key: string;
}

/** OpenAI ASR 配置 */
export interface OpenAIAsrConfig {
  api_key: string;
  base_url?: string;
  proxy_url?: string;
}

/** ASR 凭证条目 */
export interface AsrCredentialEntry {
  id: string;
  provider: AsrProviderType;
  name?: string;
  is_default: boolean;
  disabled: boolean;
  language: string;
  whisper_config?: WhisperLocalConfig;
  sensevoice_config?: SenseVoiceLocalConfig;
  xunfei_config?: XunfeiConfig;
  baidu_config?: BaiduConfig;
  openai_config?: OpenAIAsrConfig;
}

// ============ 语音输入配置类型 ============

/** 语音输出模式 */
export type VoiceOutputMode = "type" | "clipboard" | "both";

/** 语音处理配置 */
export interface VoiceProcessorConfig {
  polish_enabled: boolean;
  polish_provider?: string;
  polish_model?: string;
  default_instruction_id: string;
}

/** 语音输出配置 */
export interface VoiceOutputConfig {
  mode: VoiceOutputMode;
  type_delay_ms: number;
}

/** 语音处理指令 */
export interface VoiceInstruction {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  shortcut?: string;
  is_preset: boolean;
  icon?: string;
}

/** 语音输入功能配置 */
export interface VoiceInputConfig {
  enabled: boolean;
  shortcut: string;
  processor: VoiceProcessorConfig;
  output: VoiceOutputConfig;
  instructions: VoiceInstruction[];
  /** 选择的麦克风设备 ID（为空时使用系统默认设备） */
  selected_device_id?: string;
  /** 是否启用交互音效 */
  sound_enabled: boolean;
  /** 翻译模式使用的指令 ID */
  translate_instruction_id: string;
}

type ConfigWithVoiceInput = Config & {
  experimental?: Config["experimental"] & {
    voice_input?: (Partial<VoiceInputConfig> & Record<string, unknown>) | null;
  };
};

const DEFAULT_VOICE_INSTRUCTIONS: VoiceInstruction[] = [
  {
    id: "default",
    name: "默认润色",
    prompt: "{{text}}",
    is_preset: true,
  },
  {
    id: "translate_en",
    name: "翻译为英文",
    prompt: "{{text}}",
    is_preset: true,
  },
  {
    id: "raw",
    name: "原始输出",
    prompt: "{{text}}",
    is_preset: true,
  },
];

const DEFAULT_VOICE_INPUT_CONFIG: VoiceInputConfig = {
  enabled: false,
  shortcut: "CommandOrControl+Shift+V",
  processor: {
    polish_enabled: true,
    polish_provider: "openai",
    polish_model: "gpt-4.1-mini",
    default_instruction_id: "default",
  },
  output: {
    mode: "type",
    type_delay_ms: 10,
  },
  instructions: DEFAULT_VOICE_INSTRUCTIONS,
  selected_device_id: undefined,
  sound_enabled: true,
  translate_instruction_id: "translate_en",
};

const VOICE_INPUT_CURRENT_SURFACE = "真实语音输入 current 通道";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneVoiceInputConfig(config: VoiceInputConfig): VoiceInputConfig {
  return {
    ...config,
    processor: { ...config.processor },
    output: { ...config.output },
    instructions: config.instructions.map((instruction) => ({
      ...instruction,
    })),
  };
}

function normalizeVoiceInputConfig(
  value: Partial<VoiceInputConfig> | null | undefined,
): VoiceInputConfig {
  return {
    ...cloneVoiceInputConfig(DEFAULT_VOICE_INPUT_CONFIG),
    ...(value ?? {}),
    processor: {
      ...DEFAULT_VOICE_INPUT_CONFIG.processor,
      ...(value?.processor ?? {}),
    },
    output: {
      ...DEFAULT_VOICE_INPUT_CONFIG.output,
      ...(value?.output ?? {}),
    },
    instructions:
      Array.isArray(value?.instructions) && value.instructions.length > 0
        ? value.instructions.map((instruction) => ({ ...instruction }))
        : DEFAULT_VOICE_INSTRUCTIONS.map((instruction) => ({ ...instruction })),
    selected_device_id: value?.selected_device_id,
  };
}

function mergeVoiceInputConfig(
  appConfig: Config,
  voiceInputConfig: VoiceInputConfig,
): Config {
  const currentVoiceInput = (appConfig as ConfigWithVoiceInput).experimental
    ?.voice_input;

  return {
    ...appConfig,
    experimental: {
      ...appConfig.experimental,
      webmcp: appConfig.experimental?.webmcp ?? { enabled: false },
      voice_input: {
        ...(currentVoiceInput ?? {}),
        ...cloneVoiceInputConfig(voiceInputConfig),
      },
    },
  } as Config;
}

// ============ 麦克风设备类型 ============

/** 麦克风设备信息 */
export interface AudioDeviceInfo {
  /** 设备 ID */
  id: string;
  /** 设备名称 */
  name: string;
  /** 是否为默认设备 */
  is_default: boolean;
}

// ============ Desktop Host / App Server 命令封装 ============

async function invokeVoiceInputCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, VOICE_INPUT_CURRENT_SURFACE);
  return result as T;
}

function assertArrayResult<T>(command: string, value: unknown): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${command} did not return an array`);
  }
  return value as T[];
}

function assertVoidLike(command: string, value: unknown): void {
  if (value == null) {
    return;
  }
  throw new Error(`${command} did not return an empty result`);
}

function assertAsrCredential(
  command: string,
  value: unknown,
): AsrCredentialEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.provider !== "string"
  ) {
    throw new Error(`${command} did not return an ASR credential`);
  }
  return value as unknown as AsrCredentialEntry;
}

function assertTestAsrCredentialResult(
  command: string,
  value: unknown,
): { success: boolean; message: string } {
  if (
    !isRecord(value) ||
    typeof value.success !== "boolean" ||
    typeof value.message !== "string"
  ) {
    throw new Error(`${command} did not return a test result`);
  }
  return value as { success: boolean; message: string };
}

function assertTranscribeResult(
  command: string,
  value: unknown,
): TranscribeResult {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    typeof value.provider !== "string"
  ) {
    throw new Error(`${command} did not return a transcribe result`);
  }
  return value as unknown as TranscribeResult;
}

function assertPolishResult(command: string, value: unknown): PolishResult {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    typeof value.instruction_name !== "string"
  ) {
    throw new Error(`${command} did not return a polish result`);
  }
  return value as unknown as PolishResult;
}

function assertAudioCaptureResult(
  command: string,
  value: unknown,
): RecordingSnapshotResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.audio_data) ||
    typeof value.sample_rate !== "number" ||
    typeof value.duration !== "number"
  ) {
    throw new Error(`${command} did not return an audio capture result`);
  }
  return value as unknown as RecordingSnapshotResult;
}

function assertRecordingSegmentResult(
  command: string,
  value: unknown,
): RecordingSegmentResult {
  const base = assertAudioCaptureResult(command, value);
  if (
    !isRecord(value) ||
    typeof value.start_sample !== "number" ||
    typeof value.end_sample !== "number" ||
    typeof value.total_samples !== "number"
  ) {
    throw new Error(`${command} did not return a recording segment result`);
  }
  return base as RecordingSegmentResult;
}

function assertRecordingStatus(
  command: string,
  value: unknown,
): RecordingStatus {
  if (
    !isRecord(value) ||
    typeof value.is_recording !== "boolean" ||
    typeof value.volume !== "number" ||
    typeof value.duration !== "number"
  ) {
    throw new Error(`${command} did not return a recording status`);
  }
  return value as unknown as RecordingStatus;
}

/** 获取所有可用的麦克风设备 */
export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  const result = await invokeVoiceInputCommand<unknown>("list_audio_devices");
  return assertArrayResult<AudioDeviceInfo>("list_audio_devices", result);
}

/** 获取 ASR 凭证列表 */
export async function getAsrCredentials(): Promise<AsrCredentialEntry[]> {
  const result = await invokeVoiceInputCommand<unknown>("get_asr_credentials");
  return assertArrayResult<AsrCredentialEntry>("get_asr_credentials", result);
}

/** 添加 ASR 凭证 */
export async function addAsrCredential(
  entry: Omit<AsrCredentialEntry, "id">,
): Promise<AsrCredentialEntry> {
  const result = await invokeVoiceInputCommand<unknown>("add_asr_credential", {
    entry,
  });
  return assertAsrCredential("add_asr_credential", result);
}

/** 更新 ASR 凭证 */
export async function updateAsrCredential(
  entry: AsrCredentialEntry,
): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>(
    "update_asr_credential",
    { entry },
  );
  assertVoidLike("update_asr_credential", result);
}

/** 删除 ASR 凭证 */
export async function deleteAsrCredential(id: string): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>(
    "delete_asr_credential",
    { id },
  );
  assertVoidLike("delete_asr_credential", result);
}

/** 设置默认 ASR 凭证 */
export async function setDefaultAsrCredential(id: string): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>(
    "set_default_asr_credential",
    { id },
  );
  assertVoidLike("set_default_asr_credential", result);
}

/** 测试 ASR 凭证连通性 */
export async function testAsrCredential(
  id: string,
): Promise<{ success: boolean; message: string }> {
  const result = await invokeVoiceInputCommand<unknown>(
    "test_asr_credential",
    { id },
  );
  return assertTestAsrCredentialResult("test_asr_credential", result);
}

// ============ 语音输入配置命令 ============

/** 获取语音输入配置 */
export async function getVoiceInputConfig(): Promise<VoiceInputConfig> {
  const appConfig = (await getConfig()) as ConfigWithVoiceInput;
  return normalizeVoiceInputConfig(appConfig.experimental?.voice_input);
}

/** 保存语音输入配置 */
export async function saveVoiceInputConfig(
  config: VoiceInputConfig,
): Promise<void> {
  const appConfig = await getConfig({ forceRefresh: true });
  await saveConfig(mergeVoiceInputConfig(appConfig, config));
}

/** 获取指令列表 */
export async function getVoiceInstructions(): Promise<VoiceInstruction[]> {
  const result =
    await invokeVoiceInputCommand<unknown>("get_voice_instructions");
  return assertArrayResult<VoiceInstruction>("get_voice_instructions", result);
}

/** 保存指令 */
export async function saveVoiceInstruction(
  instruction: VoiceInstruction,
): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>(
    "save_voice_instruction",
    { instruction },
  );
  assertVoidLike("save_voice_instruction", result);
}

/** 删除指令 */
export async function deleteVoiceInstruction(id: string): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>(
    "delete_voice_instruction",
    { id },
  );
  assertVoidLike("delete_voice_instruction", result);
}

// ============ 语音识别和润色命令 ============

/** 语音识别结果 */
export interface TranscribeResult {
  text: string;
  provider: string;
}

/** 润色结果 */
export interface PolishResult {
  text: string;
  instruction_name: string;
}

/** 执行语音识别 */
export async function transcribeAudio(
  audioData: Uint8Array,
  sampleRate: number,
  credentialId?: string,
): Promise<TranscribeResult> {
  const result = await invokeVoiceInputCommand<unknown>("transcribe_audio", {
    audioData: Array.from(audioData),
    sampleRate,
    credentialId,
  });
  return assertTranscribeResult("transcribe_audio", result);
}

/** 润色文本 */
export async function polishVoiceText(
  text: string,
  instructionId?: string,
): Promise<PolishResult> {
  const result = await invokeVoiceInputCommand<unknown>("polish_voice_text", {
    text,
    instructionId,
  });
  return assertPolishResult("polish_voice_text", result);
}

/** 输出文本到系统 */
export async function outputVoiceText(
  text: string,
  mode?: "type" | "clipboard" | "both",
): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>("output_voice_text", {
    text,
    mode,
  });
  assertVoidLike("output_voice_text", result);
}

// ============ 录音控制命令 ============

/** 录音状态 */
export interface RecordingStatus {
  /** 是否正在录音 */
  is_recording: boolean;
  /** 当前音量级别（0-100） */
  volume: number;
  /** 录音时长（秒） */
  duration: number;
}

/** 停止录音结果 */
export interface StopRecordingResult {
  /** 音频数据（i16 样本的字节数组，小端序） */
  audio_data: number[];
  /** 采样率 */
  sample_rate: number;
  /** 录音时长（秒） */
  duration: number;
}

/** 录音快照结果 */
export interface RecordingSnapshotResult {
  /** 音频数据（i16 样本的字节数组，小端序） */
  audio_data: number[];
  /** 采样率 */
  sample_rate: number;
  /** 录音时长（秒） */
  duration: number;
}

/** 录音片段结果 */
export interface RecordingSegmentResult extends RecordingSnapshotResult {
  /** 片段起始 sample offset */
  start_sample: number;
  /** 片段结束 sample offset */
  end_sample: number;
  /** 当前录音总 sample 数 */
  total_samples: number;
}

/** 开始录音 */
export async function startRecording(deviceId?: string): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>("start_recording", {
    deviceId,
  });
  assertVoidLike("start_recording", result);
}

/** 停止录音并返回音频数据 */
export async function stopRecording(): Promise<StopRecordingResult> {
  const result = await invokeVoiceInputCommand<unknown>("stop_recording");
  return assertAudioCaptureResult(
    "stop_recording",
    result,
  ) as StopRecordingResult;
}

/** 获取当前录音快照，不停止录音 */
export async function getRecordingSnapshot(): Promise<RecordingSnapshotResult> {
  const result = await invokeVoiceInputCommand<unknown>(
    "get_recording_snapshot",
  );
  return assertAudioCaptureResult("get_recording_snapshot", result);
}

/** 获取当前录音片段，不停止录音 */
export async function getRecordingSegment(
  startSample: number,
  maxDurationSecs?: number,
): Promise<RecordingSegmentResult> {
  const result = await invokeVoiceInputCommand<unknown>(
    "get_recording_segment",
    {
      startSample,
      maxDurationSecs,
    },
  );
  return assertRecordingSegmentResult("get_recording_segment", result);
}

/** 取消录音 */
export async function cancelRecording(): Promise<void> {
  const result = await invokeVoiceInputCommand<unknown>("cancel_recording");
  assertVoidLike("cancel_recording", result);
}

/** 获取录音状态 */
export async function getRecordingStatus(): Promise<RecordingStatus> {
  const result = await invokeVoiceInputCommand<unknown>(
    "get_recording_status",
  );
  return assertRecordingStatus("get_recording_status", result);
}
