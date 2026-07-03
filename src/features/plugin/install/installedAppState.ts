import type {
  PluginInstallMode,
  PluginRuntimeProfileSummary,
  PluginSetupState,
  InstalledPluginState,
  InstalledAppPreview,
} from "../types";
import {
  validateProjectionSchemaCoverage,
  validateReadinessSchemaCoverage,
} from "../schema/schemaGate";
import { shellKindForInstallMode } from "../runtime-profile";

const INSTALLED_STATE_SCHEMA_VERSION = 1;
const DEFAULT_PLUGIN_DATA_ROOT = "<LimeAppData>/plugins";

export interface InstalledPluginStateEnvelope {
  schemaVersion: typeof INSTALLED_STATE_SCHEMA_VERSION;
  savedAt: string;
  state: InstalledPluginState;
}

export interface PluginSetupStateEnvelope {
  schemaVersion: typeof INSTALLED_STATE_SCHEMA_VERSION;
  appId: string;
  savedAt: string;
  setup: PluginSetupState;
}

export type InstalledPluginStatePersistenceIssueCode =
  | "READ_FAILED"
  | "PARSE_FAILED"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "STATE_INVALID"
  | "SCHEMA_GATE_FAILED";

export interface InstalledPluginStatePersistenceIssue {
  code: InstalledPluginStatePersistenceIssueCode;
  path: string;
  message: string;
  appId?: string;
}

export interface InstalledPluginStateLoadResult {
  state?: InstalledPluginState;
  issues: InstalledPluginStatePersistenceIssue[];
}

export interface InstalledPluginStateListResult {
  states: InstalledPluginState[];
  issues: InstalledPluginStatePersistenceIssue[];
}

export interface PluginPersistenceDriver {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<boolean>;
  listFiles(prefix: string): Promise<string[]>;
}

export type PluginKeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertSafeAppId(appId: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(appId)) {
    throw new Error(`Invalid Plugin id for local persistence: ${appId}`);
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
  state: InstalledPluginState;
  savedAt: string;
}): InstalledPluginStateEnvelope {
  return {
    schemaVersion: INSTALLED_STATE_SCHEMA_VERSION,
    savedAt: params.savedAt,
    state: structuredClone(params.state),
  };
}

function buildSetupStateEnvelope(params: {
  state: InstalledPluginState;
  savedAt: string;
}): PluginSetupStateEnvelope {
  return {
    schemaVersion: INSTALLED_STATE_SCHEMA_VERSION,
    appId: params.state.appId,
    savedAt: params.savedAt,
    setup: structuredClone(params.state.setup),
  };
}

function validateInstalledPluginStateShape(
  value: unknown,
  path: string,
): InstalledPluginStateLoadResult {
  const issues: InstalledPluginStatePersistenceIssue[] = [];
  if (!isRecord(value)) {
    return {
      issues: [
        {
          code: "STATE_INVALID",
          path,
          message: "Installed Plugin state must be an object.",
        },
      ],
    };
  }

  const state = value as unknown as InstalledPluginState;
  const appId = typeof value.appId === "string" ? value.appId : undefined;
  if (
    !appId ||
    !isRecord(value.identity) ||
    !isRecord(value.manifest) ||
    !isRecord(value.projection) ||
    !isRecord(value.readiness) ||
    typeof value.installMode !== "string" ||
    !isRecord(value.runtimeProfileSummary) ||
    !isRecord(value.setup) ||
    typeof value.disabled !== "boolean" ||
    typeof value.installedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    issues.push({
      code: "STATE_INVALID",
      path,
      appId,
      message: "Installed Plugin state is missing required snapshot fields.",
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
      message: "Installed Plugin state has inconsistent appId fields.",
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

function buildRuntimeProfileSummary(params: {
  preview: InstalledAppPreview;
  installMode: PluginInstallMode;
}): PluginRuntimeProfileSummary {
  const modeReadiness = params.preview.readiness.installModes.find(
    (mode) => mode.mode === params.installMode,
  );
  return {
    installMode: params.installMode,
    shellKind: shellKindForInstallMode(params.installMode),
    runtimeVersion: modeReadiness?.runtimeVersion,
    runtimeMinVersion: params.preview.manifest.install.runtime.minVersion,
    checkedAt: params.preview.readiness.checkedAt,
  };
}

function parseInstalledStateEnvelope(
  content: string,
  path: string,
): InstalledPluginStateLoadResult {
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
          message: "Installed Plugin state envelope must be an object.",
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
          message: `Unsupported Plugin installed state schemaVersion: ${String(parsed.schemaVersion)}.`,
        },
      ],
    };
  }

  return validateInstalledPluginStateShape(parsed.state, path);
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildInstalledPluginState(params: {
  preview: InstalledAppPreview;
  installMode?: PluginInstallMode;
  setup?: PluginSetupState;
  disabled?: boolean;
  installedAt?: string;
  updatedAt?: string;
}): InstalledPluginState {
  const timestamp = params.updatedAt ?? new Date().toISOString();
  const installMode = params.installMode ?? params.preview.projection.install.preferredMode;
  return {
    appId: params.preview.identity.appId,
    identity: params.preview.identity,
    manifest: params.preview.manifest,
    projection: params.preview.projection,
    readiness: params.preview.readiness,
    installMode,
    runtimeProfileSummary: buildRuntimeProfileSummary({
      preview: params.preview,
      installMode,
    }),
    setup: params.setup ?? {},
    disabled: params.disabled ?? false,
    installedAt: params.installedAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export class InMemoryInstalledPluginStateStore {
  private readonly states = new Map<string, InstalledPluginState>();

  upsert(state: InstalledPluginState): InstalledPluginState {
    const stored = structuredClone(state);
    this.states.set(stored.appId, stored);
    return structuredClone(stored);
  }

  get(appId: string): InstalledPluginState | undefined {
    const state = this.states.get(appId);
    return state ? structuredClone(state) : undefined;
  }

  list(): InstalledPluginState[] {
    return Array.from(this.states.values())
      .map((state) => structuredClone(state))
      .sort((left, right) => left.appId.localeCompare(right.appId));
  }

  setDisabled(appId: string, disabled: boolean, updatedAt: string): InstalledPluginState | undefined {
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

export class InMemoryPluginPersistenceDriver implements PluginPersistenceDriver {
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

export class BrowserLocalStoragePluginPersistenceDriver implements PluginPersistenceDriver {
  private readonly storage: PluginKeyValueStorage;
  private readonly keyPrefix: string;

  constructor(params?: {
    storage?: PluginKeyValueStorage;
    keyPrefix?: string;
  }) {
    const storage =
      params?.storage ??
      (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!storage) {
      throw new Error("Browser localStorage is not available for Plugin persistence.");
    }
    this.storage = storage;
    this.keyPrefix = params?.keyPrefix ?? "lime.plugin.persistence:";
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

export class LocalInstalledPluginStateRepository {
  private readonly dataRoot: string;
  private readonly driver: PluginPersistenceDriver;

  constructor(params: {
    driver: PluginPersistenceDriver;
    dataRoot?: string;
  }) {
    this.driver = params.driver;
    this.dataRoot = params.dataRoot ?? DEFAULT_PLUGIN_DATA_ROOT;
  }

  getInstalledStatePath(appId: string): string {
    return installedStatePath(this.dataRoot, appId);
  }

  getSetupStatePath(appId: string): string {
    return setupStatePath(this.dataRoot, appId);
  }

  async save(
    state: InstalledPluginState,
    savedAt = new Date().toISOString(),
  ): Promise<InstalledPluginState> {
    const path = this.getInstalledStatePath(state.appId);
    const validation = validateInstalledPluginStateShape(state, path);
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

  async get(appId: string): Promise<InstalledPluginStateLoadResult> {
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

  async list(): Promise<InstalledPluginStateListResult> {
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

    const states: InstalledPluginState[] = [];
    const issues: InstalledPluginStatePersistenceIssue[] = [];
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
  ): Promise<InstalledPluginStateLoadResult> {
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
