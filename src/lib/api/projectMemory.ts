import { logAgentDebug } from "@/lib/agentDebug";
import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_PROJECT_MEMORY_READ,
  type ProjectMemoryReadResponse as AppServerProjectMemoryReadResponse,
} from "../../../packages/app-server-client/src/protocol";

const PROJECT_MEMORY_CACHE_TTL_MS = 30_000;
const projectMemoryCache = new Map<
  string,
  { loadedAt: number; memory: ProjectMemory }
>();
const projectMemoryInflight = new Map<string, Promise<ProjectMemory>>();

export type ProjectMemoryAppServerClient = Pick<AppServerClient, "request">;

type ProjectMemoryReadResponse = Omit<
  AppServerProjectMemoryReadResponse,
  "memory"
> & {
  memory?: ProjectMemory | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecordOrUndefined(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRelationship(value: unknown): value is CharacterRelationship {
  return (
    isRecord(value) &&
    isString(value.target_id) &&
    isString(value.relationship_type) &&
    isOptionalString(value.description)
  );
}

function isCharacter(value: unknown): value is Character {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.project_id) &&
    isString(value.name) &&
    isStringArray(value.aliases) &&
    isOptionalString(value.description) &&
    isOptionalString(value.personality) &&
    isOptionalString(value.background) &&
    isOptionalString(value.appearance) &&
    Array.isArray(value.relationships) &&
    value.relationships.every(isRelationship) &&
    isOptionalString(value.avatar_url) &&
    isBoolean(value.is_main) &&
    isFiniteNumber(value.order) &&
    isRecordOrUndefined(value.extra) &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}

function isWorldBuilding(value: unknown): value is WorldBuilding {
  return (
    isRecord(value) &&
    isString(value.project_id) &&
    isString(value.description) &&
    isOptionalString(value.era) &&
    isOptionalString(value.locations) &&
    isOptionalString(value.rules) &&
    isRecordOrUndefined(value.extra) &&
    isString(value.updated_at)
  );
}

function isOutlineNode(value: unknown): value is OutlineNode {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.project_id) &&
    isOptionalString(value.parent_id) &&
    isString(value.title) &&
    isOptionalString(value.content) &&
    isOptionalString(value.content_id) &&
    isFiniteNumber(value.order) &&
    isBoolean(value.expanded) &&
    isRecordOrUndefined(value.extra) &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}

function isProjectMemory(value: unknown): value is ProjectMemory {
  return (
    isRecord(value) &&
    Array.isArray(value.characters) &&
    value.characters.every(isCharacter) &&
    (value.world_building === undefined ||
      isWorldBuilding(value.world_building)) &&
    Array.isArray(value.outline) &&
    value.outline.every(isOutlineNode)
  );
}

function assertProjectMemory(value: unknown): ProjectMemory {
  if (!isProjectMemory(value)) {
    throw new Error(
      "App Server projectMemory/read did not return valid project memory",
    );
  }
  return value;
}

export interface CharacterRelationship {
  target_id: string;
  relationship_type: string;
  description?: string;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  aliases: string[];
  description?: string;
  personality?: string;
  background?: string;
  appearance?: string;
  relationships: CharacterRelationship[];
  avatar_url?: string;
  is_main: boolean;
  order: number;
  extra?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorldBuilding {
  project_id: string;
  description: string;
  era?: string;
  locations?: string;
  rules?: string;
  extra?: Record<string, unknown>;
  updated_at: string;
}

export interface OutlineNode {
  id: string;
  project_id: string;
  parent_id?: string;
  title: string;
  content?: string;
  content_id?: string;
  order: number;
  expanded: boolean;
  extra?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemory {
  characters: Character[];
  world_building?: WorldBuilding;
  outline: OutlineNode[];
}

export async function getProjectMemory(
  projectId: string,
  options: { appServerClient?: ProjectMemoryAppServerClient } = {},
): Promise<ProjectMemory> {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    throw new Error("projectId is required to read App Server project memory");
  }

  const cached = projectMemoryCache.get(normalizedProjectId);
  if (cached && Date.now() - cached.loadedAt < PROJECT_MEMORY_CACHE_TTL_MS) {
    logAgentDebug("AgentApi", "projectMemoryGet.cacheHit", {
      projectId: normalizedProjectId,
    });
    return cached.memory;
  }

  const inflight = projectMemoryInflight.get(normalizedProjectId);
  if (inflight) {
    logAgentDebug("AgentApi", "projectMemoryGet.inflightHit", {
      projectId: normalizedProjectId,
    });
    return inflight;
  }

  const startedAt = Date.now();
  let settled = false;
  const slowTimer: number | null =
    typeof window !== "undefined"
      ? window.setTimeout(() => {
          if (settled) {
            return;
          }
          logAgentDebug(
            "AgentApi",
            "projectMemoryGet.slow",
            {
              elapsedMs: Date.now() - startedAt,
              projectId: normalizedProjectId,
            },
            {
              dedupeKey: `projectMemoryGet.slow:${normalizedProjectId}`,
              level: "info",
              throttleMs: 1000,
            },
          );
        }, 1000)
      : null;

  logAgentDebug("AgentApi", "projectMemoryGet.start", {
    projectId: normalizedProjectId,
  });

  const request = (async () => {
    const appServerClient = options.appServerClient ?? new AppServerClient();
    const response = await appServerClient.request<ProjectMemoryReadResponse>(
      METHOD_PROJECT_MEMORY_READ,
      { projectId: normalizedProjectId },
    );
    const memory = response.result.memory;
    if (!memory) {
      throw new Error(
        "App Server projectMemory/read did not return project memory",
      );
    }
    const validatedMemory = assertProjectMemory(memory);
    settled = true;
    logAgentDebug("AgentApi", "projectMemoryGet.success", {
      charactersCount: validatedMemory.characters.length,
      durationMs: Date.now() - startedAt,
      hasWorldBuilding: Boolean(validatedMemory.world_building),
      outlineCount: validatedMemory.outline.length,
      projectId: normalizedProjectId,
    });
    projectMemoryCache.set(normalizedProjectId, {
      loadedAt: Date.now(),
      memory: validatedMemory,
    });
    return validatedMemory;
  })();
  projectMemoryInflight.set(normalizedProjectId, request);

  try {
    return await request;
  } catch (error) {
    settled = true;
    logAgentDebug(
      "AgentApi",
      "projectMemoryGet.error",
      {
        durationMs: Date.now() - startedAt,
        error,
        projectId: normalizedProjectId,
      },
      { level: "error" },
    );
    throw error;
  } finally {
    projectMemoryInflight.delete(normalizedProjectId);
    if (slowTimer !== null) {
      clearTimeout(slowTimer);
    }
  }
}
