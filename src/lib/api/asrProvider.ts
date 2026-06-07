/**
 * ASR Provider 类型定义
 *
 * 定义语音识别服务相关的类型，与 Rust 后端保持一致。
 */

import { safeInvoke } from "@/lib/dev-bridge";
import { getConfig, saveConfig, type Config } from "./appConfig";

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

/** 获取所有可用的麦克风设备 */
export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  return safeInvoke<AudioDeviceInfo[]>("list_audio_devices");
}

/** 获取 ASR 凭证列表 */
export async function getAsrCredentials(): Promise<AsrCredentialEntry[]> {
  return safeInvoke<AsrCredentialEntry[]>("get_asr_credentials");
}

/** 添加 ASR 凭证 */
export async function addAsrCredential(
  entry: Omit<AsrCredentialEntry, "id">,
): Promise<AsrCredentialEntry> {
  return safeInvoke<AsrCredentialEntry>("add_asr_credential", { entry });
}

/** 更新 ASR 凭证 */
export async function updateAsrCredential(
  entry: AsrCredentialEntry,
): Promise<void> {
  return safeInvoke<void>("update_asr_credential", { entry });
}

/** 删除 ASR 凭证 */
export async function deleteAsrCredential(id: string): Promise<void> {
  return safeInvoke<void>("delete_asr_credential", { id });
}

/** 设置默认 ASR 凭证 */
export async function setDefaultAsrCredential(id: string): Promise<void> {
  return safeInvoke<void>("set_default_asr_credential", { id });
}

/** 测试 ASR 凭证连通性 */
export async function testAsrCredential(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return safeInvoke<{ success: boolean; message: string }>(
    "test_asr_credential",
    { id },
  );
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
  return safeInvoke<VoiceInstruction[]>("get_voice_instructions");
}

/** 保存指令 */
export async function saveVoiceInstruction(
  instruction: VoiceInstruction,
): Promise<void> {
  return safeInvoke<void>("save_voice_instruction", { instruction });
}

/** 删除指令 */
export async function deleteVoiceInstruction(id: string): Promise<void> {
  return safeInvoke<void>("delete_voice_instruction", { id });
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
  return safeInvoke<TranscribeResult>("transcribe_audio", {
    audioData: Array.from(audioData),
    sampleRate,
    credentialId,
  });
}

/** 润色文本 */
export async function polishVoiceText(
  text: string,
  instructionId?: string,
): Promise<PolishResult> {
  return safeInvoke<PolishResult>("polish_voice_text", {
    text,
    instructionId,
  });
}

/** 输出文本到系统 */
export async function outputVoiceText(
  text: string,
  mode?: "type" | "clipboard" | "both",
): Promise<void> {
  return safeInvoke<void>("output_voice_text", { text, mode });
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
  return safeInvoke<void>("start_recording", { deviceId });
}

/** 停止录音并返回音频数据 */
export async function stopRecording(): Promise<StopRecordingResult> {
  return safeInvoke<StopRecordingResult>("stop_recording");
}

/** 获取当前录音快照，不停止录音 */
export async function getRecordingSnapshot(): Promise<RecordingSnapshotResult> {
  return safeInvoke<RecordingSnapshotResult>("get_recording_snapshot");
}

/** 获取当前录音片段，不停止录音 */
export async function getRecordingSegment(
  startSample: number,
  maxDurationSecs?: number,
): Promise<RecordingSegmentResult> {
  return safeInvoke<RecordingSegmentResult>("get_recording_segment", {
    startSample,
    maxDurationSecs,
  });
}

/** 取消录音 */
export async function cancelRecording(): Promise<void> {
  return safeInvoke<void>("cancel_recording");
}

/** 获取录音状态 */
export async function getRecordingStatus(): Promise<RecordingStatus> {
  return safeInvoke<RecordingStatus>("get_recording_status");
}
