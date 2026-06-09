import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export type LayeredDesignProjectExportFileEncoding = "utf8" | "base64";

export interface LayeredDesignProjectExportFile {
  relativePath: string;
  mimeType: string;
  encoding: LayeredDesignProjectExportFileEncoding;
  content: string;
}

export interface SaveLayeredDesignProjectExportRequest {
  projectRootPath: string;
  documentId: string;
  title: string;
  directoryName?: string;
  files: LayeredDesignProjectExportFile[];
}

export interface SaveLayeredDesignProjectExportOutput {
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
}

export interface ReadLayeredDesignProjectExportRequest {
  projectRootPath: string;
  exportDirectoryRelativePath?: string;
}

export interface ReadLayeredDesignProjectExportOutput {
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
}

export async function saveLayeredDesignProjectExport(
  request: SaveLayeredDesignProjectExportRequest,
): Promise<SaveLayeredDesignProjectExportOutput> {
  const result = await safeInvoke<unknown>(
    "save_layered_design_project_export",
    { request },
  );
  assertNotDiagnosticFacade(
    "save_layered_design_project_export",
    result,
    "真实 Layered Design project export current 通道",
  );
  assertSaveLayeredDesignProjectExportOutput(
    "save_layered_design_project_export",
    result,
  );
  return result;
}

export async function readLayeredDesignProjectExport(
  request: ReadLayeredDesignProjectExportRequest,
): Promise<ReadLayeredDesignProjectExportOutput> {
  const result = await safeInvoke<unknown>(
    "read_layered_design_project_export",
    { request },
  );
  assertNotDiagnosticFacade(
    "read_layered_design_project_export",
    result,
    "真实 Layered Design project export current 通道",
  );
  assertReadLayeredDesignProjectExportOutput(
    "read_layered_design_project_export",
    result,
  );
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  if (isRecord(value) && "error" in value) {
    throw new Error(`${command} returned an error envelope`);
  }
}

function assertSaveLayeredDesignProjectExportOutput(
  command: string,
  value: unknown,
): asserts value is SaveLayeredDesignProjectExportOutput {
  assertNotErrorEnvelope(command, value);
  if (
    !isRecord(value) ||
    typeof value.projectRootPath !== "string" ||
    typeof value.exportDirectoryPath !== "string" ||
    typeof value.exportDirectoryRelativePath !== "string" ||
    typeof value.designPath !== "string" ||
    typeof value.manifestPath !== "string" ||
    typeof value.assetCount !== "number" ||
    typeof value.fileCount !== "number" ||
    typeof value.bytesWritten !== "number" ||
    typeof value.remoteReferenceAssetCount !== "number" ||
    typeof value.cachedRemoteAssetCount !== "number" ||
    typeof value.uncachedRemoteAssetCount !== "number"
  ) {
    throw new Error(
      `${command} did not return a layered design project export result`,
    );
  }
}

function assertReadLayeredDesignProjectExportOutput(
  command: string,
  value: unknown,
): asserts value is ReadLayeredDesignProjectExportOutput {
  assertNotErrorEnvelope(command, value);
  if (
    !isRecord(value) ||
    typeof value.projectRootPath !== "string" ||
    typeof value.exportDirectoryPath !== "string" ||
    typeof value.exportDirectoryRelativePath !== "string" ||
    typeof value.designPath !== "string" ||
    typeof value.designJson !== "string" ||
    typeof value.assetCount !== "number" ||
    typeof value.fileCount !== "number"
  ) {
    throw new Error(
      `${command} did not return a layered design project export document`,
    );
  }
}
