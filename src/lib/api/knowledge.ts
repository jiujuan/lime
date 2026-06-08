import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
  METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
  METHOD_KNOWLEDGE_PACK_COMPILE,
  METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
  METHOD_KNOWLEDGE_PACK_LIST,
  METHOD_KNOWLEDGE_PACK_READ,
  METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
  METHOD_KNOWLEDGE_SOURCE_IMPORT,
  type KnowledgeCompilePackResponse as AppServerKnowledgeCompilePackResponse,
  type KnowledgeContextResolutionResponse as AppServerKnowledgeContextResolutionResponse,
  type KnowledgeImportSourceResponse as AppServerKnowledgeImportSourceResponse,
  type KnowledgeListPacksResponse as AppServerKnowledgeListPacksResponse,
  type KnowledgeReadPackResponse as AppServerKnowledgeReadPackResponse,
  type KnowledgeSetDefaultPackResponse as AppServerKnowledgeSetDefaultPackResponse,
  type KnowledgeUpdatePackStatusResponse as AppServerKnowledgeUpdatePackStatusResponse,
  type KnowledgeValidateContextRunResponse as AppServerKnowledgeValidateContextRunResponse,
} from "../../../packages/app-server-client/src/protocol";

export type KnowledgeAppServerClient = Pick<AppServerClient, "request">;

export interface KnowledgeListPacksOptions {
  appServerClient?: KnowledgeAppServerClient;
}

async function requestKnowledgeAppServer<T>(
  method: string,
  params?: unknown,
  appServerClient: KnowledgeAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnowledgePackDetail(
  command: string,
  value: unknown,
): asserts value is KnowledgePackDetail {
  if (
    !isRecord(value) ||
    !isRecord(value.metadata) ||
    typeof value.rootPath !== "string"
  ) {
    throw new Error(`${command} did not return a knowledge pack detail`);
  }
}

function assertKnowledgeFileEntry(
  command: string,
  value: unknown,
  label: string,
): asserts value is KnowledgePackFileEntry {
  if (!isRecord(value) || typeof value.relativePath !== "string") {
    throw new Error(`${command} did not return ${label}`);
  }
}

function assertKnowledgeImportSourceResponse(
  command: string,
  value: unknown,
): asserts value is KnowledgeImportSourceResponse {
  if (!isRecord(value)) {
    throw new Error(`${command} did not return an import source result`);
  }
  assertKnowledgePackDetail(command, value.pack);
  assertKnowledgeFileEntry(command, value.source, "an imported source file");
}

function assertKnowledgeCompilePackResponse(
  command: string,
  value: unknown,
): asserts value is KnowledgeCompilePackResponse {
  if (
    !isRecord(value) ||
    typeof value.selectedSourceCount !== "number" ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error(`${command} did not return a compile result`);
  }
  assertKnowledgePackDetail(command, value.pack);
  assertKnowledgeFileEntry(command, value.compiledView, "a compiled view file");
  assertKnowledgeFileEntry(command, value.run, "a compile run file");
}

function assertKnowledgeSetDefaultPackResponse(
  command: string,
  value: unknown,
): asserts value is KnowledgeSetDefaultPackResponse {
  if (
    !isRecord(value) ||
    typeof value.defaultPackName !== "string" ||
    typeof value.defaultMarkerPath !== "string"
  ) {
    throw new Error(`${command} did not return a default pack result`);
  }
}

function assertKnowledgeUpdatePackStatusResponse(
  command: string,
  value: unknown,
): asserts value is KnowledgeUpdatePackStatusResponse {
  if (
    !isRecord(value) ||
    typeof value.previousStatus !== "string" ||
    typeof value.clearedDefault !== "boolean"
  ) {
    throw new Error(`${command} did not return a status update result`);
  }
  assertKnowledgePackDetail(command, value.pack);
}

function assertKnowledgeContextResolution(
  command: string,
  value: unknown,
): asserts value is KnowledgeContextResolution {
  if (
    !isRecord(value) ||
    typeof value.packName !== "string" ||
    typeof value.status !== "string" ||
    typeof value.fencedContext !== "string" ||
    typeof value.tokenEstimate !== "number" ||
    !Array.isArray(value.selectedViews) ||
    !Array.isArray(value.selectedFiles) ||
    !Array.isArray(value.sourceAnchors) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.missing)
  ) {
    throw new Error(`${command} did not return a context resolution`);
  }
}

function assertKnowledgeValidateContextRunResponse(
  command: string,
  value: unknown,
): asserts value is KnowledgeValidateContextRunResponse {
  if (
    !isRecord(value) ||
    typeof value.valid !== "boolean" ||
    !Array.isArray(value.errors) ||
    !Array.isArray(value.warnings)
  ) {
    throw new Error(`${command} did not return a context run validation`);
  }
}

function requireAppServerString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeKnowledgeListPacksResponse(
  response: AppServerKnowledgeListPacksResponse | null | undefined,
): KnowledgeListPacksResponse {
  if (!response || typeof response !== "object") {
    throw new Error("App Server knowledgePack/list did not return packs");
  }

  if (!Array.isArray(response.packs)) {
    throw new Error("App Server knowledgePack/list did not return packs");
  }

  return {
    workingDir: requireAppServerString(
      response.workingDir,
      "App Server knowledgePack/list did not return workingDir",
    ),
    rootPath: requireAppServerString(
      response.rootPath,
      "App Server knowledgePack/list did not return rootPath",
    ),
    packs: response.packs as KnowledgePackSummary[],
  };
}

function normalizeKnowledgeReadPackResponse(
  response: AppServerKnowledgeReadPackResponse | null | undefined,
): KnowledgePackDetail {
  if (!response || typeof response !== "object") {
    throw new Error("App Server knowledgePack/read did not return pack");
  }

  assertKnowledgePackDetail(METHOD_KNOWLEDGE_PACK_READ, response.pack);
  return response.pack;
}

function normalizeKnowledgeImportSourceResponse(
  response: AppServerKnowledgeImportSourceResponse | null | undefined,
): KnowledgeImportSourceResponse {
  assertKnowledgeImportSourceResponse(METHOD_KNOWLEDGE_SOURCE_IMPORT, response);
  return response;
}

function normalizeKnowledgeCompilePackResponse(
  response: AppServerKnowledgeCompilePackResponse | null | undefined,
): KnowledgeCompilePackResponse {
  assertKnowledgeCompilePackResponse(METHOD_KNOWLEDGE_PACK_COMPILE, response);
  return response;
}

function normalizeKnowledgeSetDefaultPackResponse(
  response: AppServerKnowledgeSetDefaultPackResponse | null | undefined,
): KnowledgeSetDefaultPackResponse {
  assertKnowledgeSetDefaultPackResponse(
    METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
    response,
  );
  return response;
}

function normalizeKnowledgeUpdatePackStatusResponse(
  response: AppServerKnowledgeUpdatePackStatusResponse | null | undefined,
): KnowledgeUpdatePackStatusResponse {
  assertKnowledgeUpdatePackStatusResponse(
    METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
    response,
  );
  return response;
}

function normalizeKnowledgeContextResolutionResponse(
  response: AppServerKnowledgeContextResolutionResponse | null | undefined,
): KnowledgeContextResolution {
  assertKnowledgeContextResolution(METHOD_KNOWLEDGE_CONTEXT_RESOLVE, response);
  return response as KnowledgeContextResolution;
}

function normalizeKnowledgeValidateContextRunResponse(
  response: AppServerKnowledgeValidateContextRunResponse | null | undefined,
): KnowledgeValidateContextRunResponse {
  assertKnowledgeValidateContextRunResponse(
    METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
    response,
  );
  return response;
}

export type KnowledgePackStatus =
  | "draft"
  | "ready"
  | "needs-review"
  | "stale"
  | "disputed"
  | "archived"
  | string;

export interface KnowledgePackMetadata {
  name: string;
  description: string;
  type: string;
  profile?: "document-first" | "wiki-first" | "hybrid" | string | null;
  status: KnowledgePackStatus;
  version?: string | null;
  language?: string | null;
  license?: string | null;
  maintainers: string[];
  scope?: string | null;
  trust?: string | null;
  grounding?: string | null;
  runtime?: {
    mode?: "data" | "persona" | string | null;
    [key: string]: unknown;
  } | null;
  metadata?: {
    limeTemplate?: string;
    primaryDocument?: string;
    producedBy?: {
      kind?: string;
      name?: string;
      version?: string;
      digest?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  } | null;
}

export interface KnowledgePackSummary {
  metadata: KnowledgePackMetadata;
  rootPath: string;
  knowledgePath: string;
  defaultForWorkspace: boolean;
  updatedAt: number;
  sourceCount: number;
  documentCount?: number;
  wikiCount: number;
  compiledCount: number;
  runCount: number;
  preview?: string | null;
}

export interface KnowledgePackFileEntry {
  relativePath: string;
  absolutePath: string;
  bytes: number;
  updatedAt: number;
  sha256?: string | null;
  preview?: string | null;
}

export interface KnowledgePackDetail extends KnowledgePackSummary {
  guide: string;
  documents?: KnowledgePackFileEntry[];
  sources: KnowledgePackFileEntry[];
  wiki: KnowledgePackFileEntry[];
  compiled: KnowledgePackFileEntry[];
  runs: KnowledgePackFileEntry[];
}

export interface KnowledgeListPacksRequest {
  workingDir: string;
  includeArchived?: boolean;
}

export interface KnowledgeListPacksResponse {
  workingDir: string;
  rootPath: string;
  packs: KnowledgePackSummary[];
}

export interface KnowledgeImportSourceRequest {
  workingDir: string;
  packName: string;
  description?: string;
  packType?: string;
  language?: string;
  sourceFileName?: string;
  sourceText?: string;
}

export interface KnowledgeImportSourceResponse {
  pack: KnowledgePackDetail;
  source: KnowledgePackFileEntry;
}

export interface KnowledgeBuilderRuntimeOptions {
  enabled?: boolean;
  providerOverride?: string;
  modelOverride?: string;
  sessionId?: string;
}

export interface KnowledgeCompilePackResponse {
  pack: KnowledgePackDetail;
  selectedSourceCount: number;
  compiledView: KnowledgePackFileEntry;
  run: KnowledgePackFileEntry;
  warnings: string[];
}

export interface KnowledgeSetDefaultPackResponse {
  defaultPackName: string;
  defaultMarkerPath: string;
}

export interface KnowledgeUpdatePackStatusRequest {
  workingDir: string;
  name: string;
  status: KnowledgePackStatus;
}

export interface KnowledgeUpdatePackStatusResponse {
  pack: KnowledgePackDetail;
  previousStatus: KnowledgePackStatus;
  clearedDefault: boolean;
}

export interface KnowledgeResolveContextRequest {
  workingDir: string;
  name: string;
  packs?: Array<{
    name: string;
    activation?: "explicit" | "implicit" | "resolver-driven";
  }>;
  task?: string;
  maxChars?: number;
  activation?: "explicit" | "implicit" | "resolver-driven";
  writeRun?: boolean;
  runReason?: string;
}

export interface KnowledgeContextView {
  packName?: string | null;
  relativePath: string;
  tokenEstimate: number;
  charCount: number;
  sourceAnchors: string[];
}

export interface KnowledgeContextWarning {
  severity: "info" | "warning" | "error" | string;
  path?: string | null;
  message: string;
}

export interface KnowledgeContextResolution {
  packName: string;
  status: KnowledgePackStatus;
  grounding?: string | null;
  selectedViews: KnowledgeContextView[];
  selectedFiles: string[];
  sourceAnchors: string[];
  warnings: KnowledgeContextWarning[];
  missing: string[];
  tokenEstimate: number;
  fencedContext: string;
  runId?: string | null;
  runPath?: string | null;
}

export interface KnowledgeValidateContextRunRequest {
  workingDir: string;
  name: string;
  runPath: string;
}

export interface KnowledgeValidateContextRunResponse {
  valid: boolean;
  runId?: string | null;
  status?: string | null;
  errors: string[];
  warnings: string[];
}

export async function listKnowledgePacks(
  request: KnowledgeListPacksRequest,
  options: KnowledgeListPacksOptions = {},
): Promise<KnowledgeListPacksResponse> {
  const normalizedWorkingDir = request.workingDir.trim();
  if (!normalizedWorkingDir) {
    throw new Error(
      "workingDir is required to list App Server knowledge packs",
    );
  }

  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeListPacksResponse>(
      METHOD_KNOWLEDGE_PACK_LIST,
      {
        workingDir: normalizedWorkingDir,
        includeArchived: request.includeArchived ?? false,
      },
      options.appServerClient,
    );
  return normalizeKnowledgeListPacksResponse(response);
}

export async function getKnowledgePack(
  workingDir: string,
  name: string,
): Promise<KnowledgePackDetail> {
  const normalizedWorkingDir = workingDir.trim();
  const normalizedName = name.trim();
  if (!normalizedWorkingDir) {
    throw new Error(
      "workingDir is required to read App Server knowledge pack",
    );
  }
  if (!normalizedName) {
    throw new Error("name is required to read App Server knowledge pack");
  }

  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeReadPackResponse>(
      METHOD_KNOWLEDGE_PACK_READ,
      {
        workingDir: normalizedWorkingDir,
        name: normalizedName,
      },
    );
  return normalizeKnowledgeReadPackResponse(response);
}

export async function importKnowledgeSource(
  request: KnowledgeImportSourceRequest,
): Promise<KnowledgeImportSourceResponse> {
  const normalizedWorkingDir = requireAppServerString(
    request.workingDir,
    "workingDir is required to import App Server knowledge source",
  );
  const normalizedPackName = requireAppServerString(
    request.packName,
    "packName is required to import App Server knowledge source",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeImportSourceResponse>(
      METHOD_KNOWLEDGE_SOURCE_IMPORT,
      {
        ...request,
        workingDir: normalizedWorkingDir,
        packName: normalizedPackName,
      },
    );
  return normalizeKnowledgeImportSourceResponse(response);
}

export async function compileKnowledgePack(
  workingDir: string,
  name: string,
  builderRuntime?: KnowledgeBuilderRuntimeOptions,
): Promise<KnowledgeCompilePackResponse> {
  const normalizedWorkingDir = requireAppServerString(
    workingDir,
    "workingDir is required to compile App Server knowledge pack",
  );
  const normalizedName = requireAppServerString(
    name,
    "name is required to compile App Server knowledge pack",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeCompilePackResponse>(
      METHOD_KNOWLEDGE_PACK_COMPILE,
      {
        workingDir: normalizedWorkingDir,
        name: normalizedName,
        ...(builderRuntime ? { builderRuntime } : {}),
      },
    );
  return normalizeKnowledgeCompilePackResponse(response);
}

export async function setDefaultKnowledgePack(
  workingDir: string,
  name: string,
): Promise<KnowledgeSetDefaultPackResponse> {
  const normalizedWorkingDir = requireAppServerString(
    workingDir,
    "workingDir is required to set App Server default knowledge pack",
  );
  const normalizedName = requireAppServerString(
    name,
    "name is required to set App Server default knowledge pack",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeSetDefaultPackResponse>(
      METHOD_KNOWLEDGE_PACK_DEFAULT_SET,
      {
        workingDir: normalizedWorkingDir,
        name: normalizedName,
      },
    );
  return normalizeKnowledgeSetDefaultPackResponse(response);
}

export async function updateKnowledgePackStatus(
  request: KnowledgeUpdatePackStatusRequest,
): Promise<KnowledgeUpdatePackStatusResponse> {
  const normalizedWorkingDir = requireAppServerString(
    request.workingDir,
    "workingDir is required to update App Server knowledge pack status",
  );
  const normalizedName = requireAppServerString(
    request.name,
    "name is required to update App Server knowledge pack status",
  );
  const normalizedStatus = requireAppServerString(
    request.status,
    "status is required to update App Server knowledge pack status",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeUpdatePackStatusResponse>(
      METHOD_KNOWLEDGE_PACK_STATUS_UPDATE,
      {
        ...request,
        workingDir: normalizedWorkingDir,
        name: normalizedName,
        status: normalizedStatus,
      },
    );
  return normalizeKnowledgeUpdatePackStatusResponse(response);
}

export async function resolveKnowledgeContext(
  request: KnowledgeResolveContextRequest,
): Promise<KnowledgeContextResolution> {
  const normalizedWorkingDir = requireAppServerString(
    request.workingDir,
    "workingDir is required to resolve App Server knowledge context",
  );
  const normalizedName = requireAppServerString(
    request.name,
    "name is required to resolve App Server knowledge context",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeContextResolutionResponse>(
      METHOD_KNOWLEDGE_CONTEXT_RESOLVE,
      {
        ...request,
        workingDir: normalizedWorkingDir,
        name: normalizedName,
      },
    );
  return normalizeKnowledgeContextResolutionResponse(response);
}

export async function validateKnowledgeContextRun(
  request: KnowledgeValidateContextRunRequest,
): Promise<KnowledgeValidateContextRunResponse> {
  const normalizedWorkingDir = requireAppServerString(
    request.workingDir,
    "workingDir is required to validate App Server knowledge context run",
  );
  const normalizedName = requireAppServerString(
    request.name,
    "name is required to validate App Server knowledge context run",
  );
  const normalizedRunPath = requireAppServerString(
    request.runPath,
    "runPath is required to validate App Server knowledge context run",
  );
  const response =
    await requestKnowledgeAppServer<AppServerKnowledgeValidateContextRunResponse>(
      METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE,
      {
        ...request,
        workingDir: normalizedWorkingDir,
        name: normalizedName,
        runPath: normalizedRunPath,
      },
    );
  return normalizeKnowledgeValidateContextRunResponse(response);
}
