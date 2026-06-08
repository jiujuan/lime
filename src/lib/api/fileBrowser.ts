import {
  AppServerClient,
  type AppServerFileSystemDirectoryListing,
  type AppServerFileSystemFilePreview,
} from "@/lib/api/appServer";
import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  permissions?: string;
  fileType?: string;
  isHidden?: boolean;
  modeStr?: string;
  mode?: number;
  mimeType?: string;
  isSymlink?: boolean;
  iconDataUrl?: string | null;
}

export interface DirectoryListing {
  path: string;
  parentPath: string | null;
  entries: FileEntry[];
  error: string | null;
}

export interface FilePreview {
  path: string;
  content: string | null;
  isBinary: boolean;
  size: number;
  error: string | null;
}

export interface FileManagerLocation {
  id: string;
  label: string;
  path: string;
  kind:
    | "home"
    | "desktop"
    | "documents"
    | "downloads"
    | "applications"
    | string;
}

export type FileBrowserAppServerClient = Pick<
  AppServerClient,
  | "listDirectory"
  | "readFilePreview"
  | "createFile"
  | "createDirectory"
  | "renameFile"
  | "deleteFile"
>;

function createFileBrowserAppServerClient(): FileBrowserAppServerClient {
  return new AppServerClient();
}

async function invokeFileBrowserCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实文件管理 current 通道");
  return result as T;
}

function normalizeDirectoryListing(
  listing: AppServerFileSystemDirectoryListing,
): DirectoryListing {
  return {
    ...listing,
    entries: listing.entries.map((entry) => ({
      ...entry,
      iconDataUrl: entry.iconDataUrl ?? null,
    })),
  };
}

function normalizeFilePreview(
  preview: AppServerFileSystemFilePreview,
): FilePreview {
  return preview;
}

export async function listDirectory(path: string): Promise<DirectoryListing> {
  const response = await createFileBrowserAppServerClient().listDirectory({
    path,
  });
  return normalizeDirectoryListing(response.result);
}

export async function getFileManagerLocations(): Promise<
  FileManagerLocation[]
> {
  return invokeFileBrowserCommand<FileManagerLocation[]>(
    "get_file_manager_locations",
  );
}

export async function getFileIconDataUrl(path: string): Promise<string | null> {
  return invokeFileBrowserCommand<string | null>("get_file_icon_data_url", {
    path,
  });
}

export async function readFilePreview(
  path: string,
  maxSize: number,
): Promise<FilePreview> {
  const response = await createFileBrowserAppServerClient().readFilePreview({
    path,
    maxSize,
  });
  return normalizeFilePreview(response.result);
}

export async function createFileAtPath(path: string): Promise<void> {
  await createFileBrowserAppServerClient().createFile({ path });
}

export async function createDirectoryAtPath(path: string): Promise<void> {
  await createFileBrowserAppServerClient().createDirectory({ path });
}

export async function renamePath(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await createFileBrowserAppServerClient().renameFile({ oldPath, newPath });
}

export async function deletePath(
  path: string,
  recursive: boolean,
): Promise<void> {
  await createFileBrowserAppServerClient().deleteFile({ path, recursive });
}
