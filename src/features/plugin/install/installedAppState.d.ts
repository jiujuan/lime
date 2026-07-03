import type { PluginSetupState, InstalledPluginState, InstalledAppPreview } from "../types";
declare const INSTALLED_STATE_SCHEMA_VERSION = 1;
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
export type InstalledPluginStatePersistenceIssueCode = "READ_FAILED" | "PARSE_FAILED" | "SCHEMA_VERSION_UNSUPPORTED" | "STATE_INVALID" | "SCHEMA_GATE_FAILED";
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
export type PluginKeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export declare function buildInstalledPluginState(params: {
    preview: InstalledAppPreview;
    setup?: PluginSetupState;
    disabled?: boolean;
    installedAt?: string;
    updatedAt?: string;
}): InstalledPluginState;
export declare class InMemoryInstalledPluginStateStore {
    private readonly states;
    upsert(state: InstalledPluginState): InstalledPluginState;
    get(appId: string): InstalledPluginState | undefined;
    list(): InstalledPluginState[];
    setDisabled(appId: string, disabled: boolean, updatedAt: string): InstalledPluginState | undefined;
    remove(appId: string): boolean;
    clear(): number;
}
export declare class InMemoryPluginPersistenceDriver implements PluginPersistenceDriver {
    private readonly files;
    readText(path: string): Promise<string | undefined>;
    writeText(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<boolean>;
    listFiles(prefix: string): Promise<string[]>;
    snapshot(): Record<string, string>;
}
export declare class BrowserLocalStoragePluginPersistenceDriver implements PluginPersistenceDriver {
    private readonly storage;
    private readonly keyPrefix;
    constructor(params?: {
        storage?: PluginKeyValueStorage;
        keyPrefix?: string;
    });
    readText(path: string): Promise<string | undefined>;
    writeText(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<boolean>;
    listFiles(prefix: string): Promise<string[]>;
    private storageKey;
}
export declare class LocalInstalledPluginStateRepository {
    private readonly dataRoot;
    private readonly driver;
    constructor(params: {
        driver: PluginPersistenceDriver;
        dataRoot?: string;
    });
    getInstalledStatePath(appId: string): string;
    getSetupStatePath(appId: string): string;
    save(state: InstalledPluginState, savedAt?: string): Promise<InstalledPluginState>;
    get(appId: string): Promise<InstalledPluginStateLoadResult>;
    list(): Promise<InstalledPluginStateListResult>;
    setDisabled(appId: string, disabled: boolean, updatedAt: string): Promise<InstalledPluginStateLoadResult>;
    remove(appId: string): Promise<boolean>;
}
export {};
