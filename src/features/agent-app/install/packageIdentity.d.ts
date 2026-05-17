import type { AppManifest, PackageIdentity, PackageSourceKind } from "../types";
export declare function stableStringifyAgentAppValue(value: unknown): string;
export declare function buildPackageIdentity(params: {
    manifest: AppManifest;
    sourceKind?: PackageSourceKind;
    sourceUri?: string;
    loadedAt?: string;
}): PackageIdentity;
export declare function buildAgentAppManifestHash(manifest: unknown): string;
export declare function buildAgentAppPackageHash(params: {
    manifest: unknown;
    sourceUri?: string;
}): string;
