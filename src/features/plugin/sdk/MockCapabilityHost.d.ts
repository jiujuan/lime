import type { PluginArtifactRecord, PluginEvidenceRecord, PluginProvenanceQuery, PluginRunResult, PluginStorageEntry, PluginTaskRecord, PluginUninstallResult, AppCleanupPlan, InstalledAppPreview } from "../types";
import type { CapabilityHost, LimeAppSdk } from "./CapabilityHost";
interface MockCapabilityHostOptions {
    preview: InstalledAppPreview;
    mockSdkEnabled?: boolean;
    now?: () => string;
}
export declare class MockCapabilityHost implements CapabilityHost {
    private readonly preview;
    private readonly mockSdkEnabled;
    private readonly now;
    private readonly storageEntries;
    private readonly artifacts;
    private readonly evidence;
    private readonly tasks;
    private runCounter;
    private taskCounter;
    constructor(options: MockCapabilityHostOptions);
    createSdkContext(entryKey: string, runId?: string): LimeAppSdk;
    runEntry(entryKey: string): Promise<PluginRunResult>;
    getArtifacts(query?: PluginProvenanceQuery): PluginArtifactRecord[];
    getEvidence(query?: PluginProvenanceQuery): PluginEvidenceRecord[];
    getStorageEntries(query?: PluginProvenanceQuery): PluginStorageEntry[];
    getTasks(query?: PluginProvenanceQuery): PluginTaskRecord[];
    uninstall(params: {
        cleanupPlan: AppCleanupPlan;
        deleteData: boolean;
    }): Promise<PluginUninstallResult>;
    private createStorageCapability;
    private createArtifactsCapability;
    private createEvidenceCapability;
    private createKnowledgeCapability;
    private createAgentCapability;
    private submitHostResponse;
    private assertMockSdkEnabled;
    private assertCapabilityEnabled;
    private assertRunnable;
    private findEntry;
    private nextRunId;
}
export {};
