import type { AgentAppArtifactRecord, AgentAppEvidenceRecord, AgentAppProvenanceQuery, AgentAppRunResult, AgentAppStorageEntry, AgentAppTaskRecord, AgentAppUninstallResult, AppCleanupPlan, InstalledAppPreview } from "../types";
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
    runEntry(entryKey: string): Promise<AgentAppRunResult>;
    getArtifacts(query?: AgentAppProvenanceQuery): AgentAppArtifactRecord[];
    getEvidence(query?: AgentAppProvenanceQuery): AgentAppEvidenceRecord[];
    getStorageEntries(query?: AgentAppProvenanceQuery): AgentAppStorageEntry[];
    getTasks(query?: AgentAppProvenanceQuery): AgentAppTaskRecord[];
    uninstall(params: {
        cleanupPlan: AppCleanupPlan;
        deleteData: boolean;
    }): Promise<AgentAppUninstallResult>;
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
