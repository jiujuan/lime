/**
 * 项目管理 API
 *
 * 提供项目（Project）和内容（Content）的 CRUD 操作
 */

import { AppServerClient } from "@/lib/api/appServer";
import { normalizeThemeType } from "@/lib/workspace/workbenchContract";
import type { WorkspaceSettings } from "@/types/workspace";
import {
  METHOD_WORKSPACE_BY_PATH_READ,
  METHOD_WORKSPACE_DEFAULT_ENSURE,
  METHOD_WORKSPACE_DEFAULT_READ,
  METHOD_WORKSPACE_ENSURE_READY,
  METHOD_WORKSPACE_LIST,
  METHOD_WORKSPACE_PROJECTS_ROOT_READ,
  METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
  METHOD_WORKSPACE_READ,
} from "../../../packages/app-server-client/src/protocol";

type ProjectAppServerClient = Pick<AppServerClient, "request">;

type WorkspaceListAppServerResponse = {
  workspaces?: RawProject[] | null;
};

type WorkspaceReadAppServerResponse = {
  workspace?: RawProject | null;
};

type WorkspaceProjectsRootAppServerResponse = {
  rootPath?: string | null;
};

type WorkspaceProjectPathResolveAppServerResponse = {
  rootPath?: string | null;
};

type WorkspaceEnsureReadyAppServerResponse = {
  result?: WorkspaceEnsureResult | null;
};

async function requestProjectAppServer<T>(
  method: string,
  params?: unknown,
  appServerClient: ProjectAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

function rejectRetiredWorkspaceContentCommand(command: string): never {
  throw new Error(
    `${command} is retired until Workspace writes and Content CRUD move to App Server current methods`,
  );
}

// ==================== 类型定义 ====================

/** 系统级类型（不在 UI 中显示） */
export type SystemType = "persistent" | "temporary";

/** 用户级类型（现役入口已收口为 general） */
export type UserType = "general";

/** 项目类型（系统级 + 用户级） */
export type ProjectType = SystemType | UserType;

/** 用户可选的项目类型列表 */
export const USER_PROJECT_TYPES: UserType[] = ["general"];

/** 项目类型配置 */
export interface ProjectTypeConfig {
  label: string;
  icon: string;
  defaultContentType: ContentType;
  canvasType: string | null;
}

/** 统一的项目类型配置 */
export const TYPE_CONFIGS: Record<ProjectType, ProjectTypeConfig> = {
  // 系统级类型
  persistent: {
    label: "持久化",
    icon: "📁",
    defaultContentType: "document",
    canvasType: null,
  },
  temporary: {
    label: "临时",
    icon: "📂",
    defaultContentType: "document",
    canvasType: null,
  },
  // 用户级类型
  general: {
    label: "通用对话",
    icon: "💬",
    defaultContentType: "content",
    canvasType: null,
  },
};

/** 内容类型 */
export type ContentType =
  | "episode"
  | "chapter"
  | "post"
  | "document"
  | "content";

/** 内容状态 */
export type ContentStatus = "draft" | "completed" | "published";

/** 项目统计信息 */
export interface ProjectStats {
  content_count: number;
  total_words: number;
  completed_count: number;
  last_accessed?: number;
}

/** 项目列表项 */
export interface Project {
  id: string;
  name: string;
  workspaceType: ProjectType;
  rootPath: string;
  isDefault: boolean;
  settings?: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
  icon?: string;
  color?: string;
  isFavorite: boolean;
  isArchived: boolean;
  tags: string[];
  defaultPersonaId?: string;
  stats?: ProjectStats;
}

export type RawProject = Partial<Project> & {
  id: string;
  name: string;
  workspace_type?: ProjectType | string;
  root_path?: string;
  is_default?: boolean;
  created_at?: number;
  updated_at?: number;
  is_favorite?: boolean;
  is_archived?: boolean;
  default_persona_id?: string;
};

interface ProjectDetailCacheEntry {
  value: Project | null;
  expiresAt: number;
}

const PROJECT_DETAIL_CACHE_TTL_MS = 1_000;
const projectDetailCache = new Map<string, ProjectDetailCacheEntry>();
const projectDetailInflight = new Map<string, Promise<Project | null>>();

function resolveProjectDetailCacheKey(id: string): string {
  return id.trim() || id;
}

function cloneProject(project: Project | null): Project | null {
  if (!project) {
    return null;
  }

  return {
    ...project,
    settings: project.settings ? { ...project.settings } : undefined,
    stats: project.stats ? { ...project.stats } : undefined,
    tags: [...project.tags],
  };
}

function readCachedProjectDetail(key: string):
  | {
      hit: true;
      value: Project | null;
    }
  | { hit: false } {
  const entry = projectDetailCache.get(key);
  if (!entry) {
    return { hit: false };
  }

  if (entry.expiresAt <= Date.now()) {
    projectDetailCache.delete(key);
    return { hit: false };
  }

  return { hit: true, value: cloneProject(entry.value) };
}

function writeCachedProjectDetail(key: string, value: Project | null): void {
  projectDetailCache.set(key, {
    value: cloneProject(value),
    expiresAt: Date.now() + PROJECT_DETAIL_CACHE_TTL_MS,
  });
}

export function clearProjectDetailCacheForTests(): void {
  projectDetailCache.clear();
  projectDetailInflight.clear();
  resetDefaultProjectCache();
}

/** 内容列表项 */
export interface ContentListItem {
  id: string;
  project_id: string;
  title: string;
  content_type: string;
  status: string;
  order: number;
  word_count: number;
  metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

/** 内容详情 */
export interface ContentDetail extends ContentListItem {
  body: string;
  metadata?: Record<string, unknown>;
  session_id?: string;
}

export interface GeneralWorkbenchVersionState {
  id: string;
  created_at: number;
  description?: string;
  status?: "in_progress" | "pending" | "merged" | "candidate";
  is_current: boolean;
}

export interface GeneralWorkbenchDocumentState {
  content_id: string;
  current_version_id: string;
  version_count: number;
  versions: GeneralWorkbenchVersionState[];
}

/** 创建项目请求 */
export interface CreateProjectRequest {
  name: string;
  rootPath: string;
  workspaceType?: ProjectType;
}

/** 更新项目请求 */
export interface UpdateProjectRequest {
  name?: string;
  rootPath?: string;
  settings?: WorkspaceSettings;
  icon?: string;
  color?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  tags?: string[];
  defaultPersonaId?: string;
}

export interface WorkspaceEnsureResult {
  workspaceId: string;
  rootPath: string;
  existed: boolean;
  created: boolean;
  repaired: boolean;
  relocated?: boolean;
  previousRootPath?: string | null;
  warning?: string | null;
}

/** 创建内容请求 */
export interface CreateContentRequest {
  project_id: string;
  title: string;
  content_type?: ContentType;
  order?: number;
  body?: string;
  metadata?: Record<string, unknown>;
}

/** 更新内容请求 */
export interface UpdateContentRequest {
  title?: string;
  status?: ContentStatus;
  order?: number;
  body?: string;
  metadata?: Record<string, unknown>;
  session_id?: string;
}

/** 内容列表查询参数 */
export interface ListContentQuery {
  status?: ContentStatus;
  content_type?: ContentType;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

// ==================== 项目 API ====================

/** 创建项目 */
export async function createProject(
  request: CreateProjectRequest,
): Promise<Project> {
  void request;
  return rejectRetiredWorkspaceContentCommand("workspace_create");
}

/** 获取统一 workspace 项目根目录 */
export async function getWorkspaceProjectsRoot(): Promise<string> {
  const response =
    await requestProjectAppServer<WorkspaceProjectsRootAppServerResponse>(
      METHOD_WORKSPACE_PROJECTS_ROOT_READ,
      {},
    );
  if (!response.rootPath) {
    throw new Error(
      "App Server workspace/projectsRoot/read did not return rootPath",
    );
  }
  return response.rootPath;
}

/** 按项目名称和父目录解析最终项目目录 */
export async function resolveProjectRootPath(
  name: string,
  parentRootPath?: string,
): Promise<string> {
  const request: { name: string; parentRootPath?: string } = { name };
  const normalizedParentRootPath = parentRootPath?.trim();
  if (normalizedParentRootPath) {
    request.parentRootPath = normalizedParentRootPath;
  }

  const response =
    await requestProjectAppServer<WorkspaceProjectPathResolveAppServerResponse>(
      METHOD_WORKSPACE_PROJECT_PATH_RESOLVE,
      request,
    );
  if (!response.rootPath) {
    throw new Error(
      "App Server workspace/projectPath/resolve did not return rootPath",
    );
  }
  return response.rootPath;
}

/** 获取项目列表 */
export async function listProjects(): Promise<Project[]> {
  const response =
    await requestProjectAppServer<WorkspaceListAppServerResponse>(
      METHOD_WORKSPACE_LIST,
      {},
    );
  const projects = response.workspaces;
  // 防御性编程：确保返回数组
  if (!Array.isArray(projects)) {
    console.warn("listProjects 返回非数组值:", projects);
    return [];
  }
  return projects.map((project) => normalizeProject(project));
}

/** 获取默认项目 */
export async function getDefaultProject(): Promise<Project | null> {
  const response =
    await requestProjectAppServer<WorkspaceReadAppServerResponse>(
      METHOD_WORKSPACE_DEFAULT_READ,
      {},
    );
  const project = response.workspace;
  return project ? normalizeProject(project) : null;
}

/** 获取默认项目，缺失时抛出错误 */
export async function requireDefaultProject(
  errorMessage: string = "未找到默认工作区，请先创建或选择项目",
): Promise<Project> {
  const project = await getDefaultProject();
  if (!project?.id) {
    throw new Error(errorMessage);
  }
  return project;
}

/** 获取默认项目 ID，缺失时抛出错误 */
export async function requireDefaultProjectId(
  errorMessage?: string,
): Promise<string> {
  const project = await requireDefaultProject(errorMessage);
  return project.id;
}

/** 确保工作区目录就绪 */
export async function ensureWorkspaceReady(
  id: string,
): Promise<WorkspaceEnsureResult> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw new Error("workspace id is required to ensure App Server workspace");
  }
  const response =
    await requestProjectAppServer<WorkspaceEnsureReadyAppServerResponse>(
      METHOD_WORKSPACE_ENSURE_READY,
      { id: normalizedId },
    );
  if (!response.result) {
    throw new Error("App Server workspace/ensureReady did not return result");
  }
  return response.result;
}

/** 确保默认工作区目录就绪 */
export async function ensureDefaultWorkspaceReady(): Promise<WorkspaceEnsureResult | null> {
  const defaultWorkspace =
    await requestProjectAppServer<WorkspaceReadAppServerResponse>(
      METHOD_WORKSPACE_DEFAULT_ENSURE,
      {},
    );
  const workspaceId = readProjectId(defaultWorkspace.workspace);
  if (!workspaceId) {
    return null;
  }
  return ensureWorkspaceReady(workspaceId);
}

function readProjectId(project: RawProject | null | undefined): string | null {
  const id = project?.id?.trim();
  return id || null;
}

async function ensureDefaultProjectThroughAppServer(): Promise<Project> {
  const response =
    await requestProjectAppServer<WorkspaceReadAppServerResponse>(
      METHOD_WORKSPACE_DEFAULT_ENSURE,
      {},
    );
  const project = response.workspace;
  if (!project) {
    throw new Error(
      "App Server workspace/default/ensure did not return workspace",
    );
  }
  return normalizeProject(project);
}

/** 设置默认项目 */
export async function setDefaultProject(id: string): Promise<void> {
  void id;
  return rejectRetiredWorkspaceContentCommand("workspace_set_default");
}

/** 获取或创建默认项目 */
// 默认项目缓存
let defaultProjectCache: {
  value: Project | null;
  expiresAt: number;
  promise: Promise<Project> | null;
} = {
  value: null,
  expiresAt: 0,
  promise: null,
};

const DEFAULT_PROJECT_CACHE_TTL_MS = 5_000; // 5秒缓存

function resetDefaultProjectCache(): void {
  defaultProjectCache = {
    value: null,
    expiresAt: 0,
    promise: null,
  };
}

export async function getOrCreateDefaultProject(): Promise<Project> {
  // 检查缓存
  if (defaultProjectCache.value && defaultProjectCache.expiresAt > Date.now()) {
    return defaultProjectCache.value;
  }

  // 检查是否有进行中的请求
  if (defaultProjectCache.promise) {
    return defaultProjectCache.promise;
  }

  // 创建新请求
  const promise = ensureDefaultProjectThroughAppServer()
    .then((normalized) => {
      // 更新缓存
      defaultProjectCache = {
        value: normalized,
        expiresAt: Date.now() + DEFAULT_PROJECT_CACHE_TTL_MS,
        promise: null,
      };
      return normalized;
    })
    .catch((error) => {
      // 清除失败的 promise
      defaultProjectCache.promise = null;
      throw error;
    });

  defaultProjectCache.promise = promise;
  return promise;
}

/**
 * 预加载默认项目
 * 在应用启动时调用,避免首次访问时的延迟
 */
export function preloadDefaultProject(): void {
  void getOrCreateDefaultProject().catch(() => {
    // 静默失败,不影响应用启动
  });
}

/** 通过根路径获取项目 */
export async function getProjectByRootPath(
  rootPath: string,
): Promise<Project | null> {
  const response =
    await requestProjectAppServer<WorkspaceReadAppServerResponse>(
      METHOD_WORKSPACE_BY_PATH_READ,
      { rootPath },
    );
  const project = response.workspace;
  return project ? normalizeProject(project) : null;
}

/** 获取项目详情 */
export async function getProject(id: string): Promise<Project | null> {
  const cacheKey = resolveProjectDetailCacheKey(id);
  const cached = readCachedProjectDetail(cacheKey);
  if (cached.hit) {
    return cached.value;
  }

  const inflight = projectDetailInflight.get(cacheKey);
  if (inflight) {
    return cloneProject(await inflight);
  }

  const request = requestProjectAppServer<WorkspaceReadAppServerResponse>(
    METHOD_WORKSPACE_READ,
    { id },
  )
    .then((project) => {
      const normalized = project.workspace
        ? normalizeProject(project.workspace)
        : null;
      writeCachedProjectDetail(cacheKey, normalized);
      return normalized;
    })
    .finally(() => {
      projectDetailInflight.delete(cacheKey);
    });
  projectDetailInflight.set(cacheKey, request);

  return cloneProject(await request);
}

/** 更新项目 */
export async function updateProject(
  id: string,
  request: UpdateProjectRequest,
): Promise<Project> {
  void id;
  void request;
  return rejectRetiredWorkspaceContentCommand("workspace_update");
}

/** 删除项目 */
export async function deleteProject(
  id: string,
  deleteDirectory?: boolean,
): Promise<boolean> {
  void id;
  void deleteDirectory;
  return rejectRetiredWorkspaceContentCommand("workspace_delete");
}

// ==================== 内容 API ====================

/** 创建内容 */
export async function createContent(
  request: CreateContentRequest,
): Promise<ContentDetail> {
  void request;
  return rejectRetiredWorkspaceContentCommand("content_create");
}

/** 获取内容详情 */
export async function getContent(id: string): Promise<ContentDetail | null> {
  void id;
  return rejectRetiredWorkspaceContentCommand("content_get");
}

/** 获取工作区文稿版本状态（后端解析 content.metadata，并兼容旧协议元数据键） */
export async function getGeneralWorkbenchDocumentState(
  id: string,
): Promise<GeneralWorkbenchDocumentState | null> {
  void id;
  return rejectRetiredWorkspaceContentCommand(
    "content_get_general_workbench_document_state",
  );
}

/** 获取项目的内容列表 */
export async function listContents(
  projectId: string,
  query?: ListContentQuery,
): Promise<ContentListItem[]> {
  void projectId;
  void query;
  return rejectRetiredWorkspaceContentCommand("content_list");
}

/** 更新内容 */
export async function updateContent(
  id: string,
  request: UpdateContentRequest,
): Promise<ContentDetail> {
  void id;
  void request;
  return rejectRetiredWorkspaceContentCommand("content_update");
}

/** 删除内容 */
export async function deleteContent(id: string): Promise<boolean> {
  void id;
  return rejectRetiredWorkspaceContentCommand("content_delete");
}

/** 重新排序内容 */
export async function reorderContents(
  projectId: string,
  contentIds: string[],
): Promise<void> {
  void projectId;
  void contentIds;
  return rejectRetiredWorkspaceContentCommand("content_reorder");
}

/** 获取项目内容统计 */
export async function getContentStats(
  projectId: string,
): Promise<[number, number, number]> {
  void projectId;
  return rejectRetiredWorkspaceContentCommand("content_stats");
}

// ==================== 辅助函数 ====================

/** 规范化项目对象字段 */
export function normalizeProject(project: RawProject): Project {
  const rawWorkspaceType = String(
    project.workspaceType ?? project.workspace_type ?? "persistent",
  )
    .trim()
    .toLowerCase();
  const workspaceType: ProjectType =
    rawWorkspaceType === "persistent" || rawWorkspaceType === "temporary"
      ? rawWorkspaceType
      : normalizeThemeType(rawWorkspaceType);

  return {
    id: project.id,
    name: project.name,
    workspaceType,
    rootPath: project.rootPath ?? project.root_path ?? "",
    isDefault: project.isDefault ?? project.is_default ?? false,
    settings: project.settings,
    createdAt: project.createdAt ?? project.created_at ?? 0,
    updatedAt: project.updatedAt ?? project.updated_at ?? 0,
    icon: project.icon,
    color: project.color,
    isFavorite: project.isFavorite ?? project.is_favorite ?? false,
    isArchived: project.isArchived ?? project.is_archived ?? false,
    tags: project.tags ?? [],
    defaultPersonaId:
      project.defaultPersonaId ?? project.default_persona_id ?? undefined,
    stats: project.stats,
  };
}

/** 判断是否为用户级项目类型 */
export function isUserProjectType(type: ProjectType): boolean {
  return USER_PROJECT_TYPES.includes(type as UserType);
}

/** 获取项目类型的显示名称 */
export function getProjectTypeLabel(type: ProjectType): string {
  return TYPE_CONFIGS[type]?.label || type;
}

/** 获取项目类型的图标 */
export function getProjectTypeIcon(type: ProjectType): string {
  return TYPE_CONFIGS[type]?.icon || "📁";
}

/** 获取项目默认内容类型 */
export function getDefaultContentTypeForProject(
  projectType: ProjectType,
): ContentType {
  return TYPE_CONFIGS[projectType]?.defaultContentType || "document";
}

/** 获取项目类型对应的画布类型 */
export function getCanvasTypeForProjectType(
  projectType: ProjectType,
): string | null {
  return TYPE_CONFIGS[projectType]?.canvasType || null;
}

/** 获取内容类型的显示名称 */
export function getContentTypeLabel(type: ContentType): string {
  const labels: Record<ContentType, string> = {
    episode: "剧集",
    chapter: "章节",
    post: "帖子",
    document: "文档",
    content: "内容",
  };
  return labels[type] || type;
}

/** 获取内容状态的显示名称 */
export function getContentStatusLabel(status: ContentStatus): string {
  const labels: Record<ContentStatus, string> = {
    draft: "草稿",
    completed: "已完成",
    published: "已发布",
  };
  return labels[status] || status;
}

export interface CreateProjectErrorMessageCopy {
  invalidPath: string;
  objectError: string;
  pathExists: string;
  staleSchema: string;
  unknown: string;
}

const DEFAULT_CREATE_PROJECT_ERROR_MESSAGE_COPY: CreateProjectErrorMessageCopy =
  {
    invalidPath: "项目目录无效，请重新选择",
    objectError: "创建项目失败，请查看日志",
    pathExists: "项目目录已存在，请更换项目名称或清理同名目录",
    staleSchema: "数据库结构过旧，请重启应用以执行迁移",
    unknown: "未知错误",
  };

/** 解析创建项目的错误信息 */
export function getCreateProjectErrorMessage(
  message: string,
  copy: CreateProjectErrorMessageCopy = DEFAULT_CREATE_PROJECT_ERROR_MESSAGE_COPY,
): string {
  if (!message) {
    return copy.unknown;
  }
  if (message === "[object Object]") {
    return copy.objectError;
  }
  if (message.includes("路径已存在")) {
    return copy.pathExists;
  }
  if (message.includes("no such column") || message.includes("has no column")) {
    return copy.staleSchema;
  }
  if (message.includes("无效的路径")) {
    return copy.invalidPath;
  }
  return message;
}

/** 提取异常中的错误消息 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }

  return String(error);
}

/** 格式化字数 */
export function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toLocaleString();
}

/** 格式化相对时间 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) {
    return "刚刚";
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)}天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)}周前`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}
