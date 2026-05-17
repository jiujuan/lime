import type { AppManifest } from "../types";
export interface ManifestValueLayerField {
    source: string;
    target: string;
}
export interface MergeLayeredManifestOptions {
    arrayFields?: readonly string[];
    valueFields?: readonly ManifestValueLayerField[];
}
export declare class AgentAppManifestError extends Error {
    constructor(message: string);
}
export declare function mergeLayeredManifest(input: unknown, layers: readonly unknown[], options?: MergeLayeredManifestOptions): AppManifest;
export declare function parseManifest(input: unknown): AppManifest;
