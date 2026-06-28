/* global Buffer */
import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type HostArgs = Record<string, unknown> | null | undefined;
type LayeredDesignProjectExportFileEncoding = "utf8" | "base64";
type LayeredDesignProjectExportFile = {
  relativePath: string;
  mimeType?: string;
  encoding: LayeredDesignProjectExportFileEncoding;
  content: string;
};
type SaveLayeredDesignProjectExportOutput = {
  projectRootPath: string;
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
  designPath: string;
  manifestPath: string;
  previewPngPath?: string;
  assetCount: number;
  fileCount: number;
  bytesWritten: number;
  remoteReferenceAssetCount: number;
  cachedRemoteAssetCount: number;
  uncachedRemoteAssetCount: number;
};
type ReadLayeredDesignProjectExportOutput = {
  projectRootPath: string;
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
  designPath: string;
  designJson: string;
  manifestPath?: string;
  manifestJson?: string;
  psdLikeManifestPath?: string;
  psdLikeManifestJson?: string;
  previewPngPath?: string;
  assetCount: number;
  fileCount: number;
  updatedAtMs?: number;
};
type CachedLayeredDesignRemoteAsset = {
  assetId: string;
  originalSrc: string;
  filename: string;
  content: Buffer;
};

const LAYERED_DESIGN_EXPORT_ROOT = ".lime/layered-designs";
const MAX_LAYERED_DESIGN_EXPORT_FILES = 512;
const MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES = 10 * 1024 * 1024;
const REMOTE_LAYERED_DESIGN_ASSET_TIMEOUT_MS = 8000;

export class LayeredDesignProjectHost {
  async saveExport(
    args: HostArgs,
  ): Promise<SaveLayeredDesignProjectExportOutput> {
    const request = readRequest(args);
    const projectRootPath = readRequiredAbsolutePath(
      request,
      "projectRootPath",
    );
    const documentId = readRequiredString(request, "documentId");
    const title = readString(request, "title") ?? documentId;
    const files = readLayeredDesignExportFiles(request);
    if (files.length === 0) {
      throw new Error("图层设计工程导出文件不能为空");
    }
    if (files.length > MAX_LAYERED_DESIGN_EXPORT_FILES) {
      throw new Error(
        `图层设计工程导出文件数量超出限制: ${MAX_LAYERED_DESIGN_EXPORT_FILES}`,
      );
    }
    const exportFilePaths = new Set(
      files.map((file) =>
        normalizeLayeredDesignRelativePath(file.relativePath).join("/"),
      ),
    );
    if (!exportFilePaths.has("design.json")) {
      throw new Error(`图层设计工程 ${documentId} 缺少 design.json 导出文件`);
    }
    if (!exportFilePaths.has("export-manifest.json")) {
      throw new Error(
        `图层设计工程 ${documentId} 缺少 export-manifest.json 导出文件`,
      );
    }

    const directoryName = sanitizeLayeredDesignDirectoryName(
      readString(request, "directoryName") ?? title,
      sanitizeLayeredDesignDirectoryName(documentId, "layered-design"),
    );
    const exportDirectoryRelativePath = `${LAYERED_DESIGN_EXPORT_ROOT}/${directoryName}`;
    const exportDirectoryPath = path.join(
      projectRootPath,
      ...exportDirectoryRelativePath.split("/"),
    );
    await mkdir(exportDirectoryPath, { recursive: true });

    const preparedFiles = await prepareLayeredDesignExportFiles(files);
    let designPath = path.join(exportDirectoryPath, "design.json");
    let manifestPath = path.join(exportDirectoryPath, "export-manifest.json");
    let previewPngPath: string | undefined;
    let bytesWritten = 0;

    for (const file of preparedFiles.files) {
      const relativePath = file.relativePath;
      const targetPath = path.join(exportDirectoryPath, ...relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content);
      bytesWritten += file.content.byteLength;
      const normalizedPath = relativePath.join("/");
      if (normalizedPath === "design.json") {
        designPath = targetPath;
      }
      if (normalizedPath === "export-manifest.json") {
        manifestPath = targetPath;
      }
      if (normalizedPath === "preview.png") {
        previewPngPath = targetPath;
      }
    }

    for (const asset of preparedFiles.cachedRemoteAssets) {
      const relativePath = normalizeLayeredDesignRelativePath(asset.filename);
      const targetPath = path.join(exportDirectoryPath, ...relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, asset.content);
      bytesWritten += asset.content.byteLength;
    }

    const assetsPath = path.join(exportDirectoryPath, "assets");
    const cachedRemoteAssetCount = preparedFiles.cachedRemoteAssets.length;
    return {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath,
      manifestPath,
      previewPngPath,
      assetCount: await countFilesRecursive(assetsPath),
      fileCount: await countFilesRecursive(exportDirectoryPath),
      bytesWritten,
      remoteReferenceAssetCount: preparedFiles.remoteReferenceAssetCount,
      cachedRemoteAssetCount,
      uncachedRemoteAssetCount:
        preparedFiles.remoteReferenceAssetCount - cachedRemoteAssetCount,
    };
  }

  async readExport(
    args: HostArgs,
  ): Promise<ReadLayeredDesignProjectExportOutput> {
    const request = readRequest(args);
    const projectRootPath = readRequiredAbsolutePath(
      request,
      "projectRootPath",
    );
    const { exportDirectoryPath, exportDirectoryRelativePath } =
      await resolveLayeredDesignExportDirectory(projectRootPath, request);
    const designPath = path.join(exportDirectoryPath, "design.json");
    const manifestPath = path.join(exportDirectoryPath, "export-manifest.json");
    const psdLikeManifestPath = path.join(
      exportDirectoryPath,
      "psd-like-manifest.json",
    );
    const previewPngPath = path.join(exportDirectoryPath, "preview.png");
    const assetsPath = path.join(exportDirectoryPath, "assets");
    const designStats = await stat(designPath);
    const manifestJson = await readOptionalUtf8File(manifestPath);
    const designJson = await hydrateLayeredDesignJsonWithCachedAssets(
      exportDirectoryPath,
      await readFile(designPath, "utf8"),
      manifestJson,
    );
    const psdLikeManifestJson = await readOptionalUtf8File(psdLikeManifestPath);

    return {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath,
      designJson,
      manifestPath: manifestJson === undefined ? undefined : manifestPath,
      manifestJson,
      psdLikeManifestPath:
        psdLikeManifestJson === undefined ? undefined : psdLikeManifestPath,
      psdLikeManifestJson,
      previewPngPath: (await isFile(previewPngPath))
        ? previewPngPath
        : undefined,
      assetCount: await countFilesRecursive(assetsPath),
      fileCount: await countFilesRecursive(exportDirectoryPath),
      updatedAtMs: Math.floor(designStats.mtimeMs),
    };
  }

  recognizeText(args: HostArgs): {
    supported: false;
    engine: string;
    blocks: [];
    message: string;
  } {
    const request = readRequest(args);
    assertPositiveNumber(request, "width", "OCR 图片宽度必须大于 0");
    assertPositiveNumber(request, "height", "OCR 图片高度必须大于 0");
    readRequiredRawString(request, "imageSrc");
    return {
      supported: false,
      engine: "electron_host_unsupported",
      blocks: [],
      message: "Electron Host 尚未接入 native OCR provider",
    };
  }

  analyzeFlatImage(args: HostArgs): {
    supported: false;
    engine: string;
    message: string;
  } {
    const request = readRequest(args);
    const image = readRecord(request, "image");
    if (!image) {
      throw new Error("analyze_layered_design_flat_image requires image");
    }
    readRequiredRawString(image, "src");
    assertPositiveNumber(image, "width", "Analyzer 图片宽度必须大于 0");
    assertPositiveNumber(image, "height", "Analyzer 图片高度必须大于 0");
    return {
      supported: false,
      engine: "electron_host_unsupported",
      message: "Electron Host 尚未接入 native structured analyzer provider",
    };
  }
}

function readLayeredDesignExportFiles(
  request: Record<string, unknown>,
): LayeredDesignProjectExportFile[] {
  const files = readArray(request, "files") ?? [];
  return files.map((file, index) => {
    const record = toRecord(file);
    if (!record) {
      throw new Error(`图层设计导出文件 ${index + 1} 不是有效对象`);
    }
    const encoding = readRequiredString(record, "encoding");
    if (encoding !== "utf8" && encoding !== "base64") {
      throw new Error(`图层设计导出文件 ${index + 1} encoding 不受支持`);
    }
    return {
      relativePath: readRequiredString(record, "relativePath"),
      mimeType: readString(record, "mimeType") ?? undefined,
      encoding,
      content: readRequiredRawString(record, "content"),
    };
  });
}

async function prepareLayeredDesignExportFiles(
  files: LayeredDesignProjectExportFile[],
): Promise<{
  files: Array<{ relativePath: string[]; content: Buffer }>;
  remoteReferenceAssetCount: number;
  cachedRemoteAssets: CachedLayeredDesignRemoteAsset[];
}> {
  const preparedFiles = files.map((file) => ({
    relativePath: normalizeLayeredDesignRelativePath(file.relativePath),
    content:
      file.encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : Buffer.from(file.content, "utf8"),
  }));
  const manifestFile = preparedFiles.find(
    (file) => file.relativePath.join("/") === "export-manifest.json",
  );
  if (!manifestFile) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }

  const manifest = parseLayeredDesignJsonObject(manifestFile.content);
  if (!manifest) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }
  const remoteAssets = collectLayeredDesignRemoteManifestAssets(manifest);
  if (remoteAssets.length === 0) {
    return {
      files: preparedFiles,
      remoteReferenceAssetCount: 0,
      cachedRemoteAssets: [],
    };
  }

  const psdLikeFile = preparedFiles.find(
    (file) => file.relativePath.join("/") === "psd-like-manifest.json",
  );
  const psdLikeManifest = psdLikeFile
    ? parseLayeredDesignJsonObject(psdLikeFile.content)
    : null;
  const cachedRemoteAssets: CachedLayeredDesignRemoteAsset[] = [];
  for (const asset of remoteAssets) {
    const cached = await downloadLayeredDesignRemoteAsset(
      asset.assetId,
      asset.originalSrc,
    );
    if (!cached) {
      continue;
    }
    applyCachedLayeredDesignRemoteAssetToManifest(manifest, cached);
    if (psdLikeManifest) {
      applyCachedLayeredDesignRemoteAssetToPsdLikeManifest(
        psdLikeManifest,
        cached,
      );
    }
    cachedRemoteAssets.push(cached);
  }

  if (cachedRemoteAssets.length > 0) {
    manifestFile.content = Buffer.from(JSON.stringify(manifest, null, 2));
    if (psdLikeFile && psdLikeManifest) {
      psdLikeFile.content = Buffer.from(
        JSON.stringify(psdLikeManifest, null, 2),
      );
    }
  }

  return {
    files: preparedFiles,
    remoteReferenceAssetCount: remoteAssets.length,
    cachedRemoteAssets,
  };
}

function parseLayeredDesignJsonObject(
  content: Buffer | string | undefined,
): Record<string, unknown> | null {
  if (content === undefined) {
    return null;
  }
  try {
    const value = JSON.parse(
      typeof content === "string" ? content : content.toString("utf8"),
    ) as unknown;
    return toRecord(value);
  } catch {
    return null;
  }
}

function collectLayeredDesignRemoteManifestAssets(
  manifest: Record<string, unknown>,
): Array<{ assetId: string; originalSrc: string }> {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  return assets.flatMap((asset) => {
    const record = toRecord(asset);
    const assetId = readString(record, "id");
    const source = readString(record, "source");
    const originalSrc = readString(record, "originalSrc");
    if (
      !assetId ||
      source !== "reference" ||
      !originalSrc ||
      !isSupportedLayeredDesignRemoteAssetUrl(originalSrc)
    ) {
      return [];
    }
    return [{ assetId, originalSrc }];
  });
}

function isSupportedLayeredDesignRemoteAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveLayeredDesignRemoteAssetMimeType(
  contentType: string | null,
  sourceUrl: string,
): string | null {
  const normalizedContentType = contentType
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (normalizedContentType?.startsWith("image/")) {
    return normalizedContentType;
  }
  const lower = sourceUrl.toLowerCase();
  if (lower.includes(".png")) {
    return "image/png";
  }
  if (lower.includes(".jpg") || lower.includes(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.includes(".webp")) {
    return "image/webp";
  }
  if (lower.includes(".gif")) {
    return "image/gif";
  }
  if (lower.includes(".svg")) {
    return "image/svg+xml";
  }
  return null;
}

function resolveLayeredDesignRemoteAssetExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function sanitizeLayeredDesignAssetFileStem(
  value: string,
  fallback = "asset",
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (normalized || fallback).slice(0, 96);
}

async function downloadLayeredDesignRemoteAsset(
  assetId: string,
  originalSrc: string,
): Promise<CachedLayeredDesignRemoteAsset | null> {
  try {
    const response = await fetch(originalSrc, {
      signal: AbortSignal.timeout(REMOTE_LAYERED_DESIGN_ASSET_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES) {
      return null;
    }
    const mimeType = resolveLayeredDesignRemoteAssetMimeType(
      response.headers.get("content-type"),
      originalSrc,
    );
    if (!mimeType) {
      return null;
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.byteLength > MAX_REMOTE_LAYERED_DESIGN_ASSET_BYTES) {
      return null;
    }
    const extension = resolveLayeredDesignRemoteAssetExtension(mimeType);
    return {
      assetId,
      originalSrc,
      filename: `assets/${sanitizeLayeredDesignAssetFileStem(
        assetId,
      )}.${extension}`,
      content,
    };
  } catch {
    return null;
  }
}

function applyCachedLayeredDesignRemoteAssetToManifest(
  manifest: Record<string, unknown>,
  cached: CachedLayeredDesignRemoteAsset,
): void {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const record = toRecord(asset);
    if (!record || readString(record, "id") !== cached.assetId) {
      continue;
    }
    record.source = "file";
    record.filename = cached.filename;
    record.originalSrc = cached.originalSrc;
  }
}

function applyCachedLayeredDesignRemoteAssetToPsdLikeManifest(
  manifest: Record<string, unknown>,
  cached: CachedLayeredDesignRemoteAsset,
): void {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  for (const layer of layers) {
    const layerRecord = toRecord(layer);
    const asset = toRecord(layerRecord?.asset);
    if (!asset || readString(asset, "id") !== cached.assetId) {
      continue;
    }
    asset.source = "file";
    asset.filename = cached.filename;
    asset.originalSrc = cached.originalSrc;
  }
}

async function hydrateLayeredDesignJsonWithCachedAssets(
  exportDirectoryPath: string,
  designJson: string,
  manifestJson: string | undefined,
): Promise<string> {
  const design = parseLayeredDesignJsonObject(designJson);
  const manifest = parseLayeredDesignJsonObject(manifestJson);
  if (!design || !manifest) {
    return designJson;
  }
  const manifestAssets = new Map<string, string>();
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const record = toRecord(asset);
    const assetId = readString(record, "id");
    const source = readString(record, "source");
    const filename = readString(record, "filename");
    if (assetId && source === "file" && filename) {
      manifestAssets.set(assetId, filename);
    }
  }
  if (manifestAssets.size === 0) {
    return designJson;
  }

  const designAssets = Array.isArray(design.assets) ? design.assets : [];
  let hydrated = false;
  for (const asset of designAssets) {
    const record = toRecord(asset);
    if (!record) {
      continue;
    }
    const assetId = readString(record, "id");
    if (!assetId) {
      continue;
    }
    const filename = manifestAssets.get(assetId);
    const currentSrc = readString(record, "src") ?? "";
    if (!filename || currentSrc.startsWith("data:")) {
      continue;
    }
    const relativePath = normalizeLayeredDesignRelativePath(filename);
    const assetPath = path.join(exportDirectoryPath, ...relativePath);
    if (!(await isFile(assetPath))) {
      continue;
    }
    const content = await readFile(assetPath);
    const mimeType =
      resolveLayeredDesignRemoteAssetMimeType(null, filename) ?? "image/png";
    record.src = `data:${mimeType};base64,${content.toString("base64")}`;
    hydrated = true;
  }

  return hydrated ? JSON.stringify(design, null, 2) : designJson;
}

function sanitizeLayeredDesignDirectoryName(
  value: string,
  fallback: string,
): string {
  let output = "";
  let previousDash = false;
  for (const character of value.trim()) {
    if (/[a-z0-9._-]/i.test(character)) {
      output += character.toLowerCase();
      previousDash = false;
    } else if (/[\s/\\:|]/.test(character) && !previousDash) {
      output += "-";
      previousDash = true;
    }
    if (output.length >= 96) {
      break;
    }
  }
  const trimmed = output.replace(/^[-.]+|[-.]+$/g, "");
  const directoryName = trimmed || fallback;
  return directoryName.endsWith(".layered-design")
    ? directoryName
    : `${directoryName}.layered-design`;
}

function normalizeLayeredDesignRelativePath(relativePath: string): string[] {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("导出文件相对路径不能为空");
  }
  if (path.isAbsolute(normalized)) {
    throw new Error(`导出文件路径必须是相对路径: ${relativePath}`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`导出文件路径不能包含目录穿越或根路径: ${relativePath}`);
  }
  return segments;
}

async function resolveLayeredDesignExportDirectory(
  projectRootPath: string,
  request: Record<string, unknown>,
): Promise<{
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
}> {
  const requestedRelativePath = readString(
    request,
    "exportDirectoryRelativePath",
  );
  if (requestedRelativePath) {
    const segments = normalizeLayeredDesignRelativePath(requestedRelativePath);
    const exportDirectoryRelativePath = segments.join("/");
    if (
      !exportDirectoryRelativePath.startsWith(`${LAYERED_DESIGN_EXPORT_ROOT}/`)
    ) {
      throw new Error(`图层设计工程目录必须位于 ${LAYERED_DESIGN_EXPORT_ROOT}`);
    }
    return {
      exportDirectoryPath: path.join(projectRootPath, ...segments),
      exportDirectoryRelativePath,
    };
  }

  const rootPath = path.join(
    projectRootPath,
    ...LAYERED_DESIGN_EXPORT_ROOT.split("/"),
  );
  const entries = await readdir(rootPath, { withFileTypes: true });
  let latest:
    | {
        name: string;
        updatedAtMs: number;
      }
    | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".layered-design")) {
      continue;
    }
    const designPath = path.join(rootPath, entry.name, "design.json");
    if (!(await isFile(designPath))) {
      continue;
    }
    const metadata = await stat(designPath);
    if (!latest || metadata.mtimeMs > latest.updatedAtMs) {
      latest = {
        name: entry.name,
        updatedAtMs: metadata.mtimeMs,
      };
    }
  }
  if (!latest) {
    throw new Error("图层设计工程目录为空");
  }
  return {
    exportDirectoryPath: path.join(rootPath, latest.name),
    exportDirectoryRelativePath: `${LAYERED_DESIGN_EXPORT_ROOT}/${latest.name}`,
  };
}

async function readOptionalUtf8File(
  filePath: string,
): Promise<string | undefined> {
  if (!(await isFile(filePath))) {
    return undefined;
  }
  return await readFile(filePath, "utf8");
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function countFilesRecursive(directoryPath: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursive(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function assertPositiveNumber(
  value: Record<string, unknown>,
  key: string,
  message: string,
): void {
  const next = readNumber(value, key);
  if (!next || next <= 0) {
    throw new Error(message);
  }
}

function readRequiredAbsolutePath(
  value: unknown,
  key: string,
): string {
  const next = readRequiredString(value, key);
  if (!path.isAbsolute(next)) {
    throw new Error(`${key} 必须是绝对路径`);
  }
  return next;
}

function readLayeredDesignRecord(
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

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  return readLayeredDesignRecord(value, key);
}

function readRequest(value: unknown): Record<string, unknown> {
  return readRecord(value, "request") ?? toRecord(value) ?? {};
}

function readArray(value: unknown, key: string): unknown[] | undefined {
  const record = toRecord(value);
  const next = record?.[key];
  return Array.isArray(next) ? next : undefined;
}

function readString(value: unknown, key: string): string | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function readNumber(value: unknown, key: string): number | null {
  const record = toRecord(value);
  const next = record?.[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function readRequiredString(value: unknown, key: string): string {
  const next = readString(value, key);
  if (!next) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return next;
}

function readRequiredRawString(value: unknown, key: string): string {
  const record = toRecord(value);
  const next = record?.[key];
  if (typeof next === "string" && next.length > 0) {
    return next;
  }
  throw new Error(`Missing required string field: ${key}`);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
