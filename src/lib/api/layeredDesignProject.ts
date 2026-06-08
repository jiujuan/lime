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
  const result = await safeInvoke<SaveLayeredDesignProjectExportOutput>(
    "save_layered_design_project_export",
    { request },
  );
  assertNotDiagnosticFacade(
    "save_layered_design_project_export",
    result,
    "真实 Layered Design project export current 通道",
  );
  return result;
}

export async function readLayeredDesignProjectExport(
  request: ReadLayeredDesignProjectExportRequest,
): Promise<ReadLayeredDesignProjectExportOutput> {
  const result = await safeInvoke<ReadLayeredDesignProjectExportOutput>(
    "read_layered_design_project_export",
    { request },
  );
  assertNotDiagnosticFacade(
    "read_layered_design_project_export",
    result,
    "真实 Layered Design project export current 通道",
  );
  return result;
}
