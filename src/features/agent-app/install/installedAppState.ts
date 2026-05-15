import type {
  AgentAppSetupState,
  InstalledAgentAppState,
  InstalledAppPreview,
} from "../types";
import {
  validateProjectionSchemaCoverage,
  validateReadinessSchemaCoverage,
} from "../schema/schemaGate";

const INSTALLED_STATE_SCHEMA_VERSION = 1;
const DEFAULT_AGENT_APP_DATA_ROOT = "<LimeAppData>/agent-apps";

export interface InstalledAgentAppStateEnvelope {
  schemaVersion: typeof INSTALLED_STATE_SCHEMA_VERSION;
  savedAt: string;
  state: InstalledAgentAppState;
}

export interface AgentAppSetupStateEnvelope {
  schemaVersion: typeof INSTALLED_STATE_SCHEMA_VERSION;
  appId: string;
  savedAt: string;
  setup: AgentAppSetupState;
}

export type InstalledAgentAppStatePersistenceIssueCode =
  | "READ_FAILED"
  | "PARSE_FAILED"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "STATE_INVALID"
  | "SCHEMA_GATE_FAILED";

export interface InstalledAgentAppStatePersistenceIssue {
  code: InstalledAgentAppStatePersistenceIssueCode;
  path: string;
  message: string;
  appId?: string;
}

export interface InstalledAgentAppStateLoadResult {
  state?: InstalledAgentAppState;
  issues: InstalledAgentAppStatePersistenceIssue[];
}

export interface InstalledAgentAppStateListResult {
  states: InstalledAgentAppState[];
  issues: InstalledAgentAppStatePersistenceIssue[];
}

export interface AgentAppPersistenceDriver {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<boolean>;
  listFiles(prefix: string): Promise<string[]>;
}

export type AgentAppKeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertSafeAppId(appId: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(appId)) {
    throw new Error(`Invalid Agent App id for local persistence: ${appId}`);
  }
}

function installedStatePath(dataRoot: string, appId: string): string {
  assertSafeAppId(appId);
  return `${dataRoot}/installed/${appId}.json`;
}

function setupStatePath(dataRoot: string, appId: string): string {
  assertSafeAppId(appId);
  return `${dataRoot}/setup/${appId}.json`;
}

function buildInstalledStateEnvelope(params: {
  state: InstalledAgentAppState;
  savedAt: string;
}): InstalledAgentAppStateEnvelope {
  return {
    schemaVersion: INSTALLED_STATE_SCHEMA_VERSION,
    savedAt: params.savedAt,
    state: structuredClone(params.state),
  };
}

function buildSetupStateEnvelope(params: {
  state: InstalledAgentAppState;
  savedAt: string;
}): AgentAppSetupStateEnvelope {
  return {
    schemaVersion: INSTALLED_STATE_SCHEMA_VERSION,
    appId: params.state.appId,
    savedAt: params.savedAt,
    setup: structuredClone(params.state.setup),
  };
}

function validateInstalledAgentAppStateShape(
  value: unknown,
  path: string,
): InstalledAgentAppStateLoadResult {
  const issues: InstalledAgentAppStatePersistenceIssue[] = [];
  if (!isRecord(value)) {
    return {
      issues: [
        {
          code: "STATE_INVALID",
          path,
          message: "Installed Agent App state must be an object.",
        },
      ],
    };
  }

  const state = value as unknown as InstalledAgentAppState;
  const appId = typeof value.appId === "string" ? value.appId : undefined;
  if (
    !appId ||
    !isRecord(value.identity) ||
    !isRecord(value.manifest) ||
    !isRecord(value.projection) ||
    !isRecord(value.readiness) ||
    !isRecord(value.setup) ||
    typeof value.disabled !== "boolean" ||
    typeof value.installedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    issues.push({
      code: "STATE_INVALID",
      path,
      appId,
      message: "Installed Agent App state is missing required snapshot fields.",
    });
  }

  const identityAppId = isRecord(value.identity) ? value.identity.appId : undefined;
  const projectionApp = isRecord(value.projection) ? value.projection.app : undefined;
  const projectionAppId = isRecord(projectionApp) ? projectionApp.appId : undefined;
  const readinessAppId = isRecord(value.readiness) ? value.readiness.appId : undefined;
  if (
    appId &&
    (identityAppId !== appId ||
      projectionAppId !== appId ||
      readinessAppId !== appId)
  ) {
    issues.push({
      code: "STATE_INVALID",
      path,
      appId,
      message: "Installed Agent App state has inconsistent appId fields.",
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  const projectionGate = validateProjectionSchemaCoverage(state.projection);
  projectionGate.issues.forEach((issue) => {
    issues.push({
      code: "SCHEMA_GATE_FAILED",
      path,
      appId,
      message: `Projection gate failed at ${issue.path}: ${issue.message}`,
    });
  });

  const readinessGate = validateReadinessSchemaCoverage(state.readiness);
  readinessGate.issues.forEach((issue) => {
    issues.push({
      code: "SCHEMA_GATE_FAILED",
      path,
      appId,
      message: `Readiness gate failed at ${issue.path}: ${issue.message}`,
    });
  });

  return {
    state: issues.length > 0 ? undefined : structuredClone(state),
    issues,
  };
}

function parseInstalledStateEnvelope(
  content: string,
  path: string,
): InstalledAgentAppStateLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      issues: [
        {
          code: "PARSE_FAILED",
          path,
          message: error instanceof Error ? error.message : "Failed to parse installed state JSON.",
        },
      ],
    };
  }

  if (!isRecord(parsed)) {
    return {
      issues: [
        {
          code: "STATE_INVALID",
          path,
          message: "Installed Agent App state envelope must be an object.",
        },
      ],
    };
  }

  if (parsed.schemaVersion !== INSTALLED_STATE_SCHEMA_VERSION) {
    return {
      issues: [
        {
          code: "SCHEMA_VERSION_UNSUPPORTED",
          path,
          message: `Unsupported Agent App installed state schemaVersion: ${String(parsed.schemaVersion)}.`,
        },
      ],
    };
  }

  return validateInstalledAgentAppStateShape(parsed.state, path);
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildInstalledAgentAppState(params: {
  preview: InstalledAppPreview;
  setup?: AgentAppSetupState;
  disabled?: boolean;
  installedAt?: string;
  updatedAt?: string;
}): InstalledAgentAppState {
  const timestamp = params.updatedAt ?? new Date().toISOString();
  return {
    appId: params.preview.identity.appId,
    identity: params.preview.identity,
    manifest: params.preview.manifest,
    projection: params.preview.projection,
    readiness: params.preview.readiness,
    setup: params.setup ?? {},
    disabled: params.disabled ?? false,
    installedAt: params.installedAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export class InMemoryInstalledAgentAppStateStore {
  private readonly states = new Map<string, InstalledAgentAppState>();

  upsert(state: InstalledAgentAppState): InstalledAgentAppState {
    const stored = structuredClone(state);
    this.states.set(stored.appId, stored);
    return structuredClone(stored);
  }

  get(appId: string): InstalledAgentAppState | undefined {
    const state = this.states.get(appId);
    return state ? structuredClone(state) : undefined;
  }

  list(): InstalledAgentAppState[] {
    return Array.from(this.states.values())
      .map((state) => structuredClone(state))
      .sort((left, right) => left.appId.localeCompare(right.appId));
  }

  setDisabled(appId: string, disabled: boolean, updatedAt: string): InstalledAgentAppState | undefined {
    const current = this.states.get(appId);
    if (!current) {
      return undefined;
    }
    const next = { ...current, disabled, updatedAt };
    this.states.set(appId, next);
    return structuredClone(next);
  }

  remove(appId: string): boolean {
    return this.states.delete(appId);
  }

  clear(): number {
    const count = this.states.size;
    this.states.clear();
    return count;
  }
}

export class InMemoryAgentAppPersistenceDriver implements AgentAppPersistenceDriver {
  private readonly files = new Map<string, string>();

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<boolean> {
    return this.files.delete(path);
  }

  async listFiles(prefix: string): Promise<string[]> {
    return Array.from(this.files.keys())
      .filter((path) => path.startsWith(prefix))
      .sort();
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(Array.from(this.files.entries()).sort());
  }
}

export class BrowserLocalStorageAgentAppPersistenceDriver implements AgentAppPersistenceDriver {
  private readonly storage: AgentAppKeyValueStorage;
  private readonly keyPrefix: string;

  constructor(params?: {
    storage?: AgentAppKeyValueStorage;
    keyPrefix?: string;
  }) {
    const storage =
      params?.storage ??
      (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!storage) {
      throw new Error("Browser localStorage is not available for Agent App persistence.");
    }
    this.storage = storage;
    this.keyPrefix = params?.keyPrefix ?? "lime.agent-app.persistence:";
  }

  async readText(path: string): Promise<string | undefined> {
    return this.storage.getItem(this.storageKey(path)) ?? undefined;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.storage.setItem(this.storageKey(path), content);
  }

  async deleteFile(path: string): Promise<boolean> {
    const key = this.storageKey(path);
    const existed = this.storage.getItem(key) !== null;
    this.storage.removeItem(key);
    return existed;
  }

  async listFiles(prefix: string): Promise<string[]> {
    const storagePrefix = this.storageKey(prefix);
    const paths: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(storagePrefix)) {
        paths.push(key.slice(this.keyPrefix.length));
      }
    }
    return paths.sort();
  }

  private storageKey(path: string): string {
    return `${this.keyPrefix}${path}`;
  }
}

export class LocalInstalledAgentAppStateRepository {
  private readonly dataRoot: string;
  private readonly driver: AgentAppPersistenceDriver;

  constructor(params: {
    driver: AgentAppPersistenceDriver;
    dataRoot?: string;
  }) {
    this.driver = params.driver;
    this.dataRoot = params.dataRoot ?? DEFAULT_AGENT_APP_DATA_ROOT;
  }

  getInstalledStatePath(appId: string): string {
    return installedStatePath(this.dataRoot, appId);
  }

  getSetupStatePath(appId: string): string {
    return setupStatePath(this.dataRoot, appId);
  }

  async save(
    state: InstalledAgentAppState,
    savedAt = new Date().toISOString(),
  ): Promise<InstalledAgentAppState> {
    const path = this.getInstalledStatePath(state.appId);
    const validation = validateInstalledAgentAppStateShape(state, path);
    if (validation.issues.length > 0) {
      throw new Error(validation.issues.map((issue) => issue.message).join("\n"));
    }

    await this.driver.writeText(
      path,
      serializeJson(buildInstalledStateEnvelope({ state, savedAt })),
    );
    await this.driver.writeText(
      this.getSetupStatePath(state.appId),
      serializeJson(buildSetupStateEnvelope({ state, savedAt })),
    );
    return structuredClone(state);
  }

  async get(appId: string): Promise<InstalledAgentAppStateLoadResult> {
    const path = this.getInstalledStatePath(appId);
    let content: string | undefined;
    try {
      content = await this.driver.readText(path);
    } catch (error) {
      return {
        issues: [
          {
            code: "READ_FAILED",
            path,
            appId,
            message: error instanceof Error ? error.message : "Failed to read installed state.",
          },
        ],
      };
    }

    if (content === undefined) {
      return { issues: [] };
    }

    return parseInstalledStateEnvelope(content, path);
  }

  async list(): Promise<InstalledAgentAppStateListResult> {
    const prefix = `${this.dataRoot}/installed/`;
    let paths: string[];
    try {
      paths = await this.driver.listFiles(prefix);
    } catch (error) {
      return {
        states: [],
        issues: [
          {
            code: "READ_FAILED",
            path: prefix,
            message: error instanceof Error ? error.message : "Failed to list installed states.",
          },
        ],
      };
    }

    const states: InstalledAgentAppState[] = [];
    const issues: InstalledAgentAppStatePersistenceIssue[] = [];
    for (const path of paths) {
      let content: string | undefined;
      try {
        content = await this.driver.readText(path);
      } catch (error) {
        issues.push({
          code: "READ_FAILED",
          path,
          message: error instanceof Error ? error.message : "Failed to read installed state.",
        });
        continue;
      }
      if (content === undefined) {
        continue;
      }
      const result = parseInstalledStateEnvelope(content, path);
      issues.push(...result.issues);
      if (result.state) {
        states.push(result.state);
      }
    }

    return {
      states: states.sort((left, right) => left.appId.localeCompare(right.appId)),
      issues,
    };
  }

  async setDisabled(
    appId: string,
    disabled: boolean,
    updatedAt: string,
  ): Promise<InstalledAgentAppStateLoadResult> {
    const current = await this.get(appId);
    if (!current.state) {
      return current;
    }
    const next = {
      ...current.state,
      disabled,
      updatedAt,
    };
    await this.save(next, updatedAt);
    return {
      state: next,
      issues: [],
    };
  }

  async remove(appId: string): Promise<boolean> {
    const installedDeleted = await this.driver.deleteFile(this.getInstalledStatePath(appId));
    const setupDeleted = await this.driver.deleteFile(this.getSetupStatePath(appId));
    return installedDeleted || setupDeleted;
  }
}
