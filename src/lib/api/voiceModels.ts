/**
 * @file voiceModels.ts
 * @description 本地语音模型管理 API
 */

import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
import { getAsrCredentials, type AsrCredentialEntry } from "./asrProvider";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT =
  "voice-model-download-progress";
export const DEFAULT_SENSEVOICE_MODEL_ID = "sensevoice-small-int8-2024-07-17";

export interface VoiceModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  description: string;
  version: string;
  languages: string[];
  size_bytes: number;
  download_url: string;
  vad_model_id?: string | null;
  vad_download_url?: string | null;
  runtime: string;
  bundled: boolean;
  checksum_sha256?: string | null;
}

export interface VoiceModelInstallState {
  model_id: string;
  installed: boolean;
  installing: boolean;
  install_dir: string;
  model_file?: string | null;
  tokens_file?: string | null;
  vad_file?: string | null;
  installed_bytes: number;
  last_verified_at?: number | null;
  missing_files: string[];
  default_credential_id?: string | null;
}

export interface VoiceModelDownloadResult {
  state: VoiceModelInstallState;
}

export type VoiceModelDownloadPhase =
  | "preparing"
  | "archive"
  | "extracting"
  | "vad"
  | "installing"
  | "done";

export interface VoiceModelDownloadProgressEvent {
  model_id: string;
  phase: VoiceModelDownloadPhase | string;
  downloaded_bytes: number;
  total_bytes?: number | null;
  overall_progress: number;
  message: string;
}

export interface VoiceModelTestTranscribeResult {
  text: string;
  duration_secs: number;
  sample_rate: number;
  language?: string | null;
}

export interface DefaultLocalVoiceModelReadiness {
  ready: boolean;
  model_id?: string | null;
  installed?: boolean;
  message?: string;
}

interface OemVoiceModelCatalogResponse {
  items?: OemVoiceModelCatalogItem[];
}

interface OemVoiceModelCatalogItem {
  id?: string;
  name?: string;
  provider?: string;
  description?: string;
  version?: string;
  languages?: string[];
  runtime?: string;
  bundled?: boolean;
  sizeBytes?: number;
  checksumSha256?: string | null;
  download?: {
    archive?: OemVoiceModelDownloadAsset;
    vad?: OemVoiceModelDownloadAsset | null;
  };
}

interface OemVoiceModelDownloadAsset {
  modelId?: string;
  downloadUrl?: string;
  sha256?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

async function invokeVoiceModelCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实语音模型 current 通道");
  return result as T;
}

function assertCatalogEntry(
  command: string,
  value: unknown,
): asserts value is VoiceModelCatalogEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.provider !== "string" ||
    typeof value.description !== "string" ||
    typeof value.version !== "string" ||
    !isStringArray(value.languages) ||
    !isFiniteNumber(value.size_bytes) ||
    typeof value.download_url !== "string" ||
    !isNullableString(value.vad_model_id) ||
    !isNullableString(value.vad_download_url) ||
    typeof value.runtime !== "string" ||
    typeof value.bundled !== "boolean" ||
    !isNullableString(value.checksum_sha256)
  ) {
    throw new Error(`${command} did not return a voice model catalog entry`);
  }
}

function assertInstallState(
  command: string,
  value: unknown,
): VoiceModelInstallState {
  if (
    !isRecord(value) ||
    typeof value.model_id !== "string" ||
    typeof value.installed !== "boolean" ||
    typeof value.installing !== "boolean" ||
    typeof value.install_dir !== "string" ||
    !Array.isArray(value.missing_files)
  ) {
    throw new Error(`${command} did not return a voice model install state`);
  }
  return value as unknown as VoiceModelInstallState;
}

function assertDownloadResult(
  command: string,
  value: unknown,
): VoiceModelDownloadResult {
  if (!isRecord(value)) {
    throw new Error(`${command} did not return a voice model download result`);
  }
  return {
    state: assertInstallState(command, value.state),
  };
}

function assertCatalog(command: string, value: unknown): VoiceModelCatalogEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(`${command} did not return a voice model catalog`);
  }
  for (const item of value) {
    assertCatalogEntry(command, item);
  }
  return value;
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

function assertTestTranscribeResult(
  command: string,
  value: unknown,
): VoiceModelTestTranscribeResult {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    typeof value.duration_secs !== "number" ||
    typeof value.sample_rate !== "number"
  ) {
    throw new Error(`${command} did not return a transcribe test result`);
  }
  return value as unknown as VoiceModelTestTranscribeResult;
}

function mapOemVoiceModelCatalogItem(
  item: OemVoiceModelCatalogItem,
): VoiceModelCatalogEntry | null {
  const id = normalizeText(item.id);
  if (!id) {
    return null;
  }

  const archive = item.download?.archive;
  const vad = item.download?.vad ?? null;

  return {
    id,
    name: normalizeText(item.name) ?? id,
    provider: normalizeText(item.provider) ?? "FunAudioLLM / sherpa-onnx",
    description:
      normalizeText(item.description) ??
      "本地离线 ASR，模型按需下载到用户数据目录。",
    version: normalizeText(item.version) ?? "",
    languages: Array.isArray(item.languages) ? item.languages : [],
    size_bytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
    download_url: normalizeText(archive?.downloadUrl) ?? "",
    vad_model_id: normalizeText(vad?.modelId),
    vad_download_url: normalizeText(vad?.downloadUrl),
    runtime: normalizeText(item.runtime) ?? "sherpa-onnx",
    bundled: item.bundled === true,
    checksum_sha256:
      normalizeText(archive?.sha256) ?? normalizeText(item.checksumSha256),
  };
}

async function fetchOemVoiceModelCatalog(): Promise<
  VoiceModelCatalogEntry[] | null
> {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    return null;
  }

  const response = await fetch(
    `${runtime.controlPlaneBaseUrl}/v1/public/tenants/${encodeURIComponent(
      runtime.tenantId,
    )}/client/voice-model-catalog`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `拉取语音模型目录失败 (${response.status})`;
    throw new Error(message);
  }

  const data = unwrapEnvelope<OemVoiceModelCatalogResponse>(payload);
  return (data.items ?? [])
    .map(mapOemVoiceModelCatalogItem)
    .filter((item): item is VoiceModelCatalogEntry => Boolean(item));
}

export async function listVoiceModelCatalog(): Promise<
  VoiceModelCatalogEntry[]
> {
  const oemCatalog = await fetchOemVoiceModelCatalog();
  if (oemCatalog) {
    return oemCatalog;
  }

  const result = await safeInvoke<VoiceModelCatalogEntry[]>(
    "voice_models_list_catalog",
  );
  assertNotDiagnosticFacade(
    "voice_models_list_catalog",
    result,
    "真实语音模型 current 通道",
  );
  return assertCatalog("voice_models_list_catalog", result);
}

export async function getVoiceModelInstallState(
  modelId: string,
): Promise<VoiceModelInstallState> {
  const result = await invokeVoiceModelCommand<unknown>(
    "voice_models_get_install_state",
    {
      modelId,
    },
  );
  return assertInstallState("voice_models_get_install_state", result);
}

export async function getDefaultLocalVoiceModelReadiness(): Promise<DefaultLocalVoiceModelReadiness> {
  const credentials = await getAsrCredentials();
  const defaultCredential = credentials.find(
    (credential) => credential.is_default && !credential.disabled,
  );

  if (defaultCredential?.provider !== "sensevoice_local") {
    return { ready: true };
  }

  const modelId =
    normalizeText(defaultCredential.sensevoice_config?.model_id) ??
    DEFAULT_SENSEVOICE_MODEL_ID;
  const state = await getVoiceModelInstallState(modelId);
  if (state.installed) {
    return {
      ready: true,
      model_id: modelId,
      installed: true,
    };
  }

  return {
    ready: false,
    model_id: modelId,
    installed: false,
    message: "先下载语音模型",
  };
}

export async function downloadVoiceModel(
  modelId: string,
): Promise<VoiceModelDownloadResult> {
  const oemCatalog = await fetchOemVoiceModelCatalog();
  const catalogEntry = oemCatalog?.find((item) => item.id === modelId);
  const result = await invokeVoiceModelCommand<unknown>("voice_models_download", {
    modelId,
    ...(catalogEntry ? { catalogEntry } : {}),
  });
  return assertDownloadResult("voice_models_download", result);
}

export async function listenVoiceModelDownloadProgress(
  callback: (event: VoiceModelDownloadProgressEvent) => void,
): Promise<() => void> {
  return safeListen<VoiceModelDownloadProgressEvent>(
    VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT,
    (event) => callback(event.payload),
  );
}

export async function deleteVoiceModel(
  modelId: string,
): Promise<VoiceModelInstallState> {
  const result = await invokeVoiceModelCommand<unknown>("voice_models_delete", {
    modelId,
  });
  return assertInstallState("voice_models_delete", result);
}

export async function setDefaultVoiceModel(
  modelId: string,
): Promise<AsrCredentialEntry> {
  const result = await invokeVoiceModelCommand<unknown>(
    "voice_models_set_default",
    {
      modelId,
    },
  );
  return assertAsrCredential("voice_models_set_default", result);
}

export async function testTranscribeVoiceModelFile(
  modelId: string,
  filePath: string,
): Promise<VoiceModelTestTranscribeResult> {
  const result = await invokeVoiceModelCommand<unknown>(
    "voice_models_test_transcribe_file",
    {
      modelId,
      filePath,
    },
  );
  return assertTestTranscribeResult(
    "voice_models_test_transcribe_file",
    result,
  );
}
