import type { PluginProvenance, InstalledAppPreview } from "../types";
export declare function buildPluginProvenance(params: {
    preview: InstalledAppPreview;
    entryKey?: string;
    runId?: string;
}): PluginProvenance;
