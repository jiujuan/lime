import type { AppManifest, PackageIdentity, PackageSourceKind } from "../types";
export declare function stableStringifyPluginValue(value: unknown): string;
export declare function buildPackageIdentity(params: {
    manifest: AppManifest;
    sourceKind?: PackageSourceKind;
    sourceUri?: string;
    loadedAt?: string;
}): PackageIdentity;
export declare function buildPluginManifestHash(manifest: unknown): string;
export declare function buildPluginPackageHash(params: {
    manifest: unknown;
    sourceUri?: string;
}): string;
