import type { AgentAppProvenance, InstalledAppPreview } from "../types";
export declare function buildAgentAppProvenance(params: {
    preview: InstalledAppPreview;
    entryKey?: string;
    runId?: string;
}): AgentAppProvenance;
