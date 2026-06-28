/* global Buffer, process */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type HostArgs = Record<string, unknown> | null | undefined;
type HostEventEmitter = (event: string, payload?: unknown) => void;
type VoiceModelCatalogRecord = {
  id: string;
  sizeBytes?: number;
  downloadUrl: string;
  vadDownloadUrl: string;
  checksumSha256?: string | null;
};
type DownloadProgressCallback = (
  downloadedBytes: number,
  totalBytes: number | null,
) => void;

const SENSEVOICE_MODEL_ID = "sensevoice-small-int8-2024-07-17";
const SILERO_VAD_MODEL_ID = "silero-vad-onnx";
const VOICE_MODEL_ARCHIVE_DOWNLOAD_PATH =
  "voice/sensevoice-small-int8-2024-07-17/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2";
const VOICE_MODEL_ARCHIVE_FILE =
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2";
const VOICE_MODEL_VAD_DOWNLOAD_PATH = "voice/silero-vad-onnx/silero_vad.onnx";
const DEFAULT_VOICE_MODEL_ASSET_BASE_URL =
  "https://pub-fa568bd8496349bcafe04091e2b02e1e.r2.dev";
const DEFAULT_VOICE_MODEL_BYTES = 163_002_883;
const DEFAULT_VOICE_MODEL_ARCHIVE_SHA256 =
  "7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e";
const VOICE_MODEL_ONNX_FILE = "model.int8.onnx";
const VOICE_MODEL_TOKENS_FILE = "tokens.txt";
const VOICE_MODEL_VAD_FILE = "silero_vad.onnx";
const VOICE_MODEL_MANIFEST_FILE = "lime-model.json";
const VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT = "voice-model-download-progress";

export class VoiceModelHost {
  readonly #userDataDir: string;
  readonly #emit: HostEventEmitter;

  constructor(
    userDataDir: string,
    emit: HostEventEmitter = () => undefined,
  ) {
    this.#userDataDir = userDataDir;
    this.#emit = emit;
  }

  listCatalog(): Array<Record<string, unknown>> {
    const assetBaseUrl =
      normalizeString(process.env.LIME_VOICE_MODEL_ASSET_BASE_URL) ??
      normalizeString(process.env.VOICE_MODEL_ASSET_BASE_URL) ??
      normalizeString(process.env.SERVER_VOICE_MODEL_ASSET_BASE_URL) ??
      DEFAULT_VOICE_MODEL_ASSET_BASE_URL;
    return [
      {
        id: SENSEVOICE_MODEL_ID,
        name: "SenseVoice Small INT8",
        provider: "FunAudioLLM / sherpa-onnx",
        description:
          "本地离线 ASR，支持中文、英文、日文、韩文和粤语；模型按需下载到用户数据目录。",
        version: "2024-07-17",
        languages: ["zh", "en", "ja", "ko", "yue"],
        size_bytes: DEFAULT_VOICE_MODEL_BYTES,
        download_url: joinUrl(assetBaseUrl, VOICE_MODEL_ARCHIVE_DOWNLOAD_PATH),
        vad_model_id: SILERO_VAD_MODEL_ID,
        vad_download_url: joinUrl(assetBaseUrl, VOICE_MODEL_VAD_DOWNLOAD_PATH),
        runtime: "sherpa-onnx",
        bundled: false,
        checksum_sha256: DEFAULT_VOICE_MODEL_ARCHIVE_SHA256,
      },
    ];
  }

  async getInstallState(args: HostArgs): Promise<Record<string, unknown>> {
    const modelId = this.#readModelId(args);
    const installDir = this.#installDir(modelId);
    const modelFile = path.join(installDir, VOICE_MODEL_ONNX_FILE);
    const tokensFile = path.join(installDir, VOICE_MODEL_TOKENS_FILE);
    const vadFile = path.join(installDir, VOICE_MODEL_VAD_FILE);
    const requiredFiles = [
      [VOICE_MODEL_ONNX_FILE, modelFile],
      [VOICE_MODEL_TOKENS_FILE, tokensFile],
      [VOICE_MODEL_VAD_FILE, vadFile],
    ] as const;
    const missingFiles: string[] = [];
    for (const [name, filePath] of requiredFiles) {
      if (!(await pathExists(filePath))) {
        missingFiles.push(name);
      }
    }
    const installedBytes = await directorySize(installDir);
    const manifest = await readJsonFile(
      path.join(installDir, VOICE_MODEL_MANIFEST_FILE),
    );
    const installed = missingFiles.length === 0;
    return {
      model_id: modelId,
      installed,
      installing: false,
      install_dir: installDir,
      model_file: installed ? modelFile : null,
      tokens_file: installed ? tokensFile : null,
      vad_file: installed ? vadFile : null,
      installed_bytes: installedBytes,
      last_verified_at: readNumber(manifest, "installed_at") ?? null,
      missing_files: missingFiles,
      default_credential_id: null,
    };
  }

  async download(args: HostArgs): Promise<Record<string, unknown>> {
    const modelId = this.#readModelId(args);
    const catalog = this.#readCatalogRecord(args, modelId);
    const tempRoot = path.join(
      this.#downloadsDir(),
      `${modelId}-${Date.now()}`,
    );
    const extractDir = path.join(tempRoot, "extract");
    const stagingDir = path.join(tempRoot, "staging");
    const archivePath = path.join(tempRoot, VOICE_MODEL_ARCHIVE_FILE);
    const installDir = this.#installDir(modelId);

    const expectedArchiveBytes =
      catalog.sizeBytes && catalog.sizeBytes > 0 ? catalog.sizeBytes : null;
    this.#emitDownloadProgress(
      modelId,
      "preparing",
      0,
      expectedArchiveBytes,
      0,
      "准备下载模型",
    );

    try {
      await mkdir(extractDir, { recursive: true });
      const archiveSha256 = await downloadFileToPath(
        catalog.downloadUrl,
        archivePath,
        (downloadedBytes, totalBytes) => {
          const total = totalBytes ?? expectedArchiveBytes;
          this.#emitDownloadProgress(
            modelId,
            "archive",
            downloadedBytes,
            total,
            0.9 * progressRatio(downloadedBytes, total),
            "正在下载模型包",
          );
        },
      );
      verifyOptionalSha256(archiveSha256, catalog.checksumSha256);

      this.#emitDownloadProgress(
        modelId,
        "extracting",
        0,
        null,
        0.92,
        "正在校验并解压",
      );
      await extractTarBz2(archivePath, extractDir);
      const modelSourceDir = await findModelSourceDir(extractDir);
      await mkdir(stagingDir, { recursive: true });
      await copyFile(
        path.join(modelSourceDir, VOICE_MODEL_ONNX_FILE),
        path.join(stagingDir, VOICE_MODEL_ONNX_FILE),
      );
      await copyFile(
        path.join(modelSourceDir, VOICE_MODEL_TOKENS_FILE),
        path.join(stagingDir, VOICE_MODEL_TOKENS_FILE),
      );

      await downloadFileToPath(
        catalog.vadDownloadUrl,
        path.join(stagingDir, VOICE_MODEL_VAD_FILE),
        (downloadedBytes, totalBytes) => {
          this.#emitDownloadProgress(
            modelId,
            "vad",
            downloadedBytes,
            totalBytes,
            0.92 + 0.05 * progressRatio(downloadedBytes, totalBytes),
            "正在下载 VAD",
          );
        },
      );

      await writeFile(
        path.join(stagingDir, VOICE_MODEL_MANIFEST_FILE),
        JSON.stringify(
          {
            model_id: modelId,
            installed_at: Math.floor(Date.now() / 1000),
            source_url: catalog.downloadUrl,
            vad_url: catalog.vadDownloadUrl,
            archive_sha256: archiveSha256,
            checksum_verified: Boolean(catalog.checksumSha256),
            checksum_note: catalog.checksumSha256
              ? "后端目录提供 sha256，已完成归档内容校验"
              : "后端目录未提供 sha256，当前记录下载内容摘要但不声明已完成可信校验",
          },
          null,
          2,
        ),
      );
      this.#emitDownloadProgress(
        modelId,
        "installing",
        0,
        null,
        0.98,
        "正在安装",
      );
      await rm(installDir, { recursive: true, force: true });
      await mkdir(path.dirname(installDir), { recursive: true });
      await rename(stagingDir, installDir);
      this.#emitDownloadProgress(modelId, "done", 0, null, 1, "安装完成");
      return { state: await this.getInstallState({ modelId }) };
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async delete(args: HostArgs): Promise<Record<string, unknown>> {
    const modelId = this.#readModelId(args);
    await rm(this.#installDir(modelId), {
      recursive: true,
      force: true,
    });
    return await this.getInstallState({ modelId });
  }

  #readModelId(args: HostArgs): string {
    const request = readRequest(args);
    const modelId =
      readString(request, "modelId") ??
      readString(request, "model_id") ??
      SENSEVOICE_MODEL_ID;
    if (modelId !== SENSEVOICE_MODEL_ID) {
      throw new Error(`Unsupported voice model: ${modelId}`);
    }
    return modelId;
  }

  #readCatalogRecord(args: HostArgs, modelId: string): VoiceModelCatalogRecord {
    const request = readRequest(args);
    const rawCatalog =
      readRecord(request, "catalogEntry") ??
      readRecord(request, "catalog_entry") ??
      this.listCatalog()[0];
    const id = readString(rawCatalog, "id") ?? modelId;
    if (id !== modelId) {
      throw new Error(
        `语音模型目录 ID 不匹配: expected=${modelId}, actual=${id}`,
      );
    }
    const downloadUrl = readString(rawCatalog, "download_url");
    const vadDownloadUrl = readString(rawCatalog, "vad_download_url");
    if (!downloadUrl) {
      throw new Error("SenseVoice Small 归档下载地址未配置");
    }
    if (!vadDownloadUrl) {
      throw new Error("Silero VAD 下载地址未配置");
    }
    return {
      id,
      sizeBytes: readNumber(rawCatalog, "size_bytes") ?? undefined,
      downloadUrl,
      vadDownloadUrl,
      checksumSha256: readString(rawCatalog, "checksum_sha256"),
    };
  }

  #emitDownloadProgress(
    modelId: string,
    phase: string,
    downloadedBytes: number,
    totalBytes: number | null,
    overallProgress: number,
    message: string,
  ): void {
    this.#emit(VOICE_MODEL_DOWNLOAD_PROGRESS_EVENT, {
      model_id: modelId,
      phase,
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes,
      overall_progress: clampRatio(overallProgress),
      message,
    });
  }

  #installDir(modelId: string): string {
    return path.join(this.#userDataDir, "models", "voice", modelId);
  }

  #downloadsDir(): string {
    return path.join(this.#userDataDir, "models", "voice", ".downloads");
  }
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  const next = record[key];
  return next && typeof next === "object" && !Array.isArray(next)
    ? (next as Record<string, unknown>)
    : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown, key: string): string | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function joinUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${relativePath.replace(/^\/+/u, "")}`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directorySize(directoryPath: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function downloadFileToPath(
  url: string,
  targetPath: string,
  onProgress: DownloadProgressCallback,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`下载语音模型文件失败 ${url}: ${response.status}`);
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  const file = await open(targetPath, "w");
  const hash = createHash("sha256");
  const totalBytes = readContentLength(response);
  let downloadedBytes = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = Buffer.from(value);
      downloadedBytes += chunk.byteLength;
      hash.update(chunk);
      await file.write(chunk);
      onProgress(downloadedBytes, totalBytes);
    }
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}

function readContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function verifyOptionalSha256(
  actual: string,
  expected: string | null | undefined,
): void {
  const normalized = expected?.trim();
  if (!normalized) {
    return;
  }
  if (actual.toLowerCase() !== normalized.toLowerCase()) {
    throw new Error(
      `模型归档 sha256 校验失败: expected=${normalized}, actual=${actual}`,
    );
  }
}

async function extractTarBz2(
  archivePath: string,
  extractDir: string,
): Promise<void> {
  await mkdir(extractDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xjf", archivePath, "-C", extractDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`系统 tar 解压语音模型失败: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `系统 tar 解压语音模型失败: ${stderr.trim() || `exit ${code}`}`,
        ),
      );
    });
  });
}

async function findModelSourceDir(rootDir: string): Promise<string> {
  const candidates: string[] = [];
  await collectModelSourceDirs(rootDir, candidates);
  if (candidates.length === 0) {
    throw new Error("模型归档缺少 model.int8.onnx / tokens.txt");
  }
  return candidates[0];
}

async function collectModelSourceDirs(
  directoryPath: string,
  candidates: string[],
): Promise<void> {
  const modelPath = path.join(directoryPath, VOICE_MODEL_ONNX_FILE);
  const tokensPath = path.join(directoryPath, VOICE_MODEL_TOKENS_FILE);
  if ((await pathExists(modelPath)) && (await pathExists(tokensPath))) {
    candidates.push(directoryPath);
    return;
  }
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await collectModelSourceDirs(
        path.join(directoryPath, entry.name),
        candidates,
      );
    }
  }
}

function progressRatio(
  downloadedBytes: number,
  totalBytes: number | null,
): number {
  if (!totalBytes || totalBytes <= 0) {
    return 0;
  }
  return clampRatio(downloadedBytes / totalBytes);
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

async function readJsonFile(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return toRecord(parsed) ?? {};
  } catch {
    return {};
  }
}
