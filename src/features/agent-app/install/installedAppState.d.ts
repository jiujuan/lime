import type { AgentAppSetupState, InstalledAgentAppState, InstalledAppPreview } from "../types";
declare const INSTALLED_STATE_SCHEMA_VERSION = 1;
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
export type InstalledAgentAppStatePersistenceIssueCode = "READ_FAILED" | "PARSE_FAILED" | "SCHEMA_VERSION_UNSUPPORTED" | "STATE_INVALID" | "SCHEMA_GATE_FAILED";
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
export type AgentAppKeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export declare function buildInstalledAgentAppState(params: {
    preview: InstalledAppPreview;
    setup?: AgentAppSetupState;
    disabled?: boolean;
    installedAt?: string;
    updatedAt?: string;
}): InstalledAgentAppState;
export declare class InMemoryInstalledAgentAppStateStore {
    private readonly states;
    upsert(state: InstalledAgentAppState): InstalledAgentAppState;
    get(appId: string): InstalledAgentAppState | undefined;
    list(): InstalledAgentAppState[];
    setDisabled(appId: string, disabled: boolean, updatedAt: string): InstalledAgentAppState | undefined;
    remove(appId: string): boolean;
    clear(): number;
}
export declare class InMemoryAgentAppPersistenceDriver implements AgentAppPersistenceDriver {
    private readonly files;
    readText(path: string): Promise<string | undefined>;
    writeText(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<boolean>;
    listFiles(prefix: string): Promise<string[]>;
    snapshot(): Record<string, string>;
}
export declare class BrowserLocalStorageAgentAppPersistenceDriver implements AgentAppPersistenceDriver {
    private readonly storage;
    private readonly keyPrefix;
    constructor(params?: {
        storage?: AgentAppKeyValueStorage;
        keyPrefix?: string;
    });
    readText(path: string): Promise<string | undefined>;
    writeText(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<boolean>;
    listFiles(prefix: string): Promise<string[]>;
    private storageKey;
}
export declare class LocalInstalledAgentAppStateRepository {
    private readonly dataRoot;
    private readonly driver;
    constructor(params: {
        driver: AgentAppPersistenceDriver;
        dataRoot?: string;
    });
    getInstalledStatePath(appId: string): string;
    getSetupStatePath(appId: string): string;
    save(state: InstalledAgentAppState, savedAt?: string): Promise<InstalledAgentAppState>;
    get(appId: string): Promise<InstalledAgentAppStateLoadResult>;
    list(): Promise<InstalledAgentAppStateListResult>;
    setDisabled(appId: string, disabled: boolean, updatedAt: string): Promise<InstalledAgentAppStateLoadResult>;
    remove(appId: string): Promise<boolean>;
}
export {};
