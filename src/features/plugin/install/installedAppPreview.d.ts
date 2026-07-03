import type { PluginSetupState, PluginPackageVerificationResult, CloudBootstrapApp, HostCapabilityProfile, InstalledAppPreview, PackageIdentity } from "../types";
export declare class PluginInstalledPreviewError extends Error {
    constructor(message: string);
}
export declare function buildInstalledAppPreview(params: {
    fixture: unknown;
    identity?: PackageIdentity;
    cloud?: CloudBootstrapApp;
    packageVerification?: PluginPackageVerificationResult;
    setup?: PluginSetupState;
    profile?: HostCapabilityProfile;
    loadedAt?: string;
    checkedAt?: string;
    generatedAt?: string;
}): InstalledAppPreview;
