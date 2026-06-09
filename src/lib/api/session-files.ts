/**
 * 会话文件存储 API
 *
 * 提供与后端 session_files 模块的通信接口。
 * 参考 claude-code-open 的 ~/.claude/sessions 设计。
 *
 * @module lib/api/session-files
 */

import { safeInvoke } from "@/lib/dev-bridge";
import {
  openPathWithDefaultApp,
  revealPathInFinder,
} from "@/lib/api/fileSystem";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

// ============================================================================
// 类型定义
// ============================================================================

/** 会话元数据 */
export interface SessionMeta {
  /** 会话 ID */
  sessionId: string;
  /** 会话标题 */
  title?: string;
  /** 主题类型 */
  theme?: string;
  /** 创建模式 */
  creationMode?: string;
  /** 创建时间（Unix 时间戳，毫秒） */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 文件数量 */
  fileCount: number;
  /** 总文件大小（字节） */
  totalSize: number;
}

/** 会话文件信息 */
export interface SessionFile {
  /** 文件名 */
  name: string;
  /** 文件类型 */
  fileType: string;
  /** 文件元数据 */
  metadata?: Record<string, unknown>;
  /** 文件大小（字节） */
  size: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 会话摘要 */
export interface SessionSummary {
  /** 会话 ID */
  sessionId: string;
  /** 会话标题 */
  title?: string;
  /** 主题类型 */
  theme?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 文件数量 */
  fileCount: number;
}

/** 会话详情 */
export interface SessionDetail {
  /** 元数据 */
  meta: SessionMeta;
  /** 文件列表 */
  files: SessionFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertSessionMeta(
  command: string,
  value: unknown,
): asserts value is SessionMeta {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt) ||
    !isFiniteNumber(value.fileCount) ||
    !isFiniteNumber(value.totalSize)
  ) {
    throw new Error(`${command} did not return session metadata`);
  }
}

function assertSessionFile(
  command: string,
  value: unknown,
): asserts value is SessionFile {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.fileType !== "string" ||
    !isFiniteNumber(value.size) ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt)
  ) {
    throw new Error(`${command} did not return a session file`);
  }
}

function assertSessionSummary(
  command: string,
  value: unknown,
): asserts value is SessionSummary {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt) ||
    !isFiniteNumber(value.fileCount)
  ) {
    throw new Error(`${command} did not return a session summary`);
  }
}

function assertSessionDetail(
  command: string,
  value: unknown,
): asserts value is SessionDetail {
  if (!isRecord(value)) {
    throw new Error(`${command} did not return session detail`);
  }
  assertSessionMeta(command, value.meta);
  if (!Array.isArray(value.files)) {
    throw new Error(`${command} did not return session detail files`);
  }
  value.files.forEach((file, index) => {
    assertSessionFile(`${command}.files[${index}]`, file);
  });
}

function assertStringResult(command: string, value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${command} did not return a string`);
  }
}

function assertBooleanResult(
  command: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${command} did not return a boolean`);
  }
}

function assertNumberResult(command: string, value: unknown): asserts value is number {
  if (!isFiniteNumber(value)) {
    throw new Error(`${command} did not return a number`);
  }
}

function assertVoidResult(command: string, value: unknown): void {
  if (value !== null && value !== undefined) {
    throw new Error(`${command} did not return void result`);
  }
}

function assertImportDocumentToSessionResult(
  command: string,
  value: unknown,
): asserts value is [string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    typeof value[1] !== "string"
  ) {
    throw new Error(`${command} did not return imported document tuple`);
  }
}

function assertSessionFilesCommandResult(
  command: string,
  value: unknown,
): void {
  switch (command) {
    case "session_files_create":
    case "session_files_get_or_create":
    case "session_files_update_meta":
      assertSessionMeta(command, value);
      return;
    case "session_files_exists":
      assertBooleanResult(command, value);
      return;
    case "session_files_list":
      if (!Array.isArray(value)) {
        throw new Error(`${command} did not return session summaries`);
      }
      value.forEach((summary, index) => {
        assertSessionSummary(`${command}[${index}]`, summary);
      });
      return;
    case "session_files_get_detail":
      assertSessionDetail(command, value);
      return;
    case "session_files_save_file":
      assertSessionFile(command, value);
      return;
    case "session_files_delete":
    case "session_files_delete_file":
      assertVoidResult(command, value);
      return;
    case "session_files_read_file":
    case "session_files_resolve_file_path":
    case "upload_image_to_session":
    case "read_image_from_session":
    case "import_document":
      assertStringResult(command, value);
      return;
    case "session_files_list_files":
      if (!Array.isArray(value)) {
        throw new Error(`${command} did not return session files`);
      }
      value.forEach((file, index) => {
        assertSessionFile(`${command}[${index}]`, file);
      });
      return;
    case "session_files_cleanup_expired":
    case "session_files_cleanup_empty":
      assertNumberResult(command, value);
      return;
    case "import_document_to_session":
      assertImportDocumentToSessionResult(command, value);
      return;
    default:
      return;
  }
}

async function invokeSessionFilesCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke<unknown>(command, args)
    : await safeInvoke<unknown>(command);
  assertNotDiagnosticFacade(
    command,
    result,
    "真实 Session files current 通道",
  );
  assertSessionFilesCommandResult(command, result);
  return result as T;
}

// ============================================================================
// 会话管理 API
// ============================================================================

/**
 * 创建新会话
 */
export async function createSession(sessionId: string): Promise<SessionMeta> {
  return invokeSessionFilesCommand<SessionMeta>("session_files_create", {
    sessionId,
  });
}

/**
 * 检查会话是否存在
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  return invokeSessionFilesCommand<boolean>("session_files_exists", {
    sessionId,
  });
}

/**
 * 获取或创建会话
 */
export async function getOrCreateSession(
  sessionId: string,
): Promise<SessionMeta> {
  return invokeSessionFilesCommand<SessionMeta>(
    "session_files_get_or_create",
    { sessionId },
  );
}

/**
 * 删除会话
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await invokeSessionFilesCommand<void>("session_files_delete", {
    sessionId,
  });
}

/**
 * 列出所有会话
 */
export async function listSessions(): Promise<SessionSummary[]> {
  return invokeSessionFilesCommand<SessionSummary[]>("session_files_list");
}

/**
 * 获取会话详情
 */
export async function getSessionDetail(
  sessionId: string,
): Promise<SessionDetail> {
  return invokeSessionFilesCommand<SessionDetail>(
    "session_files_get_detail",
    { sessionId },
  );
}

/**
 * 更新会话元数据
 */
export async function updateSessionMeta(
  sessionId: string,
  updates: {
    title?: string;
    theme?: string;
    creationMode?: string;
  },
): Promise<SessionMeta> {
  return invokeSessionFilesCommand<SessionMeta>("session_files_update_meta", {
    sessionId,
    ...updates,
  });
}

// ============================================================================
// 文件管理 API
// ============================================================================

/**
 * 保存文件到会话
 */
export async function saveFile(
  sessionId: string,
  fileName: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<SessionFile> {
  return invokeSessionFilesCommand<SessionFile>("session_files_save_file", {
    sessionId,
    fileName,
    content,
    metadata,
  });
}

/**
 * 读取会话文件
 */
export async function readFile(
  sessionId: string,
  fileName: string,
): Promise<string> {
  return invokeSessionFilesCommand<string>("session_files_read_file", {
    sessionId,
    fileName,
  });
}

/**
 * 解析会话文件绝对路径
 */
export async function resolveFilePath(
  sessionId: string,
  fileName: string,
): Promise<string> {
  return invokeSessionFilesCommand<string>(
    "session_files_resolve_file_path",
    {
      sessionId,
      fileName,
    },
  );
}

/**
 * 在 Finder/文件管理器中定位会话文件
 */
export async function revealFileInFinder(
  sessionId: string,
  fileName: string,
): Promise<void> {
  const path = await resolveFilePath(sessionId, fileName);
  await revealPathInFinder(path);
}

/**
 * 使用系统默认应用打开会话文件
 */
export async function openFileWithDefaultApp(
  sessionId: string,
  fileName: string,
): Promise<void> {
  const path = await resolveFilePath(sessionId, fileName);
  await openPathWithDefaultApp(path);
}

/**
 * 删除会话文件
 */
export async function deleteFile(
  sessionId: string,
  fileName: string,
): Promise<void> {
  await invokeSessionFilesCommand<void>("session_files_delete_file", {
    sessionId,
    fileName,
  });
}

/**
 * 列出会话中的文件
 */
export async function listFiles(sessionId: string): Promise<SessionFile[]> {
  return invokeSessionFilesCommand<SessionFile[]>("session_files_list_files", {
    sessionId,
  });
}

// ============================================================================
// 清理 API
// ============================================================================

/**
 * 清理过期会话
 */
export async function cleanupExpired(maxAgeDays?: number): Promise<number> {
  return invokeSessionFilesCommand<number>("session_files_cleanup_expired", {
    maxAgeDays,
  });
}

/**
 * 清理空会话
 */
export async function cleanupEmpty(): Promise<number> {
  return invokeSessionFilesCommand<number>("session_files_cleanup_empty");
}

// ============================================================================
// 图片上传 API
// ============================================================================

/**
 * 上传图片到会话
 * @param sessionId 会话 ID
 * @param filePath 本地图片文件路径
 * @returns 图片在会话中的访问路径
 */
export async function uploadImageToSession(
  sessionId: string,
  filePath: string,
): Promise<string> {
  return invokeSessionFilesCommand<string>("upload_image_to_session", {
    sessionId,
    filePath,
  });
}

/**
 * 从会话中读取图片（返回 base64 编码）
 * @param sessionId 会话 ID
 * @param fileName 文件名
 * @returns base64 编码的图片数据
 */
export async function readImageFromSession(
  sessionId: string,
  fileName: string,
): Promise<string> {
  return invokeSessionFilesCommand<string>("read_image_from_session", {
    sessionId,
    fileName,
  });
}

// ============================================================================
// 文档导入 API
// ============================================================================

/**
 * 导入文档内容
 * @param filePath 本地文档文件路径
 * @returns 文档的文本内容
 */
export async function importDocument(filePath: string): Promise<string> {
  return invokeSessionFilesCommand<string>("import_document", { filePath });
}

/**
 * 导入文档并保存到会话
 * @param sessionId 会话 ID
 * @param filePath 本地文档文件路径
 * @returns [文档内容, 保存的文件名]
 */
export async function importDocumentToSession(
  sessionId: string,
  filePath: string,
): Promise<[string, string]> {
  return invokeSessionFilesCommand<[string, string]>(
    "import_document_to_session",
    {
      sessionId,
      filePath,
    },
  );
}
